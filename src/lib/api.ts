const legacyApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const legacyApiVersion = legacyApiUrl?.match(/\/(v\d+)\/?$/)?.[1];
const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ||
    legacyApiUrl?.replace(/\/v\d+\/?$/, '') ||
    'http://localhost:3000/api';
const apiVersion = import.meta.env.VITE_API_URL_VERSION || legacyApiVersion || 'v1';

export function apiUrl(path: string, version = apiVersion): string {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    const normalizedVersion = version.replace(/^\/+|\/+$/g, '');
    const normalizedPath = path.replace(/^\/+/, '');
    return `${normalizedBaseUrl}/${normalizedVersion}/${normalizedPath}`;
}

interface SaveArticleData {
    url: string;
    title?: string;
    html?: string;
    [key: string]: unknown;
}

export async function saveArticle(data: SaveArticleData, token: string) {
    console.log('📡 [API] saveArticle called with URL:', data.url);
    console.log('📡 [API] Target Endpoint:', apiUrl('/articles/from-extension'));

    const response = await fetch(apiUrl('/articles/from-extension'), {
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

export async function getUserPreferences(token: string) {
    const response = await fetch(apiUrl('/users/me'), {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch preferences');
    }

    return response.json();
}
