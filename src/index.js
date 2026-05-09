import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ===== Service Worker PWA avec notification de mise à jour =====
let swRegistration = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      swRegistration = reg;
      console.log('SW registered:', reg.scope);

      // Détection de mise à jour
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          // Quand le nouveau worker est installé ET qu'un ancien contrôle déjà
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nouveau contenu disponible → notifier l'utilisateur
            window.dispatchEvent(new CustomEvent('sw-update-available', {
              detail: { registration: reg }
            }));
          }
        });
      });
    }).catch(err => {
      console.warn('SW registration failed:', err);
    });

    // Rechargement après mise à jour (quand le nouveau SW prend le contrôle)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
}

// Exposer la fonction de mise à jour pour App.js
window.applyUpdate = function() {
  if (swRegistration && swRegistration.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
};

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
