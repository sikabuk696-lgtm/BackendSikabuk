import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Enable offline-first PWA support via service worker.
// Switch to .unregister() below if you need to disable it.
serviceWorkerRegistration.register({
  onSuccess: () => console.log('[SikaBuk] App cached for offline use.'),
  onUpdate: (registration) => {
    // Prompt users when a new version is available (optional: show a toast)
    console.log('[SikaBuk] New version available. Reload to update.');
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  },
});
