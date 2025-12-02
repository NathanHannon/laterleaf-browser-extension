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
        '[class*="subscribe"]', '[class*="newsletter"]',

        // Common ad/nav/sidebar patterns (IDs)
        '[id*="nav"]', '[id*="menu"]', '[id*="sidebar"]',
        '[id*="banner"]', '[id*="ad"]',

        // Structural elements
        'aside', 'nav', 'footer', 'header',

        // Reuters / News specific clutter
        '[data-testid="tab-list"]', // Tabs like Summary/Companies
        '[data-testid="Title"]', // Sometimes redundant title
        '[data-testid="Button"]', // Generic buttons
        '[class*="author-bio"]', // Author bios
        '[class*="about-author"]',
        '[class*="read-more"]',
        '[class*="related-content"]',
        '[class*="more-stories"]',
        '[aria-label*="opens new tab" i]', // Link clutter
        'span[class*="opens-new-tab"]',
        'figcaption',
        '[class*="caption"]',
        '[class*="image-caption"]',
        '[data-testid="ImageCaption"]',
        '[data-testid="key-points"]',
        '[class*="key-points"]',
    ];

    selectorsToRemove.forEach(selector => {
        try {
            documentClone.querySelectorAll(selector).forEach(el => el.remove());
        } catch {
            // Ignore invalid selectors
        }
    });

    // Remove "Summary" / "Key Points" sections based on text content
    const potentialHeaders = Array.from(documentClone.querySelectorAll('h2, h3, h4, h5, h6, strong, b, div, span'));
    for (const el of potentialHeaders) {
        const text = el.textContent?.trim();
        if (text === 'Summary' || text === 'Key Points') {
            // Case 1: Header followed immediately by a list
            const next = el.nextElementSibling;
            if (next && (next.tagName === 'UL' || next.tagName === 'OL')) {
                el.remove();
                next.remove();
                continue;
            }

            // Case 2: Header inside a container that is primarily a list
            const parent = el.parentElement;
            if (parent && parent.textContent && parent.textContent.length < 1000) {
                if (parent.querySelector('ul, ol')) {
                    parent.remove();
                }
            }
        }
    }

    // Handle standalone stock ticker links (e.g. "AAPL.O")
    // Instead of removing them, we convert their container to a span to ensure they flow inline
    const links = documentClone.querySelectorAll('a');
    links.forEach(link => {
        const text = link.textContent?.trim() || '';
        // Matches tickers like AAPL.O, (AAPL.O), or similar patterns
        if (/^\(?[A-Z]{2,6}\.[A-Z]{1,3}\)?$/.test(text)) {
            // Check if it's isolated (parent has no other meaningful text)
            const parent = link.parentElement;
            if (parent) {
                const parentText = parent.textContent?.trim() || '';
                // If the parent's text is identical to the link's text (ignoring whitespace), it's isolated.
                if (parentText === text) {
                    // Convert block parents to spans to force inline behavior
                    if (['DIV', 'P', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(parent.tagName)) {
                        const span = documentClone.createElement('span');
                        span.innerHTML = parent.innerHTML;
                        parent.replaceWith(span);
                    }
                }
            }
        }
    });

    // Text-based cleaning using TreeWalker for better performance and precision
    const walker = documentClone.createTreeWalker(documentClone.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const text = node.textContent || '';

        // 1. "Opens new tab" variations (Case insensitive)
        if (text.match(/opens new tab/i)) {
            node.textContent = text.replace(/,?\s*opens new tab/gi, '');
        }

        // 2. "Purchase Licensing Rights"
        if (text.includes('Purchase Licensing Rights')) {
            node.textContent = node.textContent?.replace(/Purchase Licensing Rights/g, '') || '';
        }

        // 3. Image counters/captions: "Item 1 of 3", "[1/3]"
        if (text.match(/^(Item\s+\d+\s+of\s+\d+|\[\d+\/\d+\])/i) && text.length < 500) {
            node.textContent = '';
        }

        // 4. "Companies" header (standalone text)
        if (text.trim() === 'Companies') {
            node.textContent = '';
        }
    }

    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (!article) {
        throw new Error('Failed to parse article');
    }

    // Post-processing: Remove common news footers (Reuters, etc.)
    // We do this on the parsed content to catch things Readability missed
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content || '';
    const paragraphs = Array.from(tempDiv.querySelectorAll('p, div'));

    // Check the last few elements for footer text
    // Reuters: "Reporting by X; Editing by Y", "Our Standards: The Thomson Reuters Trust Principles."
    for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 5); i--) {
        const el = paragraphs[i];
        const text = el.textContent || '';

        if (text.includes('Reporting by') ||
            text.includes('Editing by') ||
            text.includes('Our Standards:') ||
            text.includes('The Thomson Reuters Trust Principles') ||
            text.includes('All quotes delayed a minimum of 15 minutes') ||
            text.includes('Copyright') && text.length < 100) {
            el.remove();
        }
    }
    article.content = tempDiv.innerHTML;

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

    let favicon = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
        document.querySelector('link[rel="icon"]')?.getAttribute('href') ||
        document.querySelector('link[rel="shortcut icon"]')?.getAttribute('href');

    // Resolve relative URLs for favicon
    if (favicon) {
        try {
            favicon = new URL(favicon, document.baseURI).href;
        } catch (e) {
            console.warn('Failed to resolve favicon URL:', e);
        }
    } else {
        // Fallback to default location
        try {
            favicon = new URL('/favicon.ico', document.baseURI).href;
        } catch {
            // Ignore fallback errors
        }
    }

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
            favicon: favicon || undefined
        }
    };
}
