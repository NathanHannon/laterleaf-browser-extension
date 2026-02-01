const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface SaveArticleData {
    url: string;
    title?: string;
    html?: string;
    [key: string]: unknown;
}

export async function saveArticle(data: SaveArticleData, token: string) {
    console.log('📡 [API] saveArticle called with URL:', data.url);
    console.log('📡 [API] Target Endpoint:', `${API_URL}/articles/from-extension`);

    const response = await fetch(`${API_URL}/articles/from-extension`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });

    console.log('📡 [API] Response status:', response.status);

    if (!response.ok) {
        const error = await response.json();
        console.error('❌ [API] Error response:', error);
        throw new Error(error.error?.message || 'Failed to save article');
    }

    const result = await response.json();
    console.log('✅ [API] Success response:', result);
    return result;
}
