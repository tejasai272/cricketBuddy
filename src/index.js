import React from 'react';
import ReactDOM from 'react-dom/client';

// Import CSS and App
import './index.css';
import App from './App';

// Ensure DOM is ready before mounting
function mount() {
  console.log('[App] Mount called, document.readyState:', document.readyState);
  
  const rootElement = document.getElementById('root');
  console.log('[App] Root element found:', !!rootElement, rootElement);
  
  if (!rootElement) {
    console.error('[App] ERROR: root element not found! Available elements:', document.body.innerHTML.substring(0, 500));
    setTimeout(mount, 500); // Retry
    return;
  }
  
  if (!(rootElement instanceof Element)) {
    console.error('[App] ERROR: root is not a DOM Element!', typeof rootElement, rootElement.constructor.name);
    setTimeout(mount, 500); // Retry
    return;
  }
  
  console.log('[App] Creating React root...');
  try {
    const root = ReactDOM.createRoot(rootElement);
    console.log('[App] React root created, rendering...');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('[App] ✓ App rendered successfully');
  } catch (err) {
    console.error('[App] ERROR rendering:', err.message, err);
  }
}

// Delay to ensure DOM is definitely ready
console.log('[App] Initial load, document.readyState:', document.readyState);

if (document.readyState === 'loading') {
  console.log('[App] DOM loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] DOMContentLoaded fired');
    mount();
  });
} else {
  console.log('[App] DOM ready, mounting now...');
  // Give it an extra tick to be safe
  setTimeout(mount, 0);
}

// ============================================================
// PWA Service Worker Registration for Offline Support
// ============================================================
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('[PWA] ✓ Service Worker registered successfully');
        console.log('[PWA] Scope:', registration.scope);
        
        // Check for updates every minute
        setInterval(() => {
          registration.update();
        }, 60000);
        
        // Listen for controller change (new service worker activated)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[PWA] Service Worker updated, app will refresh on next reload');
        });
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error.message);
        console.warn('[PWA] App will still work, but offline mode disabled');
      });
  });
  
  // Handle messages from service worker
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'ACTIVATE'
    });
  }
} else {
  console.warn('[PWA] Service Workers not supported in this browser');
}
*/
