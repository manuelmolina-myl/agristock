import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import { ThemeProvider } from '@/hooks/use-theme'
import { ErrorBoundary } from '@/components/custom/error-boundary'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

// ─── Stale chunk auto-recovery ───────────────────────────────────────────────
// When a new deploy ships, the service worker may still have an old index.html
// in cache that references JS chunks (hashed filenames) that no longer exist.
// The browser fetches them, hits Vercel's SPA fallback, and parses HTML as JS
// → "Failed to load module script: Expected a JavaScript-or-Wasm module".
//
// This listener detects that exact failure and self-heals:
//   1. Unregister every service worker
//   2. Clear all caches
//   3. Reload from network (cache bust)
// It only fires once per session so we don't loop on transient network errors.
let chunkErrorHandled = false
async function recoverFromStaleChunk() {
  if (chunkErrorHandled) return
  chunkErrorHandled = true
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.map((n) => caches.delete(n)))
    }
  } catch (err) {
    console.warn('[stale-chunk-recovery] cleanup failed', err)
  } finally {
    // Force a network-fresh reload, bypassing any HTTP cache.
    window.location.reload()
  }
}
window.addEventListener('error', (e) => {
  const msg = (e?.message ?? '').toString()
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Expected a JavaScript-or-Wasm module script')
  ) {
    void recoverFromStaleChunk()
  }
})
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e?.reason?.message ?? '').toString()
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Expected a JavaScript-or-Wasm module script')
  ) {
    void recoverFromStaleChunk()
  }
})

// ─── Sentry error monitoring ──────────────────────────────────────────────────
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Capture 10% of transactions in production, 100% in dev
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Replay only on error in production
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <TooltipProvider>
                <App />
                <Toaster position="bottom-right" richColors closeButton />
              </TooltipProvider>
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
