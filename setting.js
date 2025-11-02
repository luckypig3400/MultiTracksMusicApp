// setting.js
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('config-text');
  const btnBack = document.getElementById('btn-back');
  const btnSave = document.getElementById('btn-save-file');
  const btnLoad = document.getElementById('btn-load-file');
  const btnClear = document.getElementById('btn-clear');
  const fileInput = document.getElementById('file-input');

  // 讀取 localStorage config
  function loadConfig() {
    const raw = localStorage.getItem('config') || '{}';
    textarea.value = JSON.stringify(JSON.parse(raw), null, 2);
  }

  loadConfig();

  // 返回 index
  btnBack.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // 儲存成檔案
  btnSave.addEventListener('click', () => {
    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config_MultiTracksMusicApp.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // 載入自檔案
  btnLoad.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', e => {
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
  btnClear.addEventListener('click', () => {
    if (confirm('確定要清除設定嗎？')) {
      localStorage.removeItem('config');
      loadConfig();
    }
  });
});
