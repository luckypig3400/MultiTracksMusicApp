

// lyrics.js — 歌詞模組：解析 SRT、三行顯示、字體設定、同步滾動

(function () {
  let modal = null;
  let lyricsData = []; // [{ time: 0, lines: ["日文", "羅馬", "中文"] }, ...]
  let animationFrameId = null;
  let isUserScrolling = false;
  let scrollTimeout = null;

  // 新增：歌詞偏移量 (單位：秒)
  let lyricsTimeOffset = 0;
  // 新增：顯示位置偏移 (單位：行，視覺位置)
  let displayOffset = 0;

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
    const theme = safeStorage.getItem('appTheme') || 'light';
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
    // 統一換行符號，將 Windows 的 \r\n 轉換為 \n，避免正則表達式匹配失敗
    srtContent = srtContent.replace(/\r\n/g, '\n');
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

    // 初始化 Time Offset (從設定讀取)
    lyricsTimeOffset = currentTrack.lyricsTimeOffset || 0;
    const timeInput = document.getElementById('time-offset-input');
    if (timeInput) timeInput.value = lyricsTimeOffset;

    // 初始化 Display Offset (從全域設定讀取)
    if (window.AppAudioControl && window.AppAudioControl.getLyricsDisplayOffset) {
      displayOffset = window.AppAudioControl.getLyricsDisplayOffset();
    }
    const displaySlider = document.getElementById('display-offset-slider');
    if (displaySlider) {
      displaySlider.value = displayOffset;
      document.getElementById('display-offset-val').innerText = (displayOffset > 0 ? '+' : '') + displayOffset;
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

    // 新增 7 行空白行，幫助最後幾行歌詞能滾動到正確的顯示位置
    for (let i = 0; i < 7; i++) {
      const blankBlock = document.createElement('div');
      blankBlock.className = 'lyric-block blank-block';
      blankBlock.style.height = '60px'; // 設定適當高度
      blankBlock.style.cursor = 'default';
      // 移除 hover 效果與點擊事件
      blankBlock.onmouseenter = () => blankBlock.style.background = 'transparent';
      container.appendChild(blankBlock);
    }
  }

  function startSyncLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const loop = () => {
      if (!isLyricsOpen()) return;

      if (window.AppAudioControl) {
        const currentTime = window.AppAudioControl.getCurrentTime();
        // Time Offset: 調整比對時間。
        // 如果使用者輸入 +1s (延遲顯示)，代表 當前時間 10s 時，應該顯示 9s 的歌詞。
        // 也就是 邏輯時間 = 實際時間 - Offset。
        // 但通常使用者直覺是：歌詞太慢了(字幕比聲音慢)，我要他快一點(-1s)；歌詞太快了(字幕比聲音快)，我要他慢一點(+1s)。
        // 這裡實作邏輯： MatchTime = CurrentTime + offset. 
        // 假設 Offset = -1. MatchTime = 9s. 程式會去找 9s 的歌詞。
        // 所以如果現在是 10s, 顯示的是 9s 的歌詞 -> 字幕變慢了 (Delay).
        // 如果 Offset = +1. MatchTime = 11s. 顯示 11s 的歌詞 -> 字幕變快了 (Advance).
        // 為了符合一般「調整同步秒數」直覺 (通常 + 是延遲, - 是提前)，我們這裡定義：
        // 實際比對時間 = currentTime - lyricsTimeOffset
        updateActiveLyric(currentTime - lyricsTimeOffset);
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

      // 高亮當前行
      if (target && !target.classList.contains('active')) {
        target.classList.add('active');
      }

      // 捲動邏輯 (包含 Display Offset)
      // 如果 Display Offset 是 +1，我們希望當前行看起來在「上一段」(較上方)
      // 這意味著我們需要捲動到比較「下面」的元素，讓當前行被推上去。
      // 所以 Target Scroll Element = ActiveIndex + DisplayOffset

      const scrollIndex = activeIndex + parseInt(displayOffset);
      const scrollTarget = blocks[scrollIndex]; // 可能 undefined

      if (scrollTarget) {
        if (!isUserScrolling) {
          scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        // 邊界處理：如果 scrollTarget 超出範圍，就只捲動到 active
        if (target && !isUserScrolling) {
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
            min-height: 80px; display: flex; flex-direction: column; 
            justify-content: center; padding: 8px 12px; border-bottom: 1px solid #eee;
            gap: 8px;
        }
        #lyrics-controls { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        
        .control-row {
            display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        
        .font-control { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; }
        .font-control input { width: 40px; }
        
        .offset-control { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
        
        #lyrics-content {
            flex: 1; overflow-y: auto; padding: 40px 0; box-sizing: border-box;
            text-align: center; scroll-behavior: smooth;
        }
        .lyric-block {
            padding: 12px 20px; cursor: pointer; transition: all 0.2s;
            border-radius: 12px; margin: 4px 16px;
        }
        .lyric-block:not(.blank-block):hover { background: rgba(0,0,0,0.05); }
        
        /* 播放中樣式 */
        .lyric-block.active { 
            background: rgba(0, 0, 0, 0.88); 
            transform: scale(1.02); 
        }
        
        /* Dark Mode */
        .vscode-dark #lyrics-modal { background-color: #1e1e1e; color: #d4d4d4; }
        .vscode-dark #lyrics-header { border-bottom: 1px solid #333; }
        .vscode-dark .lyric-block:not(.blank-block):hover { background: rgba(255,255,255,0.05); }
        .vscode-dark .lyric-block.active { background: rgba(255, 215, 0, 0.08); }
    `;
    modal.appendChild(style);

    const header = document.createElement('div');
    header.id = 'lyrics-header';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';

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

    // Row 1: Font Size
    const row1 = document.createElement('div');
    row1.className = 'control-row';
    row1.appendChild(createInput('行1(日)', 'line1', sizes.line1));
    row1.appendChild(createInput('行2(羅)', 'line2', sizes.line2));
    row1.appendChild(createInput('行3(中)', 'line3', sizes.line3));

    // Row 2: Visual Offset Slider
    const row2 = document.createElement('div');
    row2.className = 'control-row';
    const displayOffsetWrap = document.createElement('div');
    displayOffsetWrap.className = 'offset-control';
    displayOffsetWrap.innerHTML = `<span>播放中歌詞顯示位置調整: <b id="display-offset-val">0</b></span>`;

    const displaySlider = document.createElement('input');
    displaySlider.id = 'display-offset-slider';
    displaySlider.type = 'range';
    displaySlider.min = -3;
    displaySlider.max = 3;
    displaySlider.step = 1;
    displaySlider.value = 0;
    displaySlider.style.width = '120px';
    displaySlider.oninput = (e) => {
      displayOffset = parseInt(e.target.value);
      const valStr = (displayOffset > 0 ? '+' : '') + displayOffset;
      document.getElementById('display-offset-val').innerText = valStr;
      // 儲存全域設定
      if (window.AppAudioControl && window.AppAudioControl.saveLyricsDisplayOffset) {
        window.AppAudioControl.saveLyricsDisplayOffset(displayOffset);
      }
    };
    displayOffsetWrap.appendChild(displaySlider);
    row2.appendChild(displayOffsetWrap);

    // Row 3: Time Sync Input
    const row3 = document.createElement('div');
    row3.className = 'control-row';
    const timeOffsetWrap = document.createElement('div');
    timeOffsetWrap.className = 'offset-control';
    timeOffsetWrap.innerHTML = `<span>歌詞同步秒數調整(s):</span>`;

    const timeInput = document.createElement('input');
    timeInput.id = 'time-offset-input';
    timeInput.type = 'number';
    timeInput.step = 0.1;
    timeInput.style.width = '60px';
    timeInput.value = 0;
    timeInput.onchange = (e) => {
      lyricsTimeOffset = parseFloat(e.target.value) || 0;
      // 儲存單曲設定
      if (window.AppAudioControl && window.AppAudioControl.saveTrackLyricsOffset && window.tracks) {
        const track = window.tracks[window.currentTrackIndex];
        if (track) {
          window.AppAudioControl.saveTrackLyricsOffset(track.baseName, lyricsTimeOffset);
        }
      }
    };
    timeOffsetWrap.appendChild(timeInput);
    row3.appendChild(timeOffsetWrap);

    controls.appendChild(row1);
    controls.appendChild(row2);
    controls.appendChild(row3);

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