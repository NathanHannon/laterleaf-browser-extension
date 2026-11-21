import { useState, useEffect, useId } from 'react'
import { useAuth, SignIn, UserButton } from '@clerk/chrome-extension'
import { saveArticle, getUserPreferences } from '../lib/api'
import './Popup.scss'

function BrandLogo() {
  const gradientId = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="24"
      height="24"
      fill="none"
      className="brand-logo"
      role="img"
      aria-label="LaterLeaf logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="15" y1="56" x2="50" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--primary-hover, #15803d)" />
          <stop offset="55%" stopColor="var(--primary-color, #22c55e)" />
          <stop offset="100%" stopColor="var(--primary-color, #4ade80)" />
        </linearGradient>
      </defs>
      <path
        d="M 15 55 L 15 31 C 15 15, 29 7, 48 7 C 49.5 17, 49 25, 49 33 L 49 55 C 49 56.8, 46.9 57.8, 45.5 56.6 L 32 45.5 L 18.5 56.6 C 17.1 57.8, 15 56.8, 15 55 Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M 48 7 C 37 15, 30 26, 28 38 L 32 41 L 49 55 L 49 33 C 49 25, 49.5 17, 48 7 Z"
        fill="#ffffff"
        fillOpacity="0.16"
      />
      <path d="M 24 38 C 27 27, 33 19, 41 14" stroke="#052e16" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M 29 26 L 25.5 20.5" stroke="#052e16" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

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
    async function applyPreferences() {
      if (userId) {
        try {
          const token = await getToken();
          if (token) {
            const user = await getUserPreferences(token);
            if (user) {
              const appearance = user.preferredAppearance || 'light';
              const theme = user.preferredTheme || 'default';
              document.documentElement.setAttribute('data-appearance', appearance);
              document.documentElement.setAttribute('data-theme', theme);
            }
          }
        } catch (err) {
          console.error('Failed to load user preferences', err);
        }
      }
    }
    applyPreferences();
  }, [userId, getToken]);

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
        <div className="popup-brand">
          <BrandLogo />
          <h2>LaterLeaf</h2>
        </div>
        <p>Please sign in to save articles.</p>
        <SignIn />
      </div>
    )
  }

  return (
    <div className="popup-container">
      <header>
        <div className="popup-brand">
          <BrandLogo />
          <h2>LaterLeaf</h2>
        </div>
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
