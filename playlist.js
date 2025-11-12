// playlist.js
// 改良版 playlist.js — 加入大量 debug log，並在 openPlaylist 時等待 tracks 準備好
// 依賴全域變數 / 函式：tracks, config, currentTrackIndex, loadTrack(), saveConfig()

(function () {
  let modal = null;
  let sortAsc = true;

  function log(...args) { console.log('[Playlist]', ...args); }

  // 等待 tracks 準備好（有內容）或超時
  function waitForTracks(timeoutMs = 5000, intervalMs = 150) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      log('waitForTracks: start, timeout', timeoutMs);
      const iv = setInterval(() => {
        const now = Date.now();
        const ok = Array.isArray(window.tracks) && window.tracks.length > 0;
        if (ok) {
          clearInterval(iv);
          log('waitForTracks: ready, tracks length =', window.tracks.length);
          resolve(window.tracks);
          return;
        }
        if (now - start > timeoutMs) {
          clearInterval(iv);
          log('waitForTracks: timeout — tracks not ready');
          resolve(window.tracks || []); // resolve with whatever (possibly empty)
          return;
        }
      }, intervalMs);
    });
  }

  function openPlaylist() {
    log('openPlaylist called');
    if (!modal) buildModal();
    modal.style.display = 'flex';
    // Ensure we render only when tracks ready (or after timeout)
    waitForTracks(8000, 125).then((_tracks) => {
      log('openPlaylist: after wait, tracks=', Array.isArray(window.tracks) ? window.tracks.length : typeof window.tracks);
      renderList();
    });
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
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '10000';
    modal.style.display = 'none';
    modal.style.flexDirection = 'column';
    modal.style.background = 'rgba(250,250,250,0.98)';

    // header 10%
    const header = document.createElement('div');
    header.style.height = '10%';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '8px 12px';
    header.style.boxSizing = 'border-box';
    header.style.borderBottom = '1px solid rgba(0,0,0,0.06)';

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.gap = '8px';

    // sort button (toggle asc/desc)
    const btnSort = document.createElement('button');
    btnSort.id = 'playlist-sort';
    btnSort.title = '依檔名排序 (點一下切換順序)';
    btnSort.innerText = 'A↕Z';
    btnSort.style.padding = '8px 10px';
    btnSort.addEventListener('click', () => {
      sortAsc = !sortAsc;
      log('btnSort clicked, sortAsc=', sortAsc);
      sortList();
      renderList();
    });
    leftGroup.appendChild(btnSort);

    // shuffle button
    const btnShuffle = document.createElement('button');
    btnShuffle.id = 'playlist-shuffle';
    btnShuffle.title = '隨機打亂播放清單';
    btnShuffle.innerText = 'Shuffle';
    btnShuffle.style.padding = '8px 10px';
    btnShuffle.addEventListener('click', () => {
      log('btnShuffle clicked');
      shuffleList();
      renderList();
    });
    leftGroup.appendChild(btnShuffle);

    header.appendChild(leftGroup);

    // right: save/close button
    const btnClose = document.createElement('button');
    btnClose.id = 'playlist-save-close';
    btnClose.title = '儲存播放清單排序並回到播放器';
    btnClose.innerText = 'Save & Close ✖';
    btnClose.style.padding = '8px 10px';
    btnClose.addEventListener('click', () => {
      log('btnClose clicked: persistOrder and close');
      persistOrder(true);
    });
    header.appendChild(btnClose);

    modal.appendChild(header);

    // list container 90%
    const listWrap = document.createElement('div');
    listWrap.id = 'playlist-list-wrap';
    listWrap.style.height = '90%';
    listWrap.style.overflowY = 'auto';
    listWrap.style.boxSizing = 'border-box';

    modal.appendChild(listWrap);

    // styles
    const style = document.createElement('style');
    style.textContent = `
      #playlist-modal { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans"; }
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

    log('renderList: tracks typeof', typeof window.tracks, 'length', Array.isArray(window.tracks) ? window.tracks.length : 'n/a');

    if (!Array.isArray(window.tracks) || window.tracks.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.innerText = '目前沒有播放清單，請先選擇資料夾並掃描音檔';
      wrap.appendChild(empty);
      log('renderList: no tracks, displayed empty message');
      return;
    }

    // 使用 snapshot 以避免在渲染時直接修改原陣列導致問題
    const snapshot = window.tracks.map((t) => t);

    snapshot.forEach((t, idx) => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.draggable = true;
      item.dataset.index = idx;

      const name = document.createElement('div');
      name.className = 'pl-name';
      name.innerText = t.baseName || t.filename || ('Track ' + idx);
      name.addEventListener('click', () => {
        log('item click: jump to', idx, name.innerText);
        try {
          // set currentTrackIndex to the index in the real window.tracks
          const realIndex = findRealIndexByBaseName(t.baseName);
          if (realIndex >= 0) {
            currentTrackIndex = realIndex;
            loadTrack(realIndex);
            log('loadTrack called for index', realIndex);
          } else {
            // fallback: use idx as-is
            currentTrackIndex = idx;
            loadTrack(idx);
            log('loadTrack fallback for idx', idx);
          }
        } catch (e) { console.warn('loadTrack error', e); }
        closePlaylist();
      });

      const drag = document.createElement('div');
      drag.className = 'pl-drag';
      drag.innerText = '↑↓';

      // drag events — operate on window.tracks
      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', idx.toString());
        e.dataTransfer.effectAllowed = 'move';
        log('dragstart', idx);
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = parseInt(item.dataset.index, 10);
        log('drop from', from, 'to', to);
        if (isNaN(from) || isNaN(to) || from === to) return;
        // map snapshot idx to real index in window.tracks
        const realFrom = findRealIndexByBaseName(snapshot[from]?.baseName);
        const realTo = findRealIndexByBaseName(snapshot[to]?.baseName);
        log('mapped realFrom', realFrom, 'realTo', realTo);
        if (realFrom === -1 || realTo === -1) {
          // fallback: try using from/to as positions in window.tracks
          reorderArray(window.tracks, from, to);
        } else {
          reorderArray(window.tracks, realFrom, realTo);
        }
        renderList();
        persistOrder(false); // save but don't close
      });

      item.appendChild(name);
      item.appendChild(drag);
      wrap.appendChild(item);
    });

    log('renderList finished, items rendered =', snapshot.length);
  }

  function reorderArray(arr, from, to) {
    if (!Array.isArray(arr)) return;
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  function sortList() {
    if (!Array.isArray(window.tracks)) return;
    log('sortList, sortAsc=', sortAsc);
    window.tracks.sort((a, b) => {
      const A = (a.baseName || a.filename || '').toLowerCase();
      const B = (b.baseName || b.filename || '').toLowerCase();
      if (A < B) return sortAsc ? -1 : 1;
      if (A > B) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  function shuffleList() {
    if (!Array.isArray(window.tracks)) return;
    log('shuffleList');
    for (let i = window.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [window.tracks[i], window.tracks[j]] = [window.tracks[j], window.tracks[i]];
    }
  }

  function persistOrder(closeAfter = true) {
    log('persistOrder called, closeAfter=', closeAfter);
    try {
      if (window.config && config.folders && config.folders.length > 0) {
        const folder = config.folders[0];
        folder.tracks = window.tracks.map(t => ({ filename: t.baseName, audioTracks: t.audioTracks }));
        if (typeof saveConfig === 'function') saveConfig();
        log('persistOrder: config updated and saveConfig called');
      } else {
        log('persistOrder: config not available to save');
      }

      // adjust currentTrackIndex to keep playing track
      if (typeof currentTrackIndex === 'number') {
        const playingBase = window.tracks[currentTrackIndex]?.baseName;
        if (playingBase) {
          const newIndex = window.tracks.findIndex(t => t.baseName === playingBase);
          if (newIndex >= 0) {
            currentTrackIndex = newIndex;
            log('persistOrder: updated currentTrackIndex to', newIndex);
          }
        }
      }
    } catch (e) {
      console.warn('persistOrder error', e);
    }

    if (closeAfter) closePlaylist();
  }

  function findRealIndexByBaseName(baseName) {
    if (!baseName || !Array.isArray(window.tracks)) return -1;
    return window.tracks.findIndex(t => t.baseName === baseName);
  }

  // attach to button in index.html
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
    } else {
      log('#btn-playlist not found on DOMContentLoaded');
      // try to observe DOM for the button if it appears later
      const observer = new MutationObserver((mutations, obs) => {
        const b = document.getElementById('btn-playlist');
        if (b) {
          b.addEventListener('click', (e) => { e.preventDefault(); openPlaylist(); });
          log('#btn-playlist bound via MutationObserver');
          obs.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });

  // expose for debug
  window.PlaylistUI = { openPlaylist, closePlaylist, renderList };
})();