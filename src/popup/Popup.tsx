import { useState, useEffect } from 'react'
import { useAuth, SignIn, UserButton } from '@clerk/chrome-extension'
import { saveArticle } from '../lib/api'
import './Popup.scss'

interface ArticleData {
  title: string;
  excerpt?: string;
  url: string;
  content?: string;
  [key: string]: string | undefined;
}

type ExtractionResponse =
  | { success: true; data: ArticleData }
  | { success: false; error?: string };

function Popup() {
  const { isLoaded, userId, getToken } = useAuth()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [articleData, setArticleData] = useState<ArticleData | null>(null)

  useEffect(() => {
    console.log('🚀 [Popup] Mounted, querying active tab...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      console.log('🚀 [Popup] Active tab found:', activeTab?.id, activeTab?.url);

      if (activeTab?.id) {
        // Check for restricted URLs
        if (activeTab.url?.startsWith('chrome://') ||
          activeTab.url?.startsWith('edge://') ||
          activeTab.url?.startsWith('about:') ||
          activeTab.url?.startsWith('chrome-extension://') ||
          activeTab.url?.includes('chrome.google.com/webstore')) {
          console.warn('⚠️ [Popup] Restricted URL detected');
          setStatus('error');
          setErrorMessage('Cannot save this type of page.');
          return;
        }

        // Send message to content script to extract content
        console.log('🚀 [Popup] Sending EXTRACT_CONTENT message to tab', activeTab.id);
        chrome.tabs.sendMessage(activeTab.id, { action: 'EXTRACT_CONTENT' }, (response: ExtractionResponse | undefined) => {
          console.log('🚀 [Popup] Received response from content script:', response);

          if (chrome.runtime.lastError) {
            console.error('❌ [Popup] Runtime error:', chrome.runtime.lastError);
            setStatus('error');

            const msg = chrome.runtime.lastError.message;
            if (msg && msg.includes("Receiving end does not exist")) {
              setErrorMessage('Please refresh this page to enable the extension.');
            } else {
              setErrorMessage('Could not connect to page. Try reloading.');
            }
            return;
          }

          if (response && response.success) {
            console.log('✅ [Popup] Extraction successful:', response.data.title);
            setArticleData(response.data);
          } else {
            console.error('❌ [Popup] Extraction failed:', response?.error);
            setStatus('error');
            setErrorMessage(response?.error || 'Failed to extract content');
          }
        });
      } else {
        console.warn('⚠️ [Popup] No active tab ID found');
      }
    });
  }, []);

  const handleSave = async () => {
    console.log('💾 [Popup] handleSave clicked');
    if (!articleData) {
      console.warn('⚠️ [Popup] No article data to save');
      return;
    }

    try {
      setStatus('saving');
      console.log('🔐 [Popup] Getting auth token...');
      const token = await getToken();
      if (!token) {
        console.error('❌ [Popup] No token available');
        throw new Error('Not authenticated');
      }
      console.log('🔐 [Popup] Token received (first 10 chars):', token.substring(0, 10) + '...');

      console.log('📡 [Popup] Calling saveArticle API...');
      await saveArticle(articleData, token);
      console.log('✅ [Popup] Article saved successfully!');
      setStatus('saved');
    } catch (error) {
      console.error('❌ [Popup] Save failed:', error);
      setStatus('error');
      setErrorMessage((error as Error).message);
    }
  };

  if (!isLoaded) {
    return <div>Loading...</div>
  }

  if (!userId) {
    return (
      <div className="popup-container">
        <h2>LaterLeaf</h2>
        <p>Please sign in to save articles.</p>
        <SignIn />
      </div>
    )
  }

  return (
    <div className="popup-container">
      <header>
        <h2>LaterLeaf</h2>
        <UserButton />
      </header>

      <main>
        {status === 'idle' && (
          <>
            {articleData ? (
              <div className="article-preview">
                <h3>{articleData.title}</h3>
                <p>{articleData.excerpt}</p>
                <button onClick={handleSave} className="save-button">
                  Save to LaterLeaf
                </button>
              </div>
            ) : (
              <p>Extracting content...</p>
            )}
          </>
        )}

        {status === 'saving' && <p>Saving...</p>}

        {status === 'saved' && (
          <div className="success-message">
            <h3>Saved!</h3>
            <p>Article has been added to your library.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="error-message">
            <h3>Error</h3>
            <p>{errorMessage}</p>
            <button onClick={() => setStatus('idle')}>Try Again</button>
          </div>
        )}
      </main>
    </div>
  )
}

export default Popup
