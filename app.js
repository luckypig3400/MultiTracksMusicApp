// app.js

// state
let config = null;
let tracks = [];           // 播放列表: 每首 { baseName, audioTracks: [{ filename, volume, blobUrl, relPath }] }
let audioElements = [];    // 對應 audio 元件（同步播放）
let currentTrackIndex = 0;
let skipSeconds = 5;
let repeatMode = 0; // 0 off,1 single,2 list
let isRandom = false;
let updateLoopReq = null;

// util: normalize path separators to forward slash, trim trailing slash
function normalizePath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

// read config from localStorage (primary)
function readConfig() {
  const raw = localStorage.getItem('config');
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      console.log("readConfig from localStorage:", cfg);
      return cfg;
    } catch (e) {
      console.error("readConfig parse error", e);
    }
  }
  // default
  return {
    folders: [], // { path: string, tracks: [ { filename: mainName, audioTracks:[{ filename, relPath, volume }] } ] }
    filenameRules: [
      { pattern: "_\\(Bass\\)$", name: "Bass" },
      { pattern: "_\\(Drums\\)$", name: "Drums" },
      { pattern: "_\\(Instrumental\\)$", name: "Instrumental" },
      { pattern: "_\\(Other\\)$", name: "Other" },
      { pattern: "_\\(Vocals\\)$", name: "Vocals" }
    ],
    skipSeconds: 5
  };
}

function saveConfig() {
  try {
    localStorage.setItem('config', JSON.stringify(config));
    console.log("config saved");
  } catch (e) {
    console.error("saveConfig error", e);
  }
}

// ---------- Initialization ----------
async function initializeApp() {
  console.log("initializeApp start");
  config = readConfig();
  skipSeconds = config.skipSeconds || 5;

  // setup UI events
  setUpUIEvents();

  // If no folders in config, show chooser popup (with visible input)
  if (!config.folders || config.folders.length === 0) {
    console.log("no folders configured -> show folder chooser UI");
    showFolderChooser(true);
  } else {
    // generate tracks from config if data exists
    console.log("folders exist in config:", config.folders);
    generateTrackListFromConfig();
  }
  console.log("initializeApp done");
}

// ---------- UI events ----------
function setUpUIEvents() {
  const folderInput = document.getElementById('folder-input');
  const folderChooser = document.getElementById('folder-chooser');
  const folderOk = document.getElementById('folder-ok');

  folderInput.addEventListener('change', (e) => {
    handleFolderSelect(e.target.files);
  });

  folderOk.addEventListener('click', () => {
    folderChooser.style.display = 'none';
  });

  document.getElementById('btn-play').addEventListener('click', () => playPause());
  document.getElementById('btn-next').addEventListener('click', () => nextTrack());
  document.getElementById('btn-prev').addEventListener('click', () => previousTrack());
  document.getElementById('btn-random').addEventListener('click', () => {
    isRandom = !isRandom;
    document.getElementById('btn-random').innerText = isRandom ? "隨機：開" : "隨機：關";
    console.log("isRandom", isRandom);
  });
  document.getElementById('btn-repeat').addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    const text = repeatMode === 0 ? "重複：關" : (repeatMode === 1 ? "重複：單首" : "重複：清單");
    document.getElementById('btn-repeat').innerText = text;
    console.log("repeatMode", repeatMode);
  });

  const musicNameEl = document.getElementById('music-name');
  // double-click handling (separate dblclick + click detail)
  musicNameEl.addEventListener('dblclick', () => {
    console.log("music-name dblclick (toggle cover) - not implemented");
  });
  musicNameEl.addEventListener('click', (e) => {
    // detect double-click area (two quick clicks produce detail===2 sometimes)
    if (e.detail === 2) {
      const rect = e.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width / 2) seekForward(); else seekBackward();
    }
  });

  document.getElementById('progress').addEventListener('input', onProgressChange);
}

// show folder chooser UI
function showFolderChooser(show) {
  const chooser = document.getElementById('folder-chooser');
  if (show) {
    chooser.style.display = 'block';
  } else {
    chooser.style.display = 'none';
  }
}

// ---------- Handle folder selection & scanning ----------
function handleFolderSelect(fileList) {
  if (!fileList || fileList.length === 0) {
    console.warn("handleFolderSelect: no files");
    return;
  }
  const files = Array.from(fileList);
  console.log("handleFolderSelect files:", files.length);

  // derive base folders from webkitRelativePath if available, else use fake base
  const baseFolders = new Set();
  files.forEach(f => {
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    if (parts.length > 1) baseFolders.add(parts[0]);
    else baseFolders.add('root');
  });

  // For each base folder, create config entry if not exist
  baseFolders.forEach(base => {
    const norm = normalizePath(base);
    if (!config.folders.some(f => normalizePath(f.path) === norm)) {
      config.folders.push({ path: norm, tracks: [] });
      console.log("added folder to config:", norm);
    } else {
      console.log("folder already in config:", norm);
    }
  });

  // scan and store blob urls for immediate playback, and store relative paths in config
  scanFiles(files);

  saveConfig();
  // hide chooser
  showFolderChooser(false);
}

// scan files -> populate config.folders[*].tracks with audioTracks (filename, relPath, volume)
function scanFiles(files) {
  console.log("scanFiles start, files:", files.length);
  const validExt = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wav'];
  const rulePatterns = config.filenameRules.map(r => new RegExp(r.pattern));
  // for each folder, we will build trackMap
  const folderMaps = {}; // folderPath -> { mainName -> [ { filename, relPath, blobUrl, volume, ruleIndex } ] }

  files.forEach(file => {
    const relPathRaw = file.webkitRelativePath || file.name;
    const relPath = relPathRaw.replace(/\\/g, '/'); // normalize
    const parts = relPath.split('/');
    const folder = parts.length > 1 ? parts[0] : '';
    const name = parts[parts.length - 1];
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!validExt.includes(ext)) return;

    const nameNoExt = name.substring(0, name.lastIndexOf('.')) || name;
    let matchedRuleIndex = -1;
    for (let i = 0; i < rulePatterns.length; i++) {
      if (rulePatterns[i].test(nameNoExt)) {
        matchedRuleIndex = i; break;
      }
    }
    let mainName = nameNoExt;
    if (matchedRuleIndex >= 0) {
      mainName = nameNoExt.replace(rulePatterns[matchedRuleIndex], '').trim();
    }

    const blobUrl = URL.createObjectURL(file);
    const entry = {
      filename: name,
      relPath: relPath,
      blobUrl: blobUrl,
      volume: 85, // default 85%
      ruleIndex: matchedRuleIndex
    };

    const folderKey = normalizePath(folder || '');
    if (!folderMaps[folderKey]) folderMaps[folderKey] = {};
    if (!folderMaps[folderKey][mainName]) folderMaps[folderKey][mainName] = [];
    folderMaps[folderKey][mainName].push(entry);

    console.log("scanned file:", relPath, "mainName:", mainName, "blobUrl:", blobUrl);
  });

  // merge into config.folders[*].tracks
  config.folders.forEach(folderCfg => {
    const key = normalizePath(folderCfg.path || '');
    const map = folderMaps[key] || {};
    folderCfg.tracks = [];
    Object.keys(map).forEach(mainName => {
      const audioTracks = map[mainName].map(t => ({
        filename: t.filename,
        relPath: t.relPath,
        blobUrl: t.blobUrl,
        volume: t.volume
      }));
      folderCfg.tracks.push({ filename: mainName, audioTracks });
    });
    console.log("folder", key, "tracks count:", folderCfg.tracks.length);
  });

  // regenerate playback list (use first folder as primary)
  generateTrackListFromConfig();
}

// ---------- Generate playlist & load ----------
function generateTrackListFromConfig() {
  tracks = []; audioElements = [];
  if (!config.folders || config.folders.length === 0) {
    console.warn("generateTrackListFromConfig: no folders");
    return;
  }
  const folder = config.folders[0]; // primary folder for now
  if (!folder.tracks || folder.tracks.length === 0) {
    console.warn("generateTrackListFromConfig: folder has no tracks");
    return;
  }
  folder.tracks.forEach(t => {
    tracks.push({
      baseName: t.filename,
      audioTracks: t.audioTracks.map(at => ({ ...at })) // copy
    });
  });
  console.log("playlist generated, tracks:", tracks.length);
  if (tracks.length > 0) {
    currentTrackIndex = 0;
    loadTrack(currentTrackIndex);
  }
}

// ---------- Load and play a track (synchronize all audioElements) ----------
function loadTrack(index) {
  console.log("loadTrack index", index);
  if (!tracks[index]) {
    console.warn("loadTrack: index out of range", index);
    return;
  }
  const track = tracks[index];
  document.getElementById('music-name').innerText = track.baseName;

  // cleanup old audioElements
  audioElements.forEach(a => {
    try { a.pause(); } catch (e) { }
    try { URL.revokeObjectURL(a.src); } catch (e) { }
  });
  audioElements = [];

  // clear UI
  const vc = document.getElementById('volume-controls');
  vc.innerHTML = '';

  // create audio elements for each audioTrack
  track.audioTracks.forEach((at, idx) => {
    console.log("creating audio for", at.filename, "blobUrl:", at.blobUrl, "relPath:", at.relPath);

    const audio = new Audio();
    if (at.blobUrl) {
      audio.src = at.blobUrl;
    } else if (at.relPath) {
      // fallback: try to load relative path (works when packaged or if file accessible)
      audio.src = at.relPath;
    } else {
      console.warn("no source for audio track:", at);
    }
    audio.preload = 'auto';
    audio.volume = (typeof at.volume === 'number') ? (at.volume / 100) : 0.85;
    audioElements.push(audio);

    // create UI row
    const row = document.createElement('div');
    row.className = 'volume-track';

    const label = document.createElement('div');
    label.className = 'lbl';
    // display suffix like (Bass) from filename if present
    const match = at.filename.match(/\(([^)]+)\)/);
    label.innerText = match ? `(${match[1]})` : at.filename;
    row.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0; slider.max = 100;
    slider.value = at.volume ?? 85;
    slider.style.width = '85%';
    row.appendChild(slider);

    const num = document.createElement('input');
    num.type = 'number';
    num.min = 0; num.max = 100;
    num.value = at.volume ?? 85;
    num.style.width = '10%';
    row.appendChild(num);

    // sync slider -> number -> audio
    slider.addEventListener('input', () => {
      num.value = slider.value;
      audio.volume = slider.value / 100;
      console.log("slider change:", at.filename, slider.value);
      // persist to tracks data
      at.volume = parseInt(slider.value);
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });
    num.addEventListener('change', () => {
      let v = parseInt(num.value) || 0;
      if (v < 0) v = 0; if (v > 100) v = 100;
      num.value = v; slider.value = v;
      audio.volume = v / 100;
      console.log("number change:", at.filename, v);
      at.volume = v;
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });

    vc.appendChild(row);

    // attach metadata loaded logging
    audio.addEventListener('loadedmetadata', () => {
      console.log("loadedmetadata for", at.filename, "duration:", audio.duration);
    });
    audio.addEventListener('error', (ev) => {
      console.error("audio element error for", at.filename, ev);
    });
  });

  // Start playback of all audio elements in sync
  // Strategy: set currentTime to 0 for all, then once first canplay, call play on all.
  audioElements.forEach(a => { try { a.currentTime = 0; } catch (e) { } });

  // attempt to play when canplaythrough on first element
  if (audioElements[0]) {
    const first = audioElements[0];
    const tryPlayAll = () => {
      audioElements.forEach(a => a.play().catch(e => console.error("play error:", e)));
      console.log("attempted to play all audio tracks for", track.baseName);
      // start progress loop
      startProgressLoop();
      first.removeEventListener('canplaythrough', tryPlayAll);
    };
    first.addEventListener('canplaythrough', tryPlayAll);
    // also try immediate play (may be blocked by browser autoplay policies)
    first.play().then(() => {
      console.log("first.play() succeeded immediately");
      audioElements.forEach(a => { if (a !== first) a.play().catch(e => console.warn("other play failed:", e)); });
      startProgressLoop();
    }).catch(err => {
      console.warn("first.play() blocked or failed:", err, "waiting for canplaythrough...");
    });
  }

  // update time display when durations available
  audioElements.forEach(a => {
    a.addEventListener('loadedmetadata', () => {
      const first = audioElements[0];
      if (first && !isNaN(first.duration)) {
        document.getElementById('time-total').innerText = formatTime(first.duration || 0);
      }
    });
  });
}

// ---------- Persist individual volume change into config (in-memory + localStorage) ----------
function persistVolumeSetting(baseName, filename, volume) {
  try {
    const folder = config.folders[0];
    if (!folder || !folder.tracks) return;
    const tr = folder.tracks.find(t => t.filename === baseName);
    if (!tr) return;
    const at = tr.audioTracks.find(a => a.filename === filename);
    if (!at) return;
    at.volume = volume;
    saveConfig();
    console.log("persisted volume", baseName, filename, volume);
  } catch (e) {
    console.error("persistVolumeSetting error", e);
  }
}

// ---------- Playback controls ----------
function playPause() {
  if (!audioElements || audioElements.length === 0) { console.warn("playPause: no audioElements"); return; }
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn("play error", e)));
    document.getElementById('btn-play').innerText = "暫停";
    console.log("play all");
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerText = "播放";
    console.log("pause all");
  }
}

function nextTrack() {
  if (!tracks || tracks.length === 0) return;
  if (isRandom) currentTrackIndex = Math.floor(Math.random() * tracks.length);
  else currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
  loadTrack(currentTrackIndex);
}

function previousTrack() {
  if (!tracks || tracks.length === 0) return;
  if (isRandom) currentTrackIndex = Math.floor(Math.random() * tracks.length);
  else currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
  loadTrack(currentTrackIndex);
}

function seekForward() {
  audioElements.forEach(a => {
    try { a.currentTime = Math.min(a.duration || 0, (a.currentTime || 0) + skipSeconds); } catch (e) { }
  });
  console.log("seekForward", skipSeconds);
}
function seekBackward() {
  audioElements.forEach(a => {
    try { a.currentTime = Math.max(0, (a.currentTime || 0) - skipSeconds); } catch (e) { }
  });
  console.log("seekBackward", skipSeconds);
}

// progress bar handling
function onProgressChange(e) {
  if (!audioElements || audioElements.length === 0) return;
  const val = parseFloat(e.target.value);
  const first = audioElements[0];
  const newTime = (val / 100) * (first.duration || 0);
  audioElements.forEach(a => {
    try { a.currentTime = newTime; } catch (e) { }
  });
  console.log("onProgressChange -> set time to", newTime);
}

// update loop
function startProgressLoop() {
  if (updateLoopReq) cancelAnimationFrame(updateLoopReq);
  const loop = () => {
    if (!audioElements || audioElements.length === 0) return;
    const first = audioElements[0];
    const cur = first.currentTime || 0;
    const dur = first.duration || 0;
    document.getElementById('time-current').innerText = formatTime(cur);
    document.getElementById('time-total').innerText = formatTime(dur);
    const percent = dur > 0 ? (cur / dur) * 100 : 0;
    document.getElementById('progress').value = percent;
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

// ---------- loadTracksFromConfig compatibility ----------
async function loadTracksFromConfig() {
  // This function kept for compatibility: use in-memory config
  console.log("loadTracksFromConfig called - using local config");
  if (!config || !config.folders || config.folders.length === 0) {
    console.log("no folders -> show chooser");
    showFolderChooser(true);
    return;
  }
  // if config has tracks already with relPath or blobUrl, create playlist
  generateTrackListFromConfig();
}

// ---------- start ----------
initializeApp();
