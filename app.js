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

  // 【新增】設定 Media Session API (手機通知列控制)
  setupMediaSession();

  window.loadTrack = loadTrack;
  window.currentTrackIndex = currentTrackIndex;

  window.AppAudioControl = {
    getCurrentTime: () => audioElements[0] ? audioElements[0].currentTime : 0,
    seekTo: (time) => {
      if (audioElements.length) {
        audioElements.forEach(a => a.currentTime = time);
        updateMediaSessionPositionState(); // 更新通知列進度
      }
    },
    getConfig: () => config,
    saveConfig: saveConfig,
    // 【新增】：允許 setting.js 呼叫此函式載入範本檔案
    loadFiles: (files) => {
      scanFiles(files);
      saveConfig();
    },
    // 新增：切換資料夾並重整清單
    switchFolder: (path) => {
      config.activeFolderPath = path;
      saveConfig();
      generateTrackListFromConfig();
    }
  };

  console.log("初始化：等待使用者重新選擇資料夾以更新 Blob URL");
  showFolderChooser(true);

  console.log("initializeApp done");
}

// 【新增】設定 Media Session Action Handlers
function setupMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => playPause());
    navigator.mediaSession.setActionHandler('pause', () => playPause());
    navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());

    // 支援進度條拖曳 (Seek)
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audioElements.length && details.seekTime !== undefined) {
        audioElements.forEach(a => a.currentTime = details.seekTime);
        updateMediaSessionPositionState();
      }
    });
  }
}

// 【新增】更新 Media Session Metadata (歌名、演出者)
function updateMediaSessionMetadata() {
  if (!('mediaSession' in navigator) || !tracks[currentTrackIndex]) return;

  const track = tracks[currentTrackIndex];
  // 嘗試從檔名解析更漂亮的標題 (可選)
  // 這裡直接使用 baseName
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.baseName,
    artist: 'MultiTracks Player',
    album: config.activeFolderPath || 'Unknown Folder',
    artwork: [
      // 這裡可以放預設圖示，如果沒有就留空
      // { src: 'icon.png', sizes: '96x96', type: 'image/png' }
    ]
  });
}

// 【新增】更新 Media Session Position State (進度條)
function updateMediaSessionPositionState() {
  if (!('mediaSession' in navigator) || !audioElements[0]) return;

  const audio = audioElements[0];
  if (isNaN(audio.duration) || isNaN(audio.currentTime)) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: audio.currentTime
    });
  } catch (e) {
    // 某些情況下 duration 可能還沒準備好，忽略錯誤
    console.warn("MediaSession update failed:", e);
  }
}

window.onPlaylistUpdated = function () {
  console.log("[App] 收到播放清單更新通知，正在重新同步...");
  const newCfg = readConfig();
  if (!newCfg || !newCfg.folders) return;

  const oldTracksMap = new Map();
  tracks.forEach(t => oldTracksMap.set(t.baseName, t));

  // 保留 activeFolderPath
  const currentActive = config.activeFolderPath;
  config = newCfg;
  if (!config.activeFolderPath && currentActive) config.activeFolderPath = currentActive;

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

  scanFiles(files);
  saveConfig();
  showFolderChooser(false);
}

// 【BUG 修復】：scanFiles 必須在有新檔案時，強制更新 activeFolderPath
function scanFiles(files) {
  const validAudioExt = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];
  const folderMaps = {}; // 存放本次掃描到的檔案結構
  const srtFiles = [];

  // 1. 解析本次輸入的檔案
  files.forEach(file => {
    const relPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = relPath.split('/');
    // 如果有路徑則取第一層目錄，否則為 '' (root)
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

    // 嘗試從現有 config 找回舊音量設定
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

    const folderKey = normalizePath(folder || ''); // 統一路徑格式

    if (!folderMaps[folderKey]) folderMaps[folderKey] = {};
    if (!folderMaps[folderKey][mainName]) folderMaps[folderKey][mainName] = [];
    folderMaps[folderKey][mainName].push(entry);
  });

  // 2. 針對「本次掃描到的資料夾」進行更新
  // 我們只迭代 folderMaps 的 key，這樣就不會動到 config 裡其他無關的資料夾
  Object.keys(folderMaps).forEach(targetFolderKey => {

    // 找找看 config 裡面有沒有這個資料夾
    let folderCfg = config.folders.find(f => normalizePath(f.path || '') === targetFolderKey);

    // 如果沒有，就新增一個
    if (!folderCfg) {
      folderCfg = { path: targetFolderKey, tracks: [] };
      config.folders.push(folderCfg);
    }

    const map = folderMaps[targetFolderKey];
    // 備份該資料夾原本的順序
    const oldOrder = (folderCfg.tracks || []).map(t => t.filename);

    // 清空該資料夾的 tracks，準備重建 (因為這是「重新掃描該資料夾」的行為)
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

      // 字幕配對 (放寬條件，比對本次掃描到的所有 SRT)
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
        console.log(`[${targetFolderKey}] 字幕配對: ${mainName} <-> SRT`);
      }

      return { filename: mainName, audioTracks, lyricsFile: matchedSrt };
    };

    // A. 依照舊順序加入
    oldOrder.forEach(mainName => {
      if (map[mainName]) {
        folderCfg.tracks.push(createTrackEntry(mainName));
        delete map[mainName]; // 標記已處理
      }
    });

    // B. 加入剩下的新檔案
    Object.keys(map).forEach(mainName => {
      folderCfg.tracks.push(createTrackEntry(mainName));
    });
  });

  // 【關鍵修正】：如果本次掃描有結果，強制將 activeFolderPath 切換到第一個被更新的資料夾
  // 這解決了「原本停留在 Sample Music，但使用者選擇了本地資料夾後，播放器還是顯示空的 Sample Music」的問題
  const scannedFolderKeys = Object.keys(folderMaps);
  if (scannedFolderKeys.length > 0) {
    // 優先選擇第一個掃描到的資料夾
    config.activeFolderPath = scannedFolderKeys[0];
    console.log(`Active Folder Switched to: [${config.activeFolderPath}]`);
  } else if (!config.activeFolderPath && config.folders.length > 0) {
    // 如果沒有掃描到東西且沒有當前資料夾，預設選第一個
    config.activeFolderPath = config.folders[0].path;
  }

  console.log("掃描完成，Active Folder:", config.activeFolderPath);
  generateTrackListFromConfig();
}

// 只載入 config.activeFolderPath 指定的資料夾
function generateTrackListFromConfig() {
  const newTracks = [];

  if (!config.folders || config.folders.length === 0) {
    tracks = [];
    return;
  }

  // 1. 確定要顯示哪個資料夾
  let targetFolder = config.folders.find(f => normalizePath(f.path) === normalizePath(config.activeFolderPath));

  // 如果找不到目標資料夾(可能被刪除了)，預設切回第一個
  if (!targetFolder && config.folders.length > 0) {
    targetFolder = config.folders[0];
    config.activeFolderPath = targetFolder.path;
  }

  if (targetFolder && targetFolder.tracks) {
    targetFolder.tracks.forEach(t => {
      newTracks.push({
        baseName: t.filename,
        audioTracks: t.audioTracks.map(at => ({ ...at })),
        lyricsFile: t.lyricsFile
      });
    });
  }

  tracks = newTracks;
  window.tracks = tracks; // 同步全域

  console.log(`播放清單已更新 [${config.activeFolderPath}]，共 ${tracks.length} 首`);

  // 重置索引並載入第一首 (避免重整後不自動準備播放)
  if (tracks.length > 0 && audioElements.length === 0) {
    loadTrack(0);
  }

  // 觸發播放清單UI更新
  if (window.PlaylistUI && document.getElementById('playlist-modal') && document.getElementById('playlist-modal').style.display !== 'none') {
    window.PlaylistUI.renderList();
    window.PlaylistUI.updateHeaderTitle();
  }
}

function loadTrack(index) {
  if (!tracks[index]) return;
  currentTrackIndex = index;
  window.currentTrackIndex = index;

  const track = tracks[index];
  console.log(`載入歌曲 [${index}]: ${track.baseName}`);
  document.getElementById('music-name').innerText = track.baseName;

  // 【新增】更新通知列 Metadata
  updateMediaSessionMetadata();

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

    // 【新增】當準備好播放時更新一次狀態，確保 duration 正確
    first.addEventListener('loadedmetadata', () => {
      updateMediaSessionPositionState();
    });

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
      // 【新增】播放成功後，更新通知列狀態為播放中
      navigator.mediaSession.playbackState = 'playing';
      updateMediaSessionPositionState();
    }).catch(err => console.warn("播放失敗:", err));

    first.addEventListener('pause', () => {
      if (syncIntervalId) clearInterval(syncIntervalId);
      // 【新增】暫停時更新通知列
      navigator.mediaSession.playbackState = 'paused';
    });
  }

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
    // 修正：需遍歷所有 folder 找對應的 track
    config.folders.forEach(folder => {
      if (folder.tracks) {
        const tr = folder.tracks.find(t => t.filename === baseName);
        if (tr) {
          const at = tr.audioTracks.find(a => a.filename === filename);
          if (at) {
            at.volume = volume;
            at.mute = false;
          }
        }
      }
    });
    saveConfig();
  } catch (e) { console.error(e); }
}

function playPause() {
  if (!audioElements.length) return;
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn(e)));
    document.getElementById('btn-play').innerHTML = '<i class="fa-solid fa-pause"></i>';

    // 【新增】更新通知列狀態
    navigator.mediaSession.playbackState = 'playing';
    updateMediaSessionPositionState();

    if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
    initialSyncTimeoutId = setTimeout(() => { syncCheckAndFix(); syncIntervalId = setInterval(() => { if (!audioElements[0].paused) syncCheckAndFix(); }, 5000); }, 200);
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerHTML = '<i class="fa-solid fa-play"></i>';

    // 【新增】更新通知列狀態
    navigator.mediaSession.playbackState = 'paused';

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

function seekForward() {
  // 快進 5 秒
  if (!audioElements.length) return;
  const newTime = Math.min(audioElements[0].duration || 0, audioElements[0].currentTime + skipSeconds);
  audioElements.forEach(a => a.currentTime = newTime);
  updateMediaSessionPositionState();
}
function seekBackward() {
  // 快退 5 秒
  if (!audioElements.length) return;
  const newTime = Math.max(0, audioElements[0].currentTime - skipSeconds);
  audioElements.forEach(a => a.currentTime = newTime);
  updateMediaSessionPositionState();
}

function onProgressChange(e) {
  if (!audioElements.length) return;
  const val = parseFloat(e.target.value);
  const first = audioElements[0];
  const newTime = (val / 100) * (first.duration || 0);
  audioElements.forEach(a => a.currentTime = newTime);
  // 【新增】手動拖曳進度條時，也要更新通知列
  updateMediaSessionPositionState();
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