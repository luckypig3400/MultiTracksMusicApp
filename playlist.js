// playlist.js — 修正版：新增切換資料夾功能，並根據 activeFolderPath 顯示清單

(function () {
  let modal = null;
  let sortAsc = true;
  let currentTracks = [];

  // 用於手機拖曳的暫存變數
  let touchStartIndex = -1;

  function log(...args) { console.log('[Playlist]', ...args); }

  function getConfig() {
    // 優先使用 App 記憶體中的 config (因為有 Blob URL)，若無則讀 localStorage
    if (window.AppAudioControl) return window.AppAudioControl.getConfig();
    const raw = localStorage.getItem('config');
    return raw ? JSON.parse(raw) : { folders: [] };
  }

  function saveConfig(cfg) {
    // 通知 App 保存
    if (window.AppAudioControl) window.AppAudioControl.saveConfig();
    else localStorage.setItem('config', JSON.stringify(cfg));
  }

  function loadTracksFromStorage() {
    // 直接使用 window.tracks，因為 app.js 已經根據 activeFolderPath 生成好了
    if (window.tracks) {
      currentTracks = window.tracks.map(t => ({ baseName: t.baseName, audioTracks: t.audioTracks }));
      log('Loaded tracks from window.tracks:', currentTracks.length);
    } else {
      currentTracks = [];
    }
    return currentTracks;
  }

  function persistTracks() {
    // 將 currentTracks 的順序寫回 config 中對應的 activeFolder
    const cfg = getConfig();
    const activePath = cfg.activeFolderPath;

    if (!activePath || !cfg.folders) return;

    const folder = cfg.folders.find(f => {
      // 簡單正規化比對
      const p1 = f.path.replace(/\\/g, '/').replace(/\/+$/, '');
      const p2 = activePath.replace(/\\/g, '/').replace(/\/+$/, '');
      return p1 === p2;
    });

    if (folder) {
      // 這裡比較 tricky，因為 currentTracks 只有 baseName，缺少 lyricsFile 等資訊
      // 我們需要從 folder.tracks 原本的資料中，依照 currentTracks 的順序重新排列
      const trackMap = new Map();
      folder.tracks.forEach(t => trackMap.set(t.filename, t));

      folder.tracks = currentTracks.map(ct => trackMap.get(ct.baseName)).filter(t => t);

      saveConfig(cfg);
      log('persistTracks: saved order for', folder.path);
    }
  }

  function openPlaylist() {
    log('openPlaylist');
    if (!modal) buildModal();

    // 同步主題：開啟時檢查 localStorage，若為 dark 則加上 class
    const theme = localStorage.getItem('appTheme') || 'light';
    if (theme === 'dark') modal.classList.add('vscode-dark');
    else modal.classList.remove('vscode-dark');

    loadTracksFromStorage();
    renderList();
    updateHeaderTitle(); // 更新標題顯示當前資料夾
    modal.style.display = 'flex';
  }

  function closePlaylist() {
    if (!modal) return;
    modal.style.display = 'none';
    log('closePlaylist');
  }

  // 暴露給 app.js 使用，當切換資料夾時更新標題
  function updateHeaderTitle() {
    const titleEl = document.getElementById('playlist-folder-name');
    if (!titleEl) return;
    const cfg = getConfig();
    titleEl.innerText = cfg.activeFolderPath || '未選擇資料夾';
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'playlist-modal';
    Object.assign(modal.style, {
      position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
      background: 'rgba(250,250,250,0.98)', display: 'none', flexDirection: 'column', zIndex: 10000
    });

    const style = document.createElement('style');
    style.textContent = `
      #playlist-header {
          padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.06);
          display: flex; flex-direction: column; gap: 8px;
      }
      .playlist-controls { display: flex; justify-content: space-between; align-items: center; }
      .btn-group { display: flex; gap: 8px; }
      #playlist-header button {
        padding: 8px 12px; font-size: 1rem; border-radius: 8px;
        border: 1px solid #ccc; background: white; cursor: pointer;
      }
      /* Folder Info Block */
      #playlist-folder-info {
          padding: 4px 8px; background: rgba(0,0,0,0.03); border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          min-height: 30px;
      }
      #playlist-folder-name {
          font-size: 0.9rem; font-weight: bold; color: #555; word-break: break-all;
      }
      
      .vscode-dark #playlist-modal { background-color: #1e1e1e !important; color: #d4d4d4 !important; }
      .vscode-dark #playlist-header button { background-color: #333 !important; color: #ddd !important; border-color: #555 !important; }
      .vscode-dark #playlist-folder-info { background: rgba(255,255,255,0.05); }
      .vscode-dark #playlist-folder-name { color: #bbb; }
      
      .playlist-item { display: flex; align-items: center; padding: 12px 8px; border-bottom: 1px solid #eee; background-color: inherit; }
      .vscode-dark .playlist-item { border-bottom: 1px solid #333; }
      .playlist-item.dragging { opacity: 0.5; background-color: #ddd; }
      .vscode-dark .playlist-item.dragging { background-color: #444; }
      .drag-handle { width: 15%; text-align: center; cursor: grab; font-size: 1.2rem; color: #888; padding: 4px; user-select: none; }
    `;
    modal.appendChild(style);

    const header = document.createElement('div');
    header.id = 'playlist-header';

    // 上排按鈕
    const controls = document.createElement('div');
    controls.className = 'playlist-controls';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'btn-group';

    const btnSort = document.createElement('button');
    btnSort.innerText = 'A↕Z';
    btnSort.onclick = () => { sortAsc = !sortAsc; sortList(); persistTracks(); syncAppTracks(); renderList(); };

    const btnShuffle = document.createElement('button');
    btnShuffle.innerHTML = '<i class="fa-solid fa-shuffle"></i>';
    btnShuffle.onclick = () => { shuffleList(); persistTracks(); syncAppTracks(); renderList(); };

    // 新增：切換資料夾按鈕
    const btnSwitchFolder = document.createElement('button');
    btnSwitchFolder.innerHTML = '<i class="fa-solid fa-left-right"></i><i class="fa-solid fa-folder-open"></i>';
    btnSwitchFolder.title = "切換資料夾";
    btnSwitchFolder.onclick = showFolderSelectionModal;

    leftGroup.appendChild(btnSort);
    leftGroup.appendChild(btnShuffle);
    leftGroup.appendChild(btnSwitchFolder);

    const btnClose = document.createElement('button');
    btnClose.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i>'; // 改圖示
    btnClose.title = "儲存並關閉";
    btnClose.onclick = () => { persistTracks(); syncAppTracks(); closePlaylist(); };

    controls.appendChild(leftGroup);
    controls.appendChild(btnClose);

    // 下排：資料夾資訊
    const folderInfo = document.createElement('div');
    folderInfo.id = 'playlist-folder-info';
    const folderName = document.createElement('div');
    folderName.id = 'playlist-folder-name';
    folderName.innerText = 'Loading...';
    folderInfo.appendChild(folderName);

    header.appendChild(controls);
    header.appendChild(folderInfo);

    const list = document.createElement('div');
    list.id = 'playlist-list';
    Object.assign(list.style, { height: 'calc(100% - 110px)', overflowY: 'auto' });

    modal.appendChild(header);
    modal.appendChild(list);
    document.body.appendChild(modal);
  }

  function showFolderSelectionModal() {
    const cfg = getConfig();
    if (!cfg.folders || cfg.folders.length === 0) {
      alert("你從未選擇過任何資料夾，或是載入範本音樂");
      return;
    }

    // 建立簡單的選擇 Modal
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.5)', zIndex: 10002, display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: '80%', height: '80%', background: 'white', borderRadius: '8px',
      padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    });

    // 深色模式適配
    if (document.body.classList.contains('vscode-dark') || modal.classList.contains('vscode-dark')) {
      panel.style.background = '#252526';
      panel.style.color = '#d4d4d4';
    }

    const title = document.createElement('h3');
    title.innerText = '選擇資料夾';
    title.style.margin = '0 0 8px 0';
    title.style.textAlign = 'center';

    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, {
      flex: 1, overflowY: 'auto', border: '1px solid #ccc', borderRadius: '4px'
    });

    cfg.folders.forEach(folder => {
      const item = document.createElement('div');
      item.innerText = folder.path || '(未命名資料夾)';
      Object.assign(item.style, {
        padding: '12px', cursor: 'pointer', borderBottom: '1px solid #eee'
      });

      if (modal.classList.contains('vscode-dark')) item.style.borderBottom = '1px solid #444';

      // 高亮當前資料夾
      if (folder.path === cfg.activeFolderPath) {
        item.style.background = modal.classList.contains('vscode-dark') ? '#37373d' : '#e3f2fd';
        item.style.fontWeight = 'bold';
      }

      item.onclick = () => {
        if (window.AppAudioControl) {
          window.AppAudioControl.switchFolder(folder.path);
          // 更新 Playlist UI
          loadTracksFromStorage(); // 重新從 window.tracks 載入
          renderList();
          updateHeaderTitle();
        }
        document.body.removeChild(overlay);
      };
      listContainer.appendChild(item);
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '取消';
    closeBtn.style.padding = '8px';
    closeBtn.onclick = () => document.body.removeChild(overlay);

    panel.appendChild(title);
    panel.appendChild(listContainer);
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
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
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', e => e.preventDefault());
      item.addEventListener('drop', e => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = i;
        if (from === to || isNaN(from)) return;
        reorderArray(currentTracks, from, to);
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
        // 視覺回饋可選，目前保持簡潔
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
            reorderArray(currentTracks, touchStartIndex, toIndex);
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
  }

  function reorderArray(arr, from, to) {
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  // 解析檔名以進行智慧排序：
  function parseSmartSortKey(name) {
    const underscoreIndex = name.indexOf('_');
    let processedName = name;
    if (underscoreIndex !== -1) processedName = name.substring(underscoreIndex + 1);
    const match = processedName.match(/^(\d+)\./);
    let number = 999;
    if (match && match[1]) number = parseInt(match[1], 10);
    return { original: name, processed: processedName, number: number };
  }

  function sortList() {
    currentTracks.sort((a, b) => {
      const keyA = parseSmartSortKey(a.baseName);
      const keyB = parseSmartSortKey(b.baseName);
      if (keyA.number !== keyB.number) return sortAsc ? (keyA.number - keyB.number) : (keyB.number - keyA.number);
      const strA = keyA.processed.toLowerCase();
      const strB = keyB.processed.toLowerCase();
      if (strA < strB) return sortAsc ? -1 : 1;
      if (strA > strB) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  function shuffleList() {
    for (let i = currentTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentTracks[i], currentTracks[j]] = [currentTracks[j], currentTracks[i]];
    }
  }

  function syncAppTracks() {
    if (typeof window.onPlaylistUpdated === 'function') window.onPlaylistUpdated();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-playlist');
    if (btn) btn.addEventListener('click', e => { e.preventDefault(); openPlaylist(); });
  });

  // 公開 renderList 與 updateHeaderTitle 供 app.js 呼叫
  window.PlaylistUI = { openPlaylist, renderList, loadTracksFromStorage, updateHeaderTitle };
})();