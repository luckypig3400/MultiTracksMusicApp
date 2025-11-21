// playlist.js — 修正版：移除 saveConfig 中的 app 回調，避免排序後的 localStorage 被主程式舊狀態覆蓋

(function () {
  let modal = null;
  let sortAsc = true;
  let currentTracks = [];

  function log(...args) { console.log('[Playlist]', ...args); }

  function getConfig() {
    const raw = localStorage.getItem('config');
    return raw ? JSON.parse(raw) : { folders: [] };
  }

  function saveConfig(cfg) {
    localStorage.setItem('config', JSON.stringify(cfg));
    // 【關鍵修正】：這裡絕對不能呼叫 window.saveConfig()
    // 因為 app.js 的 saveConfig 會把 app 記憶體中「還沒更新排序」的 config 寫回 localStorage
    // 導致這裡辛苦排好的順序瞬間被覆蓋掉。
    log('Config saved to localStorage directly.');
  }

  function loadTracksFromStorage() {
    const cfg = getConfig();
    if (!cfg.folders.length) return [];
    const folder = cfg.folders[0];
    currentTracks = folder.tracks.map(t => ({ baseName: t.filename, audioTracks: t.audioTracks }));
    log('Loaded', currentTracks.length, 'tracks');
    return currentTracks;
  }

  function persistTracks() {
    const cfg = getConfig();
    if (!cfg.folders.length) cfg.folders = [{ path: 'Unknown', tracks: [] }];
    cfg.folders[0].tracks = currentTracks.map(t => ({ filename: t.baseName, audioTracks: t.audioTracks }));
    saveConfig(cfg);
    log('persistTracks: saved order for', currentTracks.length, 'tracks');
  }

  function openPlaylist() {
    log('openPlaylist');
    if (!modal) buildModal();
    loadTracksFromStorage();
    renderList();
    modal.style.display = 'flex';
  }

  function closePlaylist() {
    if (!modal) return;
    modal.style.display = 'none';
    log('closePlaylist');
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'playlist-modal';
    Object.assign(modal.style, {
      position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
      background: 'rgba(250,250,250,0.98)', display: 'none', flexDirection: 'column', zIndex: 10000
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
    btnSort.innerText = 'A↕Z';
    btnSort.addEventListener('click', () => {
      sortAsc = !sortAsc;
      sortList();
      persistTracks();
      syncAppTracks(); // 排序後立即通知 App 更新
      renderList();
    });
    leftGroup.appendChild(btnSort);

    const btnShuffle = document.createElement('button');
    btnShuffle.innerText = 'Shuffle';
    btnShuffle.addEventListener('click', () => {
      shuffleList();
      persistTracks();
      syncAppTracks(); // Shuffle 後立即通知 App 更新
      renderList();
    });
    leftGroup.appendChild(btnShuffle);

    const btnClose = document.createElement('button');
    btnClose.innerText = 'Save & Close ✖';
    btnClose.addEventListener('click', () => {
      persistTracks();
      syncAppTracks();
      closePlaylist();
    });

    header.appendChild(leftGroup);
    header.appendChild(btnClose);

    const list = document.createElement('div');
    list.id = 'playlist-list';
    Object.assign(list.style, { height: '90%', overflowY: 'auto' });

    modal.appendChild(header);
    modal.appendChild(list);
    document.body.appendChild(modal);
  }

  function renderList() {
    const list = document.getElementById('playlist-list');
    if (!list) return;
    list.innerHTML = '';

    currentTracks.forEach((t, i) => {
      const item = document.createElement('div');
      Object.assign(item.style, { display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid #eee' });
      item.draggable = true;
      item.dataset.index = i;

      const name = document.createElement('div');
      name.innerText = t.baseName;
      name.style.width = '85%';
      name.style.cursor = 'pointer';

      // 點擊歌名跳轉播放
      name.addEventListener('click', () => {
        log('item click: jump to', t.baseName);
        persistTracks();
        syncAppTracks();

        if (typeof window.loadTrack === 'function' && Array.isArray(window.tracks)) {
          const realIndex = window.tracks.findIndex(wt => wt.baseName === t.baseName);
          if (realIndex >= 0) {
            window.loadTrack(realIndex);
            log('loadTrack executed for', t.baseName, 'at index', realIndex);
          } else {
            log('loadTrack: could not find', t.baseName, 'in window.tracks');
          }
        }
        closePlaylist();
      });

      const drag = document.createElement('div');
      drag.innerText = '↑↓';
      drag.style.width = '15%';
      drag.style.textAlign = 'center';
      drag.style.cursor = 'grab';

      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', i);
      });

      item.addEventListener('dragover', e => e.preventDefault());

      item.addEventListener('drop', e => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = i;
        if (from === to) return;
        const moved = currentTracks[from];
        reorderArray(currentTracks, from, to);
        log(`"${moved.baseName}" 排序從 ${from} 變成 ${to}`);
        persistTracks();
        syncAppTracks(); // 拖曳後立即通知 App 更新
        renderList();
      });

      item.appendChild(name);
      item.appendChild(drag);
      list.appendChild(item);
    });

    log('renderList complete, count =', currentTracks.length);
  }

  function reorderArray(arr, from, to) {
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  function sortList() {
    currentTracks.sort((a, b) => {
      const A = a.baseName.toLowerCase();
      const B = b.baseName.toLowerCase();
      if (A < B) return sortAsc ? -1 : 1;
      if (A > B) return sortAsc ? 1 : -1;
      return 0;
    });
    log('sortList done, sortAsc =', sortAsc);
  }

  function shuffleList() {
    for (let i = currentTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentTracks[i], currentTracks[j]] = [currentTracks[j], currentTracks[i]];
    }
    log('shuffleList done');
  }

  function syncAppTracks() {
    if (typeof window.onPlaylistUpdated === 'function') {
      window.onPlaylistUpdated();
      log('syncAppTracks: called window.onPlaylistUpdated()');
    } else {
      log('syncAppTracks: window.onPlaylistUpdated not found!');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-playlist');
    if (btn) btn.addEventListener('click', e => { e.preventDefault(); openPlaylist(); });
  });

  window.PlaylistUI = { openPlaylist, renderList, loadTracksFromStorage };
})();