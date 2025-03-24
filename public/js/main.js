        // 変数初期化
        let currentBgIndex = 0;
        let backgrounds = [];
        let photos = [];
        let photoKeywords = []; // 各写真に使用されたキーワードを格納
        let isLoading = true;
        let lastScreenWidth = window.innerWidth;
        let lastScreenHeight = window.innerHeight;
        let isOffline = !navigator.onLine;
        let isUnsplashFetchInProgress = false;
        let selectedKeyword = 'landscape';

        // 設定
        const KEYWORDS = ['landscape', 'mountains', 'ocean', 'forest', 'sunset', 'winter', 'summer', 'city', 'desert', 'beach', 'night'];
        const CACHE_KEY = 'unsplash_photos_cache';
        const CACHE_EXPIRY = 1 * 60 * 60 * 1000; // 1時間（ミリ秒）
        // const CACHE_EXPIRY = 30 * 1000; // デバッグ30秒（ミリ秒）
        const CACHE_EXPIRY_CHECK = 10 * 60 * 1000; // 10分
        const PHOTOS_COUNT = 30; // 一度に取得する画像の数
        const INTERVAL = 20000; // 20秒ごとに背景を変更

        // Pages Functions API エンドポイント（相対パス）
        const API_ENDPOINT = '/api/unsplash';

        // キャッシュの有効期限を確認し、期限切れなら自動的に画像を再取得する関数
        function startCacheExpiryChecker() {
            // CACHE_EXPIRY_CHECK秒ごとにキャッシュの有効期限をチェック
            setInterval(() => {
                // キャッシュが存在する場合のみチェック
                const cachedData = localStorage.getItem(CACHE_KEY);
                if (cachedData) {
                    try {
                        const { timestamp } = JSON.parse(cachedData);
                        const now = new Date().getTime();
                        
                        // キャッシュが期限切れで、かつ現在APIリクエスト実行中でなく、オンライン状態の場合
                        if (now - timestamp >= CACHE_EXPIRY && !isUnsplashFetchInProgress && !isOffline) {
                            console.log('キャッシュの有効期限が切れました。新しい画像を自動取得します...');
                            refreshPhotos();
                        }
                    } catch (e) {
                        console.error('キャッシュ確認エラー:', e);
                    }
                }
            }, CACHE_EXPIRY_CHECK);
        }

        // インターバルIDを保持するグローバル変数
        let backgroundChangeInterval = null;

        // 背景変更インターバルを開始する関数
        function startBackgroundChangeInterval() {
            // 既存のインターバルがあればクリアする
            if (backgroundChangeInterval) {
                clearInterval(backgroundChangeInterval);
            }
            // 新しいインターバルを設定
            backgroundChangeInterval = setInterval(changeBackground, INTERVAL);
        }
        
        // アプリケーション開始
        document.addEventListener('DOMContentLoaded', () => {
            showLoadingIndicator();
            
            // オフラインステータスの更新
            updateOfflineStatus();
            
            // キーワードセレクターの初期化
            initializeKeywordSelector();
            
            // キャッシュをチェック
            const cachedData = checkPhotoCache();
            
            if (cachedData) {
                // キャッシュデータを使用
                photos = cachedData;
                initializeBackgrounds();
                hideLoadingIndicator();
            } else {
                // 新しいデータを取得
                fetchUnsplashPhotos()
                    .then(data => {
                        photos = data;
                        // キャッシュに保存
                        cachePhotos(photos);
                        initializeBackgrounds();
                        hideLoadingIndicator();
                    })
                    .catch(error => {
                        console.error('Failed to fetch photos:', error);
                        useFallbackImages();
                        initializeBackgrounds();
                        hideLoadingIndicator();
                    });
            }
            
            // 時計の更新（これは背景とは独立して実行）
            updateClock();
            setInterval(updateClock, 1000);
            startCacheExpiryChecker();
            
            // 画面サイズの変更を監視
            window.addEventListener('resize', () => {
                // 画面サイズが大幅に変わった場合のみ再読み込み
                if (Math.abs(window.innerWidth - lastScreenWidth) > 200 || 
                    Math.abs(window.innerHeight - lastScreenHeight) > 200) {
                    lastScreenWidth = window.innerWidth;
                    lastScreenHeight = window.innerHeight;
                    
                    // キャッシュをクリア
                    localStorage.removeItem(CACHE_KEY);
                    
                    // 写真を再読み込み
                    clearBackgrounds();
                    showLoadingIndicator();
                    fetchUnsplashPhotos()
                        .then(data => {
                            photos = data;
                            cachePhotos(photos);
                            initializeBackgrounds();
                            hideLoadingIndicator();
                        })
                        .catch(error => {
                            console.error('Failed to fetch photos:', error);
                            useFallbackImages();
                            initializeBackgrounds();
                            hideLoadingIndicator();
                        });
                }
            });
            
            // ネットワーク状態の監視
            window.addEventListener('online', () => {
                isOffline = false;
                updateOfflineStatus();
            });

            window.addEventListener('offline', () => {
                isOffline = true;
                updateOfflineStatus();
            });
            
            // キーワードタグのクリックでセレクタを表示/非表示
            document.getElementById('current-keyword-tag').addEventListener('click', (e) => {
                toggleKeywordSelector();
                e.stopPropagation();
            });

            // ドキュメントクリックでセレクタを非表示
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#keyword-selector') && !e.target.closest('#current-keyword')) {
                    toggleKeywordSelector(false);
                }
            });

            // ESCキーでセレクタを閉じる
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    toggleKeywordSelector(false);
                }
            });
        });
        
        // キーワード選択パネルの初期化
        function initializeKeywordSelector() {
            const keywordSelector = document.getElementById('keyword-selector');
            
            // 既存の内容をクリア
            keywordSelector.innerHTML = '';
            
            // KEYWORDS配列から選択チップを生成
            KEYWORDS.forEach(keyword => {
                const chip = document.createElement('div');
                chip.className = 'keyword-chip';
                if (keyword === selectedKeyword) {
                    chip.classList.add('active');
                }
                chip.dataset.keyword = keyword;
                
                // 英語のキーワードを表示
                chip.innerHTML = `
                    <span>${keyword}</span>
                `;
                
                // クリックイベント
                chip.addEventListener('click', () => {
                    selectKeyword(keyword);
                });
                
                keywordSelector.appendChild(chip);
            });
            
            // 現在選択されているキーワードのタグも更新
            updateCurrentKeywordTag(selectedKeyword);
        }

        // 現在のキーワードタグを更新
        function updateCurrentKeywordTag(keyword) {
            const keywordTag = document.getElementById('current-keyword-tag');
            
            keywordTag.innerHTML = `
                <span class="keyword-tag-text">${keyword}</span>
            `;
        }

        // キーワードを選択して画像を取得
        function selectKeyword(keyword) {
            // 前の選択を解除
            const activeChip = document.querySelector('.keyword-chip.active');
            if (activeChip) {
                activeChip.classList.remove('active');
            }
            
            // 新しい選択をアクティブに
            const newActiveChip = document.querySelector(`.keyword-chip[data-keyword="${keyword}"]`);
            if (newActiveChip) {
                newActiveChip.classList.add('active');
            }
            
            // 選択したキーワードを保存
            selectedKeyword = keyword;
            
            // 現在のキーワードタグを更新
            updateCurrentKeywordTag(keyword);
            
            // キーワードセレクタをスムーズに閉じる
            toggleKeywordSelector(false);
            
            // 新しいキーワードで画像を取得
            refreshPhotosWithKeyword(keyword);
        }

        // キーワードセレクタの表示/非表示を切り替え
        function toggleKeywordSelector(show = null) {
            const keywordSelector = document.getElementById('keyword-selector');
            const isCurrentlyShown = keywordSelector.classList.contains('active');
            
            // 引数がnullの場合はトグル、そうでなければ指定された状態に
            const shouldShow = show === null ? !isCurrentlyShown : show;
            
            if (shouldShow) {
                keywordSelector.classList.add('active');
            } else {
                keywordSelector.classList.remove('active');
            }
        }
        
        // 現在の画像のキーワードを更新する関数
        function updateCurrentKeyword(index) {
            // 表示するキーワード
            let keyword = 'landscape'; // デフォルト値
            
            if (photoKeywords && photoKeywords[index]) {
                keyword = photoKeywords[index];
            }
            
            // タグを更新
            updateCurrentKeywordTag(keyword);
        }
        
        // オフライン状態の表示を更新
        function updateOfflineStatus() {
            const offlineNotice = document.getElementById('offline-notice');
            if (isOffline) {
                offlineNotice.style.display = 'block';
            } else {
                offlineNotice.style.display = 'none';
            }
        }
        
        // 新しい画像を取得する関数
        function refreshPhotos() {
            // オフラインモードの場合は処理を中止
            if (isOffline) {
                alert('オフライン状態です。インターネット接続を確認してください。');
                return;
            }
            
            // キャッシュをクリア
            localStorage.removeItem(CACHE_KEY);
            
            // ブラウザキャッシュを避けるためにタイムスタンプを使用
            window.cacheTimestamp = new Date().getTime();
            
            // 現在選択されているキーワードを取得
            const currentKeyword = selectedKeyword || KEYWORDS[0];
            
            // 写真を再読み込み
            clearBackgrounds();
            showLoadingIndicator();
            fetchUnsplashPhotosWithKeyword(currentKeyword)
                .then(data => {
                    photos = data;
                    cachePhotos(photos);
                    initializeBackgrounds();
                    hideLoadingIndicator();
                })
                .catch(error => {
                    console.error('Failed to fetch photos:', error);
                    useFallbackImages();
                    initializeBackgrounds();
                    hideLoadingIndicator();
                });
        }
        
        // 指定したキーワードで画像を取得する関数
        function refreshPhotosWithKeyword(keyword) {
            // オフラインモードの場合は処理を中止
            if (isOffline) {
                alert('オフライン状態です。インターネット接続を確認してください。');
                return;
            }
            
            // キャッシュをクリア
            localStorage.removeItem(CACHE_KEY);
            
            // ブラウザキャッシュを避けるためにタイムスタンプを使用
            window.cacheTimestamp = new Date().getTime();
            
            // 写真を再読み込み
            clearBackgrounds();
            showLoadingIndicator();
            fetchUnsplashPhotosWithKeyword(keyword)
                .then(data => {
                    photos = data;
                    cachePhotos(photos);
                    initializeBackgrounds();
                    hideLoadingIndicator();
                })
                .catch(error => {
                    console.error('Failed to fetch photos:', error);
                    useFallbackImages();
                    initializeBackgrounds();
                    hideLoadingIndicator();
                });
        }

        // ローカルストレージからキャッシュをチェック
        function checkPhotoCache() {
            try {
                const cachedData = localStorage.getItem(CACHE_KEY);
                if (!cachedData) {
                    return null;
                }
                
                const { timestamp, data } = JSON.parse(cachedData);
                const now = new Date().getTime();
                
                // キャッシュの有効期限をチェック
                if (now - timestamp < CACHE_EXPIRY) {
                    return data;
                }
                
                return null;
            } catch (e) {
                console.error('Cache read error:', e);
                return null;
            }
        }

        // キャッシュに保存
        function cachePhotos(data) {
            try {
                const cacheData = {
                    timestamp: new Date().getTime(),
                    data: data
                };
                localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            } catch (e) {
                console.error('Cache write error:', e);
            }
        }

        // Cloudflare Pages Function経由でUnsplash APIから写真を取得
        async function fetchUnsplashPhotos() {
            try {
                // 既にフェッチが進行中の場合は、新しいフェッチをスキップ
                if (isUnsplashFetchInProgress) {
                    return new Promise(resolve => {
                        // 既存のフェッチが完了するまで待機
                        const checkPhotos = () => {
                            if (photos.length > 0) {
                                resolve(photos);
                            } else {
                                setTimeout(checkPhotos, 100);
                            }
                        };
                        checkPhotos();
                    });
                }
                
                isUnsplashFetchInProgress = true;
                
                // オフラインモードの場合はエラーをスロー
                if (isOffline) {
                    isUnsplashFetchInProgress = false;
                    throw new Error('Currently offline');
                }
                
                // デフォルトでは最初のキーワード（landscape）を使用
                const keyword = selectedKeyword || KEYWORDS[0];
                const query = keyword;
                
                // 使用したキーワードを保存（後で表示するため）
                window.lastUsedKeyword = keyword;
                
                // 画面サイズを取得
                const screenWidth = window.innerWidth * window.devicePixelRatio;
                const screenHeight = window.innerHeight * window.devicePixelRatio;
                
                // ブラウザキャッシュを避けるためのタイムスタンプを追加
                const timestamp = window.cacheTimestamp || new Date().getTime();
                
                // APIリクエスト（サイズ情報とキャッシュバスティングパラメータを追加）
                const response = await fetch(`${API_ENDPOINT}?query=${query}&count=${PHOTOS_COUNT}&width=${screenWidth}&height=${screenHeight}&_=${timestamp}`);
                
                // レート制限の処理（新しく追加）
                if (response.status === 429) {
                    // レート制限エラーを特別に処理
                    const errorData = await response.json();
                    
                    // ユーザーにレート制限を通知
                    const retryAfter = parseInt(response.headers.get('Retry-After') || errorData.retry_after || '60', 10);
                    
                    // 残りの制限時間を計算（秒）
                    const remainingTime = Math.ceil(retryAfter / 60);
                    
                    // ユーザーに通知
                    console.warn(`APIリクエスト制限に達しました。約${remainingTime}分後に再試行してください。`);
                    
                    // オフライン通知を表示
                    const offlineNotice = document.getElementById('offline-notice');
                    if (offlineNotice) {
                        offlineNotice.textContent = `APIリクエスト制限に達しました。約${remainingTime}分後に再試行してください。`;
                        offlineNotice.style.display = 'block';
                        
                        // 5秒後に通知を非表示
                        setTimeout(() => {
                            offlineNotice.style.display = 'none';
                        }, 5000);
                    }
                    
                    // キャッシュされた画像があればそれを使用する
                    const cachedData = checkPhotoCache();
                    if (cachedData) {
                        isUnsplashFetchInProgress = false;
                        return cachedData;
                    }
                    
                    // 最後の手段としてフォールバック画像を使用
                    isUnsplashFetchInProgress = false;
                    throw new Error('Rate limit exceeded');
                }
                
                if (!response.ok) {
                    throw new Error(`API responded with ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                // 各写真に使用したキーワードを関連付ける
                photoKeywords = Array(data.length).fill(keyword);
                
                isUnsplashFetchInProgress = false;
                return data;
            } catch (error) {
                console.error('Failed to fetch from Unsplash API:', error);
                isUnsplashFetchInProgress = false;
                
                // エラーがレート制限の場合はフォールバック画像を使用
                if (error.message === 'Rate limit exceeded') {
                    return useFallbackImages();
                }
                
                throw error;
            }
        }
        
        // 特定のキーワードで Unsplash から写真を取得する関数
        async function fetchUnsplashPhotosWithKeyword(keyword) {
            try {
                // 既にフェッチが進行中の場合は、新しいフェッチをスキップ
                if (isUnsplashFetchInProgress) {
                    return new Promise(resolve => {
                        // 既存のフェッチが完了するまで待機
                        const checkPhotos = () => {
                            if (photos.length > 0) {
                                resolve(photos);
                            } else {
                                setTimeout(checkPhotos, 100);
                            }
                        };
                        checkPhotos();
                    });
                }
                
                isUnsplashFetchInProgress = true;
                
                // オフラインモードの場合はエラーをスロー
                if (isOffline) {
                    isUnsplashFetchInProgress = false;
                    throw new Error('Currently offline');
                }
                
                // 選択されたキーワードを使用
                const query = keyword;
                
                // 使用したキーワードを保存（後で表示するため）
                window.lastUsedKeyword = keyword;
                
                // 画面サイズを取得
                const screenWidth = window.innerWidth * window.devicePixelRatio;
                const screenHeight = window.innerHeight * window.devicePixelRatio;
                
                // ブラウザキャッシュを避けるためのタイムスタンプを追加
                const timestamp = window.cacheTimestamp || new Date().getTime();
                
                // APIリクエスト（サイズ情報とキャッシュバスティングパラメータを追加）
                const response = await fetch(`${API_ENDPOINT}?query=${query}&count=${PHOTOS_COUNT}&width=${screenWidth}&height=${screenHeight}&_=${timestamp}`);
                
                if (!response.ok) {
                    throw new Error(`API responded with ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                // 各写真に使用したキーワードを関連付ける
                photoKeywords = Array(data.length).fill(keyword);
                
                isUnsplashFetchInProgress = false;
                return data;
            } catch (error) {
                console.error('Failed to fetch from Unsplash API:', error);
                isUnsplashFetchInProgress = false;
                throw error;
            }
        }

        // フォールバック画像（エラー時）
        function useFallbackImages() {
            const colors = ['#1a365d', '#2a4365', '#2c5282', '#2b6cb0', '#3182ce'];
            photos = colors.map((color, index) => ({
                id: `fallback-${index}`,
                url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'%3E%3Crect width='1920' height='1080' fill='${color}' /%3E%3C/svg%3E`,
                photographer: {
                    name: "System",
                    profile: "#"
                },
                description: "風景画像",
                location: ""
            }));
            
            // フォールバック用のキーワード
            photoKeywords = Array(colors.length).fill('fallback');
        }
        
        // グローバル変数としてローディング用背景要素への参照を保持
        let bg1stLoadingElement = null;

        // 背景要素の初期化（最適化版 - 重複生成問題修正）
        function initializeBackgrounds() {
            // 既存の背景を全て削除
            clearBackgrounds();

            // bg_1st_loading要素の処理 - 存在しない場合のみ作成
            if (!bg1stLoadingElement) {
                bg1stLoadingElement = document.createElement('div');
                bg1stLoadingElement.className = 'background';
                bg1stLoadingElement.classList.add('loading');
                document.body.appendChild(bg1stLoadingElement);
            }
            
            // ローディング状態を有効化
            bg1stLoadingElement.classList.add('active');
            
            for (let i = 0; i < photos.length; i++) {
                const bg = document.createElement('div');
                bg.className = 'background';
                
                // 各背景要素に写真のインデックスを保存
                bg.dataset.photoIndex = i;
                
                // 最初の画像の場合
                if (i === 0) {
                    const firstImageUrl = photos[i].url;
                    
                    // 画像を非同期で読み込む
                    const firstImage = new Image();
                    firstImage.onload = () => {
                        bg1stLoadingElement.classList.remove('active');
                        bg.classList.add('active');

                        // 画像が読み込まれたら背景に設定してフェードイン効果を開始
                        bg.style.backgroundImage = `url(${firstImageUrl})`;
                        // URL情報を保持しておく（2周目以降の保険）
                        bg.dataset.backgroundImage = firstImageUrl;
                        // 背景初期化完了後にインターバルを開始
                        startBackgroundChangeInterval();
                        
                        // 次の画像（2枚目）のみプリロード
                        if (photos.length > 1) {
                            preloadImage(photos[1].url);
                        }
                    };
                    firstImage.src = photos[i].url;
                    
                    updatePhotoInfo(0);
                    updateCurrentKeyword(0);
                } else {
                    // 他の画像はデータ属性に保存
                    bg.dataset.backgroundImage = photos[i].url;
                }
                
                document.body.appendChild(bg);
                backgrounds.push(bg);
            }
        }

        // 画像をプリロードするシンプルな関数
        function preloadImage(url) {
            const img = new Image();
            img.src = url;
        }
        
        // 背景をクリア
        function clearBackgrounds() {
            backgrounds.forEach(bg => {
                document.body.removeChild(bg);
            });
            backgrounds = [];
            currentBgIndex = 0;
        }

        // 時計の更新
        function updateClock() {
            const now = new Date();
            
            // 時刻フォーマット
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            
            // 日本語の日付フォーマット
            const options = { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                weekday: 'long'
            };
            const dateString = now.toLocaleDateString('ja-JP', options);
            
            // DOM更新
            document.getElementById('time').textContent = `${hours}:${minutes}:${seconds}`;
            document.getElementById('date').textContent = dateString;
        }

        // 背景画像の切り替え（完全修正版）
        function changeBackground() {
            // 現在の背景を非アクティブにする
            // backgrounds[currentBgIndex].classList.remove('fade-in');
            backgrounds[currentBgIndex].classList.remove('active');
            
            // 次の背景インデックスに進む
            currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
            
            // 次の背景要素
            const nextBg = backgrounds[currentBgIndex];
            const photoIndex = parseInt(nextBg.dataset.photoIndex || currentBgIndex);
            
            // ケース1: 画像がまだ読み込まれていない場合（dataset.backgroundImageあり、style.backgroundImageなし）
            if (nextBg.dataset.backgroundImage && !nextBg.style.backgroundImage) {
                // 非同期で画像を読み込む
                const nextImage = new Image();
                nextImage.onload = () => {
                    // 画像が読み込まれたら背景に設定
                    nextBg.style.backgroundImage = `url(${nextBg.dataset.backgroundImage})`;
                    // フェードイン効果を適用
                    // nextBg.classList.add('fade-in');
                };
                nextImage.src = nextBg.dataset.backgroundImage;
            } 
            // ケース2: 画像が既に読み込まれている場合（style.backgroundImageあり）
            else if (nextBg.style.backgroundImage) {
                // 必要に応じてフェードイン効果を再適用
                // if (!nextBg.classList.contains('fade-in')) {
                //     nextBg.classList.add('fade-in');
                // }
                
                // すでに読み込まれている画像を再表示するためのトリガー
                // 同じURLでも再度設定することで表示を確実にする
                const currentBgUrl = nextBg.style.backgroundImage;
                nextBg.style.backgroundImage = 'none';
                
                // 少し遅延を入れてから再設定（ブラウザの再描画を促す）
                setTimeout(() => {
                    nextBg.style.backgroundImage = currentBgUrl;
                }, 10);
            }
            // ケース3: 緊急時（どちらも設定されていない場合）
            else {
                // photos配列から直接URLを取得
                const photoUrl = photos[photoIndex].url;
                
                // 一旦ローディング状態に
                nextBg.classList.add('loading');
                
                // 画像読み込み
                const fallbackImage = new Image();
                fallbackImage.onload = () => {
                    nextBg.style.backgroundImage = `url(${photoUrl})`;
                    nextBg.dataset.backgroundImage = photoUrl; // 将来のために保存
                    
                    nextBg.classList.remove('loading');
                    // nextBg.classList.add('fade-in');
                };
                fallbackImage.src = photoUrl;
            }
            
            // 次の背景をアクティブにする
            nextBg.classList.add('active');
            
            // 写真情報とキーワードを更新
            updatePhotoInfo(photoIndex);
            updateCurrentKeyword(photoIndex);
            
            // 次の画像をプリロード（常に1つ先だけ）
            const nextNextIndex = (currentBgIndex + 1) % backgrounds.length;
            if (nextNextIndex !== currentBgIndex) {
                const nextNextBg = backgrounds[nextNextIndex];
                if (nextNextBg && nextNextBg.dataset.backgroundImage && !nextNextBg.style.backgroundImage) {
                    // まだ読み込まれていない場合のみプリロード
                    const preloadImg = new Image();
                    preloadImg.src = nextNextBg.dataset.backgroundImage;
                }
            }
        }

        // 写真情報を更新
        function updatePhotoInfo(index) {
            const photoInfoElement = document.getElementById('photo-info');
            const photo = photos[index];
            
            // 既存のコンテンツをクリア
            photoInfoElement.textContent = '';
            
            if (photo && photo.photographer) {
                // 写真クレジット部分
                const creditDiv = document.createElement('div');
                creditDiv.className = 'photo-credit';
                
                const textNode = document.createTextNode('Photo by ');
                creditDiv.appendChild(textNode);
                
                const photographerLink = document.createElement('a');
                photographerLink.href = photo.photographer.profile;
                photographerLink.target = '_blank';
                photographerLink.rel = 'noopener';
                photographerLink.textContent = photo.photographer.name;
                creditDiv.appendChild(photographerLink);
                
                creditDiv.appendChild(document.createTextNode(' on '));
                
                const unsplashLink = document.createElement('a');
                unsplashLink.href = 'https://unsplash.com';
                unsplashLink.target = '_blank';
                unsplashLink.rel = 'noopener';
                unsplashLink.textContent = 'Unsplash';
                creditDiv.appendChild(unsplashLink);
                
                photoInfoElement.appendChild(creditDiv);
                
                // 撮影場所（存在する場合）
                if (photo.location) {
                    const locationDiv = document.createElement('div');
                    locationDiv.className = 'photo-location';
                    locationDiv.textContent = photo.location;
                    photoInfoElement.appendChild(locationDiv);
                }
                
                // 写真の説明（存在する場合）
                if (photo.description) {
                    const descriptionDiv = document.createElement('div');
                    descriptionDiv.className = 'photo-description';
                    descriptionDiv.textContent = photo.description;
                    photoInfoElement.appendChild(descriptionDiv);
                }
            }
        }

        // グローバルでタイマーIDを管理
        let loadingTimerId;

        // ローディングインジケータ表示関数の修正
        function showLoadingIndicator() {
            const loading = document.getElementById('loading');
            // 以前のタイマーをクリア
            clearTimeout(loadingTimerId);
            // スタイルをリセット
            loading.style.display = 'flex';
            // 即座にopacityを1に設定して確実に表示
            loading.style.opacity = '1';
        }
        
        // ローディングインジケータ非表示関数の修正
        function hideLoadingIndicator() {
            const loading = document.getElementById('loading');
            loading.style.opacity = '0';
            loadingTimerId = setTimeout(() => {
                // 念のため、まだopacityが0の場合のみdisplayをnoneに
                if (parseFloat(loading.style.opacity) === 0) {
                    loading.style.display = 'none';
                }
            }, 500);
        }
        
        // KEYWORDS配列を動的に更新する場合の関数
        function updateKeywords(newKeywords) {
            // KEYWORDSを更新
            KEYWORDS.length = 0; // 配列をクリア
            newKeywords.forEach(keyword => KEYWORDS.push(keyword));
            
            // キーワードセレクターを再初期化
            initializeKeywordSelector();
            
            // 現在選択されているキーワードがまだ有効かチェック
            if (!KEYWORDS.includes(selectedKeyword)) {
                // 選択されたキーワードが有効でなくなった場合は最初のキーワードを選択
                selectedKeyword = KEYWORDS[0];
                updateCurrentKeywordTag(selectedKeyword);
            }
        }
        
        // キーワードが変更されたときのアニメーション効果
        function animateKeywordChange(keyword) {
            // 現在のタグに一時的なクラスを追加
            const currentTag = document.getElementById('current-keyword-tag');
            currentTag.classList.add('keyword-changed');
            
            // フラッシュ効果のためのオーバーレイを作成
            const flash = document.createElement('div');
            flash.className = 'keyword-change-flash';
            document.body.appendChild(flash);
            
            // タイミングを調整
            setTimeout(() => {
                flash.remove();
                currentTag.classList.remove('keyword-changed');
            }, 700);
        }
        
        // サービスワーカーの登録
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(registration => {
                        console.log('ServiceWorker registration successful:', registration.scope);
                    })
                    .catch(error => {
                        console.error('ServiceWorker registration failed:', error);
                    });
            });
            
            // インストールイベントを検知
            window.addEventListener('beforeinstallprompt', (e) => {
                // Install prompt detected
            });
        }

        // スクリーンをスリープ状態にしない
        function keepAwake() {
            if (navigator.wakeLock) {
                navigator.wakeLock.request('screen').then(lock => {
                    // Screen wake lock active
                }).catch(err => {
                    console.error(`Screen wake lock error: ${err.name}, ${err.message}`);
                });
            }
        }
        
        // クリックでフルスクリーン表示
        document.addEventListener('click', (e) => {
            // キーワードセレクターや現在のキーワード表示領域以外のクリックでフルスクリーン
            if (!e.target.closest('#current-keyword') && !e.target.closest('#keyword-selector')) {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen();
                    keepAwake();
                }
            }
        });