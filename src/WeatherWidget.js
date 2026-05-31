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
  if (code === 0 || code === 1) return true;
  if (code === 2) return true;
  if (code === 3) return true;
  if (code >= 45 && code <= 48) return false;
  if (code >= 51 && code <= 55) return false;
  if (code >= 61 && code <= 65) return false;
  if (code >= 71 && code <= 75) return false;
  if (code >= 80 && code <= 82) return false;
  if (code >= 95) return false;
  return true;
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

// ===== Classe d'animation CSS selon le code WMO =====
export function getWeatherAnimationClass(code) {
  if (code === 0 || code === 1) return 'weather-anim-sunny';
  if (code === 2 || code === 3) return 'weather-anim-cloudy';
  return '';
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

// ===== Jours de la semaine (complets) =====
const DAY_NAMES_FR_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAY_NAMES_EN_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR_TO_INDEX = { 'Dim': 0, 'Lun': 1, 'Mar': 2, 'Mer': 3, 'Jeu': 4, 'Ven': 5, 'Sam': 6 };

/**
 * WeatherWidget — Affiche la météo actuelle + prévisions 3 jours.
 * 
 * Props :
 *   weather     : objet retourné par /api/weather { current, daily }
 *   cityName    : nom de la ville (optionnel, pour le titre)
 *   lang        : 'fr' | 'en' (pour les labels)
 */
export default function WeatherWidget({ weather, cityName, lang = 'fr' }) {
  if (!weather || !weather.current || weather.error) {
    return null;
  }

  const { current, daily } = weather;
  const animClass = getWeatherAnimationClass(current.weathercode);

  // Convertir l'abréviation du jour (ex: "Mar") en nom complet (ex: "Mardi")
  // Le premier jour (idx=0) est "Demain" / "Tomorrow"
  const getDayLabel = (dayAbbr, idx) => {
    if (idx === 0) return lang === 'fr' ? 'Demain' : 'Tomorrow';
    const idxFull = DAY_ABBR_TO_INDEX[dayAbbr];
    if (idxFull !== undefined) {
      return lang === 'fr' ? DAY_NAMES_FR_FULL[idxFull] : DAY_NAMES_EN_FULL[idxFull];
    }
    return dayAbbr || '';
  };

  // Obtenir le suffixe du jour (ex: "10" pour "10 mai")
  const getDayDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.getDate().toString();
    } catch { return ''; }
  };

  return (
    <div className={`weather-widget ${animClass}`}>
      {/* ===== Météo actuelle ===== */}
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
        {current.sunrise && current.sunset && (
          <span className="weather-detail weather-sun">
            🌅 {current.sunrise} — {current.sunset}
          </span>
        )}
        {current.uv_index != null && (
          <span className="weather-detail">
            ☀️ UV {current.uv_index}
            <span className="weather-detail-sub">
              {current.uv_index <= 2 ? (lang === 'fr' ? 'Faible' : 'Low') :
               current.uv_index <= 5 ? (lang === 'fr' ? 'Modéré' : 'Moderate') :
               current.uv_index <= 7 ? (lang === 'fr' ? 'Élevé' : 'High') :
               current.uv_index <= 10 ? (lang === 'fr' ? 'Très élevé' : 'Very High') :
               (lang === 'fr' ? 'Extrême' : 'Extreme')}
            </span>
          </span>
        )}
        {current.european_aqi != null && (
          <span className="weather-detail">
            🌫️ {lang === 'fr' ? 'Indice qualité air' : 'Air Quality'} {current.european_aqi}
            <span className="weather-detail-sub">
              {current.european_aqi <= 20 ? (lang === 'fr' ? 'Excellent' : 'Great') :
               current.european_aqi <= 40 ? (lang === 'fr' ? 'Bon' : 'Good') :
               current.european_aqi <= 60 ? (lang === 'fr' ? 'Moyen' : 'Fair') :
               current.european_aqi <= 80 ? (lang === 'fr' ? 'Dégradé' : 'Poor') :
               current.european_aqi <= 100 ? (lang === 'fr' ? 'Mauvais' : 'Very Poor') :
               (lang === 'fr' ? 'Très mauvais' : 'Extremely Poor')}
            </span>
          </span>
        )}
        {current.us_aqi != null && (
          <span className="weather-detail">
            🌫️ AQI {current.us_aqi}
            <span className="weather-detail-sub">
              {current.us_aqi <= 50 ? (lang === 'fr' ? 'Bon' : 'Good') :
               current.us_aqi <= 100 ? (lang === 'fr' ? 'Modéré' : 'Moderate') :
               current.us_aqi <= 150 ? (lang === 'fr' ? 'Malsain (sensibles)' : 'Unhealthy (Sensitive)') :
               current.us_aqi <= 200 ? (lang === 'fr' ? 'Malsain' : 'Unhealthy') :
               current.us_aqi <= 300 ? (lang === 'fr' ? 'Très malsain' : 'Very Unhealthy') :
               (lang === 'fr' ? 'Dangereux' : 'Hazardous')}
            </span>
          </span>
        )}
      </div>

      {/* ===== Prévisions 3 jours (blocs clairs et aérés) ===== */}
      {daily && daily.length > 1 && (
        <div className="forecast-bar">
          {daily.slice(1, 4).map((day, idx) => {
            const dayName = getDayLabel(day.day_name, idx);
            const dayDate = getDayDate(day.date);
            return (
              <div key={idx} className="forecast-day">
                {/* En-tête : nom du jour + date */}
                <div className="forecast-header">
                  <span className="forecast-day-name">{dayName}</span>
                  {dayDate && <span className="forecast-date">{dayDate}</span>}
                </div>

                {/* Émoji météo XL */}
                <span className="forecast-icon">{getWeatherEmoji(day.weathercode)}</span>

                {/* Description textuelle */}
                <span className="forecast-desc">{day.description}</span>

                {/* Températures min/max avec labels clairs */}
                <div className="forecast-temps">
                  <div className="forecast-temp-block">
                    <span className="forecast-temp-label">
                      {lang === 'fr' ? 'Min' : 'Min'}
                    </span>
                    <span className="forecast-min">{day.temp_min != null ? `${day.temp_min}°C` : '--'}</span>
                  </div>
                  <div className="forecast-temp-divider">|</div>
                  <div className="forecast-temp-block">
                    <span className="forecast-temp-label">
                      {lang === 'fr' ? 'Max' : 'Max'}
                    </span>
                    <span className="forecast-max">{day.temp_max != null ? `${day.temp_max}°C` : '--'}</span>
                  </div>
                </div>

                {/* Précipitations */}
                {day.precipitation_probability != null && day.precipitation_probability > 0 && (
                  <span className="forecast-precip">🌧️ {day.precipitation_probability}%</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
