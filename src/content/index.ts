import { extractContent } from './extractor';

console.log('LaterLeaf Content Script Loaded');

chrome.runtime.onMessage.addListener((request: { action: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    console.log('📨 [Content] Received message:', request.action);

    if (request.action === 'EXTRACT_CONTENT') {
        try {
            console.log('🔍 [Content] Starting extraction...');
            const content = extractContent(document);
            console.log('✅ [Content] Extraction complete:', content.title);
            console.log('📤 [Content] Sending response back to popup');
            sendResponse({ success: true, data: content });
        } catch (error) {
            console.error('❌ [Content] Extraction failed:', error);
            sendResponse({ success: false, error: (error as Error).message });
        }
    }
    return true; // Keep the message channel open for async response
});
