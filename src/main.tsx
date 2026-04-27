import './instrument';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)', color: 'var(--foreground)' }}>Something went wrong. Please refresh Pluto.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
