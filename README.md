# MultiTracksMusicApp
可以同時播放多個音軌的播放器，UVR5、StemRoller音訊分離處理的相同檔名，不同樂器的音軌

## 目前app.js
```js
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

// util
function normalizePath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

// ---------- Config ----------
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

  setUpUIEvents();

  if (!config.folders || config.folders.length === 0) {
    console.log("no folders configured -> show folder chooser UI");
    showFolderChooser(true);
  } else {
    console.log("folders exist in config:", config.folders);
    await loadTracksFromConfig();
  }
  console.log("initializeApp done");
}

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
  });
  document.getElementById('btn-repeat').addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    const text = repeatMode === 0 ? "重複：關" : (repeatMode === 1 ? "重複：單首" : "重複：清單");
    document.getElementById('btn-repeat').innerText = text;
  });

  const musicNameEl = document.getElementById('music-name');
  musicNameEl.addEventListener('click', (e) => {
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

// ---------- Handle folder selection ----------
function handleFolderSelect(fileList) {
  if (!fileList || fileList.length === 0) return;
  const files = Array.from(fileList);
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

// ---------- scan files ----------
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

    // 這裡從尾巴往前比對音軌標籤
    let suffix = '';
    for (let rule of config.filenameRules) {
      const regex = new RegExp(rule.pattern);
      if (regex.test(nameNoExt)) {
        suffix = rule.name;
        break;
      }
    }

    const mainName = suffix ? nameNoExt.replace(new RegExp(`\\(${suffix}\\)$`), '').trim() : nameNoExt;
    const blobUrl = URL.createObjectURL(file);
    const entry = { filename: name, relPath, blobUrl, volume: 85, suffix };

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
        suffix: t.suffix
      }));
      folderCfg.tracks.push({ filename: mainName, audioTracks });
    });
  });

  console.log("scanFiles result:", config);
  generateTrackListFromConfig();
}

// ---------- 重新建立 blob url ----------
function rebuildBlobUrlsFromConfig() {
  config.folders.forEach(folder => {
    folder.tracks.forEach(track => {
      track.audioTracks.forEach(at => {
        if (!at.blobUrl && at.relPath) {
          try {
            at.blobUrl = at.relPath;
          } catch (e) {
            console.warn("rebuild blob url failed for", at.relPath);
          }
        }
      });
    });
  });
}

// ---------- Generate playlist ----------
function generateTrackListFromConfig() {
  tracks = [];
  audioElements = [];
  if (!config.folders || config.folders.length === 0) return;
  const folder = config.folders[0];
  if (!folder.tracks || folder.tracks.length === 0) return;
  folder.tracks.forEach(t => {
    tracks.push({ baseName: t.filename, audioTracks: t.audioTracks.map(at => ({ ...at })) });
  });
  console.log("playlist generated, tracks:", tracks.length);
  if (tracks.length > 0) {
    currentTrackIndex = 0;
    loadTrack(currentTrackIndex);
  }
}

// ---------- Load track ----------
function loadTrack(index) {
  if (!tracks[index]) return;
  const track = tracks[index];
  console.log("loadTrack:", track);

  document.getElementById('music-name').innerText = track.baseName;

  audioElements.forEach(a => { try { a.pause(); } catch (e) { } });
  audioElements = [];
  const vc = document.getElementById('volume-controls');
  vc.innerHTML = '';

  track.audioTracks.forEach(at => {
    const audio = new Audio();
    audio.src = at.blobUrl || at.relPath;
    audio.preload = 'auto';
    audio.volume = (typeof at.volume === 'number') ? (at.volume / 100) : 0.85;
    audioElements.push(audio);

    const row = document.createElement('div');
    row.className = 'volume-track';

    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerText = at.suffix ? `(${at.suffix})` : '(Unknown)';
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

    slider.addEventListener('input', () => {
      num.value = slider.value;
      audio.volume = slider.value / 100;
      at.volume = parseInt(slider.value);
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });
    num.addEventListener('change', () => {
      let v = parseInt(num.value) || 0;
      v = Math.min(100, Math.max(0, v));
      num.value = v; slider.value = v;
      audio.volume = v / 100;
      at.volume = v;
      persistVolumeSetting(track.baseName, at.filename, at.volume);
    });

    vc.appendChild(row);
  });

  if (audioElements[0]) {
    const first = audioElements[0];
    const tryPlayAll = () => {
      audioElements.forEach(a => a.play().catch(e => console.error("play error:", e)));
      startProgressLoop();
      first.removeEventListener('canplaythrough', tryPlayAll);
    };
    first.addEventListener('canplaythrough', tryPlayAll);
    first.play().then(() => {
      audioElements.forEach(a => { if (a !== first) a.play().catch(() => { }); });
      startProgressLoop();
    }).catch(err => console.warn("first.play() failed", err));
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
    saveConfig();
  } catch (e) { console.error("persistVolumeSetting error", e); }
}

// ---------- Playback controls ----------
function playPause() {
  if (!audioElements || audioElements.length === 0) return;
  const first = audioElements[0];
  if (first.paused) {
    audioElements.forEach(a => a.play().catch(e => console.warn("play error", e)));
    document.getElementById('btn-play').innerText = "暫停";
  } else {
    audioElements.forEach(a => a.pause());
    document.getElementById('btn-play').innerText = "播放";
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

function seekForward() { audioElements.forEach(a => { a.currentTime = Math.min(a.duration || 0, a.currentTime + skipSeconds); }); }
function seekBackward() { audioElements.forEach(a => { a.currentTime = Math.max(0, a.currentTime - skipSeconds); }); }

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

// ---------- 兼容函式 ----------
async function loadTracksFromConfig() {
  console.log("loadTracksFromConfig called");
  if (!config || !config.folders || config.folders.length === 0) {
    showFolderChooser(true);
    return;
  }
  rebuildBlobUrlsFromConfig();
  generateTrackListFromConfig();
}

// ---------- Start ----------
initializeApp();

```

## 目前index.html
```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>多音軌音樂播放器</title>
<style>
  :root { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans"; }
  html,body { height:100%; margin:0; background:#fafafa; color:#111; }
  .app { height:100%; display:flex; flex-direction:column; position:relative; }

  /* 30% 名稱 / 封面 */
  #music-name {
    height:30%;
    display:flex;
    align-items:center;
    justify-content:center;
    text-align:center;
    font-size:1.4rem;
    user-select:none;
    cursor:pointer;
    background: linear-gradient(180deg, #ffffff, #f2f2f2);
    border-bottom:1px solid #e0e0e0;
    padding:12px;
    box-sizing:border-box;
  }

  /* 5% 進度 */
  #progress-container {
    height:5%;
    display:flex;
    align-items:center;
    padding:0 8px;
    gap:8px;
    box-sizing:border-box;
    border-bottom:1px solid #eaeaea;
  }
  #time-current, #time-total { width:10%; text-align:center; font-size:0.9rem; }
  #progress { width:80%; height:6px; }

  /* 25% 控制 */
  #controls {
    height:25%;
    display:flex;
    align-items:center;
    justify-content:space-around;
    gap:8px;
    box-sizing:border-box;
    border-bottom:1px solid #eaeaea;
  }
  #controls button {
    padding:10px 14px;
    font-size:1rem;
    border-radius:8px;
    border:1px solid #ccc;
    background:white;
    cursor:pointer;
  }

  /* 40% 音軌控制 */
  #volume-controls {
    height:40%;
    overflow-y:auto;
    padding:8px;
    box-sizing:border-box;
  }
  .volume-track {
    display:flex;
    align-items:center;
    gap:6px;
    margin-bottom:6px;
  }
  .volume-track .lbl { width:5%; min-width:40px; font-size:0.9rem; text-align:left; }
  .volume-track input[type="range"] { width:85%; }
  .volume-track input[type="number"] { width:10%; box-sizing:border-box; padding:4px; }

  /* folder chooser popup */
  #folder-chooser {
    position: absolute;
    z-index: 9999;
    left:50%;
    top:50%;
    transform:translate(-50%,-50%);
    background:white;
    padding:16px;
    border-radius:8px;
    box-shadow:0 8px 24px rgba(0,0,0,0.12);
    display:none;
    min-width:320px;
  }
  #folder-chooser p { margin:0 0 8px 0; }
  #folder-chooser input[type=file] { width:100%; }

  /* small helper */
  .hidden { display:none !important; }
</style>
</head>
<body>
  <div class="app">
    <div id="music-name">尚未載入歌曲 - 請選擇音樂資料夾或至設定新增資料夾</div>

    <div id="progress-container">
      <div id="time-current">0:00</div>
      <input id="progress" type="range" min="0" max="100" value="0" />
      <div id="time-total">0:00</div>
    </div>

    <div id="controls">
      <button id="btn-random">隨機：關</button>
      <button id="btn-prev">上一首</button>
      <button id="btn-play">播放</button>
      <button id="btn-next">下一首</button>
      <button id="btn-repeat">重複：關</button>
    </div>

    <div id="volume-controls">
      <!-- 動態產生音軌控制 -->
    </div>

    <div id="folder-chooser" role="dialog" aria-modal="true">
      <p>首次使用請選擇一或多個音樂資料夾（會掃描資料夾內音訊檔案）</p>
      <!-- 使用者可見的 folder input（不要自動 click） -->
      <input type="file" id="folder-input" webkitdirectory directory multiple />
      <div style="margin-top:8px; text-align:right;">
        <button id="folder-ok">關閉</button>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>

```


## Others