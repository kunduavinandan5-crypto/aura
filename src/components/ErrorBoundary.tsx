import React from 'react';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-[#07080e] px-6 text-center text-white"
      >
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-zinc-400">Your chats are saved. Reload to continue.</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold hover:bg-indigo-500"
        >
          Reload
        </button>
      </div>
    );
  }
}
