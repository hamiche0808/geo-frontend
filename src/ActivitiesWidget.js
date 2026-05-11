import React from 'react';
import { getSmartActivities, isGoodWeather } from './WeatherWidget';

/**
 * ActivitiesWidget — Affiche des suggestions d'activités selon la météo.
 * 
 * Props :
 *   weatherCode : code WMO (weathercode) de la météo actuelle
 *   cityName    : nom de la ville (pour la recherche Google)
 *   lang        : 'fr' | 'en' (valeur par défaut 'fr')
 */
export default function ActivitiesWidget({ weatherCode, cityName, lang = 'fr' }) {
  if (weatherCode === undefined || weatherCode === null) return null;

  const activities = getSmartActivities(weatherCode);
  const isOutdoor = isGoodWeather(weatherCode);

  return (
    <div className="smart-activities">
      <h4 className="activities-title">
        {isOutdoor
          ? (lang === 'fr' ? '🌳 Activités extérieures' : '🌳 Outdoor activities')
          : (lang === 'fr' ? '🏛️ Activités intérieures' : '🏛️ Indoor activities')
        }
      </h4>
      <div className="activities-grid">
        {activities.map((act, idx) => (
          <button
            key={idx}
            className="activity-btn"
            title={act.desc}
            onClick={() => {
              const q = encodeURIComponent(`${act.name} ${cityName || ''}`);
              window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener');
            }}
          >
            <span className="activity-emoji">{act.emoji}</span>
            <span className="activity-name">{act.name}</span>
            <span className="activity-desc">{act.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
