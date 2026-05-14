import React from 'react';
export class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: string | null}> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message + "\n" + error.stack }; }
  render() {
    if (this.state.error) return <div className="p-8 text-black bg-white break-words absolute inset-0 z-[9999] overflow-auto"><h1 className="text-red-500 font-bold mb-4">React Crash</h1><pre className="text-xs whitespace-pre-wrap">{this.state.error}</pre></div>;
    return this.props.children;
  }
}
