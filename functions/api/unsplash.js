// functions/api/unsplash.js
// キャッシュバスティング対応版

export async function onRequest(context) {
    // リクエストの取得
    const request = context.request;
    const url = new URL(request.url);
    
    // クエリパラメータの取得
    const query = url.searchParams.get('query') || 'landscape';
    const count = parseInt(url.searchParams.get('count') || '5', 10);
    const width = parseInt(url.searchParams.get('width') || '1920', 10);
    const height = parseInt(url.searchParams.get('height') || '1080', 10);
    
    // 環境変数からAPIキーを取得
    const apiKey = context.env.UNSPLASH_API_KEY;
    
    // CORSヘッダー（キャッシュ制御を追加）
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
    
    try {
      // Unsplash APIの直接呼び出し（キャッシュバスティング対応）
      const timestamp = new Date().getTime();
      const apiUrl = `https://api.unsplash.com/photos/random?query=${query}&count=${count}&orientation=landscape&_=${timestamp}`;
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