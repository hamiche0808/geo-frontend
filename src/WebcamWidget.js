import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ===== Composant Webcam : miniature statique + bouton Live =====
export default function WebcamWidget({ latitude, longitude, lang, apiBase }) {
  const [webcam, setWebcam] = useState(null);
  const [live, setLive] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noWebcam, setNoWebcam] = useState(false);
  const liveRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    setWebcam(null);
    setLive(false);
    setImgError(false);
    setNoWebcam(false);
    setLoading(true);
    const fetchWebcam = async () => {
      try {
        const resp = await axios.get(`${apiBase}/api/webcam`, {
          params: { lat: latitude, lon: longitude },
          timeout: 15000
        });
        if (resp.data && resp.data.image_url) {
          setWebcam(resp.data);
        } else {
          setNoWebcam(true);
        }
      } catch {
        setNoWebcam(true);
      }
      setLoading(false);
    };
    fetchWebcam();
  }, [latitude, longitude, apiBase]);

  // Nettoyage de l'intervalle live
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Pendant le chargement
  if (loading) {
    return (
      <div className="webcam-widget webcam-loading">
        <div className="webcam-header">
          <span className="webcam-title">📹 {lang === 'fr' ? 'Recherche webcam...' : 'Searching webcam...'}</span>
        </div>
        <div className="webcam-preview">
          <div className="webcam-thumb-wrapper">
            <div className="webcam-loading-icon">⏳</div>
          </div>
        </div>
      </div>
    );
  }

  // Aucune webcam trouvée → afficher un message discret
  if (noWebcam || !webcam || !webcam.image_url) {
    return (
      <div className="webcam-widget webcam-none">
        <div className="webcam-header">
          <span className="webcam-title">📷 {lang === 'fr' ? 'Aucune webcam à proximité' : 'No webcam nearby'}</span>
        </div>
      </div>
    );
  }

  const handleLive = () => {
    setLive(true);
    setImgError(false);
    // Auto‑rafraîchissement de l'image toutes les 5s → simule le direct
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const img = liveRef.current;
      if (img) {
        const separator = webcam.image_url.includes('?') ? '&' : '?';
        img.src = webcam.image_url + separator + 't=' + Date.now();
      }
    }, 5000);
  };

  const handleStop = () => {
    setLive(false);
    setImgError(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  // Si l'image échoue en mode Live, on reste en mode Live mais on affiche l'erreur
  const handleLiveImgError = () => {
    setImgError(true);
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
                <div className="webcam-error-icon">
                  <div className="webcam-error-msg">📷<br/>
                    <small>{lang === 'fr' ? 'Image indisponible' : 'Image unavailable'}</small>
                  </div>
                </div>
              ) : (
                <img
                  src={webcam.image_url}
                  alt={webcam.name}
                  className="webcam-thumb"
                  onError={() => setImgError(true)}
                  loading="lazy"
                  referrerPolicy="no-referrer"
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
              <div className="webcam-live-img-container">
                {imgError ? (
                  <div className="webcam-error-icon">
                    <div className="webcam-error-msg">📷<br/>
                      <small>{lang === 'fr' ? 'Flux indisponible' : 'Stream unavailable'}</small>
                    </div>
                  </div>
                ) : (
                  <img
                    ref={liveRef}
                    src={webcam.image_url + (webcam.image_url.includes('?') ? '&' : '?') + 't=' + Date.now()}
                    alt={webcam.name + ' live'}
                    className="webcam-live"
                    onError={handleLiveImgError}
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
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
