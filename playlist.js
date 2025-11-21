// playlist.js — 修正版：加入 CSS 樣式美化按鈕、實作手機觸控拖曳排序 (Touch API)

(function () {
  let modal = null;
  let sortAsc = true;
  let currentTracks = [];

  // 用於手機拖曳的暫存變數
  let touchStartIndex = -1;

  function log(...args) { console.log('[Playlist]', ...args); }

  function getConfig() {
    const raw = localStorage.getItem('config');
    return raw ? JSON.parse(raw) : { folders: [] };
  }

  function saveConfig(cfg) {
    localStorage.setItem('config', JSON.stringify(cfg));
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

    // 同步主題：開啟時檢查 localStorage，若為 dark 則加上 class
    const theme = localStorage.getItem('appTheme') || 'light';
    if (theme === 'dark') {
      modal.classList.add('vscode-dark');
    } else {
      modal.classList.remove('vscode-dark');
    }

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

    // 【新增 CSS】美化按鈕與列表
    const style = document.createElement('style');
    style.textContent = `
      /* 按鈕樣式，比照設定頁面 */
      #playlist-header button {
        padding: 8px 12px;
        font-size: 1rem;
        border-radius: 8px;
        border: 1px solid #ccc;
        background: white;
        cursor: pointer;
      }
      /* 深色模式按鈕適配 (需配合 vscode-dark class) */
      .vscode-dark #playlist-modal {
        background-color: #1e1e1e !important;
        color: #d4d4d4 !important;
      }
      .vscode-dark #playlist-header button {
        background-color: #333 !important;
        color: #ddd !important;
        border-color: #555 !important;
      }
      /* 清單項目樣式 */
      .playlist-item {
        display: flex; 
        align-items: center; 
        padding: 12px 8px; /* 增加高度方便點擊 */
        border-bottom: 1px solid #eee;
        background-color: inherit;
        transition: background-color 0.2s;
      }
      .vscode-dark .playlist-item {
        border-bottom: 1px solid #333;
      }
      /* 拖曳時的視覺效果 */
      .playlist-item.dragging {
        opacity: 0.5;
        background-color: #ddd;
      }
      .vscode-dark .playlist-item.dragging {
        background-color: #444;
      }
      /* 拖曳手柄 */
      .drag-handle {
        width: 15%;
        text-align: center;
        cursor: grab;
        font-size: 1.2rem;
        color: #888;
        padding: 4px; /* 增加觸控面積 */
        user-select: none;
      }
    `;
    modal.appendChild(style);

    const header = document.createElement('div');
    header.id = 'playlist-header';
    Object.assign(header.style, {
      height: '10%', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
      syncAppTracks();
      renderList();
    });
    leftGroup.appendChild(btnSort);

    const btnShuffle = document.createElement('button');
    btnShuffle.innerHTML = '<i class="fa-solid fa-shuffle">';
    btnShuffle.addEventListener('click', () => {
      shuffleList();
      persistTracks();
      syncAppTracks();
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
      item.className = 'playlist-item'; // 使用 class 方便 CSS 選取
      item.draggable = true; // 電腦版拖曳
      item.dataset.index = i;

      const name = document.createElement('div');
      name.innerText = t.baseName;
      name.style.width = '85%';
      name.style.cursor = 'pointer';
      // 避免文字被選取影響拖曳體驗
      name.style.userSelect = 'none';

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
      drag.className = 'drag-handle';
      drag.innerText = '≡'; // 改用漢堡選單符號，視覺上更像可拖曳

      // ==========================================
      // 1. 電腦版 Drag & Drop (HTML5 API)
      // ==========================================
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', i);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
      item.addEventListener('dragover', e => e.preventDefault());
      item.addEventListener('drop', e => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = i;
        if (from === to || isNaN(from)) return;
        const moved = currentTracks[from];
        reorderArray(currentTracks, from, to);
        log(`[PC] "${moved.baseName}" 排序從 ${from} 變成 ${to}`);
        persistTracks();
        syncAppTracks();
        renderList();
      });

      // ==========================================
      // 2. 手機版 Touch Drag (Touch Events)
      // 綁定在 drag handle 上，避免滑動清單時誤觸
      // ==========================================
      drag.addEventListener('touchstart', (e) => {
        // 防止手機瀏覽器的預設滾動行為
        e.preventDefault();
        touchStartIndex = i;
        item.classList.add('dragging');
      }, { passive: false });

      drag.addEventListener('touchmove', (e) => {
        e.preventDefault(); // 持續防止滾動
        const touch = e.touches[0];

        // 取得手指目前位置下方的元素
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        // 找到該元素所屬的 playlist-item
        const row = target ? target.closest('.playlist-item') : null;

        // 這裡可以加入視覺回饋，例如高亮目標行 (目前先省略以保持效能)
      }, { passive: false });

      drag.addEventListener('touchend', (e) => {
        item.classList.remove('dragging');

        // 取得手指離開時的位置
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const row = target ? target.closest('.playlist-item') : null;

        if (row && row.dataset.index !== undefined) {
          const toIndex = parseInt(row.dataset.index);
          if (touchStartIndex !== -1 && toIndex !== -1 && touchStartIndex !== toIndex) {
            const moved = currentTracks[touchStartIndex];
            reorderArray(currentTracks, touchStartIndex, toIndex);
            log(`[Mobile] "${moved.baseName}" 排序從 ${touchStartIndex} 變成 ${toIndex}`);
            persistTracks();
            syncAppTracks();
            renderList();
          }
        }
        touchStartIndex = -1; // 重置
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

  // 解析檔名以進行智慧排序：
  function parseSmartSortKey(name) {
    const underscoreIndex = name.indexOf('_');
    let processedName = name;
    if (underscoreIndex !== -1) {
      processedName = name.substring(underscoreIndex + 1);
    }
    const match = processedName.match(/^(\d+)\./);
    let number = 999;
    if (match && match[1]) {
      number = parseInt(match[1], 10);
    }
    return { original: name, processed: processedName, number: number };
  }

  function sortList() {
    currentTracks.sort((a, b) => {
      const keyA = parseSmartSortKey(a.baseName);
      const keyB = parseSmartSortKey(b.baseName);
      if (keyA.number !== keyB.number) {
        return sortAsc ? (keyA.number - keyB.number) : (keyB.number - keyA.number);
      }
      const strA = keyA.processed.toLowerCase();
      const strB = keyB.processed.toLowerCase();
      if (strA < strB) return sortAsc ? -1 : 1;
      if (strA > strB) return sortAsc ? 1 : -1;
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