
// playlist.js — 修正版：新增切換資料夾功能，並根據 activeFolderPath 顯示清單

(function () {
  let modal = null;
  let sortAsc = true;
  let currentTracks = [];

  // 用於手機拖曳的暫存變數
  let touchStartIndex = -1;

  function log(...args) { console.log('[Playlist]', ...args); }

  function getConfig() {
    // 優先使用 App 記憶體中的 config (因為有 Blob URL)，若無則讀 safeStorage
    if (window.AppAudioControl) return window.AppAudioControl.getConfig();
    const raw = safeStorage.getItem('config');
    return raw ? JSON.parse(raw) : { folders: [] };
  }

  function saveConfig(cfg) {
    // 通知 App 保存
    if (window.AppAudioControl) window.AppAudioControl.saveConfig();
    else safeStorage.setItem('config', JSON.stringify(cfg));
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

  // 計算路徑深度差 (需與 app.js 邏輯一致)
  function calcFolderDepth(rootPath, currentPath) {
    // 簡單實作正規化
    const normalize = p => p.replace(/\\/g, '/').replace(/\/+$/, '');
    const normRoot = normalize(rootPath);
    const normCurr = normalize(currentPath);

    if (normCurr === normRoot) return 0;
    if (normCurr.startsWith(normRoot + '/')) {
      const sub = normCurr.substring(normRoot.length + 1);
      return sub.split('/').length;
    }
    return 0;
  }

  function persistTracks() {
    // 將 currentTracks 的順序寫回 config 
    // 【修改】邏輯：根據目前的資料夾深度，寫入 relPathXOrder 屬性到每個 track
    const cfg = getConfig();
    const activePath = cfg.activeFolderPath;

    if (!activePath || !cfg.folders) return;

    // 簡單正規化比對
    const normActive = activePath.replace(/\\/g, '/').replace(/\/+$/, '');

    // 找到對應的 Root Config Folder
    const folder = cfg.folders.find(f => {
      const p = f.path.replace(/\\/g, '/').replace(/\/+$/, '');
      return normActive === p || normActive.startsWith(p + '/');
    });

    if (folder) {
      // 1. 計算深度 -> 決定 Key 名稱
      const depth = calcFolderDepth(folder.path, activePath);
      const orderKey = `relPath${depth}Order`;
      log(`Persisting order for depth ${depth}, Key: ${orderKey}`);

      // 2. 建立 Config Tracks 的 Map 以便快速查找
      const trackMap = new Map();
      folder.tracks.forEach(t => trackMap.set(t.filename, t));

      // 3. 依照目前的 UI 順序 (currentTracks)，更新 config track 的 orderKey
      currentTracks.forEach((ct, index) => {
        const configTrack = trackMap.get(ct.baseName);
        if (configTrack) {
          configTrack[orderKey] = index;
        }
      });

      saveConfig(cfg);
      log('persistTracks: updated order properties.');
    } else {
      log('persistTracks: Root folder not found for path:', activePath);
    }
  }

  function openPlaylist() {
    log('openPlaylist');
    if (!modal) buildModal();

    // 同步主題：開啟時檢查 safeStorage，若為 dark 則加上 class
    const theme = safeStorage.getItem('appTheme') || 'light';
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

      /* Folder Tree Styles */
      .folder-tree-node { margin-left: 12px; border-left: 1px solid #eee; }
      .vscode-dark .folder-tree-node { border-left: 1px solid #444; }
      .folder-row { padding: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
      .folder-row:hover { background: rgba(0,0,0,0.05); }
      .vscode-dark .folder-row:hover { background: rgba(255,255,255,0.05); }
      .folder-row.active { background: #e3f2fd; color: #1976d2; font-weight: bold; }
      .vscode-dark .folder-row.active { background: #37373d; color: #fff; }
      .folder-arrow { width: 20px; text-align: center; color: #888; transition: transform 0.2s; }
      .folder-arrow.expanded { transform: rotate(90deg); }
      .folder-name-text { flex: 1; }
      .folder-all-btn { 
          font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; border: 1px solid #ccc; 
          margin-left: auto; cursor: pointer; 
      }
      .vscode-dark .folder-all-btn { border-color: #555; background: #333; }
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
    btnShuffle.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>';
    btnShuffle.onclick = () => { shuffleList(); persistTracks(); syncAppTracks(); renderList(); };

    // 新增：切換資料夾按鈕
    const btnSwitchFolder = document.createElement('button');
    btnSwitchFolder.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="16 3 21 8 16 13"></polyline><line x1="21" y1="8" x2="3" y2="8"></line><polyline points="8 21 3 16 8 11"></polyline><line x1="3" y1="16" x2="21" y2="16"></line></svg><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-left: 4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    btnSwitchFolder.title = "切換資料夾";
    btnSwitchFolder.onclick = showFolderSelectionModal;

    leftGroup.appendChild(btnSort);
    leftGroup.appendChild(btnShuffle);
    leftGroup.appendChild(btnSwitchFolder);

    const btnClose = document.createElement('button');
    btnClose.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>'; // 改圖示
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

  // -------------------------------------------------------------
  // 新的 Folder Tree 邏輯
  // -------------------------------------------------------------

  function buildFileTree(folder) {
    const rootPath = folder.path.replace(/\\/g, '/').replace(/\/+$/, '');
    const tree = { name: rootPath, path: rootPath, children: {}, files: [], isRoot: true };

    if (!folder.tracks) return tree;

    folder.tracks.forEach(track => {
      // 取得該 Track 的完整相對路徑
      let relPath = "";
      if (track.audioTracks && track.audioTracks.length > 0) {
        relPath = track.audioTracks[0].relPath.replace(/\\/g, '/');
      } else {
        // Fallback (理論上不應該發生)
        relPath = rootPath + "/" + track.filename;
      }

      // 計算相對於 Root 的路徑
      // 例如 Root: "UVR", relPath: "UVR/Sub/A.mp3" -> subPath: "Sub/A.mp3"
      let subPath = relPath;
      if (relPath.startsWith(rootPath + '/')) {
        subPath = relPath.substring(rootPath.length + 1);
      } else if (relPath === rootPath) { // 檔案直接在 root 裡
        subPath = "";
      }

      // 分割目錄
      const parts = subPath.split('/');
      // 檔名是最後一個
      const fileName = parts.pop();

      // 逐步建構樹
      let currentNode = tree;
      let currentPath = rootPath;

      parts.forEach(part => {
        if (!part) return;
        currentPath += '/' + part;
        if (!currentNode.children[part]) {
          currentNode.children[part] = {
            name: part,
            path: currentPath,
            children: {},
            files: []
          };
        }
        currentNode = currentNode.children[part];
      });

      // 雖然我們只顯示資料夾，但可以記錄檔案數以供參考
      currentNode.files.push(fileName);
    });

    return tree;
  }

  function renderFolderNode(node, container, currentActivePath, onSelect, depth = 0) {
    // Container for this node
    const nodeDiv = document.createElement('div');
    // Root 不需要 margin，子節點有
    if (depth > 0) nodeDiv.className = 'folder-tree-node';

    // 1. 節點本身的 Row (顯示名稱 + 箭頭 + All按鈕)
    const row = document.createElement('div');
    row.className = 'folder-row';

    // 檢查是否有子資料夾
    const childKeys = Object.keys(node.children).sort();
    const hasSubFolders = childKeys.length > 0;

    // 箭頭 (如果沒有子資料夾，顯示空白或圓點)
    const arrow = document.createElement('div');
    arrow.className = 'folder-arrow';
    if (hasSubFolders) {
      arrow.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polygon points="9 18 15 12 9 6 9 18"></polygon></svg>';
    } else {
      arrow.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; opacity: 0.5;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
    }
    row.appendChild(arrow);

    // 資料夾名稱
    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name-text';
    nameSpan.innerText = node.name + (node.isRoot ? '' : '');
    row.appendChild(nameSpan);

    // 判斷此節點是否被選中 (完全匹配)
    const isActive = (node.path === currentActivePath);
    if (isActive) row.classList.add('active');

    // "All" 功能邏輯：
    // 如果點擊整個 Row
    row.onclick = (e) => {
      e.stopPropagation();
      // 如果有子資料夾，點擊 Row 預設行為是展開/收合
      if (hasSubFolders) {
        const isExpanded = arrow.classList.contains('expanded');
        if (isExpanded) {
          arrow.classList.remove('expanded');
          childrenContainer.style.display = 'none';
        } else {
          arrow.classList.add('expanded');
          childrenContainer.style.display = 'block';
        }
      } else {
        // 如果是葉節點(沒子資料夾)，點擊就是選取 "All" (該目錄下所有檔案)
        onSelect(node.path);
      }
    };

    nodeDiv.appendChild(row);

    // 2. 子項目容器 (預設展開 Root，其他收合?)
    const childrenContainer = document.createElement('div');
    childrenContainer.style.display = 'none'; // 預設收合

    // 如果 CurrentActivePath 位於此節點之下，則預設展開
    // 或是 Root 預設展開
    if (node.isRoot || (currentActivePath && currentActivePath.startsWith(node.path + '/'))) {
      childrenContainer.style.display = 'block';
      if (hasSubFolders) arrow.classList.add('expanded');
    }

    nodeDiv.appendChild(childrenContainer);

    // 3. 插入特殊的 "All" 選項 (如果該節點有子資料夾)
    // 這樣使用者可以選擇「只播放這個資料夾(包含遞迴)」，即使它已經展開
    if (hasSubFolders) {
      const allRow = document.createElement('div');
      allRow.className = 'folder-row';
      allRow.style.paddingLeft = '36px'; // 縮排比一般子項目多一點
      allRow.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="#666" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><polyline points="3 6 4 7 6 5"></polyline><polyline points="3 12 4 13 6 11"></polyline><polyline points="3 18 4 19 6 17"></polyline></svg> <span style="margin-left:6px">All (包含子資料夾)</span>';

      if (isActive) {
        allRow.classList.add('active');
        allRow.style.color = 'inherit'; // override active color
      }

      allRow.onclick = (e) => {
        e.stopPropagation();
        onSelect(node.path);
      };
      childrenContainer.appendChild(allRow);
    }

    // 4. 遞迴渲染子資料夾
    childKeys.forEach(key => {
      renderFolderNode(node.children[key], childrenContainer, currentActivePath, onSelect, depth + 1);
    });

    container.appendChild(nodeDiv);
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
      width: '90%', maxWidth: '500px', height: '80%', background: 'white', borderRadius: '8px',
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
      flex: 1, overflowY: 'auto', border: '1px solid #ccc', borderRadius: '4px',
      padding: '8px'
    });
    if (document.body.classList.contains('vscode-dark')) listContainer.style.borderColor = '#444';

    // 處理當前 Active Path
    const currentActive = (cfg.activeFolderPath || '').replace(/\\/g, '/').replace(/\/+$/, '');

    // 迭代每一個 Config Root Folder
    cfg.folders.forEach(folder => {
      // 建構樹
      const tree = buildFileTree(folder);
      // 渲染樹
      renderFolderNode(tree, listContainer, currentActive, (selectedPath) => {
        if (window.AppAudioControl) {
          window.AppAudioControl.switchFolder(selectedPath);
          // 更新 Playlist UI
          loadTracksFromStorage();
          renderList();
          updateHeaderTitle();
        }
        document.body.removeChild(overlay);
      });

      // 分隔線
      const separator = document.createElement('div');
      separator.style.height = '1px';
      separator.style.background = '#eee';
      separator.style.margin = '8px 0';
      if (document.body.classList.contains('vscode-dark')) separator.style.background = '#444';
      listContainer.appendChild(separator);
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '取消';
    closeBtn.style.padding = '8px';
    closeBtn.style.cursor = 'pointer';
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