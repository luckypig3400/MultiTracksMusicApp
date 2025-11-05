// app.js

let config = null;
let tracks = [];
let audioElements = [];
let currentTrackIndex = 0;
let skipSeconds = 5;
let repeatMode = 0;
let isRandom = false;
let updateLoopReq = null;
let latestFiles = [];

// 用來管理同步檢查的 timer
let syncIntervalId = null;
let initialSyncTimeoutId = null;
// 記錄上次自動同步調整的時間（避免連續重複調整）
let lastSyncAdjustTimestamp = 0;

function normalizePath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
}

function readConfig() {
  const raw = localStorage.getItem('config');
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      console.log("從 localStorage 讀取設定:", cfg);
      return cfg;
    } catch (e) {
      console.error("readConfig JSON 錯誤", e);
    }
  }
  return {
    folders: [],
    filenameRules: [
      { pattern: "\\(Bass\\)$", name: "Bass" },
      { pattern: "\\(Drums\\)$", name: "Drums" },
      { pattern: "\\(Instrumental\\)$", name: "Instrumental" },
      { pattern: "\\(Other\\)$", name: "Other" },
      { pattern: "\\(Vocals\\)$", name: "Vocals" }
    ],
    skipSeconds: 5
  };
}

function saveConfig() {
  try {
    localStorage.setItem('config', JSON.stringify(config));
    console.log("設定已儲存");
  } catch (e) {
    console.error("saveConfig 錯誤", e);
  }
}

async function initializeApp() {
  console.log("initializeApp start");
  config = readConfig();
  skipSeconds = config.skipSeconds || 5;
  setUpUIEvents();

  if (!config.folders || config.folders.length === 0) {
    console.log("尚未設定資料夾 -> 顯示選擇介面");
    showFolderChooser(true);
  } else {
    console.log("偵測到資料夾設定:", config.folders);
    await loadTracksFromConfig();
  }
  console.log("initializeApp done");
}

function setUpUIEvents() {
  const folderInput = document.getElementById('folder-input');
  const folderChooser = document.getElementById('folder-chooser');
  const folderOk = document.getElementById('folder-ok');

  folderInput.addEventListener('change', (e) => handleFolderSelect(e.target.files));
  folderOk.addEventListener('click', () => folderChooser.style.display = 'none');

  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => window.location.href = 'setting.html');
  document.getElementById('btn-play').addEventListener('click', playPause);
  document.getElementById('btn-next').addEventListener('click', nextTrack);
  document.getElementById('btn-prev').addEventListener('click', previousTrack);
  document.getElementById('btn-random').addEventListener('click', () => {
    isRandom = !isRandom;
    document.getElementById('btn-random').innerText = isRandom ? "隨機：開" : "隨機：關";
  });
  document.getElementById('btn-repeat').addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    const text = repeatMode === 0 ? "重複：關" : (repeatMode === 1 ? "重複：單曲" : "重複：清單");
    document.getElementById('btn-repeat').innerText = text;
  });

  const nameEl = document.getElementById('music-name');
  nameEl.addEventListener('click', (e) => {
    if (e.detail === 2) {
      const rect = e.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width / 2) seekForward(); else seekBackward();
    }
  });

  document.getElementById('progress').addEventListener('input', onProgressChange);
}

function showFolderChooser(show) {
  const chooser = document.getElementById('folder-chooser');
  chooser.style.display = show ? 'block' : 'none';
}

function handleFolderSelect(fileList) {
  if (!fileList || fileList.length === 0) return;
  const files = Array.from(fileList);
  latestFiles = files;
  console.log("handleFolderSelect files:", files.length);

  const baseFolders = new Set();
  files.forEach(f => {
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    baseFolders.add(parts.length > 1 ? parts[0] : 'root');
  });

  baseFolders.forEach(base => {
    const norm = normalizePath(base);
    if (!config.folders.some(f => normalizePath(f.path) === norm)) {
      config.folders.push({ path: norm, tracks: [] });
    }
  });

  updateBlobUrlsByRelPath(files);
  scanFiles(files);
  saveConfig();
  showFolderChooser(false);
}

function scanFiles(files) {
  const validExt = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];
  const folderMaps = {};

  files.forEach(file => {
    const relPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = relPath.split('/');
    const folder = parts.length > 1 ? parts[0] : '';
    const name = parts[parts.length - 1];
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!validExt.includes(ext)) return;

    const nameNoExt = name.substring(0, name.lastIndexOf('.')) || name;
    let suffix = '';
    for (let rule of config.filenameRules) {
      const regex = new RegExp(rule.pattern);
      if (regex.test(nameNoExt)) {
        suffix = rule.name;
        break;
      }
    }
    const mainName = suffix ? nameNoExt.replace(new RegExp(`\\(${suffix}\\)$`), '').trim() : nameNoExt;

    // 檢查是否已存在相同相對路徑，沿用舊 volume 與 mute 設定
    let oldVolume = 85;
    let oldMute = false;
    for (let folderCfg of config.folders) {
      for (let track of folderCfg.tracks || []) {
        const match = track.audioTracks?.find(a => a.relPath === relPath);
        if (match) {
          oldVolume = match.volume ?? 85;
          oldMute = match.mute ?? false;
          break;
        }
      }
    }

    const blobUrl = URL.createObjectURL(file);
    const entry = { filename: name, relPath, blobUrl, volume: oldVolume, mute: oldMute, suffix };
    const folderKey = normalizePath(folder || '');
    if (!folderMaps[folderKey]) folderMaps[folderKey] = {};
    if (!folderMaps[folderKey][mainName]) folderMaps[folderKey][mainName] = [];
    folderMaps[folderKey][mainName].push(entry);
  });

  config.folders.forEach(folderCfg => {
    const key = normalizePath(folderCfg.path || '');
    const map = folderMaps[key] || {};
    folderCfg.tracks = [];
    Object.keys(map).forEach(mainName => {
      const audioTracks = map[mainName].map(t => ({
        filename: t.filename,
        relPath: t.relPath,
        blobUrl: t.blobUrl,
        volume: t.volume,
        mute: t.mute || false,
        suffix: t.suffix
      }));
      folderCfg.tracks.push({ filename: mainName, audioTracks });
    });
  });

  console.log("掃描完成，保留舊音量:", config);
  generateTrackListFromConfig();
}

function updateBlobUrlsByRelPath(files) {
  if (!config || !config.folders) return;
  const fileMap = new Map();
  files.forEach(f => {
    const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    fileMap.set(rel, URL.createObjectURL(f));
  });
  config.folders.forEach(folder => {
    folder.tracks?.forEach(track => {
      track.audioTracks?.forEach(at => {
        if (fileMap.has(at.relPath)) {
          at.blobUrl = fileMap.get(at.relPath);
        }
      });
    });
  });
  console.log("blobUrl 已依相對路徑更新");
}

function generateTrackListFromConfig() {
  tracks = [];
  audioElements = [];
  if (!config.folders || config.folders.length === 0) return;
  const folder = config.folders[0];
  if (!folder.tracks || folder.tracks.length === 0) return;
  folder.tracks.forEach(t => {
    tracks.push({ baseName: t.filename, audioTracks: t.audioTracks.map(at => ({ ...at })) });
  });
  console.log("播放清單建立，共", tracks.length, "首");
  if (tracks.length > 0) {
    currentTrackIndex = 0;
    loadTrack(currentTrackIndex);
  }
}

function loadTrack(index) {
  if (!tracks[index]) return;
  const track = tracks[index];
  console.log("載入歌曲:", track);
  document.getElementById('music-name').innerText = track.baseName;
  audioElements.forEach(a => { try { a.pause(); } catch { } });
  audioElements = [];
  const vc = document.getElementById('volume-controls');
  vc.innerHTML = '';

  track.audioTracks.forEach((at, idx) => {
    const audio = new Audio();
    audio.src = at.blobUrl || at.relPath; // blobUrl 優先，否則嘗試相對路徑
    audio.preload = 'auto';
    // 若已經設定 mute，則暫時把音量設為 0，但保留 at.volume 作為保存值
    audio.volume = (at.mute ? 0 : ((typeof at.volume === 'number') ? (at.volume / 100) : 0.85));
    audioElements.push(audio);

    const row = document.createElement('div');
    row.className = 'volume-track';

    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerText = at.suffix ? `(${at.suffix})` : '(未知)';
    // 點擊標籤切換靜音/還原
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => {
      toggleMuteForTrack(idx);
    });
    row.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0; slider.max = 100;
    // 顯示的 slider 值如果是靜音就顯示 0，否則顯示保存的音量
    slider.value = at.mute ? 0 : (at.volume ?? 85);
    slider.style.width = '85%';
    row.appendChild(slider);

    const num = document.createElement('input');
    num.type = 'number';
    num.min = 0; num.max = 100;
    num.value = at.mute ? 0 : (at.volume ?? 85);
    num.style.width = '10%';
    row.appendChild(num);

    // 綁定 slider 與數字輸入更新
    slider.addEventListener('input', () => {
      num.value = slider.value;
      audio.volume = slider.value / 100;
      // 當 user 手動改變 slider 時視為取消靜音
      at.mute = false;
      at.volume = parseInt(slider.value);
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });
    num.addEventListener('change', () => {
      let v = parseInt(num.value) || 0;
      v = Math.min(100, Math.max(0, v));
      num.value = v; slider.value = v;
      audio.volume = v / 100;
      at.mute = false;
      at.volume = v;
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });

    vc.appendChild(row);

    // 把 UI 元件綁進 at 以便 mute 切換時操作
    at._ui = { slider, num, label, audio }; // 非序列化屬性
  });

  if (audioElements[0]) {
    const first = audioElements[0];
    first.addEventListener('ended', onTrackEnd);

    // 當開始播放時先延遲 200ms 再檢查同步
    const startPlay = () => {
      // 清除舊 timers
      if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
      if (syncIntervalId) clearInterval(syncIntervalId);

      initialSyncTimeoutId = setTimeout(() => {
        syncCheckAndFix();
        // 每 3 秒檢查一次
        syncIntervalId = setInterval(() => {
          if (!audioElements.length) return;
          // 只在播放中檢查
          if (audioElements[0].paused) return;
          syncCheckAndFix();
        }, 3000);
      }, 200);
    };

    // 在 canplaythrough 或 user play 事件後都呼叫 startPlay
    first.addEventListener('canplaythrough', startPlay, { once: true });

    first.play().then(() => {
      audioElements.forEach((a, i) => { if (a !== first) a.play().catch(() => { }); });
      startProgressLoop();
      startPlay();
    }).catch(err => {
      console.warn("播放失敗:", err);
      alert("檔案無法播放或路徑已失效，請重新選擇資料夾以更新 blobUrl");
      showFolderChooser(true);
    });

    // 當暫停時停止定時器
    first.addEventListener('pause', () => {
      if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
      if (initialSyncTimeoutId) { clearTimeout(initialSyncTimeoutId); initialSyncTimeoutId = null; }
    });
  }
}

function toggleMuteForTrack(idx) {
  // 切換指定音軌的靜音狀態，並更新 UI 與 config
  const track = tracks[currentTrackIndex];
  if (!track) return;
  const at = track.audioTracks[idx];
  if (!at) return;
  const ui = at._ui;
  if (!ui) return;

  if (!at.mute) {
    // 進入靜音: 保留原始音量在 at.volume，將播放音量設定為 0
    at.mute = true;
    ui.audio.volume = 0;
    ui.slider.value = 0;
    ui.num.value = 0;
    ui.label.style.opacity = '0.6';
    console.log(`已將 ${at.filename} 靜音`);
  } else {
    // 取消靜音: 還原到保存的音量
    at.mute = false;
    const restored = at.volume ?? 85;
    ui.audio.volume = restored / 100;
    ui.slider.value = restored;
    ui.num.value = restored;
    ui.label.style.opacity = '1';
    console.log(`已還原 ${at.filename} 音量為 ${restored}`);
  }

  // 儲存設定
  saveConfig();
}

function onTrackEnd() {
  if (repeatMode === 1) {
    // 單曲重複重新載入並播放
    loadTrack(currentTrackIndex);
  } else if (repeatMode === 2) {
    nextTrack();
  } else if (currentTrackIndex < tracks.length - 1) {
    nextTrack();
  }
}

function persistVolumeSetting(baseName, filename, volume) {
  try {
    const folder = config.folders[0];
    if (!folder || !folder.tracks) return;
    const tr = folder.tracks.find(t => t.filename === baseName);
    if (!tr) return;
    const at = tr.audioTracks.find(a => a.filename === filename);
    if (!at) return;
    at.volume = volume;
    // 手動改變音量視為取消靜音
    at.mute = false;
    saveConfig();
  } catch (e) { console.error("persistVolumeSetting 錯誤", e); }
}

function playPause() {
  if (!audioElements.length) return;
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn("play error", e)));
    document.getElementById('btn-play').innerText = "暫停";
    // 使用者手動播放也要啟動同步檢查
    if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
    initialSyncTimeoutId = setTimeout(() => { syncCheckAndFix(); syncIntervalId = setInterval(() => { if (!audioElements[0].paused) syncCheckAndFix(); }, 5000); }, 200);
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerText = "播放";
    if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
    if (initialSyncTimeoutId) { clearTimeout(initialSyncTimeoutId); initialSyncTimeoutId = null; }
  }
}

function nextTrack() {
  if (!tracks.length) return;
  currentTrackIndex = isRandom ? Math.floor(Math.random() * tracks.length) : (currentTrackIndex + 1) % tracks.length;
  loadTrack(currentTrackIndex);
}
function previousTrack() {
  if (!tracks.length) return;
  currentTrackIndex = isRandom ? Math.floor(Math.random() * tracks.length) : (currentTrackIndex - 1 + tracks.length) % tracks.length;
  loadTrack(currentTrackIndex);
}

function seekForward() { audioElements.forEach(a => a.currentTime = Math.min(a.duration || 0, a.currentTime + skipSeconds)); }
function seekBackward() { audioElements.forEach(a => a.currentTime = Math.max(0, a.currentTime - skipSeconds)); }

function onProgressChange(e) {
  if (!audioElements.length) return;
  const val = parseFloat(e.target.value);
  const first = audioElements[0];
  const newTime = (val / 100) * (first.duration || 0);
  audioElements.forEach(a => a.currentTime = newTime);
}

function startProgressLoop() {
  if (updateLoopReq) cancelAnimationFrame(updateLoopReq);
  const loop = () => {
    if (!audioElements.length) return;
    const first = audioElements[0];
    const cur = first.currentTime || 0;
    const dur = first.duration || 0;
    document.getElementById('time-current').innerText = formatTime(cur);
    document.getElementById('time-total').innerText = formatTime(dur);
    document.getElementById('progress').value = dur > 0 ? (cur / dur) * 100 : 0;
    updateLoopReq = requestAnimationFrame(loop);
  };
  loop();
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' + s : s}`;
}

function formatTimeMs(ms) {
  // 輸出 mi:ss:ms 三位數毫秒
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}:${millis.toString().padStart(3, '0')}`;
}

// 同步檢查與修正 (修正版：改為全部音軌一起同步)
function syncCheckAndFix() {
  if (!audioElements.length) return;
  // 若剛剛才調整過，短時間內不再調整，避免來回震盪
  const now = Date.now();
  if (now - lastSyncAdjustTimestamp < 600) return;

  const timesMs = audioElements.map(a => Math.round((a.currentTime || 0) * 1000));
  // 找出最多音軌的時間 (頻率最高)
  const freq = {};
  timesMs.forEach(t => freq[t] = (freq[t] || 0) + 1);
  let mostCommonTime = null; let mostCount = 0;
  for (const k in freq) {
    if (freq[k] > mostCount) { mostCount = freq[k]; mostCommonTime = parseInt(k); }
  }
  // 決定基準時間 如果有多個不同時間且多於1個不同值 以 Vocals 為準
  const uniqueTimes = Object.keys(freq).length;
  let refTime = mostCommonTime;
  if (uniqueTimes > 1) {
    // 嘗試找 Vocals
    const vocalsIndex = tracks[currentTrackIndex]?.audioTracks?.findIndex(at => at.suffix === 'Vocals');
    if (vocalsIndex != null && vocalsIndex >= 0 && vocalsIndex < audioElements.length) {
      refTime = Math.round((audioElements[vocalsIndex].currentTime || 0) * 1000);
    }
  }

  // 檢查每個音軌是否偏離超過容忍值
  const toleranceMs = 15; // 放寬到 15ms，減少頻繁微調
  const diffs = timesMs.map(t => t - refTime);
  const needAdjust = diffs.some(d => Math.abs(d) > toleranceMs);
  if (!needAdjust) return;

  // 記錄調整前時間
  const before = audioElements.map((a, i) => ({ label: tracks[currentTrackIndex]?.audioTracks?.[i]?.suffix || a.src || i, timeMs: timesMs[i] }));

  // 若有多個時間不一致 且有 Vocals，則以 Vocals 為準，否則以 mostCommonTime
  const finalRef = refTime;
  // 這次修改：同步時所有音軌（包括 Vocals）都對齊同一 refTime
  audioElements.forEach(a => {
    try {
      a.currentTime = finalRef / 1000;
    } catch (e) {
      console.warn('調整時間失敗', e);
    }
  });

  // 更新上次調整時間，避免短時間內再度調整
  lastSyncAdjustTimestamp = Date.now();

  // 記錄調整後時間（稍後取樣以免立刻讀到未同步的值）
  setTimeout(() => {
    const afterMs = audioElements.map(a => Math.round((a.currentTime || 0) * 1000));
    const after = audioElements.map((a, i) => ({ label: tracks[currentTrackIndex]?.audioTracks?.[i]?.suffix || a.src || i, timeMs: afterMs[i] }));

    console.log('已調整音軌, 調整前', before.map(b => `${b.label} ${formatTimeMs(b.timeMs)}`).join(', '), '調整後', after.map(b => `${b.label} ${formatTimeMs(b.timeMs)}`).join(', '));

    // 閃爍進度條
    flashProgressBar();
  }, 80); // 等 80ms 再讀取一次時間以取得穩定值
}

function flashProgressBar() {
  const p = document.getElementById('progress');
  if (!p) return;
  // 使用 boxShadow 與 background 快速顯示變化（比改變 input background 更可靠）
  const originalBox = p.style.boxShadow || '';
  const originalBg = p.style.backgroundColor || '';
  p.style.transition = 'box-shadow 0.06s, background-color 0.06s';
  p.style.boxShadow = '0 0 8px rgba(255,0,0,0.9)';
  p.style.backgroundColor = 'rgba(255,0,0,0.15)';
  setTimeout(() => {
    p.style.boxShadow = originalBox;
    p.style.backgroundColor = originalBg;
  }, 300);
}

async function loadTracksFromConfig() {
  console.log("loadTracksFromConfig called");
  if (!config || !config.folders || config.folders.length === 0) {
    showFolderChooser(true);
    return;
  }
  generateTrackListFromConfig();
}

initializeApp();
