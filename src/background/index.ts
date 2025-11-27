console.log('Background service worker started');

const RESTRICTED_PREFIXES = [
    'chrome://',
    'edge://',
    'about:',
    'chrome-extension://',
    'view-source:',
    'file://'
];

const RESTRICTED_DOMAINS = [
    'chrome.google.com/webstore',
    'chromewebstore.google.com'
];

function isRestrictedUrl(url: string | undefined): boolean {
    if (!url) return true; // Default to restricted if no URL
    
    if (RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix))) {
        return true;
    }

    if (RESTRICTED_DOMAINS.some(domain => url.includes(domain))) {
        return true;
    }

    return false;
}

function updateIconState(tabId: number, url: string | undefined) {
    if (isRestrictedUrl(url)) {
        chrome.action.disable(tabId);
    } else {
        chrome.action.enable(tabId);
    }
}

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        updateIconState(tabId, tab.url);
    }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateIconState(activeInfo.tabId, tab.url);
});

