

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
let lastSyncAdjustTimestamp = 0;
// 防抖 Timer
let saveVolumeTimeout = null;

// 用於區分單擊與雙擊的 Timer
let clickTimeout = null;

// 動態偏移補償 (針對手機延遲)
// 結構: { filename: offsetMs } (offsetMs 單位為毫秒)
let trackOffsets = {};
// 標記是否正在等待校正後的驗證
let isVerifyingSync = false;

function normalizePath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
}

// 計算路徑深度差 (用於決定 relPathXOrder 的 X)
// root: "UVR", path: "UVR" -> 0
// root: "UVR", path: "UVR/Sub" -> 1
function calcFolderDepth(rootPath, currentPath) {
  const normRoot = normalizePath(rootPath);
  const normCurr = normalizePath(currentPath);

  if (normCurr === normRoot) return 0;
  if (normCurr.startsWith(normRoot + '/')) {
    const sub = normCurr.substring(normRoot.length + 1);
    return sub.split('/').length;
  }
  return 0; // Fallback
}

function readConfig() {
  const defaultCfg = {
    filenameRules: [
      { pattern: "\\(Bass\\)$", name: "Bass" },
      { pattern: "\\(Drums\\)$", name: "Drums" },
      { pattern: "\\(Instrumental\\)$", name: "Instrumental" },
      { pattern: "\\(Other\\)$", name: "Other" },
      { pattern: "\\(Vocals\\)$", name: "Vocals" }
    ],
    skipSeconds: 5,
    lyricsFontSize: { line1: 14, line2: 20, line3: 16 },
    lyricsDisplayOffset: 0,
    showDebugInfo: false,
    activeFolderPath: "",
    appTheme: localStorage.getItem('appTheme') || "light",
    folders: []
  };

  const raw = localStorage.getItem('config');
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      // 合併預設值，避免新使用者的設定檔殘缺
      return { ...defaultCfg, ...cfg };
    } catch (e) {
      console.error("readConfig JSON 錯誤", e);
    }
  }
  return defaultCfg;
}

function saveConfig() {
  try {
    // 為了避免 localStorage 儲存過多垃圾，不將 Blob URL 存入 (因重整後無效)
    // 但我們會儲存字體大小等設定
    // 將 folders 移到最下方
    const orderedCfg = {};
    for (const key in config) {
      if (key !== 'folders') {
        orderedCfg[key] = config[key];
      }
    }
    orderedCfg.folders = config.folders || [];
    config = orderedCfg;

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
      config.activeFolderPath = normalizePath(path);
      saveConfig();
      generateTrackListFromConfig();
    },
    // 新增：允許 setting.js 即時設定跳轉秒數
    setSkipSeconds: (seconds) => {
      skipSeconds = seconds;
      config.skipSeconds = seconds;
    },
    // 新增：儲存單曲歌詞時間偏移 (秒數)
    saveTrackLyricsOffset: (baseName, offset) => {
      // 1. 更新 config
      config.folders.forEach(folder => {
        if (folder.tracks) {
          const t = folder.tracks.find(tr => tr.filename === baseName);
          if (t) t.lyricsTimeOffset = offset;
        }
      });
      // 2. 更新當前播放清單 (若是當前歌曲)
      if (window.tracks) {
        const t = window.tracks.find(tr => tr.baseName === baseName);
        if (t) t.lyricsTimeOffset = offset;
      }
      saveConfig();
    },
    // 新增：儲存全域歌詞顯示偏移 (行數)
    saveLyricsDisplayOffset: (offset) => {
      config.lyricsDisplayOffset = offset;
      saveConfig();
    },
    // 新增：取得全域歌詞顯示偏移
    getLyricsDisplayOffset: () => {
      return config.lyricsDisplayOffset || 0;
    }
  };

  toggleDebugInfoDisplay();
  console.log("初始化：等待使用者重新選擇資料夾以更新 Blob URL");
  showFolderChooser(true);
  console.log("initializeApp done");
}

function toggleDebugInfoDisplay() {
  const debugEl = document.getElementById('debug-info');
  if (debugEl) {
    debugEl.style.display = config.showDebugInfo ? 'block' : 'none';
  }
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
  const debugSetting = config.showDebugInfo;

  config = newCfg;
  if (!config.activeFolderPath && currentActive) config.activeFolderPath = currentActive;
  if (config.showDebugInfo === undefined) config.showDebugInfo = debugSetting;

  // 更新 skipSeconds
  skipSeconds = config.skipSeconds || 5;

  // 將 Blob URL 填回 config
  config.folders.forEach(folder => {
    folder.tracks.forEach(t => {
      const oldT = oldTracksMap.get(t.filename);
      if (oldT) {
        t.lyricsFile = oldT.lyricsFile;
        // 保留可能尚未儲存到 config 但存在於 runtime 的 lyricsTimeOffset
        if (t.lyricsTimeOffset === undefined && oldT.lyricsTimeOffset !== undefined) {
          t.lyricsTimeOffset = oldT.lyricsTimeOffset;
        }
        t.audioTracks.forEach(at => {
          const oldAt = oldT.audioTracks.find(oa => oa.filename === at.filename);
          if (oldAt) at.blobUrl = oldAt.blobUrl;
        });
      }
    });
  });

  const currentSongName = tracks[currentTrackIndex]?.baseName;
  generateTrackListFromConfig();
  toggleDebugInfoDisplay();

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

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.add('show');

  // 如果之前有 timer 正在跑，清除它以重置時間
  if (toast.hideTimeout) clearTimeout(toast.hideTimeout);

  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

function setUpUIEvents() {
  const folderInput = document.getElementById('folder-input');
  const filesInput = document.getElementById('files-input');
  const folderChooser = document.getElementById('folder-chooser');
  const folderOk = document.getElementById('folder-ok');

  folderInput.addEventListener('change', (e) => handleFolderSelect(e.target.files));
  if (filesInput) {
    filesInput.addEventListener('change', (e) => handleFolderSelect(e.target.files));
  }
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
    document.getElementById('btn-random').innerHTML = isRandom ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="gold" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>';
  });
  document.getElementById('btn-repeat').addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    const text = repeatMode === 0 ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>' : (repeatMode === 1 ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="gold" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg><span style="color: gold; font-size: 12px; margin-left: 2px;">1</span>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="gold" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg><span style="color: gold; font-size: 12px; margin-left: 2px;">A</span>');
    document.getElementById('btn-repeat').innerHTML = text;
  });

  const nameEl = document.getElementById('music-name');
  nameEl.addEventListener('click', (e) => {
    // 區分單擊與雙擊：利用延遲
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
      // 這是雙擊 (跳轉邏輯)
      const rect = e.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width / 2) seekForward(); else seekBackward();
    } else {
      // 這是單擊 (複製邏輯)
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        // 執行複製
        const textToCopy = nameEl.innerText;
        if (textToCopy && textToCopy !== '尚未載入歌曲 - 請選擇音樂資料夾或至設定新增資料夾') {
          navigator.clipboard.writeText(textToCopy).then(() => {
            showToast("已複製歌名 (Copied title)");
          }).catch(err => {
            console.error('Copy failed', err);
            showToast("複製失敗");
          });
        }
      }, 250); // 250ms 延遲等待確認是否為雙擊
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
// 【修改】：保留 relPathXOrder 排序參數
// 【修改】：修復檔案移動後音量重置問題 (Bug 1)，以及Active Folder重置問題 (Bug 2)
// 【新增】：保留 lyricsTimeOffset 參數
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

    // 嘗試從現有 config 找回舊音量設定 與 排序設定
    let oldVolume = 85;
    let oldMute = false;
    let oldOrders = {}; // 用來存 relPathXOrder
    let oldLyricsTimeOffset = 0; // 用來存單曲歌詞偏移

    for (let folderCfg of config.folders) {
      const matchTrack = folderCfg.tracks?.find(t => t.filename === mainName);
      if (matchTrack) {
        // 抓出所有 relPathXOrder 屬性
        Object.keys(matchTrack).forEach(key => {
          if (/^relPath\d+Order$/.test(key)) {
            oldOrders[key] = matchTrack[key];
          }
        });

        // 保留歌詞時間偏移
        if (matchTrack.lyricsTimeOffset !== undefined) {
          oldLyricsTimeOffset = matchTrack.lyricsTimeOffset;
        }

        // 【Bug 1 修復】：這裡原本是比對 relPath，現在改為比對 filename
        // 只要檔名相同 (例如 "1_001.迷星叫_(Bass).mp3")，就視為同一首歌的該音軌，
        // 即使它被移動到子目錄下，也能找回音量設定。
        const matchAudio = matchTrack.audioTracks?.find(a => a.filename === name);

        if (matchAudio) {
          oldVolume = matchAudio.volume ?? 85;
          oldMute = matchAudio.mute ?? false;
        }
        if (Object.keys(oldOrders).length > 0 || matchAudio) break;
      }
    }

    const blobUrl = URL.createObjectURL(file);
    const entry = { filename: name, relPath, blobUrl, volume: oldVolume, mute: oldMute, suffix, oldOrders, oldLyricsTimeOffset };

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
    // 備份該資料夾原本的順序 (保留舊 tracks 的參考，用來恢復排序屬性，雖然上面已經做了一次查找，但這裡是針對資料夾內的重建)
    const oldTracksMap = new Map();
    if (folderCfg.tracks) {
      folderCfg.tracks.forEach(t => oldTracksMap.set(t.filename, t));
    }

    // 備份該資料夾原本的順序 (Filename List)
    const oldOrder = (folderCfg.tracks || []).map(t => t.filename);

    // 清空該資料夾的 tracks，準備重建 (因為這是「重新掃描該資料夾」的行為)
    folderCfg.tracks = [];

    const createTrackEntry = (mainName) => {
      // 取得第一筆 entry 裡面的 oldOrders (因為同一首歌的 oldOrders 應該一樣)
      const firstEntry = map[mainName][0];
      const recoveredOrders = firstEntry.oldOrders || {};
      const recoveredLyricsOffset = firstEntry.oldLyricsTimeOffset || 0;

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

      // 建立新物件，並展開 recoveredOrders
      return {
        filename: mainName,
        audioTracks,
        lyricsFile: matchedSrt,
        lyricsTimeOffset: recoveredLyricsOffset, // 寫回單曲歌詞偏移
        ...recoveredOrders // 寫回 relPathXOrder
      };
    };

    // A. 依照舊順序加入 (Array Order)
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

  // 【BUG 2 修復】：如果本次掃描有結果，先檢查當前的 activeFolderPath 是否有效
  // 如果有效 (即位於本次掃描的根目錄下)，則保留，不要強制跳回 Root
  const scannedFolderKeys = Object.keys(folderMaps);
  let isCurrentActiveValid = false;

  if (config.activeFolderPath && scannedFolderKeys.length > 0) {
    const normActive = normalizePath(config.activeFolderPath);
    // 檢查 activePath 是否屬於本次掃描到的任一 Root Folder (或者是其子目錄)
    for (const rootKey of scannedFolderKeys) {
      const normRoot = normalizePath(rootKey);
      if (normActive === normRoot || normActive.startsWith(normRoot + '/')) {
        isCurrentActiveValid = true;
        break;
      }
    }
  }

  if (isCurrentActiveValid) {
    console.log(`保留原本 Active Folder: [${config.activeFolderPath}]`);
  } else if (scannedFolderKeys.length > 0) {
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

// 【Modified】支援子資料夾過濾 與 多層次排序
// 只載入 config.activeFolderPath 指定的資料夾或子資料夾
function generateTrackListFromConfig() {
  const newTracks = [];
  if (!config.folders || config.folders.length === 0) {
    tracks = [];
    return;
  }

  const normActivePath = normalizePath(config.activeFolderPath);

  // 1. 尋找對應的 Config Folder (父資料夾)
  // 因為 config.folders 只存 root level，所以我們要找 activeFolderPath 是否以某個 config folder 開頭
  let targetFolder = config.folders.find(f => {
    const p = normalizePath(f.path);
    return normActivePath === p || normActivePath.startsWith(p + '/');
  });

  // 如果找不到 (可能被刪除或異常)，且有資料夾，預設回第一個根目錄
  if (!targetFolder && config.folders.length > 0) {
    targetFolder = config.folders[0];
    config.activeFolderPath = normalizePath(targetFolder.path); // 重置為根路徑
    console.warn(`Target folder not found for path [${normActivePath}], defaulting to [${config.activeFolderPath}]`);
  }

  // 暫存符合條件的 tracks，準備進行排序
  let validTracks = [];

  if (targetFolder && targetFolder.tracks) {
    targetFolder.tracks.forEach(t => {
      // 2. 過濾 tracks
      // 取出 track 的完整相對路徑，判斷是否位於 activeFolderPath 內
      // 假設 t.audioTracks[0].relPath 存在 (通常都有)
      if (t.audioTracks && t.audioTracks.length > 0) {
        const fullRelPath = normalizePath(t.audioTracks[0].relPath);

        // 取得檔案所在的目錄路徑
        const lastSlash = fullRelPath.lastIndexOf('/');
        const dirPath = lastSlash !== -1 ? fullRelPath.substring(0, lastSlash) : "";

        // 判斷邏輯：Starts With
        const isMatch = (dirPath === config.activeFolderPath) ||
          dirPath.startsWith(config.activeFolderPath + '/');

        if (isMatch) {
          validTracks.push({
            configTrack: t, // 保留原始 config 參照以供排序讀取
            uiTrack: {
              baseName: t.filename,
              audioTracks: t.audioTracks.map(at => ({ ...at })),
              lyricsFile: t.lyricsFile,
              lyricsTimeOffset: t.lyricsTimeOffset || 0 // 確保 UI track 也有這個屬性
            }
          });
        }
      }
    });
  }

  // 3. 根據層級深度進行排序
  const depth = calcFolderDepth(targetFolder.path, config.activeFolderPath);
  const orderKey = `relPath${depth}Order`;

  // 排序邏輯：
  // 如果有 orderKey，數值小的排前面。
  // 如果沒有 orderKey (新歌)，則預設視為非常大 (排在後面)，並保持原本 scan 的相對順序 (Stable Sort)
  validTracks.sort((a, b) => {
    const orderA = a.configTrack[orderKey];
    const orderB = b.configTrack[orderKey];

    // 如果兩者都有設定順序，比較順序
    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }
    // 如果 A 有 B 沒有，A 排前面
    if (orderA !== undefined) return -1;
    // 如果 B 有 A 沒有，B 排前面
    if (orderB !== undefined) return 1;

    // 都沒有順序，保持原樣 (因為 Array.sort 在現代瀏覽器通常是 stable，但為了保險可以不回傳 0 以外的值)
    return 0;
  });

  // 轉回 UI 需要的格式
  tracks = validTracks.map(vt => vt.uiTrack);
  window.tracks = tracks; // 同步全域

  console.log(`播放清單已更新 [${config.activeFolderPath}] (Depth: ${depth})，共 ${tracks.length} 首`);

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
  // 重置 offset
  trackOffsets = {};
  isVerifyingSync = false;

  const vc = document.getElementById('volume-controls');
  vc.innerHTML = '';

  track.audioTracks.forEach((at, idx) => {
    const audio = new Audio();
    audio.src = at.blobUrl || at.relPath;
    audio.preload = 'auto';

    // 【修正】靜音初始化：如果是 Vocals 設為 0，其他設為 0.01，現在改為全部 0.01 以避免延遲
    if (at.mute) {
      audio.volume = 0.01;
    } else {
      audio.volume = (typeof at.volume === 'number') ? (at.volume / 100) : 0.85;
    }

    // 綁定 key 用於查詢 offset
    audio.dataset.filename = at.filename;
    audio.dataset.suffix = at.suffix || 'Unknown';

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

    // UI 顯示：靜音時 Slider 顯示 1
    if (at.mute) {
      slider.value = 1;
    } else {
      slider.value = (at.volume ?? 85);
    }

    slider.style.width = '85%';
    row.appendChild(slider);

    const num = document.createElement('input');
    num.type = 'number'; num.min = 0; num.max = 100;

    if (at.mute) {
      num.value = 1;
    } else {
      num.value = (at.volume ?? 85);
    }

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
        }, 1000);
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

function persistVolumeSetting(baseName, filename, volume) {
  if (saveVolumeTimeout) clearTimeout(saveVolumeTimeout);

  // 先更新記憶體
  try {
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
  } catch (e) { console.error(e); }

  // 防抖寫入
  saveVolumeTimeout = setTimeout(() => {
    saveConfig();
  }, 500);
}

function toggleMuteForTrack(idx) {
  const track = tracks[currentTrackIndex];
  if (!track) return;
  const at = track.audioTracks[idx];
  if (!at) return;
  const ui = at._ui;
  if (!ui) return;

  // UI 立即更新
  if (!at.mute) {
    at.mute = true;
    // 【修正】靜音邏輯：全部改為 0.01 以避免延遲
    ui.audio.volume = 0.01;
    ui.slider.value = 1;
    ui.num.value = 1;
    ui.label.style.opacity = '0.6';
  } else {
    at.mute = false; const restored = at.volume ?? 85;
    ui.audio.volume = restored / 100;
    ui.slider.value = restored; ui.num.value = restored; ui.label.style.opacity = '1';
  }

  // 【修正】如果是 Master (Vocals) 被切換，強制同步所有音軌
  if (at.suffix === 'Vocals') {
    console.log("Master (Vocals) mute toggled. Forcing full sync.");
    // 找出 Vocals 元素 (其實就是 audioElements[idx])
    const master = audioElements[idx];
    const masterTime = master.currentTime;

    audioElements.forEach(audio => {
      if (audio === master) return;
      const key = audio.dataset.filename;
      const savedOffsetMs = trackOffsets[key] || 0;
      audio.currentTime = masterTime + (savedOffsetMs / 1000);
    });
  }

  // 同步更新記憶體中的 config
  try {
    config.folders.forEach(folder => {
      if (folder.tracks) {
        const tr = folder.tracks.find(t => t.filename === track.baseName);
        if (tr) {
          const confAt = tr.audioTracks.find(a => a.filename === at.filename);
          if (confAt) confAt.mute = at.mute;
        }
      }
    });
  } catch (e) { console.error(e); }

  // 防抖存檔
  if (saveVolumeTimeout) clearTimeout(saveVolumeTimeout);
  saveVolumeTimeout = setTimeout(() => {
    saveConfig();
  }, 500);
}

function onTrackEnd() {
  if (repeatMode === 1) loadTrack(currentTrackIndex);
  else if (repeatMode === 2) nextTrack();
  else if (currentTrackIndex < tracks.length - 1) nextTrack();
}

function playPause() {
  if (!audioElements.length) return;
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn(e)));
    document.getElementById('btn-play').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

    // 【新增】更新通知列狀態
    navigator.mediaSession.playbackState = 'playing';
    updateMediaSessionPositionState();
    if (initialSyncTimeoutId) clearTimeout(initialSyncTimeoutId);
    initialSyncTimeoutId = setTimeout(() => { syncCheckAndFix(); syncIntervalId = setInterval(() => { if (!audioElements[0].paused) syncCheckAndFix(); }, 5000); }, 200);
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';

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
  // 快進 5 秒 (使用動態的 skipSeconds)
  if (!audioElements.length) return;
  const newTime = Math.min(audioElements[0].duration || 0, audioElements[0].currentTime + skipSeconds);
  audioElements.forEach(a => a.currentTime = newTime);
  updateMediaSessionPositionState();
}
function seekBackward() {
  // 快退 5 秒 (使用動態的 skipSeconds)
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

    if (config.showDebugInfo) {
      updateDebugInfoDisplay(audioElements);
    }

    updateLoopReq = requestAnimationFrame(loop);
  };
  loop();
}

function updateDebugInfoDisplay(elements) {
  const debugEl = document.getElementById('debug-info');
  if (!debugEl) return;

  // 找出 Master (Vocals or Index 0)
  let masterIdx = elements.findIndex(a => a.dataset.suffix === 'Vocals');
  if (masterIdx === -1) masterIdx = 0;

  const master = elements[masterIdx];
  const masterTime = master.currentTime;

  const m = Math.floor(masterTime / 60);
  const s = Math.floor(masterTime % 60);
  const ms = Math.floor((masterTime % 1) * 1000);
  const timeStr = `${m}:${s < 10 ? '0' + s : s}.${ms.toString().padStart(3, '0')}`;

  let html = `<b>Vocals:</b> <span style="color:#333; background:#eee; padding:0 2px;">${timeStr}</span>`;
  if (document.body.classList.contains('vscode-dark')) {
    html = `<b>Vocals:</b> <span style="color:#eee; background:#333; padding:0 2px;">${timeStr}</span>`;
  }

  elements.forEach((a, i) => {
    if (i === masterIdx) return;
    const diff = (a.currentTime - masterTime) * 1000; // ms
    const sign = diff > 0 ? '+' : '';
    const diffStr = `${sign}${Math.round(diff)}ms`;
    let color = 'inherit';
    // 【調整】閥值改為 10ms 和 5ms
    if (Math.abs(diff) > 10) color = 'red';
    else if (Math.abs(diff) > 5) color = 'orange';

    html += ` , <b>${a.dataset.suffix}:</b> <span style="color:${color}">${diffStr}</span>`;
  });

  debugEl.innerHTML = html;
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' + s : s}`;
}

// 【修正】主從式同步 + 動態偏移補償 + 閥值 10ms
function syncCheckAndFix() {
  if (!audioElements.length) return;
  if (isVerifyingSync) return;

  const now = Date.now();
  if (now - lastSyncAdjustTimestamp < 1000) return;

  // 1. 確定 Master
  let masterIdx = audioElements.findIndex(a => a.dataset.suffix === 'Vocals');
  if (masterIdx === -1) masterIdx = 0;
  const master = audioElements[masterIdx];
  const masterTime = master.currentTime;

  let needsFix = false;
  const threshold = 0.01; // 【修正】10ms

  // 2. 檢查是否有音軌偏移 (只查 Slave)
  for (let i = 0; i < audioElements.length; i++) {
    if (i === masterIdx) continue;
    const diff = audioElements[i].currentTime - masterTime;
    if (Math.abs(diff) > threshold) {
      needsFix = true;
      break;
    }
  }

  if (needsFix) {
    console.log("[Sync Triggered] " + getDebugInfoString(audioElements, false));

    // 3. 只調整跑掉的 Slave
    audioElements.forEach((slave, i) => {
      if (i === masterIdx) return;

      const diff = slave.currentTime - masterTime;
      if (Math.abs(diff) > threshold) {
        const key = slave.dataset.filename;
        const savedOffsetMs = trackOffsets[key] || 0;

        const targetTime = masterTime + (savedOffsetMs / 1000);
        slave.currentTime = targetTime;
      }
    });

    lastSyncAdjustTimestamp = Date.now();
    flashProgressBar();

    // 4. 0.5秒後驗證並學習
    isVerifyingSync = true;
    setTimeout(() => {
      verifySyncAndLearn(master);
      isVerifyingSync = false;
    }, 500);
  }
}

// 產生除錯字串 (共用)
function getDebugInfoString(elements, isHtml) {
  // 時間戳記
  const now = new Date();
  const ts = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
  let masterIdx = elements.findIndex(a => a.dataset.suffix === 'Vocals');
  if (masterIdx === -1) masterIdx = 0;
  const master = elements[masterIdx];
  const masterTime = master.currentTime;

  const m = Math.floor(masterTime / 60);
  const s = Math.floor(masterTime % 60);
  const ms = Math.floor((masterTime % 1) * 1000);
  const timeStr = `${m}:${s < 10 ? '0' + s : s}.${ms.toString().padStart(3, '0')}`;

  let output = `[${ts}]`;
  if (!isHtml) output = `Vocals: ${timeStr}`;

  elements.forEach((a, i) => {
    if (i === masterIdx) return;
    const diff = (a.currentTime - masterTime) * 1000;
    const sign = diff > 0 ? '+' : '';
    const diffStr = `${sign}${Math.round(diff)}ms`;
    if (!isHtml) output += ` , ${a.dataset.suffix}: ${diffStr}`;
  });
  return output;
}

function verifySyncAndLearn(master) {
  const masterTime = master.currentTime;

  audioElements.forEach((audio, i) => {
    if (audio === master) return;

    const diffMs = (audio.currentTime - masterTime) * 1000;
    const key = audio.dataset.filename;

    // 【修正】閥值改為 10ms
    if (Math.abs(diffMs) > 10) {
      if (!trackOffsets[key]) trackOffsets[key] = 0;

      // Offset += (-diff)
      trackOffsets[key] += (-diffMs);

      console.log(`[Sync Learn] ${audio.dataset.suffix} offset adjusted. Diff: ${Math.round(diffMs)}ms, New Offset: ${Math.round(trackOffsets[key])}ms`);
    } else {
      if (trackOffsets[key]) {
        trackOffsets[key] *= 0.8;
        if (Math.abs(trackOffsets[key]) < 5) trackOffsets[key] = 0;
      }
    }
  });
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