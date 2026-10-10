import React from 'react';
import * as Sentry from '@sentry/react';

interface ErrorBoundaryState {
  error: Error | null;
}

/** Last-resort crash screen (no layout dependency — plain centered card). */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    try {
      console.error('[zut] UI crash:', error);
      try {
        Sentry.captureException(error);
      } catch {
        /* sentry optional (no-op without DSN) */
      }
      localStorage.setItem(
        'zut:last-crash',
        JSON.stringify({
          message: error?.message ?? String(error),
          stack: String(error?.stack ?? '').slice(0, 2000),
          at: new Date().toISOString(),
        }),
      );
    } catch {
      /* logging must never throw */
    }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message ?? 'Unknown error';
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-[#141416] text-neutral-200 select-none p-4">
          <div className="max-w-md w-full rounded-2xl border border-neutral-700 bg-[#18181c] p-6 text-center shadow-2xl">
            <h1 className="text-sm font-semibold text-white">Something went wrong</h1>
            <p className="mt-2 text-xs text-neutral-400 font-mono break-words">{msg}</p>
            <p className="mt-2 text-xs text-neutral-400">
              Your files on this device are intact — reloading restores the last saved state.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
            >
              Reload IDE
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
