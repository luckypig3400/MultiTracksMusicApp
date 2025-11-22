// lyrics.js — 歌詞模組：解析 SRT、三行顯示、字體設定、同步滾動

(function () {
  let modal = null;
  let lyricsData = []; // [{ time: 0, lines: ["日文", "羅馬", "中文"] }, ...]
  let animationFrameId = null;
  let isUserScrolling = false;
  let scrollTimeout = null;

  function log(...args) { console.log('[Lyrics]', ...args); }

  // 讀取與儲存 Config (依賴 app.js 的 window.AppAudioControl)
  function getFontSizeConfig() {
    if (window.AppAudioControl) {
      const cfg = window.AppAudioControl.getConfig();
      return cfg.lyricsFontSize || { line1: 20, line2: 16, line3: 14 };
    }
    return { line1: 20, line2: 16, line3: 14 };
  }

  function saveFontSizeConfig(newSizes) {
    if (window.AppAudioControl) {
      const cfg = window.AppAudioControl.getConfig();
      cfg.lyricsFontSize = newSizes;
      window.AppAudioControl.saveConfig();
    }
  }

  function openLyrics() {
    log('openLyrics');
    if (!modal) buildModal();

    // 套用主題
    const theme = localStorage.getItem('appTheme') || 'light';
    if (theme === 'dark') modal.classList.add('vscode-dark');
    else modal.classList.remove('vscode-dark');

    modal.style.display = 'flex';
    reloadLyrics(); // 載入當前歌曲歌詞
    startSyncLoop();
  }

  function closeLyrics() {
    if (!modal) return;
    modal.style.display = 'none';
    stopSyncLoop();
  }

  function isLyricsOpen() {
    return modal && modal.style.display !== 'none';
  }

  // 解析 SRT 字串
  function parseSRT(srtContent) {
    const pattern = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n\n|\n*$)/g;
    const result = [];
    let match;
    while ((match = pattern.exec(srtContent)) !== null) {
      const startTime = parseTime(match[2]);
      // const endTime = parseTime(match[3]); 
      const textBlock = match[4].trim();
      const lines = textBlock.split('\n').map(l => l.trim()).filter(l => l);
      result.push({ time: startTime, lines: lines });
    }
    return result;
  }

  function parseTime(timeStr) {
    // 00:00:07,710
    const parts = timeStr.split(':');
    const secParts = parts[2].split(',');
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(secParts[0]) + parseInt(secParts[1]) / 1000;
  }

  async function reloadLyrics() {
    const container = document.getElementById('lyrics-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding: 20px; color:#888;">載入中...</div>';
    lyricsData = [];

    if (!window.tracks || window.currentTrackIndex === undefined) {
      container.innerHTML = '<div style="text-align:center; padding: 20px;">無播放歌曲</div>';
      return;
    }

    const currentTrack = window.tracks[window.currentTrackIndex];
    if (!currentTrack || !currentTrack.lyricsFile) {
      container.innerHTML = '<div style="text-align:center; padding: 20px;">無歌詞檔案</div>';
      return;
    }

    try {
      const response = await fetch(currentTrack.lyricsFile);
      const text = await response.text();
      lyricsData = parseSRT(text);
      renderLyrics();
    } catch (e) {
      console.error('歌詞載入失敗', e);
      container.innerHTML = '<div style="text-align:center; padding: 20px;">歌詞讀取錯誤</div>';
    }
  }

  function renderLyrics() {
    const container = document.getElementById('lyrics-content');
    container.innerHTML = '';

    // 讀取字體設定
    const sizes = getFontSizeConfig();

    // 注入動態樣式
    const styleId = 'lyrics-dynamic-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
        .lyric-line-1 { font-size: ${sizes.line1}px; font-weight: bold; color: #333; }
        .lyric-line-2 { font-size: ${sizes.line2}px; color: #666; }
        .lyric-line-3 { font-size: ${sizes.line3}px; color: #888; }
        .vscode-dark .lyric-line-1 { color: #eee; }
        .vscode-dark .lyric-line-2 { color: #bbb; }
        .vscode-dark .lyric-line-3 { color: #999; }
    `;

    // 建立歌詞 DOM
    lyricsData.forEach((item, index) => {
      const block = document.createElement('div');
      block.className = 'lyric-block';
      block.dataset.index = index;
      block.dataset.time = item.time;

      // 點擊跳轉
      block.addEventListener('click', () => {
        if (window.AppAudioControl) {
          window.AppAudioControl.seekTo(item.time);
        }
      });

      item.lines.forEach((line, i) => {
        const p = document.createElement('p');
        p.textContent = line;
        // 若只有一行，套用 line1；有三行則分別 line1, line2, line3
        // 這裡簡單處理：第1行用 line1, 第2行用 line2...
        // 如果只有一行英文，就是 line1
        let className = 'lyric-line-1';
        if (i === 1) className = 'lyric-line-2';
        if (i === 2) className = 'lyric-line-3';

        p.className = className;
        p.style.margin = '2px 0';
        block.appendChild(p);
      });

      container.appendChild(block);
    });
  }

  function startSyncLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const loop = () => {
      if (!isLyricsOpen()) return;

      if (window.AppAudioControl) {
        const currentTime = window.AppAudioControl.getCurrentTime();
        updateActiveLyric(currentTime);
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  function stopSyncLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  }

  function updateActiveLyric(time) {
    // 找到最後一個時間 <= currentTime 的歌詞
    let activeIndex = -1;
    for (let i = 0; i < lyricsData.length; i++) {
      if (lyricsData[i].time <= time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    // 移除舊高亮
    const prevActive = document.querySelector('.lyric-block.active');
    if (prevActive && prevActive.dataset.index != activeIndex) {
      prevActive.classList.remove('active');
    }

    if (activeIndex !== -1) {
      const blocks = document.querySelectorAll('.lyric-block');
      const target = blocks[activeIndex];
      if (target && !target.classList.contains('active')) {
        target.classList.add('active');
        // 自動滾動
        if (!isUserScrolling) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'lyrics-modal';
    Object.assign(modal.style, {
      position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
      background: 'rgba(250,250,250,0.98)', display: 'none', flexDirection: 'column', zIndex: 10000
    });

    // CSS
    const style = document.createElement('style');
    style.textContent = `
        #lyrics-header {
            height: 15%; min-height: 80px; display: flex; flex-direction: column; 
            justify-content: center; padding: 8px 12px; border-bottom: 1px solid #eee;
        }
        #lyrics-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .font-control { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; }
        .font-control input { width: 40px; }
        
        #lyrics-content {
            height: 85%; overflow-y: auto; padding: 20px 0; box-sizing: border-box;
            text-align: center; scroll-behavior: smooth;
        }
        .lyric-block {
            padding: 10px 20px; cursor: pointer; transition: background 0.2s;
            border-radius: 8px; margin: 0 10px;
        }
        .lyric-block:hover { background: rgba(0,0,0,0.05); }
        .lyric-block.active { 
            background: rgba(0,0,0,0.1); transform: scale(1.02); transition: transform 0.2s; 
        }
        
        /* Dark Mode */
        .vscode-dark #lyrics-modal { background-color: #1e1e1e; color: #d4d4d4; }
        .vscode-dark #lyrics-header { border-bottom: 1px solid #333; }
        .vscode-dark .lyric-block:hover { background: rgba(255,255,255,0.05); }
        .vscode-dark .lyric-block.active { background: rgba(255,255,255,0.1); }
    `;
    modal.appendChild(style);

    // Header
    const header = document.createElement('div');
    header.id = 'lyrics-header';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.marginBottom = '8px';

    const title = document.createElement('div');
    title.innerText = '歌詞 (Lyrics)';
    title.style.fontSize = '1.2rem';
    title.style.fontWeight = 'bold';

    const btnClose = document.createElement('button');
    btnClose.innerText = '關閉 ✖';
    btnClose.style.padding = '4px 8px';
    btnClose.style.cursor = 'pointer';
    btnClose.onclick = closeLyrics;

    topRow.appendChild(title);
    topRow.appendChild(btnClose);

    // Font Controls
    const controls = document.createElement('div');
    controls.id = 'lyrics-controls';

    const sizes = getFontSizeConfig();

    const createInput = (label, key, val) => {
      const wrap = document.createElement('div');
      wrap.className = 'font-control';
      wrap.innerHTML = `<span>${label}:</span>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = val;
      input.min = 8; input.max = 72;
      input.onchange = (e) => {
        const newSizes = getFontSizeConfig();
        newSizes[key] = parseInt(e.target.value);
        saveFontSizeConfig(newSizes);
        renderLyrics(); // Re-render to apply styles
      };
      wrap.appendChild(input);
      return wrap;
    };

    controls.appendChild(createInput('行1(日)', 'line1', sizes.line1));
    controls.appendChild(createInput('行2(羅)', 'line2', sizes.line2));
    controls.appendChild(createInput('行3(中)', 'line3', sizes.line3));

    header.appendChild(topRow);
    header.appendChild(controls);

    // Content
    const content = document.createElement('div');
    content.id = 'lyrics-content';

    // 偵測使用者滾動，暫停自動滾動
    content.addEventListener('scroll', () => {
      isUserScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isUserScrolling = false;
      }, 2000); // 停止滾動 2 秒後恢復自動滾動
    });

    modal.appendChild(header);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  window.LyricsUI = { openLyrics, reloadLyrics, isLyricsOpen };
})();