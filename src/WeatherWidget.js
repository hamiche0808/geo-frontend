import React from 'react';

// ===== Emoji météo selon code WMO =====
export function getWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 55) return '🌦️';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 75) return '🌨️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

// ===== Déterminer si le temps est "beau" (extérieur) ou "mauvais" (intérieur) =====
export function isGoodWeather(code) {
  if (code === 0 || code === 1) return true;      // Ensoleillé, partiellement nuageux
  if (code === 2) return true;                      // Partiellement nuageux
  if (code === 3) return true;                      // Nuageux
  if (code >= 45 && code <= 48) return false;       // Brouillard
  if (code >= 51 && code <= 55) return false;       // Bruine
  if (code >= 61 && code <= 65) return false;       // Pluie
  if (code >= 71 && code <= 75) return false;       // Neige
  if (code >= 80 && code <= 82) return false;       // Averses
  if (code >= 95) return false;                     // Orage
  return true; // Par défaut, on suppose beau temps
}

// ===== Activités intelligentes selon la météo =====
export function getSmartActivities(weatherCode) {
  const good = isGoodWeather(weatherCode);
  if (good) {
    return [
      { emoji: '🌳', name: 'Parcs & Jardins', desc: 'Profitez du beau temps' },
      { emoji: '⛲', name: 'Monuments', desc: 'Visitez les sites historiques' },
      { emoji: '⛱️', name: 'Plages & Lac', desc: 'Idéal pour une baignade' },
      { emoji: '🚴', name: 'Balade à vélo', desc: 'Parcourez la ville' },
      { emoji: '🧺', name: 'Pique-nique', desc: 'En plein air' },
    ];
  } else {
    return [
      { emoji: '🏛️', name: 'Musées', desc: 'Culture & expositions' },
      { emoji: '🍿', name: 'Cinémas', desc: 'Films & séances' },
      { emoji: '🛍️', name: 'Shopping', desc: 'Centres commerciaux' },
      { emoji: '🎮', name: 'Bowling / Jeux', desc: 'Activités couvertes' },
      { emoji: '☕', name: 'Cafés & Salons', desc: 'Détente au chaud' },
    ];
  }
}

// ===== WMO codes description (affichage lisible) =====
export const WMO_DESCRIPTIONS = {
  0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux",
  3: "Nuageux", 45: "Brumeux", 48: "Brouillard givrant",
  51: "Légère bruine", 53: "Bruine modérée", 55: "Bruine dense",
  56: "Bruine verglaçante légère", 57: "Bruine verglaçante dense",
  61: "Pluie faible", 63: "Pluie modérée", 65: "Pluie forte",
  66: "Pluie verglaçante légère", 67: "Pluie verglaçante forte",
  71: "Neige faible", 73: "Neige modérée", 75: "Neige forte",
  77: "Grains de neige", 80: "Averses de pluie faibles",
  81: "Averses de pluie modérées", 82: "Averses de pluie violentes",
  85: "Averses de neige faibles", 86: "Averses de neige fortes",
  95: "Orage", 96: "Orage avec grêle légère", 99: "Orage avec grêle forte"
};

// ===== Jours de la semaine en français =====
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/**
 * WeatherWidget — Affiche la météo actuelle + prévisions 4 jours.
 * 
 * Props :
 *   weather     : objet retourné par /api/weather { current, daily }
 *   cityName    : nom de la ville (optionnel, pour le titre)
 *   lang        : 'fr' | 'en' (pour les labels, valeur par défaut 'fr')
 */
export default function WeatherWidget({ weather, cityName, lang = 'fr' }) {
  if (!weather || !weather.current || weather.error) {
    return null;
  }

  const { current, daily } = weather;

  return (
    <div className="weather-widget">
      {/* Météo actuelle */}
      <div className="weather-info">
        <span className="weather-icon">{getWeatherEmoji(current.weathercode)}</span>
        <span className="weather-temp">{Math.round(current.temperature)}°C</span>
        <span className="weather-desc">{current.description}</span>
        <span className="weather-detail">💨 {current.windspeed} km/h</span>
        {current.humidity != null && (
          <span className="weather-detail">💧 {current.humidity}%</span>
        )}
        {current.feels_like != null && (
          <span className="weather-detail">
            🌡️ {lang === 'fr' ? 'Ressenti' : 'Feels like'} {Math.round(current.feels_like)}°C
          </span>
        )}
        {current.precipitation_probability != null && current.precipitation_probability > 0 && (
          <span className="weather-detail">🌧️ {current.precipitation_probability}%</span>
        )}
      </div>

      {/* Prévisions 4 jours */}
      {daily && daily.length > 0 && (
        <div className="forecast-bar">
          {daily.slice(1).map((day, idx) => (
            <div key={idx} className="forecast-day">
              <span className="forecast-day-name">{day.day_name}</span>
              <span className="forecast-icon">{getWeatherEmoji(day.weathercode)}</span>
              <span className="forecast-desc">{day.description}</span>
              <span className="forecast-temps">
                <span className="forecast-max">{day.temp_max}°</span>
                <span className="forecast-min">{day.temp_min}°</span>
              </span>
              <span className="forecast-precip">
                💧{day.precipitation}mm
                {day.precipitation_probability != null && day.precipitation_probability > 0 && (
                  <span className="forecast-prob"> ({day.precipitation_probability}%)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
