// functions/api/unsplash.js
// KVストレージのキャッシュ機能を削除したシンプル版

export async function onRequest(context) {
    // リクエストの取得
    const request = context.request;
    const url = new URL(request.url);
    
    // クエリパラメータの取得
    const query = url.searchParams.get('query') || 'landscape';
    const count = parseInt(url.searchParams.get('count') || '5', 10);
    
    // 環境変数からAPIキーを取得
    const apiKey = context.env.UNSPLASH_API_KEY;
    
    // CORSヘッダー
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=600' // 10分間のブラウザキャッシュを設定
    };
    
    // OPTIONSリクエスト（プリフライト）への対応
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    try {
      // Unsplash APIの直接呼び出し（キャッシュなし）
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
      
      // 結果を返す（KVキャッシュなし）
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