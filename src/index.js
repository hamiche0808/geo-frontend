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

// ===== Service Worker PWA avec mise à jour intelligente =====
let swRegistration = null;
let currentUpdateId = null; // Identifiant unique de la mise à jour courante

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      swRegistration = reg;

      // Détection de mise à jour
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // ID unique pour cette mise à jour (timestamp + random)
            currentUpdateId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

            // Détection mobile : écran tactile ET petite largeur
            const isMobile = ('ontouchstart' in window) && window.innerWidth < 1024;
            // Détection PWA installée
            const isPwa = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

            if (isMobile || isPwa) {
              // MODE MOBILE / PWA : notifier l'utilisateur avec possibilité de reporter
              window.dispatchEvent(new CustomEvent('sw-update-available', {
                detail: { registration: reg, updateId: currentUpdateId }
              }));
            } else {
              // MODE DESKTOP (site web) : mise à jour automatique immédiate
              if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
            }
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

// Exposer l'ID de mise à jour courant
window.getCurrentUpdateId = function() {
  return currentUpdateId;
};

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
