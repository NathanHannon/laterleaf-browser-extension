# LaterLeaf Browser Extension Architecture

## Overview
A lightweight, "Save & Go" browser extension built with **React, TypeScript, and Vite**. Its single purpose is to extract content perfectly from the user's current tab and send it to LaterLeaf.

**Philosophy:** The extension is a **capture tool**, not a consumption tool. All advanced features (reading, AI summaries, audio, tagging) happen in the main web app. This keeps the extension fast, maintainable, and focused on bypassing paywalls/bot-blockers via client-side extraction.

## 1. Tech Stack & Tools
-   **Framework**: React 18 + TypeScript
-   **Build Tool**: Vite + `@crxjs/vite-plugin` (Hot Module Replacement for extensions)
-   **Styling**: SCSS / SASS (matches `rct-laterleaf` design system variables & mixins)
-   **State/Auth**: Clerk (via Chrome Storage sync)
-   **Extraction**: `@mozilla/readability` + `dompurify` (running in Content Script)

## 2. Project Structure
Recommended location: `Web/browser-extension`

```text
browser-extension/
├── manifest.json
├── package.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   └── index.ts        # Service Worker (API calls, context menus)
│   ├── content/
│   │   ├── index.ts        # Content Script entry
│   │   └── extractor.ts    # Readability logic & DOM serialization
│   ├── popup/
│   │   ├── index.tsx       # React Entry
│   │   ├── Popup.tsx       # Simple "Save" UI
│   │   ├── Popup.module.scss # Component-scoped styles
│   │   └── components/     # Shared UI components
│   ├── lib/
│   │   ├── api.ts          # Typed API client
│   │   └── storage.ts      # Chrome storage wrappers
│   └── assets/
│       ├── icons/          # Extension icons
│       └── styles/         # Global styles
│           ├── _variables.scss # Shared variables from main app
│           └── main.scss       # Global resets
└── public/                 # Static public files
```

## 3. Data Flow & Architecture

### The "Client-Side Extraction" Pattern
The extension scrapes the page *as the user sees it*, bypassing server-side blocking.

1.  **Extraction (Extension)**:
    *   User clicks "Save".
    *   Content Script runs `@mozilla/readability` on the current DOM.
    *   **Crucial Step**: The extension generates both the `content` (clean text for AI) and `contentHtml` (clean HTML for reading).
    *   Metadata (OG tags, favicon, author) is parsed from the DOM.

2.  **Transmission (API)**:
    *   Extension sends a POST request to `/api/articles/from-extension`.
    *   Payload includes: `url`, `title`, `content`, `contentHtml`, `excerpt`, `imageUrl`, `metadata`.

3.  **Storage (Backend)**:
    *   Backend receives the payload.
    *   **Deduplication**: Checks if `url` already exists.
    *   **Storage**: Saves to `Article` table. The database record is identical to a server-scraped article.
    *   **Junction**: Creates `UserArticle` link.

4.  **Post-Processing (Async)**:
    *   Backend triggers background jobs for **Embeddings** (Vector Search) and **Summarization** (Gemini).
    *   These run exactly the same as if the article came from the web app.

## 4. API Contract

### Endpoint: `POST /articles/from-extension`

**Request Body:**
```typescript
interface ExtensionArticlePayload {
  url: string;
  title: string;
  content: string;      // Plain text for AI/Embeddings
  contentHtml: string;  // Cleaned HTML for Reader View
  excerpt?: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
  siteName?: string;
  // Raw metadata for fallback
  metadata: {
    ogImage?: string;
    ogTitle?: string;
    ogDescription?: string;
    favicon?: string;
  }
}
```

**Backend Logic (Controller):**
```typescript
// 1. Check if Article exists by URL
let article = await articleRepo.findOne({ where: { url } });

if (!article) {
  // 2. Create new Article (Skipping ContentExtractionService)
  // We trust the extension's extraction
  article = await articleRepo.create({
    url,
    title,
    content,           // Provided by extension
    contentHtml,       // Provided by extension
    excerpt,
    imageUrl,
    siteName,
    // ... map other fields
    extractionMethod: 'extension' // Internal tracking only
  });
  
  // 3. Trigger Background Jobs (Same as server-side flow)
  await jobQueue.addEmbeddingJob(article.id);
  await jobQueue.addSummaryJob(article.id);
}

// 4. Link to User
await userArticleRepo.create({ userId, articleId: article.id });
```

## 5. Implementation Phases

### Phase 1: The "Pocket" Killer (Core)
-   Set up Vite + CRXJS project structure.
-   Implement `Readability` in Content Script.
-   Create `/articles/from-extension` endpoint in LoopBack.
-   Basic Popup with "Save" button and Login state (Clerk).

### Phase 2: Enhanced Experience
-   **Context Menu**: Right-click to save.
-   **Dynamic Icon**: Show saved status (filled/outline icon) based on current tab URL.
-   **Duplicate Detection**: Extension checks if URL is already saved before extracting.

### Phase 3: AI Integration
-   Show "Generating Summary..." in the popup immediately after save.
-   Stream the summary back to the popup in real-time as it's generated.
-   Allow user to edit tags and title before saving.

### Phase 4: Polish & Optimize
-   Improve extraction heuristics (handle more edge cases).
-   Optimize performance (reduce extension size, improve speed).
-   Enhance error handling and user feedback.

## Benefits Summary

### For Users:
- ✅ Works with ANY site they can access (including paywalled)
- ✅ One-click saving from anywhere
- ✅ Perfect extraction quality
- ✅ Instant feedback

### For You:
- ✅ Solves tough site extraction without APIs
- ✅ No scraping infrastructure costs
- ✅ Competitive advantage over Pocket
- ✅ Higher user engagement (extension keeps you top-of-mind)

### Technical:
- ✅ Leverages user's legitimate site access
- ✅ Impossible to block (real browser context)
- ✅ Scales with users (no server load for extraction)
- ✅ Hybrid fallback maintains web-only functionality

This architecture gives you the perfect solution: extension users get perfect extraction for any site, while web-only users still get your current (good enough) server-side extraction.