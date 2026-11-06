import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { isTerminalClient } from './lib/runtime.ts';
import './index.css';

// Set before the first paint so the terminal client never flashes the
// wallpaper/animations it is about to turn off.
if (isTerminalClient()) {
  document.documentElement.dataset.terminal = '1';
}

// Error tracking is a no-op until VITE_SENTRY_DSN is set
// (sentry.io project → Settings → Client Keys). No account needed to run.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
