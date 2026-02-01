import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';

export interface ExtractedContent {
    url: string;
    title: string;
    content: string;
    contentHtml: string;
    excerpt: string;
    author?: string;
    publishedTime?: string;
    siteName: string;
    imageUrl?: string;
    hasContent: boolean;
    metadata: {
        ogImage?: string;
        ogTitle?: string;
        ogDescription?: string;
        favicon?: string;
    };
}

export function extractContent(document: Document): ExtractedContent {
    // --- PAYWALL DETECTION (Pre-Parsing) ---
    // 0. Whitelist Check
    const safeDomains = ['blog.google', 'google.com', 'youtube.com', 'wikipedia.org', 'github.com'];
    const hostname = window.location.hostname;
    const isWhitelisted = safeDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));

    // Check for common paywall indicators before we clean the DOM
    const paywallKeywords = [
        'subscribe to read',
        'subscribe for full access',
        'log in to continue',
        'already a subscriber',
        'you have reached your limit',
        'this article is for subscribers only',
        'join now to read',
        'create an account to read',
        'start your free trial',
        'unlock this article',
        // NYT and other specific ones
        'subscribe to the times',
        'read as many articles as you like',
        'create an account to read', // specific
        'register to keep reading', // specific
        'subscribe to continue' // specific
    ];

    // Check for paywall classes/IDs
    const paywallSelectors = [
        '[class*="paywall"]',
        '[id*="paywall"]',
        '[class*="gate"]',
        '[id*="gate"]',
        '[class*="subscriber-only"]',
        '[class*="premium-content"]'
    ];

    let potentialPaywallDetected = false;
    let expectedWordCount = 0;

    // JSON-LD captured fields
    let jsonLdBody = '';
    let jsonLdDate = '';
    let jsonLdAuthor = '';
    let jsonLdDescription = '';

    // 1. Check for explicit paywall elements
    if (document.querySelector(paywallSelectors.join(','))) {
        potentialPaywallDetected = true;
    }

    // 2. Check for keywords in the visible text of the body (rough check)
    const bodyText = document.body.innerText.toLowerCase();
    // Only check the last 20% of the text or the last 1000 chars to avoid false positives in headers
    const footerText = bodyText.slice(-1000);
    if (paywallKeywords.some(keyword => footerText.includes(keyword))) {
        potentialPaywallDetected = true;
    }

    // 3. Check JSON-LD for "isAccessibleForFree": false
    // Schema.org standard for paywalled content
    try {
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        jsonLdScripts.forEach(script => {
            if (!script.textContent) return;

            try {
                const data = JSON.parse(script.textContent);
                const items = Array.isArray(data) ? data : [data];

                for (const item of items) {
                    // Capture nice-to-have metadata while parsing
                    if (item['articleBody']) jsonLdBody = item['articleBody'];
                    if (item['datePublished']) jsonLdDate = item['datePublished'];
                    if (item['description']) jsonLdDescription = item['description'];
                    if (!jsonLdAuthor && item['author']) {
                        if (typeof item['author'] === 'string') jsonLdAuthor = item['author'];
                        else if (item['author'].name) jsonLdAuthor = item['author'].name;
                        else if (Array.isArray(item['author']) && item['author'][0]?.name) jsonLdAuthor = item['author'][0].name;
                    }

                    if (potentialPaywallDetected) continue;

                    // Capture word count if available
                    if (item['wordCount']) {
                        const count = parseInt(item['wordCount'], 10);
                        if (!isNaN(count) && count > expectedWordCount) {
                            expectedWordCount = count;
                        }
                    }

                    // Check for explicit false value
                    const isNotFree = item['isAccessibleForFree'] === false || item['isAccessibleForFree'] === 'False' || item['isAccessibleForFree'] === 'false';

                    if (isNotFree) {
                        // If it's not free, we check if the defined paywall element is actually present in the DOM.
                        // If the user is logged in, this element should be absent.
                        if (item['hasPart']) {
                            const parts = Array.isArray(item['hasPart']) ? item['hasPart'] : [item['hasPart']];
                            for (const part of parts) {
                                if (part['cssSelector']) {
                                    const el = document.querySelector(part['cssSelector']) as HTMLElement;
                                    // Only trigger if the element exists AND is visible (not hidden by CSS)
                                    // offsetParent checks if it's being rendered
                                    if (el && el.offsetParent !== null) {
                                        potentialPaywallDetected = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if (potentialPaywallDetected) break;
                }
            } catch {
                // Ignore invalid JSON
            }
        });
    } catch (e) {
        console.warn('Error checking JSON-LD:', e);
    }

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

    // --- PAYWALL CONFIRMATION (Post-Parsing) ---
    // Determine if we actually have content
    let hasContent = true;
    const contentLength = article.textContent?.length || 0;

    // Use JSON-LD description as excerpt fallback
    if (!article.excerpt && jsonLdDescription) {
        article.excerpt = jsonLdDescription;
    }

    // Use JSON-LD body if it provides significantly better quality text than the DOM extraction
    // This is common in "soft" paywalls where the DOM is truncated but metadata is full for SEO.
    // SAFETY: We ONLY does this if we haven't detected a paywall. If the user is blocked,
    // we must respect that and NOT grab the hidden SEO text.
    let finalContent = article.textContent || '';
    if (!potentialPaywallDetected && jsonLdBody && jsonLdBody.length > finalContent.length + 500) {
        finalContent = jsonLdBody;
    }

    // Calculate word count of extracted text
    const cleanText = finalContent;
    const actualWordCount = cleanText.split(/\s+/).length;

    // Skip paywall heuristics if whitelisted
    if (!isWhitelisted) {
        // Heuristic 0: Word Count Ratio Validation (The "Teaser Check")
        // If metadata promised >500 words and we capture <30% of that, it's a teaser.
        if (expectedWordCount > 500 && actualWordCount < (expectedWordCount * 0.3)) {
            hasContent = false;
        }

        // Heuristic 1: Very short content + Paywall detected
        if (contentLength < 1000 && potentialPaywallDetected) {
            hasContent = false;
        }

        // Heuristic 2: Extremely short content (likely just a snippet) regardless of paywall detection
        if (contentLength < 300) {
            hasContent = false;
        }

        // Heuristic 3: Check the extracted text itself for paywall keywords (Readability might have kept them)
        const extractedText = finalContent.toLowerCase();
        // Check the last 1500 chars to catch paywalls buried under "Related Articles" lists
        const lastParagraph = extractedText.slice(-1500);

        if (paywallKeywords.some(keyword => lastParagraph.includes(keyword))) {
            hasContent = false;
        }
    }

    return {
        url: window.location.href,
        title: article.title || '',
        content: finalContent,
        contentHtml: cleanHtml,
        excerpt: article.excerpt || '',
        siteName: article.siteName || '',
        author: jsonLdAuthor || article.byline || undefined,
        publishedTime: jsonLdDate || article.publishedTime || undefined,
        imageUrl: ogImage,
        hasContent,
        metadata: {
            ogImage,
            ogTitle,
            ogDescription: ogDescription || jsonLdDescription,
            favicon: favicon || undefined
        }
    };
}
