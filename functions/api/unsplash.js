// functions/api/unsplash.js
// 画面サイズに基づいて最適な解像度のイメージを提供

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
      // Unsplash APIの直接呼び出し
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
        
        // 小さな画面にはsmallを使用
        if (screenWidth <= 640) {
          return photo.urls.small;
        }
        // 中程度の画面にはregularを使用
        else if (screenWidth <= 1920) {
          return photo.urls.regular;
        }
        // 大きな画面にはfullを使用
        else if (screenWidth <= 2560) {
          return photo.urls.full;
        }
        // 超高解像度の画面にはrawをリサイズして使用
        else {
          // rawには幅と高さを指定できる
          return `${photo.urls.raw}&w=${screenWidth}&fit=max`;
        }
      };
      
      // 必要なデータだけを抽出
      const processedData = data.map(photo => ({
        id: photo.id,
        url: getOptimalImageUrl(photo, width, height),
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