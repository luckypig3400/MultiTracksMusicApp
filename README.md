# MultiTracksMusicApp
可以同時播放多個音軌的播放器，UVR5、StemRoller音訊分離處理的相同檔名，不同樂器的音軌

## Prompts
### 請ChatGPT寫播放清單的功能
請仔細看目前的畫布app.js
以及下方我提供的index.html
我希望當點一下播放清單按鈕時，會跳出滿版的彈出播放清單視窗(避免音樂播放中斷)
這個播放清單視窗中最上方10%從左到右分別有
依檔名排序的按鈕(點一下切換正/倒序)、隨機按鈕(點一下打亂一次目前播放清單)，以及打叉按鈕(儲存播放清單排序並回到播放器首頁)
然後其餘的90%，則會塞滿目前播放清單歌曲(每個高度都占用10%，像清單一樣可上下滾動)左邊85%寬度顯示歌名，如果字數太多會自動顯示到第二行，點選歌名的85%區塊會跳轉到該首歌播放，右邊15%則可以像是YTMusic手機版一樣拖曳來自定義排序，可拖曳空間用這樣顯示"↑↓"，拖曳後要及時保存順序
我認為要分開成playlist.js寫，如果上述的HTML元件不會太複雜(100行內)就直接使用js生成
然後因為是彈出視窗，我想index.html內的css應該會自動套用吧?
你不用幫我更新app.js，只要完整將playlist.js建立成畫布(如果app.js有可以重複用的function，也請嘗試直接呼叫使用)
並且另外告訴我app.js與index.html要新增那些程式碼來套用playlist.js的功能
(要詳細告訴我加在哪裡，例如app.js在function generateTrackListFromConfig() {前面一行完整加入妳寫的程式碼，或是index.html在<script src="setting.js"></script>下面一行完整加入妳寫的程式碼)
請仔細思考，把目前的畫布app.js與我貼的index.html看完再開始撰寫程式碼

完整輸出更新後的playlist.js，仔細思考多次後再開始寫playlist.js程式碼

### 從這邊開始切換成Gemini 3 Pro預覽版，要求修復歌曲清單排序後未被套用的問題
#### 1st-failed
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
你好，這是我目前的多音軌播放器App，請先詳細閱覽每一份程式碼，以及我提供的一個簡化版的config
(這個config是保存我目前載入的歌曲，和一小部分設定) 目前有個蠻嚴重的bug。
就是在playlist.js我的播放清單重新排序後，實際上好像並沒有把排序后的歌曲順序保存起來，
我是藉由回到播放器主界面，然後點選下一首歌發現播放的順序還是原本排序前的播放順序
請你仔細查閱每一份程式碼之後，然後幫我修復這個功能，你只要輸出有修改的程式碼，但是要整份完整輸出
例如你認為只需要修改playlist.js那么你就只需要把整份playlist.js完整輸出即可

#### 2nd-failed
你目前的版本遇到了大問題(我推測問題是出在app.js)
我目前的版本是每次網頁重新整理后都需要要求使用者再次選擇資料夾，
因為之前嘗試用indexedDB的時候一直出現bug，所以那時候使用這種方式，
讓每次重整網頁並選取資料夾后，都可以重新更新blob url，
而你這個版本不會跳出提示要求再次重新選擇資料夾，我下面貼目前錯誤的log給你
仔細思考后再幫我從你剛才的版本開始仔細修復功能，對了播放清單移動排序的功能我還沒測，
你這次修改先不要改成indexedDB的方式，因為我還要等整個功能完善才考慮要不要改寫
```log
為節省空間，已移除
```

#### 3rd-failed
無法載入資料夾的問題修復好了，但目前遇到的問題還是一樣播放清單排序改變后，
主界面按下下一首還是播放出舊的排序的歌曲，而且當我拖曳排序播放清單內的歌曲順序後，
他竟然會自動播放目前就清單的第一首歌曲，而且還是疊加在目前正在播放的歌曲上，
而且當我手動按下下一首的時候疊加的那首歌居然還會繼續播放，停不掉耶要直到把網頁重整后才會停止
```log
為節省空間，已移除
```

#### 4th ok!!! 排序沒有反映在切換上下一首歌的問題已修復，目前只剩下重新載入網頁后順序又變回原本的順序
謝謝! 你目前修好了更改排序會疊加播放第一首歌曲的問題
但最核心的問題，也就是更改播放清單排序后，回到主界面切換下一首歌或上一首歌時，
依舊不會按照我剛才排序好的清單順序來播放，他仍舊是使用排序前的就順序來播放，
請再次仔細思考仔細查看playlist.ja與app.js，我目前使用的都是你剛才輸出的版本，
我想相信你這次可以完美修復的，但為了避免這個bug還是存在，請你這次也一定優化與這個功能相關的log輸出
```
為節省空間，已移除
``` 

### 請Gemini 3 Pro預覽版修復重新載入網頁后順序又變回原本的順序的異常(檔案載入的預設順序)，與A-Z排序解析成數字再排序
#### 1st OK!!!
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
謝謝!你已修復拖曳排序清單保存後，切換上/下一首歌仍使用排序前順序的異常
目前只剩下重新載入網頁后順序又變回原本的順序的異常(就是資料夾內檔案載入的預設順序)
我有在手機和電腦上都分別測試，這2個裝置上我所放的音樂檔案都不太一樣，
但是他們重新排序后並且重新載入網頁後，都會遇到排序順序變為原本的順序，就是資料夾內檔案載入的預設順序
請再次瀏覽我這次上船的所有程式碼，然後仔細修復這個問題
對了，也請你一併將A-Z排序功能按鈕的排序，改為會先做以下的處理再排序
舉個例子像是以下這些config中的filename
10_010.迷路日々_
13_013.栞_
23_023.天球 (そら) のMúsica_
9_009.詩超絆_
1_Lost Stars_
1_13.只因爲你_
1_不是因為天氣晴朗才愛你_
我希望先把他們都先移除從檔名開頭數來第一個_前面的所有字元包含這個_也要移除
處理完後應該會變成這個樣子
010.迷路日々_
013.栞_
023.天球 (そら) のMúsica_
009.詩超絆_
Lost Stars_
13.只因爲你_
不是因為天氣晴朗才愛你_
然後我希望把經過這樣子處理的檔案名稱再拿去做2次處理也就是解析出數字
做法是從檔名開頭一直到遇到.，都拿來當作數字的區塊然後會把他解析成數字之後再排序，
如果沒有.的話就不把它拿來解析成數字給他編號999，後續再依照字母排序來排，
你可能要幫我注意處理后的編號，與原始檔名之間的關聯，這樣應該才有辦法拿來做排序
9->9_009.詩超絆_
10->10_010.迷路日々_
13->13_013.栞_
13->1_13.只因爲你_

### 請Gemini 3 Pro預覽版將setting.js與setting.html合併，讓開啟設定頁面時音樂會繼續播放，並加入Ctrl+F5按鈕
#### 1st OK!!!
真的非常謝謝! 你一次就修好了並更新好排序功能了
我現在還有一個需求是請你把setting.js與setting.html合併，讓開啟設定頁面時音樂會繼續播放
設定的介面的HTML元素保持使用目前的setting.html內容，然後產生這個設定頁面的方式
比照playlist.js產生播放清單的方式，這樣應該就能做到開啟設定頁面時音樂可以繼續播放了吧
然後設定頁面請多加入一個按鈕叫做Ctrl+F5，他會讓瀏覽器清除自身這個頁面的快取檔案
(也就是清除app.js、playlist.js等此網頁所有的程式碼檔案，讓瀏覽器可以從伺服器請求新檔案，
會有這樣的要求是因為我發現Android上的Chrome容易載入舊版檔案來使用，而我又無法在手機上按下Ctrl+F5)
一樣有修改的程式碼都幫我完整的整份輸出謝謝

### 請Gemini 3 Pro預覽版修正playlist.js未套用css，以及在手機上無法拖曳排序方塊
#### 1st OK! Good
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
太感謝你了! 你一次就合併好設定頁面與新增重新載入按鈕的功能
你真的非常地仔細，目前我有發現在播放清單(playlist.js)的按鈕未套用CSS，，以及在手機上無法拖曳排序方塊的問題
再麻煩你仔細瀏覽我最新上傳的程式碼並仔細思考然後幫我修改程式碼，一樣有修改的程式碼都幫我完整的整份輸出謝謝

### 請Gemini 3 Pro預覽版把index.html的清單與設定移到下一列，並在中間加入歌詞按鈕
#### 1st OK!!! 太神啦!
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
你好請幫我把index首頁的控制區域中的清單與設定按鈕移到下一列，並且在中間幫我加入歌詞按鈕
然後歌詞按鈕我剛剛找過沒有適合的圖示，所以按鈕名稱請直接寫"歌詞(Lyrics)"
所以下一列調整后的按鈕順序應該是最左邊是清單中間是歌詞最右邊是設定
然後歌詞播放的按鈕點下去的功能請幫我寫在lyrics.js，請一樣模仿播放清單和設定的方式
網頁的內容是由JS產出的，這樣切換到歌詞頁面時音樂才會繼續正常播放
我的SRT動態歌詞有三行，分別是日文，羅馬拼音，中文翻譯
歌詞播放界面的上方，請設計可以分別調整這三行文字大小的按鈕或是拉桿(附帶輸入框)，然後請將設定的字體大小也保存在config裡面
對了部分歌詞內容因為是純英文或是音樂符號，所以只有一行
就直接把他套用設定的第一行字的大小，對了我是希望這個歌詞瀏覽介面
除了會動態顯示歌詞之外，也會像yt music一樣可以上下滑動瀏覽全部完整的歌詞，並且點選特定的歌詞，會跳轉到那個時間播放(這個點擊區塊是三行歌詞包在一起一個div區塊)
然後歌曲對應的歌詞載入的方式是，把config里的filename，去除從頭開始到第一個_的內容，然後在處理過的檔名內，嘗試移除從頭數來第一個.之前的內容，
然後得去跟已載入的SRT字幕檔案，比較檔案名稱，如果字元符合度達70%以上
就認定該字幕是對應這首歌的(不論是字幕還是歌曲處理時都不要有副檔名)
例如以下逐步處理流程:
1_001.迷星叫_ -> 001.迷星叫_ -> 迷星叫_
比對字幕清單(不包含副檔名的部分)
栞.srt,迷星叫.srt,無路矢.srt,......
找到迷星叫.srt符合本首歌的歌名達到70%，拿它來做這首歌的歌詞
1_Lost Stars_ -> Lost Stars_ -> Lost Stars_
找到Lost Star.srt符合本首歌的歌名達到70%，拿它來做這首歌的歌詞

迷星叫.srt 部分內容擷取
```
1
00:00:07,710 --> 00:00:10,190
La-la-la-la

2
00:00:10,190 --> 00:00:16,380
🎵

3
00:00:16,380 --> 00:00:18,910
交差点の真ん中
Kousaten no mannaka
在十字路口的正中央

4
00:00:18,910 --> 00:00:21,520
急ぐ人に紛れて
Isogu hito ni magirete
混在人群的匆忙腳步裡

5
00:00:21,520 --> 00:00:26,540
僕だけがあてもなく 漂うみたいだ
Boku dake ga ate mo naku tadayou mitai da
只有我像是沒有方向地漂浮著

6
00:00:26,540 --> 00:00:29,040
流行りの歌はいつも
Hayari no uta wa itsumo
流行的歌總是

7
00:00:29,040 --> 00:00:31,410
僕のことは歌ってない
Boku no koto wa utattenai
沒有唱到我的心情
```

載入的歌曲與srt清單
```cmd
Microsoft Windows [版本 10.0.26100.6899]
(c) Microsoft Corporation. 著作權所有，並保留一切權利。
提供dir檔案清單
```

### 請Gemini 3 Pro預覽版修復需要到歌詞介面修改任意字體大小，重新載入後才會找到歌詞的bug，並把播放中歌詞顏色更改成醒目顏色
#### 1st Nice!
你好我有發現一個很神奇的bug，請幫我修復之前尚未載入過歌詞時，也就是當local storage裡面的config對應的歌曲沒有"lyricsFile"時，
他并不會正確地找到歌詞，而是要我手動到歌詞介面修改任意字體大小，重新載入後才會找到歌詞，請幫我修復這個bug，
並把播放中歌詞顏色更改成醒目顏色，比較希望是金色這樣應該深色主題和淺色主題都可以方便閱覽的顏色，
另外目前的日文歌詞好像不會變成灰色的，請也跟其他兩行歌詞一樣改成灰色，只有播放中的歌詞會一起變成金色

### 請Gemini 3 Pro預覽版到設定頁頁加入載入專案內音樂範本與可從config內刪除範本資料
#### 1st Oops Bug
你好我的專案內有這些範本的音樂檔案，也包含歌詞的檔案
我希望你幫我修改程式碼，在選擇資料夾的提示框內多一行字說明，
【如果沒有UVR5音訊檔案的話，可以到設定頁面載入範例音訊檔案，以及歌詞檔案】
請修改設定頁頁(setting.js)加入"載入音樂範本"與可從config內"刪除範本資料"的按鈕
點擊載入音樂範本后，會跳出提示視窗列出所有載入的檔案名稱(不要顯示路徑，只要檔名就好)
(這個程式碼專案結構如下，會直接透過nginx部署在網站上)

```cmd
dir提供檔案清單
```

#### 2nd OK!只是測試音樂檔案載入後如果以前有載入過資料夾，就不會自動播放而需要手動下一首首切換，因為不會顯示在播放清單中
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
哇出現bug了! 而且蠻嚴重的，目前遇到的問題是，載入範例檔案后，無法播放OAO
我目前測試的網址是http://127.0.0.1:5501/
然後非常嚴重的問題是，載入範例檔案後舊的設定檔居然會全部被清除!
只能增加(append)或刪除載入的範例檔案的設定而已，拜託不要刪除現有的config內容
這邊再次提供目前所有的程式碼檔案給你，目前的版本都是你剛才修改過的
這次請仔細思考之后再開始寫程式謝謝

### 請Gemini 3 Pro預覽版修復測試音樂不會顯示在播放清單中的bug與新增資料夾切換按鈕
#### 1st 出現很酷的bug!!! 上次載入測試音樂，重整網頁後這次手動選擇並載入的資料夾無法播放了(因仍停在上次的Active Folder: Sample Music)
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
你剛才修改的那版程式碼，已經修復好設定被清除的問題，測試音樂檔案也可以被正確載入播放了!
不過我又發現一個很細緻的bug，就是當我沒有選擇要載入的資料夾，直接把選擇資料夾的提示框關閉，
然後直接到設定按下載入範本音樂檔案按鈕的時候，我發現回到播放清單頁面會發現裡面的歌曲，
都是我之前選擇資料夾時留下的歌曲順序的設定，反而載入的範本資料並沒有顯示在播放清單中，(不過一直切換下一首歌還是可以找到載入的範例音樂，並且正常播放)
但是當我到無痕模式嘗試時，範本音樂會正確的被載入並直接播放，我很仔細的查詢問題，目前推測是config內的path設定造成的
(我最下面有貼一小部分目前config的內容你再留意path的資料值)
我有想到一個解決方法，就是在播放清單介面裡面，在隨機按鈕的旁邊新增一個按鈕裡面用這2個圖示組合在一起的按鈕
<i class="fa-solid fa-left-right"></i><i class="fa-solid fa-folder-open"></i>
代表切換資料夾的意思，並且目前的Save & Close按鈕名稱直接改成下方圖示(因為排序播放清單都會自動保存順序)
<i class="fa-solid fa-arrow-right-from-bracket"></i>
然後這些按鈕的下方與清單之間請加上一個與按鈕區塊同高的區塊顯示H3標題，顯示目前清單的資料夾(path就好)名稱(所以playlist的清單高度要自動的變小)
當按下切換資料夾這個按鈕後，會彈出一個長寬各占螢幕長寬80%的彈出視窗，裡面有曾經載入過的資料夾(path)可以選擇(也要可以捲動，怕之後載入超多不同資料夾)
無需有離開的按鈕，點選任一個資料夾(包含當前選中的)，就會自行切換到那個資料夾的清單內容("path": "Sample Music"也當作是一個資料夾)
為了防呆如果目前的設定檔內一個資料夾都沒有的話，就會讓這個切換資料夾的按鈕打不開，然後跳出"你從未選擇過任何資料夾，或是載入範本音樂"的訊息
我再次把程式碼都附上來給你，請你仔細思考後再開始寫程式，希望這次當我沒有選擇資料夾，
而有去設定頁面按按鈕載入，或是之前有載入過範本音樂還沒刪除，會將我提供的測試檔案被載入直接播放
以防萬一，請你在載入測試檔案的部分以及嘗試播放測試檔案的過程都加上許多詳細的log

"folders": [
{
"path": "Ultimate Vocal Remover",
      "tracks": [
        {
          "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_",
          "audioTracks": [
            {
              "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Vocals).mp3",
              "relPath": "Ultimate Vocal Remover/1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Vocals).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/39376577-fb0b-4c7f-868e-862d9a7ca221",
              "volume": 77,
              "mute": false,
              "suffix": "Vocals"
            },
            {
              "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Instrumental).mp3",
              "relPath": "Ultimate Vocal Remover/1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Instrumental).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/a4a44089-96d2-4124-9f70-24f67ba67e27",
              "volume": 39,
              "mute": false,
              "suffix": "Instrumental"
            }
          ]
        },
        {
          "filename": "1_001.迷星叫_",
          "audioTracks": [
            {
              "filename": "1_001.迷星叫_(Bass).mp3",
              "relPath": "Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Bass).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/2aff0194-79e9-43ae-9a24-286b67b8ae59",
              "volume": 58,
              "mute": false,
              "suffix": "Bass"
            },
            {
              "filename": "1_001.迷星叫_(Drums).mp3",
              "relPath": "Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Drums).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/f99d9bcc-01ff-4ec8-b46c-b6766da88f2f",
              "volume": 50,
              "mute": false,
              "suffix": "Drums"
            },
            {
              "filename": "1_001.迷星叫_(Other).mp3",
              "relPath": "Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Other).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/3e4647d1-b3e3-4492-aff9-254dfbf21c8a",
              "volume": 31,
              "mute": false,
              "suffix": "Other"
            },
            {
              "filename": "1_001.迷星叫_(Vocals).mp3",
              "relPath": "Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Vocals).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/710c7da8-0e10-4065-a489-8e9fc78ab5e9",
              "volume": 88,
              "mute": false,
              "suffix": "Vocals"
            }
          ]
        },
            {
      "path": "Sample Music",
      "tracks": [
        {
          "filename": "1_999.迷星叫_",
          "audioTracks": [
            {
              "filename": "1_999.迷星叫_(Drums).mp3",
              "relPath": "Sample Music/1_999.迷星叫_(Drums).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/a16b15ab-39ae-4552-a721-14290eba5efd",
              "volume": 85,
              "mute": false,
              "suffix": "Drums"
            },
            {
              "filename": "1_999.迷星叫_(Bass).mp3",
              "relPath": "Sample Music/1_999.迷星叫_(Bass).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/7155bb0b-b956-45e9-b453-2109d5bca3d6",
              "volume": 85,
              "mute": false,
              "suffix": "Bass"
            },
            {
              "filename": "1_999.迷星叫_(Other).mp3",
              "relPath": "Sample Music/1_999.迷星叫_(Other).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/d9ab642d-db77-45f5-a2f8-33450dc779f2",
              "volume": 85,
              "mute": false,
              "suffix": "Other"
            },
            {
              "filename": "1_999.迷星叫_(Vocals).mp3",
              "relPath": "Sample Music/1_999.迷星叫_(Vocals).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/f94f8a81-087e-4fb2-b658-27780bad9391",
              "volume": 85,
              "mute": false,
              "suffix": "Vocals"
            }
          ],
          "lyricsFile": "blob:http://127.0.0.1:5501/db28ff42-169f-45f8-bf9a-c4eb9aa4db7b"
        },
...

#### 2nd Nice!可正常切換資料夾了
出現很酷的bug!!! 上次載入測試音樂，重整網頁後這次手動選擇並載入的資料夾無法播放了
(因為仍停留在上次的Active Folder: Sample Music) 請修復! 
讓他可以自動切換選擇的資料夾或/範本資料到播放清單裡面，並維持載入後可以自動播放的功能，謝謝
app.js:83 initializeApp start
app.js:110 初始化：等待使用者重新選擇資料夾以更新 Blob URL
app.js:112 initializeApp done
g9nhm28jb13afdh.js:2 [Violation] Permissions policy violation: unload is not allowed in this document.
(anonymous) @ g9nhm28jb13afdh.js:2
(anonymous) @ g9nhm28jb13afdh.js:2
(anonymous) @ g9nhm28jb13afdh.js:2
favicon.ico:1  GET http://127.0.0.1:5501/favicon.ico 404 (Not Found)
app.js:212 handleFolderSelect files: 194
app.js:336 掃描完成，Active Folder: Sample Music
app.js:371 播放清單已更新 [Sample Music]，共 0 首

### 請Gemini 3 Pro預覽版修復通知列播放中音樂功能按鈕
#### 1st Good job!
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
你好我目前遇到一個很特殊的bug，甚至能不能稱作是bug我也不確定，
問題就是目前的音樂播放中，然後我在手機上的Chrome瀏覽器或是其他瀏覽器播放時，
在手機通知列出現的媒體控制選項就只有播放跟暫停的按鈕可以做使用，
然而我非常希望能做到像YTmusic一樣，在手機通知列出現的媒體控制選項有:
上一首、播放/暫停、下一首，以及在這些按鈕之上會出現播放進度條，而且可以拖曳來調整播放進度
我還希望再多加入一個重複播放的切換按鈕如果做得到的話，
請仔細思考後再幫我修改程式碼，一樣幫我完成輸出修改後的程式碼謝謝

### 請Gemini 3 Pro預覽版修復音訊容易不同步，且點下音軌Label快速mute幾乎一定會影響同步導致延遲
#### 1st Oops!
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
你好我目前遇到bug了，就是當我載入/切換音樂的時候，那一瞬間可能各音軌會稍微不同步，不過其實這個部分還好可以接受
，重點是只要播放中一發生有音軌偏移的情況，那麼很容易就會一直隔幾秒就需要再重新同步一次，導致音樂一直斷斷續續的，
上面說的這個狀況尤其是在手機上的裝置特別容易發生，我使用的手機是Samsung Galaxy S23 ultra，應該已經算是效能不錯的手機了
然後非常嚴重的一個bug是點下音軌Label快速mute幾乎一定會影響同步導致延遲，連我高性能的電腦都會這樣，
我推測這個應該是程式有bug吧，然後需要將所有音軌同步調整的閥值請設定為20ms，就是只要有任一個音軌與Vocals音軌相差超過20ms就要全部一起修正
請你仔細觀察我傳給你的所有程式碼，然後仔細思考後再幫我做出修正，完整輸出你有修改的所有程式碼，謝謝
對了請幫我在設定介面中加入一顆switch開關，可以控制是否顯示除錯訊息，除錯訊息的內容就是會在播放進度拉桿的下方
多出一些文字，列出Vocals音軌當前的秒數mi:ss .ms，然後其他所有音軌的標籤顯示+XXms -XXms (+代表比Vocals快，-則反之)範例如下: 
<b>Vocals:</b>1:31 .777 ,<b>Other:</b> +12ms ,<b>Bass:</b> -8ms ,<b>Drums:</b> 0ms ,<b>Instrumental:</b> +31ms

#### 2nd
喔不! 切換mute/unmute時抖動變得更嚴重了!!! 我覺得還是應該要連Vocals這個主音軌一起修整這樣才有辦法一起同步，不然其他3個Slaves音軌調完後又發現與Vocals偏移相差超過20毫秒然後因此馬上需要再次修正，就會一直導致我說的音樂斷斷續續的問題，如果你真的認為這種主從式設計比較好，那請你修正後馬上記錄各個音軌偏移了多少，
這樣或許可以把修正後馬上偏移的毫秒數，馬上增加到下次修正的值(也就是假設bass第一次偏移，進行修正后馬上再去讀取他這次偏移多少，然後下次同步成Vocals的時間，
就先去加上這個直在進行調整，例如:第一次Bass drifted -80ms，與Vocals同步後0.5秒後馬上去讀取他這次又偏移了多少假設記錄到Bass drifted -220ms，哪那下次同步，就把vocals當前的時間加上這個220ms再同步給bass，如果是假設Bass drifted 168ms.就把vocals當前的時間-這個168ms再同步給bass，各各音軌要分開記錄這個值，
然後這次改完后也是隔0.5秒後馬上去讀取他這次又偏移了多少假設記錄到Bass drifted -12ms，因為已經符合20ms的差異之內，所以記得把這個額外修正的偏移值歸零)
對了我希望debug info，在輸出格式要跟顯示在頁面上的一樣，這樣寫在同一行會比較好閱讀，然後針對這個debug info，應該在前面加上時間戳記
`貼上console訊息`

#### 3rd Good!
首先我說的在debug info前面加上時間戳記，不是加在播放介面上，請移除它，我希望是加在你輸出在console log當中，
而且將播放界面中debug info的那些數值都一併寫在console log里，這樣我比較好複製給你進一步除錯
另外既然我們已經有加上了偏移補償的機制，那麼你就可以不用把Vocals音軌一起調整，這樣聽起來才比較不會有頓挫

#### 4th Advance
你這一次改版還蠻不錯的，只是我自己有發現一個小bug，那就是如果去把vocals切換mute/unmute的話
其他3個音軌會一起跟著偏移，所以我們改成只有切換vocals mute/unmute時，會將所有音軌一起同步對齊為Vocal當下時間
切換其他音軌 mute/unmute時就保持目前的模式就已經非常棒了，另外音軌差異的閥值充20毫秒改成10毫秒，
因為我發現有時候修正後剛好是1X毫秒，聽起來偏移感還是比較重的

### 請Gemini 3 Pro預覽版調整切換靜音方式
#### 1st OAO
`僅附上app.js`
我發現靜音不要變成0，而是把音量變成1(模擬拖曳拉桿變成1)可以大幅減少音軌延遲(除了vocals之外)
你可以壓縮程式碼，但是請你不要刪除任何一行註解，我發現你之前常常都把我的註解刪掉，害我都要在git當中一行一行保留住解
例如下面這樣你壓縮後卻移除註解就不行
        // 選擇性：通知 App 更新 (如果需要即時套用設定變更)
        // 但為了保險起見，通常載入設定後使用者會傾向重整，
        // 這裡我們只更新 UI。
      } catch (err) {
        alert('檔案內容不是有效 JSON');
      }
      } catch (err) { alert('檔案內容不是有效 JSON'); }

#### 2nd Perfect!!!
`僅附上app.js`
剛剛測試是可行的，所以請把Vocals mute也採用相同邏輯靜音不要變成0，而是把音量變成1(模擬拖曳拉桿變成1)
我發現你剛才還是都把我的註解刪掉，請勿刪除任何一行註解，也不要壓縮程式碼
用我這次傳的app.js去修改

### 請Gemini 3 Pro預覽版協助在播放清單Folder切換鈕可以切進相對路徑內的資料夾
#### 1st Good!!!
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
`雖然Gemini 3 Pro總共可以接受超過100萬tokens的輸出入加總，但會累加目前已使用超過40萬，感覺AI稍微變笨所以新開聊天，這一次使用Build模式`
你好請你仔細瀏覽我傳所有的程式碼，我希望你幫我在播放清單的資料夾切換按鈕更改為可以切換進去只播放相對路徑內的資料夾(子資料夾子之子資料夾)
我下面有貼目前config內的一小段json，"path": "Sample Music"、"path": "Ultimate Vocal Remover"、"relPath": "Ultimate Vocal Remover/Others/*"、"relPath": "Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/*、或是其他"relPath": "Ultimate Vocal Remover/*的資料夾/，以及"relPath": "Ultimate Vocal Remover/*，直接是父資料夾內的檔案
我的想法是了把path視為父資料夾，而記錄在裡面的relPath視為子資料夾，但是也提供，可以一次播放付資料夾內的所有檔案(目前就是這樣)
所以目前的資料夾切換按鈕， 的上層改為是可以展開來的摺疊區塊，然後展開來後以下面config的案例應該會變成這樣
目前版本:點進去就直接切換到那個資料夾內的所有檔案作為播放清單內容
選擇資料夾
Ultimate Vocal Remover
Sample Music
希望本次修改成:點一下父資料夾展開那個資料夾內的所有子資料夾(與子資料夾內的資夾)，並會出現All，點選他代表如同現在版本一樣，
把父資料夾內的所有子資料夾的檔案都一起列成播放清單，而點選子資料夾就只把他裡面的內容列在播放清單中播放(此資料夾依照A-Z排序)
選擇資料夾
Ultimate Vocal Remover
|_All
|_Others(下面若沒有子資料夾，就不用再展開多一個All按鈕)
|_MyGo!!!!! to Ave Mujica (Crychic in the middle XD)
  |_All
  |_LiveSpeialVersion
Sample Music
|_All
請仔細思考後再開始寫程式碼，并完整輸出你所有有修改的程式碼
!!!請勿刪除任何一行註解，也不要壓縮程式碼!!! 超重要!!!
{
      "path": "Ultimate Vocal Remover",
      "tracks": [
        {
          "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_",
          "audioTracks": [
            {
              "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Vocals).mp3",
              "relPath": "Ultimate Vocal Remover/Others/1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Vocals).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/213b53c3-6055-4792-b8ce-1cbe913d544a",
              "volume": 85,
              "mute": false,
              "suffix": "Vocals"
            },
            {
              "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Instrumental).mp3",
              "relPath": "Ultimate Vocal Remover/Others/1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Instrumental).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/e7b391b9-ac3a-4ca8-8df0-0509ab2b903f",
              "volume": 85,
              "mute": false,
              "suffix": "Instrumental"
            }
          ],
          "lyricsFile": null
        },
        {
          "filename": "1_001.迷星叫_",
          "audioTracks": [
            {
              "filename": "1_001.迷星叫_(Bass).mp3",
              "relPath": "Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Bass).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/0f1e7ea5-6baa-456c-8fae-3e173ed1dc37",
              "volume": 58,
              "mute": false,
              "suffix": "Bass"
            },
{
      "path": "Sample Music",
      "tracks": [
        {
          "filename": "1_999.迷星叫_",
          "audioTracks": [
            {
              "filename": "1_999.迷星叫_(Vocals).mp3",
              "relPath": "Sample Music/1_999.迷星叫_(Vocals).mp3",
              "blobUrl": "blob:http://127.0.0.1:5501/352804e4-f619-45c2-8d81-7cc64bc1a033",
              "volume": 88,
              "mute": false,
              "suffix": "Vocals"
            },

### 請Gemini 3 Pro預覽版把子資料夾內的排序儲存在新json key-value relPathXOrder，動態歌詞播放功能增加offset調整顯示上面一點或下面一點
#### 1st Perfect
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
謝謝你之前已經幫我在播放清單的資料夾切換按鈕更改為可以切換進去只播放相對路徑內的資料夾，運作的十分不錯
但是美中不足的是當我切換到子資料夾之內播放時，拖曳子資料夾裡面的播放順序就沒有效了，我希望進入到子資料夾子與子子(子*n)資料夾，
都可以在播放清單頁面調整對應那個資料夾內的播放順序，我想到的實作方式是，把目前播放清單排序的方式改為將資料夾內的排序儲存在新的json key-value relPathXOrder
其中relPathXOrder的X代表位於父資夾(path的值)內的第幾層，在父資料夾內就設為0，也就是relPath0Order，如果在父資料夾下面一層子資料夾內的話就是relPath1Order
，再如果於父資料夾下面一層子資料夾內的再裡面一層子資料夾的話就是relPath2Order，以此類推也就是利用它相對於父資料夾的下面第n層來儲存順序變數，
但同時越底層(也就是越多層子資料夾包覆的)的歌曲，就必須記錄越多層的順序變數，我以下面的json例子來實際示範
父資料夾"path": "Ultimate Vocal Remover"，與他同層的有一首歌"filename": test1"，它的音軌有"relPath": "Ultimate Vocal Remover/test1_(Vocals).mp3"
、等多個音軌檔案，因為這個歌曲直接與傅齊父資料同一層，所以只需使用 relPath0Order 紀錄他在選擇Ultimate Vocal Remover並選取All的時候的播放順序，
這個變數要與filename，位於同一層，因為每首歌曲的多個音軌檔案都會在同一個相對路徑下，舉例像是這樣"filename": "test1","relPath0Order":13，
代表他在這層的播放清單下播放順序是第13首，然後我再舉個蠻複雜的多層子資料夾例子，使用"filename": "1_001.迷星叫_"這首來作說明
你可以看到他一樣位於父資料夾"path": "Ultimate Vocal Remover"底下，他的"relPath": "Ultimate Vocal Remover/Playlists/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Bass).mp3",是在父資料夾下的第2層，所以他就會需要建立3個relPathXOrder，用來儲存他在各層資料夾選擇ALL的
播放清單下的播放順序，像是以下這樣
"filename": "1_001.迷星叫_","relPath0Order":31,"relPath1Order":7,"relPath2Order":1,
"relPath0Order":31代表他在Ultimate Vocal Remover選取All的時候的播放順序是31
"relPath1Order":7代表他在Ultimate Vocal Remover/Playlists選取All的時候的播放順序是7
"relPath2Order":1代表他在Ultimate Vocal Remover/Playlists/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)選取All的時候的播放順序是1
其他歌曲也以此類推，假設這首歌或者這個子資料夾是第一次載入，就依照目前的檔案載入的順序去幫他對應這些relPathXOrder的變數給予對應的預設值

  "folders": [
    {
      "path": "Ultimate Vocal Remover",
      "tracks": [
        {
          "filename": "test1",
          "audioTracks": [
            {
              "filename": "test1_(Vocals).mp3",
              "relPath": "Ultimate Vocal Remover/test1_(Vocals).mp3",
              ...省略
        {
          "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_",
          "audioTracks": [
            {
              "filename": "1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Vocals).mp3",
              "relPath": "Ultimate Vocal Remover/Others/1_04.I Don't Even Know Your Name   Aftertaste   Kid In Love   I Want You Back (Live Medley)_(Vocals).mp3",
              ...省略
        {
          "filename": "1_001.迷星叫_",
          "audioTracks": [
            {
              "filename": "1_001.迷星叫_(Bass).mp3",
              "relPath": "Ultimate Vocal Remover/Playlists/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Bass).mp3",
              ...省略
        {
          "filename": "4_[04].Dried Flowers -Orchestral Arrangement Version-_",
          "audioTracks": [
            {
              "filename": "4_[04].Dried Flowers -Orchestral Arrangement Version-_(Bass).mp3",
              "relPath": "Ultimate Vocal Remover/Albums/Hibiku響-Yuuri優里/4_[04].Dried Flowers -Orchestral Arrangement Version-_(Bass).mp3",
              ...省略
    {
      "path": "Sample Music",
      "tracks": [
        {
          "filename": "13_997.栞_",
          "audioTracks": [
            {
              "filename": "13_997.栞_(Drums).mp3",
              "relPath": "Sample Music/13_997.栞_(Drums).mp3",

請你仔細瀏覽我傳所有的程式碼，並仔細思考後再開始寫程式碼，請完整輸出你所有有修改的程式碼
!!!請勿刪除任何一行註解，也不要壓縮程式碼!!! 超重要!!! 謝謝~

### 請Gemini 3 Pro預覽版修正為保存最後播放的資料夾清單，以及檔案搬移到不同的資料夾后音量設定會全部變回預設
#### 1st Perfect!!
`附上本專案所有程式碼文件，排除vscode和git設定以及 需求.txt`
你好我目前有發現2個bug，
第1個是當我把檔案搬移到不同資料夾后，但一樣是位於這個父資料夾裡面，只是被放到不同的子資料夾，之前的音量設定就會變回預設值
例如:原本的Ultimate Vocal Remover/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)/1_001.迷星叫_(Bass).mp3(包含這首歌對應的所有音軌)
被我移動到這個資料夾Ultimate Vocal Remover/Playlists/MyGo!!!!! to Ave Mujica (Crychic in the middle XD)，
然後這首歌對應的所有音軌音量設定全變回預設值，所以重新掃描檔案定還原音量設定的時候，請忽略相對路徑，只要移動後仍處在同一個父資料夾裡面
那麼就請直接去比對檔名就好，也就是1_001.迷星叫_(Bass).mp3、1_001.迷星叫_(XXX).mp3，如果對應得到完全相同的檔名，就把對應的音量設定還原回去

第2個是Active Folder並沒有被保留，每次網頁重整后再次選取同樣的資料夾(父)，然後就會回到父資料夾的播放清單，詳細如下方log，我這邊先截取關鍵訊息
(播放清單已更新 [Ultimate Vocal Remover/Albums/Hibiku響-Yuuri優里] (Depth: 2)，共 12 首，然後我重整網頁再次選擇載入父資料夾
Ultimate Vocal Remover，然後播放的清單就會變回這個父資料夾本身，而不是切到我上次最後播放的Hibiku響-Yuuri優里)
請你仔細瀏覽我傳的所有程式碼，並仔細思考後再開始寫程式碼，請完整輸出你所有有修改的程式碼
!!!請勿刪除任何一行註解，也不要壓縮程式碼!!! 超重要!!! 謝謝~

```log
為節省空間，已移除
```

