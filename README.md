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

