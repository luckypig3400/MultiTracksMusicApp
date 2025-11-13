// playlist.js — 改良：使用 module state (currentTracks) 立刻反映 UI，所有操作直接修改 currentTracks 並寫回 localStorage
// 提供清晰 log：例如 [Playlist] "歌曲名稱" 排序從 9 變成 12
// 依賴全域函式/變數：saveConfig(), config, window.tracks (optional), loadTrack(), currentTrackIndex

(function () {
  let modal = null;
  let sortAsc = true;
  let currentTracks = []; // module state for UI

  function log(...args) { console.log.apply(console, ['[Playlist]'].concat(args)); }

  function loadTracksFromStorageToState() {
    try {
      const stored = localStorage.getItem('config');
      if (!stored) {
        currentTracks = [];
        return currentTracks;
      }
      const cfg = JSON.parse(stored);
      if (cfg.folders && cfg.folders.length > 0) {
        // use the first folder as the playlist source (matches app behavior)
        const folderTracks = cfg.folders[0].tracks || [];
        currentTracks = folderTracks.map(t => ({
          filename: t.filename,
          baseName: t.filename,
          audioTracks: t.audioTracks || []
        }));
        log('Loaded', currentTracks.length, 'tracks into currentTracks');
        return currentTracks;
      }
    } catch (e) {
      console.warn('loadTracksFromStorageToState error', e);
      currentTracks = [];
    }
    return currentTracks;
  }

  function persistTracksToStorage(tracks) {
    try {
      const cfgRaw = localStorage.getItem('config');
      const cfg = cfgRaw ? JSON.parse(cfgRaw) : { folders: [] };
      if (!cfg.folders || cfg.folders.length === 0) {
        cfg.folders = [{ path: 'Unknown', tracks: [] }];
      }
      cfg.folders[0].tracks = tracks.map(t => ({ filename: t.baseName, audioTracks: t.audioTracks }));
      localStorage.setItem('config', JSON.stringify(cfg));
      if (typeof saveConfig === 'function') saveConfig();
      log('persistTracksToStorage: saved', tracks.length, 'tracks');
    } catch (e) {
      console.warn('persistTracksToStorage error', e);
    }
  }

  function openPlaylist() {
    log('openPlaylist called');
    if (!modal) buildModal();
    loadTracksFromStorageToState();
    renderList();
    modal.style.display = 'flex';
  }

  function closePlaylist() {
    if (!modal) return;
    modal.style.display = 'none';
    log('closePlaylist');
  }

  function buildModal() {
    log('buildModal');
    modal = document.createElement('div');
    modal.id = 'playlist-modal';
    Object.assign(modal.style, {
      position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
      zIndex: '10000', display: 'none', flexDirection: 'column',
      background: 'rgba(250,250,250,0.98)'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      height: '10%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', boxSizing: 'border-box', borderBottom: '1px solid rgba(0,0,0,0.06)'
    });

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.gap = '8px';

    const btnSort = document.createElement('button');
    btnSort.id = 'playlist-sort';
    btnSort.innerText = 'A↕Z';
    btnSort.title = '依檔名排序 (點一下切換順序)';
    btnSort.addEventListener('click', () => {
      sortAsc = !sortAsc;
      log('btnSort clicked, sortAsc=', sortAsc);
      sortList();
      renderList();
    });
    leftGroup.appendChild(btnSort);

    const btnShuffle = document.createElement('button');
    btnShuffle.id = 'playlist-shuffle';
    btnShuffle.innerText = 'Shuffle';
    btnShuffle.title = '隨機打亂播放清單';
    btnShuffle.addEventListener('click', () => {
      log('btnShuffle clicked');
      shuffleList();
      renderList();
    });
    leftGroup.appendChild(btnShuffle);

    header.appendChild(leftGroup);

    const btnClose = document.createElement('button');
    btnClose.id = 'playlist-save-close';
    btnClose.innerText = 'Save & Close ✖';
    btnClose.addEventListener('click', () => {
      log('btnClose clicked: persist currentTracks and close');
      persistTracksToStorage(currentTracks);
      // Also update in-memory window.tracks if present so app.js sees change
      try { if (Array.isArray(window.tracks)) { window.tracks = currentTracks.map(t => ({ baseName: t.baseName, audioTracks: t.audioTracks })); log('window.tracks updated in-memory'); } } catch (e) { }
      closePlaylist();
    });
    header.appendChild(btnClose);

    modal.appendChild(header);

    const listWrap = document.createElement('div');
    listWrap.id = 'playlist-list-wrap';
    Object.assign(listWrap.style, { height: '90%', overflowY: 'auto', boxSizing: 'border-box' });
    modal.appendChild(listWrap);

    const style = document.createElement('style');
    style.textContent = `
      #playlist-modal { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans'; }
      #playlist-modal .pl-item { display:flex; align-items:center; gap:8px; box-sizing:border-box; padding:6px 12px; border-bottom:1px solid rgba(0,0,0,0.04); height:10vh; min-height:56px; }
      #playlist-modal .pl-item .pl-name { width:85%; overflow:hidden; word-break:break-word; cursor:pointer; }
      #playlist-modal .pl-item .pl-drag { width:15%; text-align:center; cursor:grab; user-select:none; }
      #playlist-modal .pl-item.dragging { opacity:0.5; }
      #playlist-modal button { border-radius:6px; border:1px solid #ccc; background:white; padding:6px 8px; cursor:pointer; }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);
    log('modal appended to body');
  }

  function renderList() {
    log('renderList called');
    if (!modal) buildModal();
    const wrap = document.getElementById('playlist-list-wrap');
    wrap.innerHTML = '';

    if (!Array.isArray(currentTracks) || currentTracks.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.innerText = '目前沒有播放清單，請先選擇資料夾並掃描音檔';
      wrap.appendChild(empty);
      log('renderList: currentTracks empty');
      return;
    }

    currentTracks.forEach((t, idx) => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.draggable = true;
      item.dataset.index = idx;

      const name = document.createElement('div');
      name.className = 'pl-name';
      name.innerText = t.baseName || t.filename || ('Track ' + idx);
      name.addEventListener('click', () => {
        log('item click: jump to', idx, name.innerText);
        // persist current order first
        persistTracksToStorage(currentTracks);
        // try to update window.tracks and call loadTrack with matching baseName
        try {
          if (Array.isArray(window.tracks)) {
            const realIndex = window.tracks.findIndex(wt => wt.baseName === t.baseName);
            if (realIndex >= 0) {
              currentTrackIndex = realIndex;
              loadTrack(realIndex);
              log('loadTrack called for realIndex', realIndex);
            } else {
              // update window.tracks to currentTracks summary and try again
              window.tracks = currentTracks.map(ct => ({ baseName: ct.baseName, audioTracks: ct.audioTracks }));
              const newIndex = window.tracks.findIndex(wt => wt.baseName === t.baseName);
              if (newIndex >= 0) { currentTrackIndex = newIndex; loadTrack(newIndex); log('loadTrack called after updating window.tracks, index', newIndex); }
            }
          }
        } catch (e) { console.warn('jump/loadTrack error', e); }
        closePlaylist();
      });

      const drag = document.createElement('div');
      drag.className = 'pl-drag';
      drag.innerText = '↑↓';

      // drag handlers operate on currentTracks
      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', idx.toString());
        e.dataTransfer.effectAllowed = 'move';
        log('dragstart', idx, t.baseName);
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));

      item.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = parseInt(item.dataset.index, 10);
        if (isNaN(from) || isNaN(to) || from === to) return;
        const moved = currentTracks[from];
        // perform reorder
        reorderArray(currentTracks, from, to);
        // log with song name and indices (1-based for readability)
        log(`"${moved.baseName}" 排序從 ${from} 變成 ${to}`);
        // persist and re-render
        persistTracksToStorage(currentTracks);
        renderList();
      });

      item.appendChild(name);
      item.appendChild(drag);
      wrap.appendChild(item);
    });

    log('renderList finished, items rendered =', currentTracks.length);
  }

  function reorderArray(arr, from, to) {
    if (!Array.isArray(arr)) return;
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  function sortList() {
    if (!Array.isArray(currentTracks)) return;
    log('sortList, sortAsc=', sortAsc);
    currentTracks.sort((a, b) => {
      const A = (a.baseName || a.filename || '').toLowerCase();
      const B = (b.baseName || b.filename || '').toLowerCase();
      if (A < B) return sortAsc ? -1 : 1;
      if (A > B) return sortAsc ? 1 : -1;
      return 0;
    });
    log('sortList: finished ordering, now persisting');
    persistTracksToStorage(currentTracks);
  }

  function shuffleList() {
    if (!Array.isArray(currentTracks)) return;
    log('shuffleList');
    for (let i = currentTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentTracks[i], currentTracks[j]] = [currentTracks[j], currentTracks[i]];
    }
    persistTracksToStorage(currentTracks);
  }

  document.addEventListener('DOMContentLoaded', () => {
    log('DOMContentLoaded: attempting to bind #btn-playlist');
    const btn = document.getElementById('btn-playlist');
    if (btn) {
      btn.addEventListener('click', (e) => { e.preventDefault(); log('#btn-playlist clicked'); openPlaylist(); });
      log('#btn-playlist bound');
    }
  });

  // expose for debug
  window.PlaylistUI = { openPlaylist, closePlaylist, renderList, loadTracksFromStorageToState };
})();
