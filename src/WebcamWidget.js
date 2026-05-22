import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ===== Composant Webcam : miniature statique + bouton Live =====
export default function WebcamWidget({ latitude, longitude, lang, apiBase }) {
  const [webcam, setWebcam] = useState(null);
  const [live, setLive] = useState(false);
  const [imgError, setImgError] = useState(false);
  const liveRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    setWebcam(null);
    setLive(false);
    setImgError(false);
    const fetchWebcam = async () => {
      try {
        const resp = await axios.get(`${apiBase}/api/webcam`, {
          params: { lat: latitude, lon: longitude },
          timeout: 12000
        });
        setWebcam(resp.data);
      } catch { /* aucun flux trouvé — on n'affiche rien */ }
    };
    fetchWebcam();
  }, [latitude, longitude, apiBase]);

  // Nettoyage de l'intervalle live
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Si pas de webcam trouvée → rien n'afficher (pas de casse)
  if (!webcam || !webcam.image_url) return null;

  const handleLive = () => {
    setLive(true);
    setImgError(false);
    // Auto‑rafraîchissement de l'image toutes les 3s → simule le direct
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const img = liveRef.current;
      if (img) {
        const separator = webcam.image_url.includes('?') ? '&' : '?';
        img.src = webcam.image_url + separator + 't=' + Date.now();
      }
    }, 3000);
  };

  const handleStop = () => {
    setLive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return (
    <div className="webcam-widget">
      <div className="webcam-header">
        <span className="webcam-title">📹 {webcam.name}</span>
        {webcam.distance_m && (
          <span className="webcam-distance">
            {webcam.distance_m < 1000
              ? `${webcam.distance_m}m`
              : `${(webcam.distance_m / 1000).toFixed(1)}km`}
          </span>
        )}
      </div>

      <div className="webcam-preview">
        {!live ? (
          <>
            <div className="webcam-thumb-wrapper">
              {imgError ? (
                <div className="webcam-error-icon">📷</div>
              ) : (
                <img
                  src={webcam.image_url}
                  alt={webcam.name}
                  className="webcam-thumb"
                  onError={() => setImgError(true)}
                  loading="lazy"
                />
              )}
              <button className="webcam-live-btn" onClick={handleLive}
                title={lang === 'fr' ? 'Voir le direct' : 'Watch live'}>
                ▶️ {lang === 'fr' ? 'Live' : 'Live'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="webcam-live-wrapper">
              <img
                ref={liveRef}
                src={webcam.image_url + (webcam.image_url.includes('?') ? '&' : '?') + 't=' + Date.now()}
                alt={webcam.name + ' live'}
                className="webcam-live"
                onError={() => { handleStop(); setImgError(true); }}
              />
              <button className="webcam-stop-btn" onClick={handleStop}>
                ⏹ {lang === 'fr' ? 'Arrêter' : 'Stop'}
              </button>
            </div>
          </>
        )}
      </div>

      {webcam.website && (
        <a href={webcam.website} target="_blank" rel="noopener noreferrer" className="webcam-link">
          🔗 {lang === 'fr' ? 'Voir sur le site' : 'View on website'}
        </a>
      )}
    </div>
  );
}
