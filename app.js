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
    skipSeconds: 5,
    lyricsFontSize: { line1: 20, line2: 16, line3: 14 }
  };
}

function saveConfig() {
  try {
    // 為了避免 localStorage 儲存過多垃圾，不將 Blob URL 存入 (因重整後無效)
    // 但我們會儲存字體大小等設定
    localStorage.setItem('config', JSON.stringify(config));
  } catch (e) {
    console.error("saveConfig 錯誤", e);
  }
}

// 計算兩個字串的相似度 (Levenshtein Distance)
function calculateSimilarity(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const distance = matrix[len1][len2];
  const maxLength = Math.max(len1, len2);
  return maxLength === 0 ? 1.0 : 1.0 - distance / maxLength;
}

// 清洗檔名以進行比對
function cleanFilenameForMatching(name) {
  // 1. 移除第一個 _ 之前的內容 (包含 _)
  let processed = name;
  const underscoreIndex = name.indexOf('_');
  if (underscoreIndex !== -1) {
    processed = name.substring(underscoreIndex + 1);
  }
  // 2. 嘗試移除第一個 . 之前的內容 (包含 .)
  const dotIndex = processed.indexOf('.');
  if (dotIndex !== -1) {
    processed = processed.substring(dotIndex + 1);
  }
  // 移除可能的末尾底線
  if (processed.endsWith('_')) {
    processed = processed.slice(0, -1);
  }
  return processed;
}

async function initializeApp() {
  console.log("initializeApp start");
  config = readConfig();
  skipSeconds = config.skipSeconds || 5;
  setUpUIEvents();

  window.loadTrack = loadTrack;
  window.currentTrackIndex = currentTrackIndex;

  window.AppAudioControl = {
    getCurrentTime: () => audioElements[0] ? audioElements[0].currentTime : 0,
    seekTo: (time) => {
      if (audioElements.length) {
        audioElements.forEach(a => a.currentTime = time);
      }
    },
    getConfig: () => config,
    saveConfig: saveConfig
  };

  console.log("初始化：等待使用者重新選擇資料夾以更新 Blob URL");
  showFolderChooser(true);

  console.log("initializeApp done");
}

window.onPlaylistUpdated = function () {
  console.log("[App] 收到播放清單更新通知，正在重新同步...");
  const newCfg = readConfig();
  if (!newCfg || !newCfg.folders) return;

  // 這裡需要注意，readConfig 讀到的是 localStorage 裡的舊資料 (沒有 Blob URL)
  // 我們必須保留目前記憶體中有 Blob URL 的 audioTracks 和 lyricsFile
  // 但這裡簡化處理：因為 playlist.js 只是改順序，我們假設它保存時沒有破壞結構
  // 實際上 playlist.js 存的是 filename，我們需要重新 map 回記憶體中的 blob

  // 為了簡單起見，我們信任 tracks 陣列的 blobUrl 還在，只是順序變了
  // 更好的做法是讓 playlist.js 只傳遞新的順序 index，不過目前的架構是重讀 config
  // 所以這裡其實依賴 generateTrackListFromConfig 使用 *當前記憶體中的 config* (如果沒被覆蓋)
  // 或者我們重新 scan? 不，重整後 blob 就不見了。

  // 修正：我們使用 readConfig 取得順序，但保留當前 config 的 blob 資料
  // 這部分比較複雜，目前的實作是 playlist.js 存檔後，這裡讀檔會導致 blob 遺失
  // **但是**，只要使用者沒有按下 F5，瀏覽器記憶體內的 config 還是舊的嗎？
  // 不，playlist.js 寫入 localStorage 後，這裡讀出來的是沒有 blob 的。
  // **重要修正**：因為我們無法從 localStorage 恢復 Blob URL，
  // 當 playlist 更新順序時，我們應該從 `window.tracks` (舊的) 裡把 Blob URL 找回來填回去。

  const oldTracksMap = new Map();
  tracks.forEach(t => oldTracksMap.set(t.baseName, t));

  config.folders = newCfg.folders; // 更新為新順序

  // 將 Blob URL 填回 config
  config.folders.forEach(folder => {
    folder.tracks.forEach(t => {
      const oldT = oldTracksMap.get(t.filename);
      if (oldT) {
        t.lyricsFile = oldT.lyricsFile;
        t.audioTracks.forEach(at => {
          const oldAt = oldT.audioTracks.find(oa => oa.filename === at.filename);
          if (oldAt) at.blobUrl = oldAt.blobUrl;
        });
      }
    });
  });

  const currentSongName = tracks[currentTrackIndex]?.baseName;
  generateTrackListFromConfig();

  if (currentSongName) {
    const newIdx = tracks.findIndex(t => t.baseName === currentSongName);
    if (newIdx >= 0) {
      currentTrackIndex = newIdx;
      window.currentTrackIndex = newIdx;
      console.log(`[App] Index 已修正: ${newIdx}`);
    } else {
      currentTrackIndex = 0;
      window.currentTrackIndex = 0;
    }
  }
};

function setUpUIEvents() {
  const folderInput = document.getElementById('folder-input');
  const folderChooser = document.getElementById('folder-chooser');
  const folderOk = document.getElementById('folder-ok');

  folderInput.addEventListener('change', (e) => handleFolderSelect(e.target.files));
  folderOk.addEventListener('click', () => folderChooser.style.display = 'none');

  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => {
    if (window.SettingsUI) window.SettingsUI.openSettings();
    else window.location.href = 'setting.html';
  });

  const btnLyrics = document.getElementById('btn-lyrics');
  if (btnLyrics) btnLyrics.addEventListener('click', () => {
    if (window.LyricsUI) window.LyricsUI.openLyrics();
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
  const validAudioExt = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];
  const folderMaps = {};
  const srtFiles = [];

  // 1. 分類檔案
  files.forEach(file => {
    const relPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = relPath.split('/');
    const folder = parts.length > 1 ? parts[0] : '';
    const name = parts[parts.length - 1];
    const ext = (name.split('.').pop() || '').toLowerCase();

    if (ext === 'srt') {
      srtFiles.push({
        filename: name,
        nameNoExt: name.substring(0, name.lastIndexOf('.')),
        blobUrl: URL.createObjectURL(file),
        folderKey: normalizePath(folder || '')
      });
      return;
    }

    if (!validAudioExt.includes(ext)) return;

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
    const oldOrder = (folderCfg.tracks || []).map(t => t.filename);

    folderCfg.tracks = [];

    const createTrackEntry = (mainName) => {
      const audioTracks = map[mainName].map(t => ({
        filename: t.filename,
        relPath: t.relPath,
        blobUrl: t.blobUrl,
        volume: t.volume,
        mute: t.mute || false,
        suffix: t.suffix
      }));

      // 【字幕配對邏輯修正】
      let matchedSrt = null;
      let bestScore = 0;

      const cleanedSongName = cleanFilenameForMatching(mainName);

      // 放寬限制：比對所有掃描到的 SRT，不限制資料夾
      // 這樣能解決如果字幕放在根目錄但音樂在子目錄的情況
      srtFiles.forEach(srt => {
        const score = calculateSimilarity(cleanedSongName, srt.nameNoExt);
        // 提高標準：70% 以上
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          matchedSrt = srt.blobUrl;
        }
      });

      if (matchedSrt) {
        console.log(`字幕配對: [${mainName}] <-> [${matchedSrt.slice(-12)}] (${(bestScore * 100).toFixed(0)}%)`);
      }

      return { filename: mainName, audioTracks, lyricsFile: matchedSrt };
    };

    // A. 舊順序
    oldOrder.forEach(mainName => {
      if (map[mainName]) {
        folderCfg.tracks.push(createTrackEntry(mainName));
        delete map[mainName];
      }
    });

    // B. 新檔案
    Object.keys(map).forEach(mainName => {
      folderCfg.tracks.push(createTrackEntry(mainName));
    });
  });

  console.log("掃描完成，config 更新完畢");
  generateTrackListFromConfig();
}

function generateTrackListFromConfig() {
  const newTracks = [];
  if (!config.folders || config.folders.length === 0) return;
  const folder = config.folders[0];

  if (folder && folder.tracks) {
    folder.tracks.forEach(t => {
      newTracks.push({
        baseName: t.filename,
        audioTracks: t.audioTracks.map(at => ({ ...at })),
        lyricsFile: t.lyricsFile
      });
    });
  }

  tracks = newTracks;
  window.tracks = tracks;
  console.log("播放清單已更新，共", tracks.length, "首");

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
    label.addEventListener('click', () => toggleMuteForTrack(idx));
    row.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = 0; slider.max = 100;
    slider.value = at.mute ? 0 : (at.volume ?? 85);
    slider.style.width = '85%';
    row.appendChild(slider);

    const num = document.createElement('input');
    num.type = 'number'; num.min = 0; num.max = 100;
    num.value = at.mute ? 0 : (at.volume ?? 85);
    num.style.width = '10%';
    row.appendChild(num);

    slider.addEventListener('input', () => {
      num.value = slider.value; audio.volume = slider.value / 100;
      at.mute = false; at.volume = parseInt(slider.value);
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });
    num.addEventListener('change', () => {
      let v = parseInt(num.value) || 0; v = Math.min(100, Math.max(0, v));
      num.value = v; slider.value = v; audio.volume = v / 100;
      at.mute = false; at.volume = v;
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
    }).catch(err => console.warn("播放失敗:", err));
    first.addEventListener('pause', () => {
      if (syncIntervalId) clearInterval(syncIntervalId);
    });
  }

  // 通知歌詞模組更新
  if (window.LyricsUI && window.LyricsUI.isLyricsOpen()) {
    window.LyricsUI.reloadLyrics();
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
    at.mute = true; ui.audio.volume = 0;
    ui.slider.value = 0; ui.num.value = 0; ui.label.style.opacity = '0.6';
  } else {
    at.mute = false; const restored = at.volume ?? 85;
    ui.audio.volume = restored / 100;
    ui.slider.value = restored; ui.num.value = restored; ui.label.style.opacity = '1';
  }
  saveConfig();
}

function onTrackEnd() {
  if (repeatMode === 1) loadTrack(currentTrackIndex);
  else if (repeatMode === 2) nextTrack();
  else if (currentTrackIndex < tracks.length - 1) nextTrack();
}

function persistVolumeSetting(baseName, filename, volume) {
  try {
    const folder = config.folders[0];
    if (!folder || !folder.tracks) return;
    const tr = folder.tracks.find(t => t.filename === baseName);
    if (!tr) return;
    const at = tr.audioTracks.find(a => a.filename === filename);
    if (!at) return;
    at.volume = volume; at.mute = false;
    saveConfig();
  } catch (e) { console.error(e); }
}

function playPause() {
  if (!audioElements.length) return;
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn(e)));
    document.getElementById('btn-play').innerHTML = '<i class="fa-solid fa-pause"></i>';
    if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
    initialSyncTimeoutId = setTimeout(() => { syncCheckAndFix(); syncIntervalId = setInterval(() => { if (!audioElements[0].paused) syncCheckAndFix(); }, 5000); }, 200);
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerHTML = '<i class="fa-solid fa-play"></i>';
    if (syncIntervalId) clearInterval(syncIntervalId);
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

function syncCheckAndFix() {
  if (!audioElements.length) return;
  const now = Date.now();
  if (now - lastSyncAdjustTimestamp < 600) return;

  const timesMs = audioElements.map(a => Math.round((a.currentTime || 0) * 1000));
  const freq = {}; timesMs.forEach(t => freq[t] = (freq[t] || 0) + 1);
  let mostCommonTime = null; let mostCount = 0;
  for (const k in freq) { if (freq[k] > mostCount) { mostCount = freq[k]; mostCommonTime = parseInt(k); } }
  let refTime = mostCommonTime;
  const uniqueTimes = Object.keys(freq).length;
  if (uniqueTimes > 1) {
    const vocalsIndex = tracks[currentTrackIndex]?.audioTracks?.findIndex(at => at.suffix === 'Vocals');
    if (vocalsIndex != null && vocalsIndex >= 0) refTime = Math.round((audioElements[vocalsIndex].currentTime || 0) * 1000);
  }
  const diffs = timesMs.map(t => t - refTime);
  if (diffs.some(d => Math.abs(d) > 15)) {
    audioElements.forEach(a => a.currentTime = refTime / 1000);
    lastSyncAdjustTimestamp = Date.now();
    flashProgressBar();
  }
}

function flashProgressBar() {
  const p = document.getElementById('progress');
  if (!p) return;
  p.style.transition = 'box-shadow 0.06s, background-color 0.06s';
  p.style.boxShadow = '0 0 8px rgba(255,0,0,0.9)';
  p.style.backgroundColor = 'rgba(255,0,0,0.15)';
  setTimeout(() => { p.style.boxShadow = ''; p.style.backgroundColor = ''; }, 300);
}

async function loadTracksFromConfig() {
  if (!config || !config.folders || config.folders.length === 0) {
    showFolderChooser(true);
    return;
  }
  generateTrackListFromConfig();
}

initializeApp();