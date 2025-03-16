// functions/api/unsplash.js
// Cloudflare Pages Functionsとして配置

export async function onRequest(context) {
    // リクエストの取得
    const request = context.request;
    const url = new URL(request.url);
    
    // クエリパラメータの取得
    const query = url.searchParams.get('query') || 'landscape';
    const count = parseInt(url.searchParams.get('count') || '5', 10);
    
    // キャッシュキーの作成
    const cacheKey = `${query}-${count}`;
    
    // 環境変数からAPIキーを取得
    const apiKey = context.env.UNSPLASH_API_KEY;
    
    // CORSヘッダー
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Content-Type': 'application/json'
    };
    
    try {
      // KVストレージがある場合はキャッシュをチェック
      if (context.env.UNSPLASH_CACHE) {
        const cachedData = await context.env.UNSPLASH_CACHE.get(cacheKey, 'json');
        
        if (cachedData && cachedData.timestamp) {
          const now = Date.now();
          // 3時間以内のキャッシュなら使用
          if (now - cachedData.timestamp < 3 * 60 * 60 * 1000) {
            return new Response(JSON.stringify(cachedData.data), {
              headers: corsHeaders
            });
          }
        }
      }
      
      // Unsplash APIの呼び出し
      const apiUrl = `https://api.unsplash.com/photos/random?query=${query}&count=${count}&orientation=landscape`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Client-ID ${apiKey}`,
          'Accept-Version': 'v1'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Unsplash API responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      // 必要なデータだけを抽出
      const processedData = data.map(photo => ({
        id: photo.id,
        url: photo.urls.regular,
        download_url: photo.links.download,
        width: photo.width,
        height: photo.height,
        color: photo.color,
        description: photo.description || photo.alt_description,
        location: photo.location?.name,
        photographer: {
          name: photo.user.name,
          username: photo.user.username,
          profile: photo.user.links.html
        }
      }));
      
      // KVストレージがある場合はキャッシュに保存
      if (context.env.UNSPLASH_CACHE) {
        await context.env.UNSPLASH_CACHE.put(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: processedData
        }), {expirationTtl: 10800}); // 3時間（秒単位）
      }
      
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