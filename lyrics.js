

// lyrics.js — 歌詞模組：解析 SRT、三行顯示、字體設定、同步滾動

(function () {
  let modal = null;
  let lyricsData = []; // [{ time: 0, lines: ["日文", "羅馬", "中文"] }, ...]
  let animationFrameId = null;
  let isUserScrolling = false;
  let scrollTimeout = null;

  // 新增：歌詞偏移量 (單位：秒)
  let lyricsOffset = 0;

  function log(...args) { console.log('[Lyrics]', ...args); }

  // 讀取與儲存 Config
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

    // 【修復 Bug】：強制重新載入一次歌詞，確保抓到最新的 window.tracks 資料
    // 這樣即使首次 scanFiles 後直接打開，也能正確顯示
    reloadLyrics();

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
      container.innerHTML = '<div style="text-align:center; padding: 20px;">歌詞讀取錯誤 (可能需重新選擇資料夾)</div>';
    }
  }

  function renderLyrics() {
    const container = document.getElementById('lyrics-content');
    container.innerHTML = '';

    const sizes = getFontSizeConfig();

    // 注入動態樣式
    const styleId = 'lyrics-dynamic-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    // 【樣式修改】：
    // 1. 預設全部為灰色 (color: #888 / #aaa)
    // 2. 播放中 (.active) 時，全部文字變為金色 (#FFD700)
    styleEl.textContent = `
        /* 一般狀態：全灰 */
        .lyric-line-1 { font-size: ${sizes.line1}px; font-weight: bold; color: #888; }
        .lyric-line-2 { font-size: ${sizes.line2}px; color: #888; }
        .lyric-line-3 { font-size: ${sizes.line3}px; color: #888; }
        
        .vscode-dark .lyric-line-1 { color: #aaa; }
        .vscode-dark .lyric-line-2 { color: #aaa; }
        .vscode-dark .lyric-line-3 { color: #aaa; }

        /* 播放中狀態：全金 */
        .lyric-block.active .lyric-line-1,
        .lyric-block.active .lyric-line-2,
        .lyric-block.active .lyric-line-3 {
            color: #FFD700 !important;
            text-shadow: 0 0 8px rgba(255, 215, 0, 0.25);
        }
    `;

    lyricsData.forEach((item, index) => {
      const block = document.createElement('div');
      block.className = 'lyric-block';
      block.dataset.index = index;
      block.dataset.time = item.time;

      block.addEventListener('click', () => {
        if (window.AppAudioControl) {
          window.AppAudioControl.seekTo(item.time);
        }
      });

      item.lines.forEach((line, i) => {
        const p = document.createElement('p');
        p.textContent = line;
        let className = 'lyric-line-1';
        if (i === 1) className = 'lyric-line-2';
        if (i === 2) className = 'lyric-line-3';

        p.className = className;
        p.style.margin = '4px 0'; // 增加行距
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
        // 加上偏移量 (例如: +1s 表示歌詞提早1秒對應，或延遲顯示，需視需求定義)
        // 這裡定義: offset > 0，代表將「當前播放時間」視為更晚的時間，所以歌詞會跑到更後面 -> 視覺上歌詞會「提早」出現
        // 或者：我們希望調整的是「顯示位置」。如果歌詞太快(出現太早)，我們希望 offset 是負的，讓比對的時間變小。
        // 通常 UI 上的 +- 調整的是歌詞的時間戳記。
        // 為了直觀：如果歌詞太快，我們想要 delay 它。Delay 意味著：CurrentTime 10s 時，我們應該顯示 9s 的歌詞。
        // 所以 AdjustedTime = CurrentTime - Delay.
        // 如果 UI 上顯示 +0.5s 代表「延遲0.5秒」，則 formula: Time - 0.5
        // 這裡我們直接使用 Time + Offset，讓使用者自己拉動感受即可。
        updateActiveLyric(currentTime + lyricsOffset);
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  function stopSyncLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  }

  function updateActiveLyric(time) {
    let activeIndex = -1;
    for (let i = 0; i < lyricsData.length; i++) {
      if (lyricsData[i].time <= time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    const prevActive = document.querySelector('.lyric-block.active');
    if (prevActive && prevActive.dataset.index != activeIndex) {
      prevActive.classList.remove('active');
    }

    if (activeIndex !== -1) {
      const blocks = document.querySelectorAll('.lyric-block');
      const target = blocks[activeIndex];
      if (target && !target.classList.contains('active')) {
        target.classList.add('active');
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

    const style = document.createElement('style');
    style.textContent = `
        #lyrics-header {
            height: 15%; min-height: 80px; display: flex; flex-direction: column; 
            justify-content: center; padding: 8px 12px; border-bottom: 1px solid #eee;
        }
        #lyrics-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .font-control { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; }
        .font-control input { width: 40px; }
        .offset-control { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-left: 12px; }
        
        #lyrics-content {
            height: 85%; overflow-y: auto; padding: 40px 0; box-sizing: border-box;
            text-align: center; scroll-behavior: smooth;
        }
        .lyric-block {
            padding: 12px 20px; cursor: pointer; transition: all 0.2s;
            border-radius: 12px; margin: 4px 16px;
        }
        .lyric-block:hover { background: rgba(0,0,0,0.05); }
        
        /* 播放中樣式 */
        .lyric-block.active { 
            background: rgba(0, 0, 0, 0.88); 
            transform: scale(1.02); 
        }
        
        /* Dark Mode */
        .vscode-dark #lyrics-modal { background-color: #1e1e1e; color: #d4d4d4; }
        .vscode-dark #lyrics-header { border-bottom: 1px solid #333; }
        .vscode-dark .lyric-block:hover { background: rgba(255,255,255,0.05); }
        .vscode-dark .lyric-block.active { background: rgba(255, 215, 0, 0.08); }
    `;
    modal.appendChild(style);

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
        renderLyrics();
      };
      wrap.appendChild(input);
      return wrap;
    };

    controls.appendChild(createInput('行1(日)', 'line1', sizes.line1));
    controls.appendChild(createInput('行2(羅)', 'line2', sizes.line2));
    controls.appendChild(createInput('行3(中)', 'line3', sizes.line3));

    // 新增 Offset Slider
    const offsetWrap = document.createElement('div');
    offsetWrap.className = 'offset-control';
    offsetWrap.innerHTML = `<span>Offset: <span id="offset-val">0.0</span>s</span>`;
    const offsetSlider = document.createElement('input');
    offsetSlider.type = 'range';
    offsetSlider.min = -3.0;
    offsetSlider.max = 3.0;
    offsetSlider.step = 0.1;
    offsetSlider.value = 0;
    offsetSlider.style.width = '100px';
    offsetSlider.oninput = (e) => {
      lyricsOffset = parseFloat(e.target.value);
      const display = document.getElementById('offset-val');
      if (display) display.innerText = lyricsOffset.toFixed(1);
    };
    offsetWrap.appendChild(offsetSlider);
    controls.appendChild(offsetWrap);

    header.appendChild(topRow);
    header.appendChild(controls);

    const content = document.createElement('div');
    content.id = 'lyrics-content';

    content.addEventListener('scroll', () => {
      isUserScrolling = true;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isUserScrolling = false;
      }, 2000);
    });

    modal.appendChild(header);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  window.LyricsUI = { openLyrics, reloadLyrics, isLyricsOpen };
})();
