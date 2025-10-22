// ==================== IndexedDB ====================
const DB_NAME = 'music_player_db';
const STORE_NAME = 'folder_handles';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e.target.error);
  });
}

async function getAllHandles() {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

async function getAllKeys() {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result);
  });
}

// ==================== Config ====================
function loadConfig() {
  const raw = localStorage.getItem('app_config');
  return raw ? JSON.parse(raw) : {
    skipSeconds: 5,
    volumeSettings: {}, // { songId: { trackName: volume } }
    filenameRules: [
      { pattern: "(Bass)$", name: "Bass", fixed: true },
      { pattern: "(Drums)$", name: "Drums", fixed: true },
      { pattern: "(Instrumental)$", name: "Instrumental", fixed: true },
      { pattern: "(Other)$", name: "Other", fixed: true },
      { pattern: "(Vocals)$", name: "Vocals", fixed: true },
      { pattern: "(Piano)$", name: "Piano", fixed: true },
      { pattern: "(Guitar)$", name: "Guitar", fixed: true }
    ]
  };
}

function saveConfig(cfg) {
  localStorage.setItem('app_config', JSON.stringify(cfg));
}

let config = loadConfig();

// ==================== Global state ====================
let songs = [];
let currentSongIndex = -1;
let repeatMode = 0; // 0=off, 1=single, 2=all
let isShuffle = false;
let isPlaying = false;
let isShowingCover = false;
let audioElements = []; // {audio, trackName}

// ==================== UI Elements ====================
const songTitleEl = document.getElementById('songTitle');
const coverArtEl = document.getElementById('coverArt');
const progressBarEl = document.getElementById('progressBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const repeatBtn = document.getElementById('repeatBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const trackVolumeContainer = document.getElementById('trackVolumeContainer');

// ==================== Initialization ====================
async function initializeApp() {
  const keys = await getAllKeys();
  const handles = await getAllHandles();

  if (!keys || keys.length === 0) {
    alert("請先至設定頁新增至少一個資料夾！");
    return;
  }

  songs = await loadSongsFromFolders(handles);
  if (songs.length > 0) {
    currentSongIndex = 0;
    loadSong(songs[currentSongIndex]);
  }
}

// ==================== Load songs ====================
async function loadSongsFromFolders(handles) {
  const supportedExt = ['.flac', '.wav', '.mp3', '.m4a', '.aac'];
  const fileMap = {};

  for (const handle of handles) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (!supportedExt.includes(ext)) continue;

        const baseName = getBaseName(entry.name);
        if (!fileMap[baseName]) fileMap[baseName] = [];
        fileMap[baseName].push(entry);
      }
    }
  }

  const songs = [];
  for (const [baseName, entries] of Object.entries(fileMap)) {
    songs.push({ title: baseName, entries });
  }
  return songs;
}

function getBaseName(filename) {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
  for (const rule of config.filenameRules) {
    const reg = new RegExp(rule.pattern, 'i');
    if (reg.test(nameWithoutExt)) {
      return nameWithoutExt.replace(reg, '').replace(/[_\s-]+$/, '');
    }
  }
  return nameWithoutExt;
}

// ==================== Playback ====================
async function loadSong(song) {
  cleanupAudio();
  audioElements = [];

  songTitleEl.textContent = song.title;
  coverArtEl.style.display = 'none';
  songTitleEl.style.display = 'block';
  isShowingCover = false;

  for (const entry of song.entries) {
    const file = await entry.getFile();
    const url = URL.createObjectURL(file);
    const trackName = getTrackName(entry.name);
    const audio = new Audio(url);
    audioElements.push({ audio, trackName });
  }

  buildTrackVolumeUI(song);
  syncAll('pause');
  progressBarEl.value = 0;
}

function cleanupAudio() {
  for (const { audio } of audioElements) {
    audio.pause();
    URL.revokeObjectURL(audio.src);
  }
  audioElements = [];
}

function playAll() {
  isPlaying = true;
  for (const { audio } of audioElements) audio.play();
  playPauseBtn.textContent = '⏸️';
}

function pauseAll() {
  isPlaying = false;
  for (const { audio } of audioElements) audio.pause();
  playPauseBtn.textContent = '▶️';
}

function togglePlay() {
  if (isPlaying) pauseAll(); else playAll();
}

function prevSong() {
  if (songs.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
  loadSong(songs[currentSongIndex]);
  if (isPlaying) playAll();
}

function nextSong() {
  if (songs.length === 0) return;
  if (isShuffle) {
    currentSongIndex = Math.floor(Math.random() * songs.length);
  } else {
    currentSongIndex = (currentSongIndex + 1) % songs.length;
  }
  loadSong(songs[currentSongIndex]);
  if (isPlaying) playAll();
}

function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3;
  repeatBtn.textContent = repeatMode === 0 ? '🔁' : (repeatMode === 1 ? '🔂' : '🔁🔁');
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  shuffleBtn.style.background = isShuffle ? '#1ed760' : '#1db954';
}

function getTrackName(filename) {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
  for (const rule of config.filenameRules) {
    const reg = new RegExp(rule.pattern, 'i');
    const match = nameWithoutExt.match(reg);
    if (match) return rule.name;
  }
  return 'Main';
}

// ==================== Volume Control ====================
function buildTrackVolumeUI(song) {
  trackVolumeContainer.innerHTML = '';
  const savedVolumes = config.volumeSettings[song.title] || {};

  for (const { audio, trackName } of audioElements) {
    const vol = savedVolumes[trackName] !== undefined ? savedVolumes[trackName] : 100;
    audio.volume = vol / 100;

    const item = document.createElement('div');
    item.className = 'track-volume-item';

    const label = document.createElement('div');
    label.className = 'track-label';
    label.textContent = trackName;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.value = vol;
    slider.className = 'track-slider';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.max = 100;
    input.value = vol;
    input.className = 'track-input';

    slider.addEventListener('input', () => {
      audio.volume = slider.value / 100;
      input.value = slider.value;
      saveVolume(song.title, trackName, slider.value);
    });

    input.addEventListener('change', () => {
      let v = Math.max(0, Math.min(100, parseInt(input.value) || 0));
      slider.value = v;
      audio.volume = v / 100;
      saveVolume(song.title, trackName, v);
    });

    item.appendChild(label);
    item.appendChild(slider);
    item.appendChild(input);
    trackVolumeContainer.appendChild(item);
  }
}

function saveVolume(songTitle, trackName, value) {
  if (!config.volumeSettings[songTitle]) config.volumeSettings[songTitle] = {};
  config.volumeSettings[songTitle][trackName] = value;
  saveConfig(config);
}

// ==================== Progress ====================
progressBarEl.addEventListener('input', () => {
  for (const { audio } of audioElements) {
    audio.currentTime = progressBarEl.value;
  }
});

setInterval(() => {
  if (audioElements.length > 0 && isPlaying) {
    const time = audioElements[0].currentTime;
    progressBarEl.value = time;
  }
}, 200);

// ==================== Title / Cover toggle ====================
songTitleEl.addEventListener('click', () => {
  if (isShowingCover) {
    coverArtEl.style.display = 'none';
    songTitleEl.style.display = 'block';
    isShowingCover = false;
  } else {
    // 如果有封面可以顯示
    coverArtEl.style.display = 'block';
    songTitleEl.style.display = 'none';
    isShowingCover = true;
  }
});

songTitleEl.addEventListener('dblclick', () => {
  for (const { audio } of audioElements) audio.currentTime += config.skipSeconds;
});

coverArtEl.addEventListener('dblclick', (e) => {
  const rect = coverArtEl.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  if (clickX > rect.width / 2) {
    for (const { audio } of audioElements) audio.currentTime += config.skipSeconds;
  } else {
    for (const { audio } of audioElements) audio.currentTime -= config.skipSeconds;
  }
});

// ==================== Controls ====================
playPauseBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
repeatBtn.addEventListener('click', toggleRepeat);
shuffleBtn.addEventListener('click', toggleShuffle);

// ==================== Start ====================
initializeApp();
