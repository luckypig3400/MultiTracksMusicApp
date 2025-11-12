// playlist.js — 使用 localStorage 直接讀取與編輯播放清單排序，移除等待機制
// 依賴全域變數 / 函式：saveConfig(), config

(function () {
  let modal = null;
  let sortAsc = true;

  function log(...args) { console.log('[Playlist]', ...args); }

  function openPlaylist() {
    log('openPlaylist called');
    if (!modal) buildModal();
    modal.style.display = 'flex';
    renderList();
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
      log('btnClose clicked: persistOrder and close');
      persistOrder(true);
    });
    header.appendChild(btnClose);

    modal.appendChild(header);

    const listWrap = document.createElement('div');
    listWrap.id = 'playlist-list-wrap';
    Object.assign(listWrap.style, {
      height: '90%', overflowY: 'auto', boxSizing: 'border-box'
    });
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

  function getTracksFromLocalStorage() {
    try {
      const stored = localStorage.getItem('config');
      if (!stored) return [];
      const cfg = JSON.parse(stored);
      if (cfg.folders && cfg.folders.length > 0) {
        const allTracks = cfg.folders.flatMap(f => f.tracks.map(t => ({
          filename: t.filename,
          baseName: t.filename,
          audioTracks: t.audioTracks || []
        })));
        log('Loaded', allTracks.length, 'tracks from localStorage');
        return allTracks;
      }
      return [];
    } catch (e) {
      console.warn('getTracksFromLocalStorage error', e);
      return [];
    }
  }

  function renderList() {
    log('renderList called');
    const wrap = document.getElementById('playlist-list-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    const tracks = getTracksFromLocalStorage();
    log('renderList: tracks count', tracks.length);

    if (tracks.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.innerText = '目前沒有播放清單，請先選擇資料夾並掃描音檔';
      wrap.appendChild(empty);
      return;
    }

    tracks.forEach((t, idx) => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.draggable = true;
      item.dataset.index = idx;

      const name = document.createElement('div');
      name.className = 'pl-name';
      name.innerText = t.baseName || t.filename || ('Track ' + idx);
      item.appendChild(name);

      const drag = document.createElement('div');
      drag.className = 'pl-drag';
      drag.innerText = '↑↓';
      item.appendChild(drag);

      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', idx.toString());
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => e.preventDefault());
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = parseInt(item.dataset.index, 10);
        log('drop from', from, 'to', to);
        reorderArray(tracks, from, to);
        persistTracks(tracks);
        renderList();
      });

      wrap.appendChild(item);
    });

    log('renderList finished, items rendered =', tracks.length);
  }

  function reorderArray(arr, from, to) {
    if (!Array.isArray(arr)) return;
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  function sortList() {
    const tracks = getTracksFromLocalStorage();
    log('sortList, sortAsc=', sortAsc);
    tracks.sort((a, b) => {
      const A = (a.baseName || a.filename || '').toLowerCase();
      const B = (b.baseName || b.filename || '').toLowerCase();
      if (A < B) return sortAsc ? -1 : 1;
      if (A > B) return sortAsc ? 1 : -1;
      return 0;
    });
    persistTracks(tracks);
  }

  function shuffleList() {
    const tracks = getTracksFromLocalStorage();
    log('shuffleList');
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    persistTracks(tracks);
  }

  function persistTracks(tracks) {
    try {
      const cfg = JSON.parse(localStorage.getItem('config'));
      if (!cfg.folders || cfg.folders.length === 0) return;
      cfg.folders[0].tracks = tracks.map(t => ({ filename: t.baseName, audioTracks: t.audioTracks }));
      localStorage.setItem('config', JSON.stringify(cfg));
      if (typeof saveConfig === 'function') saveConfig();
      log('persistTracks: saved to localStorage');
    } catch (e) {
      console.warn('persistTracks error', e);
    }
  }

  function persistOrder(closeAfter = true) {
    renderList();
    if (closeAfter) closePlaylist();
  }

  document.addEventListener('DOMContentLoaded', () => {
    log('DOMContentLoaded: attempting to bind #btn-playlist');
    const btn = document.getElementById('btn-playlist');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        log('#btn-playlist clicked');
        openPlaylist();
      });
      log('#btn-playlist bound');
    }
  });

  window.PlaylistUI = { openPlaylist, closePlaylist, renderList };
})();