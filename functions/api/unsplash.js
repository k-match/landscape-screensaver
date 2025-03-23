// functions/api/unsplash.js
// キャッシュバスティング対応版

// functions/api/unsplash.js
// レート制限機能を追加したバージョン

export async function onRequest(context) {
  // リクエストの取得
  const request = context.request;
  const url = new URL(request.url);
  
  // CORSヘッダー設定（キャッシュ制御を含む）
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json',
    // キャッシュバスティングのためにキャッシュ無効化 
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  };
  
  // OPTIONSリクエスト（プリフライト）への対応
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  
  // ------- レート制限のロジック開始 -------
  // クライアントの識別子を取得（IP アドレス）
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  
  // レート制限の設定
  const RATE_LIMIT = 5;                  // 5回のリクエスト
  const RATE_LIMIT_WINDOW = 60;          // 60秒間 (1分)
  
  // KV から現在のレート制限情報を取得
  const rateKey = `rate_limit:${clientIP}`;
  let rateData;
  
  try {
      rateData = await context.env.RATE_LIMITS.get(rateKey, { type: 'json' });
  } catch (e) {
      console.error('Error reading rate limit data:', e);
  }
  
  // 現在のタイムスタンプ
  const now = Math.floor(Date.now() / 1000);
  
  // レート制限データがない場合または期限切れの場合は初期化
  if (!rateData || (now - rateData.startTime) > RATE_LIMIT_WINDOW) {
      rateData = {
          count: 0,
          startTime: now
      };
  }
  
  // リクエスト数をインクリメント
  rateData.count++;
  
  // 残りのリクエスト数を計算
  const remainingRequests = Math.max(0, RATE_LIMIT - rateData.count);
  
  // KVに更新されたデータを保存（有効期限をウィンドウ時間+少し余裕を持たせる）
  await context.env.RATE_LIMITS.put(
      rateKey, 
      JSON.stringify(rateData), 
      { expirationTtl: RATE_LIMIT_WINDOW + 10 }
  );
  
  // レート制限ヘッダーを追加
  corsHeaders['X-RateLimit-Limit'] = RATE_LIMIT.toString();
  corsHeaders['X-RateLimit-Remaining'] = remainingRequests.toString();
  corsHeaders['X-RateLimit-Reset'] = (rateData.startTime + RATE_LIMIT_WINDOW).toString();
  
  // レート制限を超えた場合、429エラーを返す
  if (rateData.count > RATE_LIMIT) {
      return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          message: `リクエスト制限を超えました。${RATE_LIMIT_WINDOW}秒後に再試行してください。`,
          retry_after: RATE_LIMIT_WINDOW
      }), {
          status: 429,
          headers: {
              ...corsHeaders,
              'Retry-After': RATE_LIMIT_WINDOW.toString()
          }
      });
  }
  // ------- レート制限のロジック終了 -------
  
  try {
    // クエリパラメータの取得
    const query = url.searchParams.get('query') || 'landscape';
    // 安全なクエリ文字列に制限（英数字、スペース、カンマのみ許可）
    const sanitizedQuery = query.replace(/[^a-zA-Z0-9 ,]/g, '');
    
    // 合理的な上限値を設定
    const maxWidth = 3840; // 4K幅
    const maxHeight = 2160; // 4K高さ
    const count = Math.min(parseInt(url.searchParams.get('count') || '5', 10), 30);
    const width = Math.min(parseInt(url.searchParams.get('width') || '1920', 10), maxWidth);
    const height = Math.min(parseInt(url.searchParams.get('height') || '1080', 10), maxHeight);
    
    // 環境変数からAPIキーを取得
    const apiKey = context.env.UNSPLASH_API_KEY;
    
    // Unsplash APIの直接呼び出し（キャッシュバスティング対応）
    const timestamp = new Date().getTime();
    const apiUrl = `https://api.unsplash.com/photos/random?query=${sanitizedQuery}&count=${count}&orientation=landscape&_=${timestamp}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Client-ID ${apiKey}`,
        'Accept-Version': 'v1',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Unsplash API responded with ${response.status}`);
    }
    
    const data = await response.json();
    
    // 画面サイズに基づいて最適な解像度を選択
    const getOptimalImageUrl = (photo, screenWidth, screenHeight) => {
      // 利用可能な解像度オプション
      const urls = {
        raw: photo.urls.raw,
        full: photo.urls.full,
        regular: photo.urls.regular,
        small: photo.urls.small,
        thumb: photo.urls.thumb
      };
      
      // キャッシュバスティングのためのタイムスタンプパラメータ
      const cacheBuster = `&_=${new Date().getTime()}`;
      
      // 小さな画面にはsmallを使用
      if (screenWidth <= 640) {
        return `${photo.urls.small}${photo.urls.small.includes('?') ? '&' : '?'}_=${timestamp}`;
      }
      // 中程度の画面にはregularを使用
      else if (screenWidth <= 1920) {
        return `${photo.urls.regular}${photo.urls.regular.includes('?') ? '&' : '?'}_=${timestamp}`;
      }
      // 大きな画面にはfullを使用
      else if (screenWidth <= 2560) {
        return `${photo.urls.full}${photo.urls.full.includes('?') ? '&' : '?'}_=${timestamp}`;
      }
      // 超高解像度の画面にはrawをリサイズして使用
      else {
        // rawには幅と高さを指定できる
        return `${photo.urls.raw}&w=${screenWidth}&fit=max&_=${timestamp}`;
      }
    };

    // HTMLエスケープ関数（サーバーサイド用）
    function escapeHTML(str) {
      if (!str) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
    }
    
    // プロセスされたデータでエスケープを適用
    const processedData = data.map(photo => ({
      id: photo.id,
      url: getOptimalImageUrl(photo, width, height),
      download_url: photo.links.download,
      width: photo.width,
      height: photo.height,
      color: photo.color,
      description: escapeHTML(photo.description || photo.alt_description),
      location: escapeHTML(photo.location?.name),
      photographer: {
          name: escapeHTML(photo.user.name),
          username: escapeHTML(photo.user.username),
          profile: photo.user.links.html // URLはエスケープしない
      }
    }));
    
    // 結果を返す
    return new Response(JSON.stringify(processedData), {
      headers: corsHeaders
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      status: 'error'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}