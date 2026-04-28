import './instrument';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { runtimeLogger } from './lib/runtimeLogger';

const handleRootError = (message: string) => (error: unknown) => {
  if (import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development') {
    console.error(message, error);
    return;
  }

  runtimeLogger.error(message, error);
};

ReactDOM.createRoot(document.getElementById('root')!, {
  onUncaughtError: handleRootError('Uncaught React root error'),
  onCaughtError: handleRootError('Caught React root error'),
  onRecoverableError: handleRootError('Recoverable React root error'),
}).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
