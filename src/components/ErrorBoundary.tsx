import { Component, type ErrorInfo, type ReactNode } from 'react';
import { runtimeLogger } from '../lib/runtimeLogger';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    runtimeLogger.error('Pluto UI error boundary caught an error.', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <div
          style={{
            width: 'min(100%, 460px)',
            padding: '28px',
            border: '1px solid var(--card-border)',
            borderRadius: '16px',
            background: 'var(--card-bg)',
            boxShadow: 'var(--panel-shadow)',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: '1.5rem' }}>Pluto needs a quick refresh</h1>
          <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Something unexpected happened while loading this view. Your account and saved chats are safe.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              borderRadius: '12px',
              padding: '12px 18px',
              cursor: 'pointer',
              background: 'var(--brand-gradient)',
              color: 'var(--user-bubble-text)',
              fontWeight: 700,
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
