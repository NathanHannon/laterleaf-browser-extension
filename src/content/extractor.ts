import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';

export interface ExtractedContent {
    url: string;
    title: string;
    content: string;
    contentHtml: string;
    excerpt: string;
    siteName: string;
    imageUrl?: string;
    metadata: {
        ogImage?: string;
        ogTitle?: string;
        ogDescription?: string;
        favicon?: string;
    };
}

export function extractContent(document: Document): ExtractedContent {
    // Serialize and re-parse to avoid Custom Element conflicts (e.g. __CE_registry errors)
    // and to ensure a clean DOM for Readability.
    const serializer = new XMLSerializer();
    const htmlStr = serializer.serializeToString(document);
    const parser = new DOMParser();
    const documentClone = parser.parseFromString(htmlStr, 'text/html');

    // Restore base URI for relative link resolution
    if (!documentClone.querySelector('base')) {
        const base = documentClone.createElement('base');
        base.href = document.baseURI;
        documentClone.head.appendChild(base);
    }

    // Remove AI summaries and other clutter before parsing
    const selectorsToRemove = [
        // AI Summaries & Google Overviews
        '[class*="google-summary"]', '[id*="google-summary"]',
        '[class*="ai-overview"]', '[id*="ai-overview"]',
        '[aria-label="AI Overview"]',
        '[class*="key-takeaways"]',
        '[class*="tldr"]',
        // Specific Google Blog AI Summary selector
        '[data-component="uni-ai-generated-summary"]',
        // Google Blog Author Image (in Hero Menu)
        '[data-analytics-module*="Hero Menu"] figure',

        // Common ad/nav/sidebar patterns (Classes)
        '[class*="nav"]', '[class*="menu"]', '[class*="sidebar"]',
        '[class*="banner"]', '[class*="advert"]', '[class*="social"]',
        '[class*="share"]', '[class*="cookie"]', '[class*="popup"]',

        // Common ad/nav/sidebar patterns (IDs)
        '[id*="nav"]', '[id*="menu"]', '[id*="sidebar"]',
        '[id*="banner"]', '[id*="ad"]',

        // Structural elements
        'aside', 'nav', 'footer', 'header'
    ];

    selectorsToRemove.forEach(selector => {
        try {
            documentClone.querySelectorAll(selector).forEach(el => el.remove());
        } catch {
            // Ignore invalid selectors
        }
    });

    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (!article) {
        throw new Error('Failed to parse article');
    }

    const cleanHtml = DOMPurify.sanitize(article.content || '', {
        USE_PROFILES: { html: true },
        // More aggressive tag removal to catch custom elements and media
        FORBID_TAGS: [
            'img', 'figure', 'picture', 'video', 'audio', 'iframe',
            'uni-image-full-width', 'uni-youtube-player-article', 'uni-related-content-tout'
        ],
        FORBID_ATTR: ['style', 'class', 'id', 'data-component', 'data-analytics-module'], // Also strip data attributes
    });

    // Extract metadata
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || undefined;
    const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || undefined;
    const favicon = document.querySelector('link[rel="icon"]')?.getAttribute('href') || undefined;

    return {
        url: window.location.href,
        title: article.title || '',
        content: article.textContent || '',
        contentHtml: cleanHtml,
        excerpt: article.excerpt || '',
        siteName: article.siteName || '',
        imageUrl: ogImage,
        metadata: {
            ogImage,
            ogTitle,
            ogDescription,
            favicon
        }
    };
}
