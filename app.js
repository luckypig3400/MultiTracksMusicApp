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
      // console.log("從 localStorage 讀取設定:", cfg);
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
    // console.log("設定已儲存");
  } catch (e) {
    console.error("saveConfig 錯誤", e);
  }
}

async function initializeApp() {
  console.log("initializeApp start");
  config = readConfig();
  skipSeconds = config.skipSeconds || 5;
  setUpUIEvents();

  // 暴露方法給 playlist.js 使用
  window.loadTrack = loadTrack;
  window.currentTrackIndex = currentTrackIndex;

  console.log("初始化：等待使用者重新選擇資料夾以更新 Blob URL");
  showFolderChooser(true);

  console.log("initializeApp done");
}

// 提供給 Playlist.js 呼叫的同步介面
window.onPlaylistUpdated = function () {
  console.log("[App] 收到播放清單更新通知，正在重新同步...");

  // 1. 重新讀取最新的 localStorage 設定
  const newCfg = readConfig();
  if (!newCfg || !newCfg.folders) {
    console.error("[App] 同步失敗：讀取到的設定無效");
    return;
  }

  // 更新 config 參照
  config.folders = newCfg.folders;

  // 2. 記住當前正在播放的歌名
  const currentSongName = tracks[currentTrackIndex]?.baseName;

  // 3. 重新生成內部的 tracks 陣列
  generateTrackListFromConfig();

  // Debug: 驗證排序是否生效
  if (tracks.length > 0) {
    const preview = tracks.slice(0, 3).map((t, i) => `${i}: ${t.baseName}`).join(', ');
    console.log(`[App] 同步後的前三首歌曲順序: ${preview}`);
  }

  // 4. 修正 currentTrackIndex，防止切歌時跳錯首
  if (currentSongName) {
    const newIdx = tracks.findIndex(t => t.baseName === currentSongName);
    if (newIdx >= 0) {
      currentTrackIndex = newIdx;
      window.currentTrackIndex = newIdx;
      console.log(`[App] Index 已修正: 目前播放 "${currentSongName}" 改為索引 [${newIdx}]`);
    } else {
      currentTrackIndex = 0;
      window.currentTrackIndex = 0;
      console.warn(`[App] 警告: 原本播放的歌曲 "${currentSongName}" 在新清單中找不到，重置為 0`);
    }
  }
};

function setUpUIEvents() {
  const folderInput = document.getElementById('folder-input');
  const folderChooser = document.getElementById('folder-chooser');
  const folderOk = document.getElementById('folder-ok');

  folderInput.addEventListener('change', (e) => handleFolderSelect(e.target.files));

  folderOk.addEventListener('click', () => {
    if (tracks.length === 0) {
      // 沒歌時保持開啟
    }
    folderChooser.style.display = 'none';
  });

  const btnSettings = document.getElementById('btn-settings');
  // 【修改】：使用 SettingsUI.openSettings() 而不是跳轉頁面
  if (btnSettings) btnSettings.addEventListener('click', () => {
    if (window.SettingsUI) {
      window.SettingsUI.openSettings();
    } else {
      console.error("SettingsUI module not loaded.");
      window.location.href = 'setting.html'; // Fallback (雖然 setting.html 內容已經移除了)
    }
  });

  document.getElementById('btn-play').addEventListener('click', playPause);
  document.getElementById('btn-next').addEventListener('click', nextTrack);
  document.getElementById('btn-prev').addEventListener('click', previousTrack);
  document.getElementById('btn-random').addEventListener('click', () => {
    isRandom = !isRandom;
    document.getElementById('btn-random').innerHTML = isRandom ? '<i class="fa-solid fa-shuffle" style="color: gold;">' : '<i class="fa-solid fa-shuffle">';
  });
  document.getElementById('btn-repeat').addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    const text = repeatMode === 0 ? '<i class="fa-solid fa-repeat"></i>' : (repeatMode === 1 ? '<i class="fa-solid fa-repeat" style="color: gold;">&nbsp;1</i>' : '<i class="fa-solid fa-repeat" style="color: gold;">A</i>');
    document.getElementById('btn-repeat').innerHTML = text;
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
  if (chooser) chooser.style.display = show ? 'block' : 'none';
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

  scanFiles(files);
  saveConfig();
  showFolderChooser(false);
}

function scanFiles(files) {
  const validExt = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];
  const folderMaps = {};

  // 1. 建立新掃描的檔案 Map
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

    // 嘗試沿用舊的音量設定
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

  // 2. 更新 config.folders
  config.folders.forEach(folderCfg => {
    const key = normalizePath(folderCfg.path || '');
    const map = folderMaps[key] || {};

    // 【關鍵修正】：
    // 在清空 folderCfg.tracks 之前，先保存當前的順序 (舊順序)
    // 因為 config 是從 localStorage 讀出來的，裡面包含了上次排好的順序
    const oldOrder = (folderCfg.tracks || []).map(t => t.filename);

    folderCfg.tracks = [];

    // A. 先依照舊順序加入
    oldOrder.forEach(mainName => {
      if (map[mainName]) {
        const audioTracks = map[mainName].map(t => ({
          filename: t.filename,
          relPath: t.relPath,
          blobUrl: t.blobUrl,
          volume: t.volume,
          mute: t.mute || false,
          suffix: t.suffix
        }));
        folderCfg.tracks.push({ filename: mainName, audioTracks });
        // 加入後從 map 中移除，避免重複加入
        delete map[mainName];
      }
    });

    // B. 將剩下的 (新檔案) 加入
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

  console.log("掃描完成，config 更新完畢 (已保留舊排序)");
  generateTrackListFromConfig();
}

function generateTrackListFromConfig() {
  // 這裡不清除 audioElements，避免打斷正在播放的音樂
  const newTracks = [];

  if (!config.folders || config.folders.length === 0) return;
  const folder = config.folders[0];

  if (folder && folder.tracks) {
    folder.tracks.forEach(t => {
      newTracks.push({ baseName: t.filename, audioTracks: t.audioTracks.map(at => ({ ...at })) });
    });
  }

  tracks = newTracks;
  window.tracks = tracks;

  console.log("播放清單已更新，共", tracks.length, "首");

  // 僅在沒有音樂正在播放且清單不為空時，才載入第一首 (初始化用)
  if (tracks.length > 0 && audioElements.length === 0) {
    loadTrack(0);
  }
}

function loadTrack(index) {
  if (!tracks[index]) return;
  currentTrackIndex = index;
  window.currentTrackIndex = index;

  const track = tracks[index];
  console.log(`載入歌曲 [${index}]: ${track.baseName}`);
  document.getElementById('music-name').innerText = track.baseName;

  audioElements.forEach(a => { try { a.pause(); } catch { } });
  audioElements = [];

  const vc = document.getElementById('volume-controls');
  vc.innerHTML = '';

  track.audioTracks.forEach((at, idx) => {
    const audio = new Audio();
    audio.src = at.blobUrl || at.relPath;
    audio.preload = 'auto';
    audio.volume = (at.mute ? 0 : ((typeof at.volume === 'number') ? (at.volume / 100) : 0.85));
    audioElements.push(audio);

    const row = document.createElement('div');
    row.className = 'volume-track';

    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerText = at.suffix ? `(${at.suffix})` : '(未知)';
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => {
      toggleMuteForTrack(idx);
    });
    row.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0; slider.max = 100;
    slider.value = at.mute ? 0 : (at.volume ?? 85);
    slider.style.width = '85%';
    row.appendChild(slider);

    const num = document.createElement('input');
    num.type = 'number';
    num.min = 0; num.max = 100;
    num.value = at.mute ? 0 : (at.volume ?? 85);
    num.style.width = '10%';
    row.appendChild(num);

    slider.addEventListener('input', () => {
      num.value = slider.value;
      audio.volume = slider.value / 100;
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
    at._ui = { slider, num, label, audio };
  });

  if (audioElements[0]) {
    const first = audioElements[0];
    first.addEventListener('ended', onTrackEnd);

    const startPlay = () => {
      if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
      if (syncIntervalId) clearInterval(syncIntervalId);

      initialSyncTimeoutId = setTimeout(() => {
        syncCheckAndFix();
        syncIntervalId = setInterval(() => {
          if (!audioElements.length) return;
          if (audioElements[0].paused) return;
          syncCheckAndFix();
        }, 3000);
      }, 200);
    };

    first.addEventListener('canplaythrough', startPlay, { once: true });

    first.play().then(() => {
      audioElements.forEach((a, i) => { if (a !== first) a.play().catch(() => { }); });
      startProgressLoop();
      startPlay();
    }).catch(err => {
      console.warn("播放失敗 (可能是 blob 失效或格式不支援):", err);
    });

    first.addEventListener('pause', () => {
      if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
      if (initialSyncTimeoutId) { clearTimeout(initialSyncTimeoutId); initialSyncTimeoutId = null; }
    });
  }
}

function toggleMuteForTrack(idx) {
  const track = tracks[currentTrackIndex];
  if (!track) return;
  const at = track.audioTracks[idx];
  if (!at) return;
  const ui = at._ui;
  if (!ui) return;

  if (!at.mute) {
    at.mute = true;
    ui.audio.volume = 0;
    ui.slider.value = 0;
    ui.num.value = 0;
    ui.label.style.opacity = '0.6';
  } else {
    at.mute = false;
    const restored = at.volume ?? 85;
    ui.audio.volume = restored / 100;
    ui.slider.value = restored;
    ui.num.value = restored;
    ui.label.style.opacity = '1';
  }
  saveConfig();
}

function onTrackEnd() {
  if (repeatMode === 1) {
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
    at.mute = false;
    saveConfig();
  } catch (e) { console.error("persistVolumeSetting 錯誤", e); }
}

function playPause() {
  if (!audioElements.length) return;
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn("play error", e)));
    document.getElementById('btn-play').innerHTML = '<i class="fa-solid fa-pause"></i>';
    if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
    initialSyncTimeoutId = setTimeout(() => { syncCheckAndFix(); syncIntervalId = setInterval(() => { if (!audioElements[0].paused) syncCheckAndFix(); }, 5000); }, 200);
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerHTML = '<i class="fa-solid fa-play"></i>';
    if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
    if (initialSyncTimeoutId) { clearTimeout(initialSyncTimeoutId); initialSyncTimeoutId = null; }
  }
}

function nextTrack() {
  if (!tracks.length) return;
  currentTrackIndex = isRandom ? Math.floor(Math.random() * tracks.length) : (currentTrackIndex + 1) % tracks.length;
  console.log("Next Track -> Index:", currentTrackIndex);
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
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}:${millis.toString().padStart(3, '0')}`;
}

function syncCheckAndFix() {
  if (!audioElements.length) return;
  const now = Date.now();
  if (now - lastSyncAdjustTimestamp < 600) return;

  const timesMs = audioElements.map(a => Math.round((a.currentTime || 0) * 1000));
  const freq = {};
  timesMs.forEach(t => freq[t] = (freq[t] || 0) + 1);
  let mostCommonTime = null; let mostCount = 0;
  for (const k in freq) {
    if (freq[k] > mostCount) { mostCount = freq[k]; mostCommonTime = parseInt(k); }
  }

  const uniqueTimes = Object.keys(freq).length;
  let refTime = mostCommonTime;
  if (uniqueTimes > 1) {
    const vocalsIndex = tracks[currentTrackIndex]?.audioTracks?.findIndex(at => at.suffix === 'Vocals');
    if (vocalsIndex != null && vocalsIndex >= 0 && vocalsIndex < audioElements.length) {
      refTime = Math.round((audioElements[vocalsIndex].currentTime || 0) * 1000);
    }
  }

  const toleranceMs = 15;
  const diffs = timesMs.map(t => t - refTime);
  const needAdjust = diffs.some(d => Math.abs(d) > toleranceMs);
  if (!needAdjust) return;

  const before = audioElements.map((a, i) => ({ label: tracks[currentTrackIndex]?.audioTracks?.[i]?.suffix || a.src || i, timeMs: timesMs[i] }));

  const finalRef = refTime;
  audioElements.forEach(a => {
    try {
      a.currentTime = finalRef / 1000;
    } catch (e) {
      console.warn('調整時間失敗', e);
    }
  });

  lastSyncAdjustTimestamp = Date.now();

  setTimeout(() => {
    const afterMs = audioElements.map(a => Math.round((a.currentTime || 0) * 1000));
    const after = audioElements.map((a, i) => ({ label: tracks[currentTrackIndex]?.audioTracks?.[i]?.suffix || a.src || i, timeMs: afterMs[i] }));
    // console.log('已調整音軌, 調整前', before.map(b => `${b.label} ${formatTimeMs(b.timeMs)}`).join(', '), '調整後', after.map(b => `${b.label} ${formatTimeMs(b.timeMs)}`).join(', '));
    flashProgressBar();
  }, 80);
}

function flashProgressBar() {
  const p = document.getElementById('progress');
  if (!p) return;
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