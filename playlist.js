// playlist.js
// 完整建立播放清單的彈出視窗與排序 / 拖曳功能
// 假設全域變數與函式來自 app.js：tracks (陣列), currentTrackIndex (整數), loadTrack(index), saveConfig()

(function () {
  let modal = null;
  let sortAsc = true;

  function openPlaylist() {
    if (!modal) buildModal();
    renderList();
    modal.style.display = 'flex';
    // 不要中斷播放：僅顯示 overlay
  }

  function closePlaylist() {
    if (!modal) return;
    modal.style.display = 'none';
  }

  function buildModal() {
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
    modal.style.background = 'rgba(255,255,255,0.98)';

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

    // sort button
    const btnSort = document.createElement('button');
    btnSort.id = 'playlist-sort';
    btnSort.title = '依檔名排序 (點一下切換順序)';
    btnSort.innerText = 'A↕Z';
    btnSort.style.padding = '8px 10px';
    btnSort.addEventListener('click', () => {
      sortAsc = !sortAsc;
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
      persistOrder();
      closePlaylist();
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
      #playlist-modal .pl-item { display:flex; align-items:center; gap:8px; box-sizing:border-box; padding:6px 12px; border-bottom:1px solid rgba(0,0,0,0.04); height:10vh; min-height:56px; }
      #playlist-modal .pl-item .pl-name { width:85%; overflow:hidden; word-break:break-word; cursor:pointer; }
      #playlist-modal .pl-item .pl-drag { width:15%; text-align:center; cursor:grab; user-select:none; }
      #playlist-modal .pl-item.dragging { opacity:0.5; }
      #playlist-modal button { border-radius:6px; border:1px solid #ccc; background:white; padding:6px 8px; cursor:pointer; }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);
  }

  function renderList() {
    if (!modal) buildModal();
    const wrap = document.getElementById('playlist-list-wrap');
    wrap.innerHTML = '';

    if (!window.tracks || tracks.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.innerText = '目前沒有播放清單，請先選擇資料夾並掃描音檔';
      wrap.appendChild(empty);
      return;
    }

    // create a shallow copy to avoid accidental mutation while rendering
    tracks.forEach((t, idx) => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.draggable = true;
      item.dataset.index = idx;

      const name = document.createElement('div');
      name.className = 'pl-name';
      name.innerText = t.baseName || t.filename || ('Track ' + idx);
      name.addEventListener('click', () => {
        // 跳轉到該首歌播放
        // 將 currentTrackIndex 指向該索引，載入並播放
        try {
          currentTrackIndex = idx;
          loadTrack(idx);
        } catch (e) { console.warn('loadTrack error', e); }
        closePlaylist();
      });

      const drag = document.createElement('div');
      drag.className = 'pl-drag';
      drag.innerText = '↑↓';

      // drag events
      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', idx.toString());
        e.dataTransfer.effectAllowed = 'move';
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
        if (isNaN(from) || isNaN(to) || from === to) return;
        reorderArray(tracks, from, to);
        // 更新顯示索引 attributes
        renderList();
        // 及時保存順序
        persistOrder(false); // false -> 不關閉 modal
      });

      item.appendChild(name);
      item.appendChild(drag);
      wrap.appendChild(item);
    });
  }

  function reorderArray(arr, from, to) {
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  }

  function sortList() {
    if (!tracks) return;
    tracks.sort((a, b) => {
      const A = (a.baseName || a.filename || '').toLowerCase();
      const B = (b.baseName || b.filename || '').toLowerCase();
      if (A < B) return sortAsc ? -1 : 1;
      if (A > B) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  function shuffleList() {
    if (!tracks) return;
    // Fisher-Yates
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
  }

  function persistOrder(closeAfter = true) {
    try {
      // 儲存至 config.folders[0].tracks（假設單一 folder）
      if (window.config && config.folders && config.folders.length > 0) {
        const folder = config.folders[0];
        folder.tracks = tracks.map(t => ({ filename: t.baseName, audioTracks: t.audioTracks }));
        // 同步 appTheme 或其他屬性不要動
        if (typeof saveConfig === 'function') saveConfig();
      }

      // 保持目前播放的 track index 在新的排序中
      if (typeof currentTrackIndex === 'number' && typeof loadTrack === 'function') {
        // try to find the track that was playing by filename/relPath
        // we assume the currently playing baseName exists somewhere
        // if playing, find its new index and keep currentTrackIndex
        // Note: if the track object structure contains audioTracks, we'll try to match by first audio track relPath
        const currentBase = (tracks[currentTrackIndex] && tracks[currentTrackIndex].baseName) || null;
        if (currentBase) {
          const newIndex = tracks.findIndex(t => t.baseName === currentBase);
          if (newIndex >= 0) currentTrackIndex = newIndex;
        }
      }
    } catch (e) {
      console.warn('persistOrder error', e);
    }

    if (closeAfter) closePlaylist();
  }

  // attach to button in index.html
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-playlist');
    if (btn) btn.addEventListener('click', (e) => {
      e.preventDefault();
      openPlaylist();
    });
  });

  // expose for debug
  window.PlaylistUI = { openPlaylist, closePlaylist, renderList };
})();
