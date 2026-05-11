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
let currentUpdateId = null;
let installPromptEvent = null; // Pour l'invite d'installation PWA

// Écouter l'événement d'installation PWA (beforeinstallprompt)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent = e;
  // Informer App.js que l'installation est disponible
  window.dispatchEvent(new CustomEvent('pwa-install-available'));
});

// Écouter l'installation réussie
window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));
});

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

      // Vérification périodique des mises à jour (toutes les 30 min)
      setInterval(() => {
        reg.update();
      }, 30 * 60 * 1000);
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

// Exposer la vérification manuelle de mise à jour
window.checkForUpdates = function() {
  if (swRegistration) {
    swRegistration.update();
    return true;
  }
  return false;
};

// Exposer l'ID de mise à jour courant
window.getCurrentUpdateId = function() {
  return currentUpdateId;
};

// Exposer l'invite d'installation PWA
window.installPwa = function() {
  if (installPromptEvent) {
    installPromptEvent.prompt();
    // Ne pas réutiliser l'événement
    installPromptEvent = null;
  }
};

// Vérifier si l'installation PWA est disponible
window.isPwaInstallAvailable = function() {
  return installPromptEvent !== null;
};

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
