// setting.js — 修正版：改為 Modal 形式，支援不中斷播放，並新增強制重整功能與範本載入

// 定義範本檔案列表
const SAMPLE_BASE_URL = "audio/sample/";
const SAMPLE_FILES = [
  // 歌曲 1: 栞 (13_997)
  "13_997.栞_(Bass).mp3",
  "13_997.栞_(Drums).mp3",
  "13_997.栞_(Other).mp3",
  "13_997.栞_(Vocals).mp3",
  "栞.srt",

  // 歌曲 2: 春日影 (15_998)
  "15_998.春日影 - From THE FIRST TAKE_(Bass).mp3",
  "15_998.春日影 - From THE FIRST TAKE_(Drums).mp3",
  "15_998.春日影 - From THE FIRST TAKE_(Other).mp3",
  "15_998.春日影 - From THE FIRST TAKE_(Vocals).mp3",
  "春日影 - From THE FIRST TAKE.srt",

  // 歌曲 3: 迷星叫 (1_999)
  "1_999.迷星叫_(Bass).mp3",
  "1_999.迷星叫_(Drums).mp3",
  "1_999.迷星叫_(Other).mp3",
  "1_999.迷星叫_(Vocals).mp3",
  "迷星叫.srt"
];

// 封裝主題管理模組 (全域可存取)
window.ThemeManager = (() => {
  // 套用 VSCode dark 主題的樣式 (動態注入 CSS)
  const style = document.createElement('style');
  style.textContent = `
    .vscode-dark div{ background-color: #1e1e1e !important; color: #d4d4d4 !important; }
    .vscode-dark body, .vscode-dark .app, .vscode-dark #settings-modal { background-color: #1e1e1e !important; color: #d4d4d4 !important; }
    .vscode-dark textarea { background-color: #252526 !important; color: #d4d4d4 !important; border-color: #3c3c3c !important; }
    .vscode-dark button { background-color: #333 !important; color: #ddd !important; border-color: #555 !important; }
  `;
  document.head.appendChild(style);

  function applyTheme(theme, btnTheme = null) {
    const app = document.querySelector('.app');
    const modal = document.getElementById('settings-modal');
    if (theme === 'dark') {
      document.documentElement.classList.add('vscode-dark');
      if (app) app.classList.add('vscode-dark');
      if (modal) modal.classList.add('vscode-dark');
      if (btnTheme) btnTheme.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      document.documentElement.classList.remove('vscode-dark');
      if (app) app.classList.remove('vscode-dark');
      if (modal) modal.classList.remove('vscode-dark');
      if (btnTheme) btnTheme.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
  }

  function toggleTheme(btnTheme = null) {
    const current = localStorage.getItem('appTheme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('appTheme', next);

    // 同步更新 config 中的主題設定
    try {
      const raw = localStorage.getItem('config');
      const cfg = raw ? JSON.parse(raw) : {};
      cfg.appTheme = next;
      localStorage.setItem('config', JSON.stringify(cfg));
    } catch (e) {
      console.warn('更新 config.appTheme 時發生錯誤', e);
    }

    applyTheme(next, btnTheme);
  }

  function loadAndApplyTheme(btnTheme = null) {
    let savedTheme = 'light';
    try {
      const raw = localStorage.getItem('config');
      const cfg = raw ? JSON.parse(raw) : {};
      savedTheme = cfg.appTheme || localStorage.getItem('appTheme') || 'light';
    } catch {
      savedTheme = localStorage.getItem('appTheme') || 'light';
    }
    localStorage.setItem('appTheme', savedTheme);
    applyTheme(savedTheme, btnTheme);
  }
  return { applyTheme, toggleTheme, loadAndApplyTheme };
})();

// 設定介面 UI 模組
window.SettingsUI = (() => {
  let modal = null;

  function openSettings() {
    if (!modal) buildModal();
    loadConfigToTextarea();
    modal.style.display = 'flex';

    // 確保開啟時主題正確
    const currentTheme = localStorage.getItem('appTheme') || 'light';
    const btnTheme = document.getElementById('btn-theme-toggle');
    ThemeManager.applyTheme(currentTheme, btnTheme);

    // 更新 Debug 按鈕文字
    updateDebugButtonState();
  }

  function closeSettings() {
    if (!modal) return;
    modal.style.display = 'none';
  }

  function updateDebugButtonState() {
    const btn = document.getElementById('btn-debug-toggle');
    if (!btn) return;
    // 讀取目前 config
    const cfg = JSON.parse(localStorage.getItem('config') || '{}');
    if (cfg.showDebugInfo) {
      btn.innerHTML = '除錯訊息: 開';
      btn.style.color = '#2e7d32'; // green
    } else {
      btn.innerHTML = '除錯訊息: 關';
      btn.style.color = '#555';
    }
  }

  function toggleDebugInfo() {
    const cfg = JSON.parse(localStorage.getItem('config') || '{}');
    cfg.showDebugInfo = !cfg.showDebugInfo;
    localStorage.setItem('config', JSON.stringify(cfg));
    // 通知 App 更新 config 並立即顯示/隱藏
    if (window.onPlaylistUpdated) window.onPlaylistUpdated();
    updateDebugButtonState();
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'settings-modal';
    Object.assign(modal.style, {
      position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
      background: 'rgba(250,250,250,0.98)', display: 'none', flexDirection: 'column',
      padding: '12px', boxSizing: 'border-box', zIndex: 10001
    });

    // 注入設定頁面專用的 CSS
    const style = document.createElement('style');
    style.textContent = `
      #settings-btn-container {
        display:flex; justify-content:flex-start; gap:8px; margin-bottom:8px; flex-wrap: wrap;
      }
      #settings-btn-container button {
        padding:8px 12px; font-size:1rem; border-radius:8px; border:1px solid #ccc;
        background:white; cursor:pointer;
      }
      #config-text {
        flex:1; width:100%; resize:none; padding:8px; font-family: monospace;
        font-size:0.9rem; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; overflow:auto;
      }
    `;
    modal.appendChild(style);

    // 建立按鈕區
    const btnContainer = document.createElement('div');
    btnContainer.id = 'settings-btn-container';

    const btnBack = createButton('btn-back', '返回', closeSettings);
    const btnSave = createButton('btn-save-file', '儲存成檔案', exportConfig);
    const btnLoad = createButton('btn-load-file', '載入自檔案', () => document.getElementById('file-input').click());
    const btnClear = createButton('btn-clear', '清除', clearConfig);
    const btnTheme = createButton('btn-theme-toggle', '<i class="fa-solid fa-moon"></i>', () => ThemeManager.toggleTheme(btnTheme));
    btnTheme.title = "切換主題";

    // 【新增】除錯訊息開關
    const btnDebug = createButton('btn-debug-toggle', '除錯訊息: 關', toggleDebugInfo);

    const btnLoadSample = createButton('btn-load-sample', '載入音樂範本', loadSampleMusic);
    btnLoadSample.style.color = '#2e7d32'; btnLoadSample.style.borderColor = '#2e7d32';
    const btnRemoveSample = createButton('btn-remove-sample', '刪除範本資料', removeSampleMusic);
    btnRemoveSample.style.color = '#e65100'; // 橘色
    btnRemoveSample.style.borderColor = '#e65100';

    // 強制重整按鈕
    const btnForceReload = createButton('btn-force-reload', '強制重整 (Ctrl+F5)', forceReload);
    btnForceReload.style.color = '#d32f2f'; // 紅色警告色
    btnForceReload.style.borderColor = '#d32f2f';

    btnContainer.appendChild(btnBack);
    btnContainer.appendChild(btnSave);
    btnContainer.appendChild(btnLoad);
    btnContainer.appendChild(btnClear);
    btnContainer.appendChild(btnTheme);
    btnContainer.appendChild(btnDebug); // Add here
    btnContainer.appendChild(btnLoadSample);
    btnContainer.appendChild(btnRemoveSample);
    btnContainer.appendChild(btnForceReload);

    // 建立 Textarea
    const textarea = document.createElement('textarea');
    textarea.id = 'config-text';
    textarea.readOnly = true;

    // 隱藏的檔案輸入框
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'file-input';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', handleFileLoad);

    modal.appendChild(btnContainer);
    modal.appendChild(textarea);
    modal.appendChild(fileInput);
    document.body.appendChild(modal);
  }

  function createButton(id, text, onClick) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.innerHTML = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  async function loadSampleMusic() {
    if (!confirm('確定要載入範本音樂檔案嗎？(需連網下載)\n\n注意：範本檔案將會被放入「Sample Music」資料夾中，不會覆蓋您現有的本地檔案。')) return;
    const loadedFiles = [];
    const fileObjects = [];
    try {
      const promises = SAMPLE_FILES.map(async (filename) => {
        const response = await fetch(SAMPLE_BASE_URL + filename);
        if (!response.ok) throw new Error(`Failed to load ${filename}`);
        const blob = await response.blob();
        // 【關鍵修正】：手動加上 "Sample Music/" 路徑前綴
        // 這樣 app.js 的 scanFiles 就會把這些檔案歸類到 Sample Music 資料夾，不會影響 root 資料夾
        const file = new File([blob], "Sample Music/" + filename, { type: blob.type });
        fileObjects.push(file);
        loadedFiles.push(filename);
      });
      await Promise.all(promises);
      if (fileObjects.length > 0 && window.AppAudioControl) {
        // 呼叫 app.js 提供的介面處理檔案
        window.AppAudioControl.loadFiles(fileObjects);
        alert(`成功載入以下範本檔案：\n\n${loadedFiles.join('\n')}`);
        loadConfigToTextarea(); // 更新顯示的 JSON
      } else {
        alert("無法載入範本檔案。");
      }
    } catch (err) {
      console.error(err);
      alert("載入範本時發生錯誤，請檢查網路或檔案路徑。");
    }
  }

  function removeSampleMusic() {
    if (!confirm('確定要移除範本音樂資料嗎？\n(將會移除「Sample Music」資料夾)')) return;
    try {
      const config = JSON.parse(localStorage.getItem('config') || '{}');
      if (!config.folders) {
        alert("設定檔中無資料。");
        return;
      }

      // 直接移除 path 為 "Sample Music" 的資料夾
      const originalLength = config.folders.length;
      config.folders = config.folders.filter(f => f.path !== "Sample Music");
      if (config.folders.length < originalLength) {
        localStorage.setItem('config', JSON.stringify(config));
        loadConfigToTextarea();
        // 觸發 App 更新
        if (window.onPlaylistUpdated) window.onPlaylistUpdated();
        alert("已移除範本資料夾。");
      } else { alert("未找到範本資料夾 (Sample Music)。"); }
    } catch (e) { console.error(e); alert("移除失敗。"); }
  }

  function loadConfigToTextarea() {
    const textarea = document.getElementById('config-text');
    if (!textarea) return;
    const raw = localStorage.getItem('config') || '{}';
    try {
      const cfg = JSON.parse(raw);
      // 確保 config 內包含 appTheme
      if (!cfg.appTheme) {
        cfg.appTheme = localStorage.getItem('appTheme') || 'light';
      }
      textarea.value = JSON.stringify(cfg, null, 2);
    } catch (e) { textarea.value = raw; }
  }

  function exportConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem('config') || '{}');
      cfg.appTheme = localStorage.getItem('appTheme') || cfg.appTheme || 'light';
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'config_MultiTracksMusicApp.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('匯出設定時發生錯誤'); }
  }

  function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const obj = JSON.parse(evt.target.result);
        if (obj.appTheme) localStorage.setItem('appTheme', obj.appTheme);
        localStorage.setItem('config', JSON.stringify(obj));
        loadConfigToTextarea();
        ThemeManager.loadAndApplyTheme(document.getElementById('btn-theme-toggle'));
        alert('設定已載入並儲存到 localStorage');

        // 選擇性：通知 App 更新 (如果需要即時套用設定變更)
        // 但為了保險起見，通常載入設定後使用者會傾向重整，
        // 這裡我們只更新 UI。
      } catch (err) {
        alert('檔案內容不是有效 JSON');
      }
    };
    reader.readAsText(file, 'utf-8');
    // Reset value so same file can be selected again
    e.target.value = '';
  }

  function clearConfig() {
    if (confirm('確定要清除設定嗎？')) {
      localStorage.removeItem('config');
      localStorage.removeItem('appTheme');
      loadConfigToTextarea();
      ThemeManager.applyTheme('light', document.getElementById('btn-theme-toggle'));
    }
  }

  function forceReload() {
    if (confirm('確定要強制重新整理頁面嗎？\n這將會重新載入所有程式碼檔案 (app.js, playlist.js 等)。\n\n注意：這會停止目前的音樂播放。')) {
      // 使用 location.reload(true) 強制從伺服器重新載入
      // 並加上時間戳記參數以確保繞過頑強的快取
      const url = new URL(window.location.href);
      url.searchParams.set('t', Date.now());
      window.location.href = url.toString();
      // Fallback
      window.location.reload(true);
    }
  }

  return { openSettings };
})();