// setting.js

// 封裝主題管理模組
const ThemeManager = (() => {
  // 套用 VSCode dark 主題的樣式
  const style = document.createElement('style');
  style.textContent = `
    .vscode-dark div{
      background-color: #1e1e1e !important;
      color: #d4d4d4 !important;
    }
    .vscode-dark body, .vscode-dark .app {
      background-color: #1e1e1e !important;
      color: #d4d4d4 !important;
    }
    .vscode-dark textarea {
      background-color: #252526 !important;
      color: #d4d4d4 !important;
      border-color: #3c3c3c !important;
    }
    .vscode-dark button {
      background-color: #333 !important;
      color: #ddd !important;
      border-color: #555 !important;
    }
  `;
  document.head.appendChild(style);

  function applyTheme(theme, btnTheme = null) {
    const app = document.querySelector('.app');
    if (theme === 'dark') {
      document.documentElement.classList.add('vscode-dark');
      if (app) app.classList.add('vscode-dark');
      if (btnTheme) btnTheme.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      document.documentElement.classList.remove('vscode-dark');
      if (app) app.classList.remove('vscode-dark');
      if (btnTheme) btnTheme.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
  }

  function toggleTheme(btnTheme = null) {
    const current = localStorage.getItem('appTheme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('appTheme', next);
    applyTheme(next, btnTheme);
  }

  function loadAndApplyTheme(btnTheme = null) {
    const savedTheme = localStorage.getItem('appTheme') || 'light';
    applyTheme(savedTheme, btnTheme);
  }

  return { applyTheme, toggleTheme, loadAndApplyTheme };
})();

// 初始化設定頁面
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('config-text');
  const btnBack = document.getElementById('btn-back');
  const btnSave = document.getElementById('btn-save-file');
  const btnLoad = document.getElementById('btn-load-file');
  const btnClear = document.getElementById('btn-clear');
  const fileInput = document.getElementById('file-input');
  const btnTheme = document.getElementById('btn-theme-toggle');

  // 初始化主題
  ThemeManager.loadAndApplyTheme(btnTheme);

  // 讀取 localStorage config
  function loadConfig() {
    const raw = localStorage.getItem('config') || '{}';
    try {
      textarea.value = JSON.stringify(JSON.parse(raw), null, 2);
    } catch (e) {
      textarea.value = raw;
    }
  }
  loadConfig();

  // 綁定主題切換
  if (btnTheme) {
    btnTheme.addEventListener('click', () => ThemeManager.toggleTheme(btnTheme));
  }

  // 返回 index
  if (btnBack) btnBack.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // 儲存成檔案
  if (btnSave) btnSave.addEventListener('click', () => {
    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config_MultiTracksMusicApp.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // 載入自檔案
  if (btnLoad) btnLoad.addEventListener('click', () => fileInput.click());

  if (fileInput) fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const obj = JSON.parse(evt.target.result);
        localStorage.setItem('config', JSON.stringify(obj));
        loadConfig();
        alert('設定已載入並儲存到 localStorage');
      } catch (err) {
        alert('檔案內容不是有效 JSON');
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  // 清除 localStorage
  if (btnClear) btnClear.addEventListener('click', () => {
    if (confirm('確定要清除設定嗎？')) {
      localStorage.removeItem('config');
      loadConfig();
    }
  });
});
