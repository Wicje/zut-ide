import React from 'react';

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
      console.error('[composer-ghost] UI crash:', error);
    } catch {
      /* logging must never throw */
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-[#141416] text-neutral-200 select-none">
          <div className="max-w-md rounded-2xl border border-neutral-700 bg-[#18181c] p-6 text-center shadow-2xl">
            <h1 className="text-sm font-semibold text-white">Something went wrong</h1>
            <p className="mt-2 text-xs text-neutral-400">
              Your files on this device are intact — reloading restores the last saved state.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
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
