import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import WeatherWidget from './WeatherWidget';
import ActivitiesWidget from './ActivitiesWidget';

// ===== Axios personnalisé : User-Agent + cache session =====
const API_CLIENT = axios.create({
  headers: {
    'User-Agent': 'GeoLocApp/5.0 (hamiche08.08@gmail.com)',
    'Accept': 'application/json',
    'X-API-Key': 'geoloc-app-key-2026',
  },
  timeout: 60000
});
// Intercepteur pour logger les erreurs réseau
API_CLIENT.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      console.warn('⚠️ Erreur réseau GeoLoc :', error.message);
    }
    return Promise.reject(error);
  }
);

// ===== Cache Session (sessionStorage)  =====
const CACHE_TTL = 600000; // 10 minutes
const CACHE_MAX_ENTRIES = 50; // limite pour ne pas saturer le stockage

function getCacheKey(url) {
  return 'geoCache:' + url;
}
function getFromCache(url) {
  try {
    const key = getCacheKey(url);
    const item = sessionStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (Date.now() - parsed.ts < CACHE_TTL) {
        return parsed.data;
      }
      sessionStorage.removeItem(key);
    }
  } catch (e) { /* ignore */ }
  return null;
}
function setToCache(url, data) {
  try {
    const key = getCacheKey(url);
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    // Nettoyer les entrées les plus vieilles si trop nombreuses
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('geoCache:')) keys.push({ key: k, ts: JSON.parse(sessionStorage.getItem(k)).ts });
    }
    if (keys.length > CACHE_MAX_ENTRIES) {
      keys.sort((a, b) => a.ts - b.ts);
      const toRemove = keys.slice(0, keys.length - CACHE_MAX_ENTRIES);
      toRemove.forEach(k => sessionStorage.removeItem(k.key));
    }
  } catch (e) { /* ignore */ }
}

// Version avec cache pour les appels GET
// Fallback automatique Railway → Render si timeout (>3s) ou erreur
let railFallbackActive = false; // sticky fallback : éviter d'attendre 3s à chaque requête si Railway est down
async function cachedGet(url, params = {}) {
  const cacheKey = url + JSON.stringify(params);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  if (!railFallbackActive) {
    // Essayer Railway (timeout 3s) — l'URL contient déjà API_RAILWAY car API = API_RAILWAY
    try {
      const resp = await RAILWAY_CLIENT.get(url, { params });
      setToCache(cacheKey, resp.data);
      return resp.data;
    } catch (primaryErr) {
      console.warn('⚠️ Railway indisponible, bascule vers Render :', primaryErr.message);
      railFallbackActive = true; // sticky : on ne réessaie pas Railway avant rechargement page
    }
  }

  // Fallback Render : remplacer le domaine Railway par Render
  const renderUrl = url.replace(API_RAILWAY, API_FALLBACK);
  const resp = await API_CLIENT.get(renderUrl, { params });
  setToCache(cacheKey, resp.data);
  return resp.data;
}

// ===== Tracking admin (stats anonymes) =====
let _trackDebounce = {};
function trackSearch(city) {
  if (!city) return;
  const key = 's_' + city;
  if (_trackDebounce[key]) return; // Évite les doublons 5s
  _trackDebounce[key] = setTimeout(() => { delete _trackDebounce[key]; }, 5000);
  // Appel asynchrone silencieux (fire & forget)
  apiPost(`${API}/api/admin/track`, { type: 'search', city }).catch(() => {});
}
function trackServer(server) {
  apiPost(`${API}/api/admin/track`, { type: 'server', server }).catch(() => {});
}

// Helper pour les appels POST avec fallback Railway → Render
async function apiPost(url, data, config = {}) {
  if (!railFallbackActive) {
    try {
      return await RAILWAY_CLIENT.post(url, data, config);
    } catch (e) {
      console.warn('⚠️ Railway POST indisponible, bascule vers Render :', e.message);
      railFallbackActive = true;
    }
  }
  const renderUrl = url.replace(API_RAILWAY, API_FALLBACK);
  return await API_CLIENT.post(renderUrl, data, config);
}

// Icône de drapeau dynamique selon le pays
function getFlagIcon(countryCode) {
  const code = (countryCode || 'FR').toLowerCase();
  const flagUrl = `https://flagcdn.com/w20/${code}.png`;
  return L.divIcon({
    className: 'flag-pin-marker',
    html: `<div class="flag-pin-face">
      <img src="${flagUrl}" alt="" crossorigin="anonymous" />
    </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -48],
  });
}

// ===== Backend URLs (Railway principal, Render fallback) =====
const API_RAILWAY = 'https://geo-api-production-b1af.up.railway.app';
const API_RENDER  = 'https://geo-app-1-z314.onrender.com';
const API = process.env.REACT_APP_API_URL || API_RAILWAY;
const API_FALLBACK = API_RENDER;

// Railway-specific Axios client avec timeout 3s
const RAILWAY_CLIENT = axios.create({
  headers: {
    'User-Agent': 'GeoLocApp/5.0 (hamiche08.08@gmail.com)',
    'Accept': 'application/json',
    'X-API-Key': 'geoloc-app-key-2026',
  },
  timeout: 3000
});

// ===== Mapping pays → devise =====
const CURRENCY_MAP = {
  FR: 'EUR', BE: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', AT: 'EUR', IE: 'EUR', GR: 'EUR', FI: 'EUR',
  DZ: 'DZD', MA: 'MAD', TN: 'TND',
  US: 'USD', CA: 'CAD', GB: 'GBP', CH: 'CHF', JP: 'JPY', CN: 'CNY', AU: 'AUD', NZ: 'NZD',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
};
const CURRENCY_NAMES = {
  EUR: 'Euro', DZD: 'Dinar algérien', MAD: 'Dirham marocain', TND: 'Dinar tunisien',
  USD: 'Dollar américain', CAD: 'Dollar canadien', GBP: 'Livre sterling',
  CHF: 'Franc suisse', JPY: 'Yen japonais', CNY: 'Yuan chinois', AUD: 'Dollar australien', NZD: 'Dollar néo-zélandais',
  SEK: 'Couronne suédoise', NOK: 'Couronne norvégienne', DKK: 'Couronne danoise', PLN: 'Zloty polonais',
};

// ===== Traductions FR / EN =====
const TR = {
  fr: {
    search: 'Recherche', itinerary: 'Itineraire', settings: 'Parametres',
    fullscreen: 'Plein ecran', exitFullscreen: 'Reduire',
    mapLayer: 'Fond de carte', street: 'Route', satellite: 'Satellite', terrain: 'Relief',
    searchPlaceholder: 'Code postal ou nom de ville...',
    noMapData: 'Effectuez une recherche', noMapDataDistance: 'Selectionnez deux villes',
  },
  en: {
    search: 'Search', itinerary: 'Route', settings: 'Settings',
    fullscreen: 'Full screen', exitFullscreen: 'Minimize',
    mapLayer: 'Map layer', street: 'Street', satellite: 'Satellite', terrain: 'Terrain',
    searchPlaceholder: 'Postal code or city name...',
    noMapData: 'Search for a location', noMapDataDistance: 'Select two cities',
  }
};
function tr(key, lang) {
  return (TR[lang] && TR[lang][key]) || key;
}

// ===== Fonds de carte (améliorés) =====
const MAP_TILES = {
  street: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; <a href="https://www.esri.com/">Esri</a>'
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  }
};

// Récupérer la population d'une commune (France → INSEE, Belgique → Statbel, US → Census)
async function fetchPopulation(postalCode, cityName, countryCode = 'FR') {
  try {
    if (!postalCode && !cityName) return null;
    const endpointMap = {
      'FR': 'population-fr',
      'BE': 'population-be',
      'US': 'population-us',
      'CA': 'population-ca',
      'DZ': 'population-dz',
      'MA': 'population-ma',
      'TN': 'population-tn',
    };
    const endpoint = endpointMap[countryCode] || 'population-fr';
    const params = { postal_code: postalCode, city_name: cityName };
    const data = await cachedGet(`${API}/api/${endpoint}`, params);
    
    // Réponse sous forme de tableau : [{ population: XXX }]
    if (Array.isArray(data) && data.length > 0) {
      const pop = data[0].population;
      if (pop != null) return pop;
    }
    // Réponse sous forme d'objet direct : { population: XXX }
    if (data && data.population != null) {
      return data.population;
    }
    // Réponse avec une clé 'data' contenant le tableau
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      const pop = data.data[0].population;
      if (pop != null) return pop;
    }
  } catch { /* ignore */ }
  return null;
}

const COUNTRIES = [
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'DZ', name: 'Algérie', flag: '🇩🇿' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦' },
  { code: 'TN', name: 'Tunisie', flag: '🇹🇳' },
  { code: 'DE', name: 'Allemagne', flag: '🇩🇪' },
  { code: 'IT', name: 'Italie', flag: '🇮🇹' },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸' },
  { code: 'US', name: 'États-Unis', flag: '🇺🇸' },
  { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧' },
  { code: 'JP', name: 'Japon', flag: '🇯🇵' },
  { code: 'CH', name: 'Suisse', flag: '🇨🇭' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'NL', name: 'Pays-Bas', flag: '🇳🇱' },
  { code: 'AT', name: 'Autriche', flag: '🇦🇹' },
  { code: 'IE', name: 'Irlande', flag: '🇮🇪' },
  { code: 'GR', name: 'Grèce', flag: '🇬🇷' },
  { code: 'FI', name: 'Finlande', flag: '🇫🇮' },
  { code: 'CN', name: 'Chine', flag: '🇨🇳' },
  { code: 'NZ', name: 'Nouvelle-Zélande', flag: '🇳🇿' },
  { code: 'SE', name: 'Suède', flag: '🇸🇪' },
  { code: 'NO', name: 'Norvège', flag: '🇳🇴' },
  { code: 'DK', name: 'Danemark', flag: '🇩🇰' },
  { code: 'PL', name: 'Pologne', flag: '🇵🇱' },
  { code: 'AU', name: 'Australie', flag: '🇦🇺' },
];

// ===== Échantillon de villes pour le bouton "Ville au hasard" =====
const SAMPLE_CITIES = {
  FR: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Saint-Étienne', 'Le Havre', 'Toulon', 'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Villeurbanne'],
  BE: ['Bruxelles', 'Anvers', 'Gand', 'Charleroi', 'Liège', 'Bruges', 'Namur', 'Louvain', 'Mons', 'Alost'],
  CA: ['Montréal', 'Toronto', 'Vancouver', 'Québec', 'Ottawa', 'Calgary', 'Edmonton', 'Winnipeg', 'Halifax', 'Mississauga'],
  DZ: ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif', 'Tlemcen', 'Sidi Bel Abbès', 'Skikda', 'Batna'],
  MA: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan'],
  TN: ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabès', 'Ariana', 'Gafsa', 'Monastir', 'Ben Gardane'],
  DE: ['Berlin', 'Hambourg', 'Munich', 'Cologne', 'Francfort', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen'],
  IT: ['Rome', 'Milan', 'Naples', 'Turin', 'Palerme', 'Bologne', 'Florence', 'Catane', 'Venise', 'Vérone'],
  ES: ['Madrid', 'Barcelone', 'Valence', 'Séville', 'Bilbao', 'Málaga', 'Saragosse', 'Murcie', 'Palma', 'Grenade'],
  US: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphie', 'San Antonio', 'San Diego', 'Dallas', 'San Francisco', 'Boston', 'Seattle', 'Denver', 'Miami', 'Atlanta'],
  GB: ['Londres', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Édimbourg', 'Leeds', 'Bristol', 'Sheffield', 'Cardiff'],
  JP: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe', 'Kyoto', 'Kawasaki', 'Saitama'],
  CH: ['Zurich', 'Genève', 'Bâle', 'Berne', 'Lausanne', 'Winterthour', 'Lucerne', 'Saint-Gall', 'Lugano', 'Bienne'],
  PT: ['Lisbonne', 'Porto', 'Braga', 'Coimbra', 'Funchal', 'Amadora', 'Setúbal', 'Aveiro', 'Évora', 'Faro'],
  NL: ['Amsterdam', 'Rotterdam', 'La Haye', 'Utrecht', 'Eindhoven', 'Groningue', 'Tilbourg', 'Almere', 'Breda', 'Nimègue'],
  AT: ['Vienne', 'Salzbourg', 'Graz', 'Linz', 'Innsbruck', 'Klagenfurt', 'Villach', 'Wels', 'Sankt Pölten', 'Dornbirn'],
  IE: ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Drogheda', 'Kilkenny', 'Wexford', 'Sligo', 'Dundalk'],
  GR: ['Athènes', 'Thessalonique', 'Patras', 'Héraklion', 'Larissa', 'Volos', 'Ioannina', 'La Canée', 'Rhodes', 'Le Pirée'],
  FI: ['Helsinki', 'Espoo', 'Tampere', 'Turku', 'Vantaa', 'Oulu', 'Lahti', 'Jyväskylä', 'Kuopio', 'Pori'],
  CN: ['Pékin', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Nankin', 'Wuhan', 'Hangzhou', 'Xi\'an', 'Chongqing'],
  NZ: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Napier', 'Dunedin', 'Palmerston North', 'Nelson', 'Rotorua'],
  SE: ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Linköping', 'Västerås', 'Örebro', 'Helsingborg', 'Norrköping', 'Jönköping'],
  NO: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Drammen', 'Fredrikstad', 'Kristiansand', 'Tromsø', 'Sandnes', 'Bodø'],
  DK: ['Copenhague', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Randers', 'Kolding', 'Horsens', 'Vejle', 'Roskilde'],
  PL: ['Varsovie', 'Cracovie', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz', 'Lublin', 'Katowice'],
  AU: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adélaïde', 'Gold Coast', 'Newcastle', 'Canberra', 'Wollongong', 'Sunshine Coast'],
};

// ===== Fuseaux horaires IANA — fonction intelligente (pays × longitude) =====
// Pour les pays à fuseau unique, mapping direct.
// Pour les grands pays (US, CA, RU, AU, BR, MX, ID), on utilise la longitude.
function getTimezoneForLocation(countryCode, longitude) {
  // Pays à fuseau unique
  const SIMPLE = {
    'FR': 'Europe/Paris',       'BE': 'Europe/Brussels',
    'DE': 'Europe/Berlin',      'IT': 'Europe/Rome',
    'ES': 'Europe/Madrid',      'GB': 'Europe/London',
    'PT': 'Europe/Lisbon',      'NL': 'Europe/Amsterdam',
    'LU': 'Europe/Luxembourg',  'CH': 'Europe/Zurich',
    'AT': 'Europe/Vienna',      'DK': 'Europe/Copenhagen',
    'SE': 'Europe/Stockholm',   'NO': 'Europe/Oslo',
    'FI': 'Europe/Helsinki',    'PL': 'Europe/Warsaw',
    'CZ': 'Europe/Prague',      'SK': 'Europe/Bratislava',
    'HU': 'Europe/Budapest',    'RO': 'Europe/Bucharest',
    'BG': 'Europe/Sofia',       'GR': 'Europe/Athens',
    'HR': 'Europe/Zagreb',      'RS': 'Europe/Belgrade',
    'IE': 'Europe/Dublin',      'IS': 'Atlantic/Reykjavik',
    'TR': 'Europe/Istanbul',    'AR': 'America/Argentina/Buenos_Aires',
    'NZ': 'Pacific/Auckland',   'JP': 'Asia/Tokyo',
    'CN': 'Asia/Shanghai',      'IN': 'Asia/Kolkata',
    'KR': 'Asia/Seoul',         'SG': 'Asia/Singapore',
    'HK': 'Asia/Hong_Kong',     'TW': 'Asia/Taipei',
    'TH': 'Asia/Bangkok',       'VN': 'Asia/Ho_Chi_Minh',
    'MY': 'Asia/Kuala_Lumpur',  'PH': 'Asia/Manila',
    'MA': 'Africa/Casablanca',  'DZ': 'Africa/Algiers',
    'TN': 'Africa/Tunis',       'ZA': 'Africa/Johannesburg',
    'EG': 'Africa/Cairo',       'KE': 'Africa/Nairobi',
    'NG': 'Africa/Lagos',
  };
  if (SIMPLE[countryCode]) return SIMPLE[countryCode];

  // Pays multi‑timezone : sélection par longitude
  const lon = longitude != null ? Number(longitude) : NaN;

  if (countryCode === 'US') {
    if (lon < -140)          return 'Pacific/Honolulu';     // Hawaii
    if (lon < -125)          return 'America/Anchorage';    // Alaska
    if (lon < -112.5)        return 'America/Los_Angeles';  // Pacific
    if (lon < -97.5)         return 'America/Denver';       // Mountain
    if (lon < -82.5)         return 'America/Chicago';      // Central
    return 'America/New_York';                               // Eastern
  }
  if (countryCode === 'CA') {
    if (lon < -120)          return 'America/Vancouver';    // Pacific
    if (lon < -105)          return 'America/Edmonton';     // Mountain
    if (lon < -90)           return 'America/Winnipeg';     // Central
    if (lon < -75)           return 'America/Toronto';      // Eastern
    return 'America/Halifax';                                // Atlantic
  }
  if (countryCode === 'RU') {
    if (lon < 25)            return 'Europe/Kaliningrad';
    if (lon < 40)            return 'Europe/Moscow';
    if (lon < 55)            return 'Europe/Samara';
    if (lon < 70)            return 'Asia/Yekaterinburg';
    if (lon < 85)            return 'Asia/Omsk';
    if (lon < 100)           return 'Asia/Krasnoyarsk';
    if (lon < 115)           return 'Asia/Irkutsk';
    if (lon < 130)           return 'Asia/Yakutsk';
    if (lon < 145)           return 'Asia/Vladivostok';
    if (lon < 160)           return 'Asia/Magadan';
    return 'Asia/Kamchatka';
  }
  if (countryCode === 'AU') {
    if (lon < 130)           return 'Australia/Perth';      // Western
    if (lon < 135)           return 'Australia/Darwin';     // NT
    if (lon < 140)           return 'Australia/Adelaide';   // South
    if (lon < 150)           return 'Australia/Sydney';     // NSW/ACT/Vic/Tas
    return 'Australia/Brisbane';                             // Queensland
  }
  if (countryCode === 'BR') {
    if (lon < -60)           return 'America/Rio_Branco';   // -5h
    if (lon < -45)           return 'America/Manaus';       // -4h
    return 'America/Sao_Paulo';                              // -3h
  }
  if (countryCode === 'MX') {
    if (lon < -105)          return 'America/Tijuana';      // Pacific
    if (lon < -95)           return 'America/Chihuahua';    // Mountain
    return 'America/Mexico_City';                            // Central
  }
  if (countryCode === 'ID') {
    if (lon < 120)           return 'Asia/Jakarta';         // WIB  (UTC+7)
    if (lon < 135)           return 'Asia/Makassar';        // WITA (UTC+8)
    return 'Asia/Jayapura';                                  // WIT  (UTC+9)
  }

  // Fallback solar time (approximation longitude → offset UTC)
  if (!isNaN(lon)) {
    const offsetHours = lon / 15;
    const sign = offsetHours >= 0 ? '+' : '-';
    const absH = Math.floor(Math.abs(offsetHours));
    const absM = Math.abs(Math.round((Math.abs(offsetHours) - absH) * 60));
    const pad = (n) => String(n).padStart(2, '0');
    return `UTC${sign}${pad(absH)}:${pad(absM)}`;
  }

  return 'Europe/Paris'; // dernier recours
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Icône violette pour les waypoints
const waypointIcon = L.divIcon({
  className: 'waypoint-marker',
  html: '<div class="wp-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

// ========== Composant d'auto-zoom sur les marqueurs ==========
function FitBoundsOnChange({ markers, routeCoords }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const points = [];
    if (markers && markers.length > 0) {
      markers.forEach(m => { if (m) points.push(m); });
    }
    if (routeCoords && routeCoords.length > 0) {
      routeCoords.forEach(c => { if (c) points.push(c); });
    }
    if (points.length > 0) {
      try {
        const bounds = L.latLngBounds(points);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
      } catch (e) { /* ignore invalid bounds */ }
    }
  }, [map, markers, routeCoords]);
  return null;
}

// ========== Composant d'autocomplétion réutilisable (villes + adresses) ==========
const CityInput = React.memo(function CityInput({ label, value, onChange, onSelect, country, placeholder }) {
  const [input, setInput] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounce = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setInput(v);
    if (onChange) onChange(v);
    // Reset erreur dès qu'on tape
    // Min 3 caractères
      if (v.trim().length >= 3) {
        setSearching(true);
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(async () => {
          try {
            // Uniquement les villes/localités (pas d'adresses/rues)
            const promises = [
            cachedGet(`${API}/api/search`, { q: v, country, limit: 10 }).catch(() => [])
            ];
            const results = await Promise.all(promises);
            const cityResp = Array.isArray(results[0]) ? results[0] : (results[0]?.data || []);
            const filtered = (cityResp || []).filter(c => c.city).slice(0, 10);
            setSuggestions(filtered);
            setShow(filtered.length > 0);
          } catch { setSuggestions([]); }
          setSearching(false);
        }, 800);
    } else { setSuggestions([]); setShow(false); setSearching(false); }
  };

  // Formater l'affichage d'une suggestion avec code postal et pays
  const formatSuggestion = (s) => {
    const name = s.city || s.display_name?.split(',')[0] || '';
    const code = s.postal_code ? `(${s.postal_code})` : '';
    const countryName = s.country || s.country_code || '';
    return { name, code, countryName };
  };

  return (
    <div className="city-input-wrapper">
      <label className="city-input-label">{label}</label>
      <div className="city-input-field">
        <input
          type="text"
          value={input}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder={placeholder}
        />
        {searching && <span className="input-spinner">⏳</span>}
      </div>
      {show && suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((s, idx) => {
            const { name, code, countryName } = formatSuggestion(s);
            return (
              <li key={idx} onMouseDown={() => {
                setInput(s.city);
                setShow(false);
                onSelect(s);
              }}>
                <span className="suggestion-city">
                  🏙️ {name}
                </span>
                <span className="suggestion-code">
                  {code} {countryName}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

// ===== Helpers pour réduire la duplication =====
const POP_COUNTRIES = ['FR','BE','US','CA','DZ','MA','TN','JP',
  'France','Belgium','Belgique','United States','Canada',
  'Algérie','Maroc','Tunisie'];
function shouldFetchPopulation(countryCode, countryName) {
  return POP_COUNTRIES.includes(countryCode) || POP_COUNTRIES.includes(countryName);
}
function buildLocationFromData(data, defaultCountry) {
  return {
    city: data.city || '',
    postal_code: data.postal_code || '',
    country: data.country || '',
    country_code: data.country_code || defaultCountry || 'FR',
    latitude: data.latitude,
    longitude: data.longitude,
    department: data.department || '',
    region: data.region || '',
    population: data.population || 0,
    display_name: data.display_name || '',
    is_address: data._type === 'address' || data.is_address || false
  };
}

// ===== Composant QR Code avec fallback si le serveur est down =====
function QRCodeView({ url, lang }) {
  const [qrError, setQrError] = useState(false);
  if (qrError) {
    return (
      <div className="qr-section">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          📱 {lang === 'fr' ? 'QR Code indisponible' : 'QR Code unavailable'}
        </p>
      </div>
    );
  }
  return (
    <div className="qr-section">
      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`}
        alt="QR Code" className="qr-image" onError={() => setQrError(true)} />
      <p className="qr-hint">{lang === 'fr' ? 'Scannez pour ouvrir l\'application' : 'Scan to open the app'}</p>
    </div>
  );
}

// ========== Application principale ==========
function App() {
  const [mode, setMode] = useState('search'); // 'search' | 'distance'

  // Mode Recherche
  const [searchInput, setSearchInput] = useState('');
  const [location, setLocation] = useState(null);

  // Mode Distance
  const [cityA, setCityA] = useState(null);
  const [cityB, setCityB] = useState(null);
  const [countryA, setCountryA] = useState('FR');
  const [countryB, setCountryB] = useState('FR');
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null); // tracé routier
  const [routeAlternatives, setRouteAlternatives] = useState(null); // toutes les routes alternatives
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0); // index de la route sélectionnée

  // Multi-étapes (waypoints)
  const [waypoints, setWaypoints] = useState([]); // array de city objects
  const [waypointCountries, setWaypointCountries] = useState([]);

  // Coût carburant
  const [fuelConsumption, setFuelConsumption] = useState(() => {
    const saved = localStorage.getItem('geoloc_fuel_consumption');
    return saved ? parseFloat(saved) : 7;
  });
  const [fuelType, setFuelType] = useState(() => {
    return localStorage.getItem('geoloc_fuel_type') || 'essence';
  });
  const [fuelPrice, setFuelPrice] = useState(() => {
    const saved = localStorage.getItem('geoloc_fuel_price');
    return saved ? parseFloat(saved) : 1.85;
  });
  const [showFuelCalc, setShowFuelCalc] = useState(false);

  // Sauvegarder les valeurs carburant dans localStorage
  useEffect(() => { localStorage.setItem('geoloc_fuel_consumption', String(fuelConsumption)); }, [fuelConsumption]);
  useEffect(() => { localStorage.setItem('geoloc_fuel_type', fuelType); }, [fuelType]);
  useEffect(() => { localStorage.setItem('geoloc_fuel_price', String(fuelPrice)); }, [fuelPrice]);

  const [userPos, setUserPos] = useState(null);
  const [userCity, setUserCity] = useState(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');
  const [country, setCountry] = useState('FR');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingDebounce, setSearchingDebounce] = useState(false);
  const [history, setHistory] = useState([]);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [cityImage, setCityImage] = useState(null); // URL de la miniature ville
  const [cityImageLoading, setCityImageLoading] = useState(false); // chargement en cours
  const [fallbackImgError, setFallbackImgError] = useState(false); // Erreur chargement image fallback
  const [modeProfile, setModeProfile] = useState('driving'); // driving | cycling | walking
  const [darkMode, setDarkMode] = useState(false);

  // Fond de carte + plein ecran
  const [mapStyle, setMapStyle] = useState('street');
  const [fullScreenMap, setFullScreenMap] = useState(false);

  // Langue + parametres
  const [lang, setLang] = useState('fr');
  const [showSettings, setShowSettings] = useState(false);
  const [customPrimary, setCustomPrimary] = useState('');
  const [customAccent, setCustomAccent] = useState('');
  // Admin secret
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminStats, setAdminStats] = useState(null);
  const [adminError, setAdminError] = useState('');

  // Taux de change (devises)
  const [exchangeRates, setExchangeRates] = useState(null);

  // Guide touristique IA conversationnel
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  const [pwaInstallAvailable, setPwaInstallAvailable] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState(null); // 'checking' | 'uptodate' | 'found' | null
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Détection hors-ligne
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Écouter la disponibilité d'installation PWA
  useEffect(() => {
    const handler = () => setPwaInstallAvailable(true);
    const installedHandler = () => setPwaInstallAvailable(false);
    window.addEventListener('pwa-install-available', handler);
    window.addEventListener('pwa-installed', installedHandler);
    return () => {
      window.removeEventListener('pwa-install-available', handler);
      window.removeEventListener('pwa-installed', installedHandler);
    };
  }, []);

  // ===== Mise à jour automatique au démarrage =====
  useEffect(() => {
    // Vérifier les mises à jour dès l'ouverture de l'app
    if (window.checkForUpdates) {
      window.checkForUpdates();
    }
  }, []);

  // Écouter les mises à jour PWA automatiques
  useEffect(() => {
    const autoHandler = () => {
      setError('🔄 Mise à jour détectée — rechargement...');
      setTimeout(() => setError(''), 3000);
    };
    // Mise à jour trouvée via le bouton manuel → afficher le message inline
    const foundHandler = () => {
      setUpdateCheckMsg('found');
    };
    window.addEventListener('sw-update-applied', autoHandler);
    window.addEventListener('sw-update-found', foundHandler);
    return () => {
      window.removeEventListener('sw-update-applied', autoHandler);
      window.removeEventListener('sw-update-found', foundHandler);
    };
  }, []);
  // ===== Fin mise à jour automatique =====

  const debounceRef = useRef(null);

  // Charger l'historique
  useEffect(() => {
    try {
      const saved = localStorage.getItem('geoHistory');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) { /* ignore */ }
  }, []);

  // ===== Récupérer les taux de change au démarrage (open.er-api.com, gratuit) =====
  useEffect(() => {
    // Essayer le cache d'abord
    try {
      const cached = sessionStorage.getItem('geoCache:exchangeRates');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 3600000) { // 1h de cache
          setExchangeRates(parsed.data);
          return;
        }
      }
    } catch {}
    // Sinon fetch avec retry
    const fetchRates = (attempt = 0) => {
      fetch('https://open.er-api.com/v6/latest/EUR')
        .then(r => r.json())
        .then(data => {
          if (data && data.result === 'success' && data.rates) {
            setExchangeRates(data.rates);
            try { sessionStorage.setItem('geoCache:exchangeRates', JSON.stringify({ ts: Date.now(), data: data.rates })); } catch {}
          }
        })
        .catch(() => {
          if (attempt < 2) setTimeout(() => fetchRates(attempt + 1), 1000);
        });
    };
    fetchRates();
  }, []);

  // Mode sombre
  useEffect(() => {
    document.body.className = darkMode ? 'dark-mode' : '';
  }, [darkMode]);

  // Reset du chat IA quand on change de ville ou pays
  useEffect(() => {
    setChatStarted(false);
    setChatMessages([]);
    setChatInput('');
  }, [location]);

  // Lecture des paramètres d'URL pour le partage + white-label
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pc = params.get('pc');
    const city = params.get('city');
    const from = params.get('from');
    const to = params.get('to');
    const wp = params.get('wp'); // waypoints
    const logo = params.get('logo');
    const primary = params.get('primary');
    const accent = params.get('accent');

    // White-label : personnalisation via URL
    if (primary || accent || logo) {
      const root = document.documentElement;
      if (primary) {
        root.style.setProperty('--wl-primary', primary);
        document.querySelector('header').style.background = primary;
      }
      if (accent) root.style.setProperty('--accent', accent);
      if (logo) {
        const brand = document.querySelector('.app-brand');
        if (brand) {
          const existingLogo = brand.querySelector('.app-logo');
          const titleEl = brand.querySelector('.app-title');
          if (existingLogo) {
            existingLogo.innerHTML = `<img src="${encodeURI(logo)}" alt="Logo" style="height:48px;width:auto">`;
          }
          if (titleEl) titleEl.style.display = 'none';
        }
      }
    }

    if (from && to) {
      // Mode distance partagé
      setMode('distance');
      handleSharedRoute(from, to, wp);
    } else if (pc) {
      setSearchInput(pc);
      handleSearch(pc);
    } else if (city) {
      setSearchInput(city);
      handleSearch(city);
    }
  }, []);

  // Route partagée
  const handleSharedRoute = async (from, to, wpStr) => {
    try {
      // Chercher les villes par nom
      const [fromData, toData] = await Promise.all([
        cachedGet(`${API}/api/search`, { q: from, limit: 1 }),
        cachedGet(`${API}/api/search`, { q: to, limit: 1 })
      ]);
      const fromArr = Array.isArray(fromData) ? fromData : (fromData?.data || []);
      const toArr = Array.isArray(toData) ? toData : (toData?.data || []);
      if (fromArr.length > 0) {
        handleDistanceCity(fromArr[0], 'A');
      }
      if (toArr.length > 0) {
        handleDistanceCity(toArr[0], 'B');
      }
      if (wpStr) {
        const wpNames = wpStr.split(';');
        for (const name of wpNames) {
          const resp = await cachedGet(`${API}/api/search`, { q: name, limit: 1 });
          const arr = Array.isArray(resp) ? resp : (resp?.data || []);
          if (arr.length > 0) {
            addWaypointWithData(arr[0]);
          }
        }
      }
    } catch (e) {
      setError('Route partagée : impossible de charger les villes.');
    }
  };

  const saveToHistory = (entry) => {
    const newHistory = [entry, ...history.filter(h => h.postal_code !== entry.postal_code)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('geoHistory', JSON.stringify(newHistory));
  };

  // ===== Météo via Open-Meteo (actuelle + 3 jours) avec UV + Qualité de l'air =====
  const fetchWeather = async (lat, lon) => {
    try {
      // Demander l'indice UV et la qualité de l'air au backend
      const data = await cachedGet(`${API}/api/weather`, { lat, lon, include: 'uv_index,aqi' });
      if (data && !data.error) {
        setWeather(data);
        // Si le backend ne renvoie pas les données AQI, les récupérer directement depuis Open-Meteo (gratuit)
        if (data && data.current && data.current.european_aqi == null && data.current.us_aqi == null) {
          fetchAirQuality(lat, lon);
        }
      } else {
        setWeather(null);
      }
    } catch { setWeather(null); }
  };

  // ===== Qualité de l'air via Open-Meteo (gratuit, sans clé) =====
  const fetchAirQuality = async (lat, lon) => {
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,us_aqi`;
      const resp = await fetch(url);
      const aqiData = await resp.json();
      if (aqiData && aqiData.current) {
        setWeather(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            current: {
              ...prev.current,
              european_aqi: aqiData.current.european_aqi,
              us_aqi: aqiData.current.us_aqi
            }
          };
        });
      }
    } catch { /* La qualité de l'air est optionnelle */ }
  };

  // ===== Chat conversationnel IA via backend Gemini =====
  const sendChatMessage = async (text) => {
    if (!location || !text.trim()) return;
    const userMsg = { role: 'user', text: text.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const resp = await apiPost(`${API}/api/ai/chat`, {
        city: location.city,
        country_code: location.country_code,
        lang: lang,
        messages: updatedMessages,
      });
      const reply = resp.data.response || resp.data.guide || '...';
      setChatMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch {
      const errMsg = lang === 'fr'
        ? '❌ Erreur lors de la génération de la réponse. Réessayez.'
        : '❌ Error generating the response. Please retry.';
      setChatMessages(prev => [...prev, { role: 'model', text: errMsg }]);
    }
    setChatLoading(false);
  };

  // Démarrer le chat automatiquement avec une première question
  const startChat = () => {
    setChatStarted(true);
    const firstQuestion = lang === 'fr'
      ? `Quels sont les meilleurs endroits à visiter à ${location.city} et quelle spécialité locale goûter ?`
      : `What are the best places to visit in ${location.city} and what local specialty should I try?`;
    sendChatMessage(firstQuestion);
  };

  // ===== Partage =====
  // Partage de l'application complète
  const [showQR, setShowQR] = useState(false);
  const APP_URL = window.location.origin;

  const shareApp = () => {
    const url = APP_URL;
    // Inclure l'heure locale de la destination si disponible
    const timeStr = localTimeStr ? ` (🕐 ${localTimeStr})` : '';
    const destStr = location?.city ? `\n📍 ${location.city}${location.postal_code ? ' ('+location.postal_code+')' : ''}${timeStr}` : '';
    const shareText = `🌍 GeoLoc - Recherche d'adresses, itinéraires, météo et population. Application gratuite et sans compte !${destStr}`;
    if (navigator.share) {
      navigator.share({
        title: 'GeoLoc - Recherche, Itinéraire, Météo',
        text: shareText,
        url: url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${shareText}\n${url}`).then(() => {
        setNotification('📋 Lien de l\'application copié !');
        setTimeout(() => setNotification(''), 2500);
      }).catch(() => {});
    }
  };

  const getSearchUrl = () => {
    return APP_URL;
  };

  // ===== Miniature ville (Wikipedia) =====
  useEffect(() => {
    if (!location?.city) { setCityImage(null); setCityImageLoading(false); setFallbackImgError(false); return; }
    setFallbackImgError(false);
    setCityImageLoading(true);
    const city = location.city;
    const country = location.country || 'France';
    // Essayer Wikipedia en français puis en anglais
    const fetchImage = async () => {
      for (const lang of ['fr', 'en']) {
        try {
          const resp = await fetch(
            `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(city)}&prop=pageimages&format=json&pithumbsize=300&origin=*`
          );
          const data = await resp.json();
          const pages = data?.query?.pages;
          if (pages) {
            const page = Object.values(pages)[0];
            if (page?.thumbnail?.source) {
              setCityImage(page.thumbnail.source);
              setCityImageLoading(false);
              return;
            }
          }
        } catch { /* ignore */ }
      }
      setCityImage(null);
      setCityImageLoading(false);
    };
    fetchImage();
  }, [location?.city, location?.country]);

  // ===== Heure locale (temps réel, rafraîchie toutes les 30s) =====
  const [localTimeStr, setLocalTimeStr] = useState('');
  const [timeOffsetStr, setTimeOffsetStr] = useState('');
  const getLocalTime = (countryCode, longitude) => {
    try {
      const tz = getTimezoneForLocation(countryCode, longitude);
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date());
    } catch { return ''; }
  };
  // Calcul du décalage horaire par rapport au navigateur
  const getTimeOffsetStr = (countryCode, longitude) => {
    try {
      const tz = getTimezoneForLocation(countryCode, longitude);
      // Offset du navigateur (minutes, positif pour UTC+)
      const browserOffset = -new Date().getTimezoneOffset();
      // Offset de la destination
      const now = new Date();
      const utcNow = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const destOffset = (tzNow - utcNow) / 60000;
      const diffMin = destOffset - browserOffset;
      if (Math.abs(diffMin) < 30) return ', même heure que vous';
      const hours = diffMin / 60;
      const sign = hours > 0 ? '+' : '';
      return ` (${sign}${hours.toFixed(1).replace('.0', '')}h par rapport à vous)`;
    } catch { return ''; }
  };
  // Mise à jour dynamique toutes les 30 secondes
  useEffect(() => {
    if (!location?.country_code) { setLocalTimeStr(''); setTimeOffsetStr(''); return; }
    const update = () => {
      setLocalTimeStr(getLocalTime(location.country_code, location.longitude));
      setTimeOffsetStr(getTimeOffsetStr(location.country_code, location.longitude));
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [location?.country_code, location?.longitude]);

  // ===== Mode Recherche =====
  const handleSearch = async (query, countryOverride) => {
    const term = (query || searchInput).trim();
    const countryCode = countryOverride || country;
    if (!term) return;
    setError(null);
    setLoading(true);
    setLoadingMessage('🔍 Recherche...');
    try {
      setLoadingMessage('📡 Connexion...');
      // Si le terme ne ressemble pas à un code postal, chercher d'abord via /api/search
      if (!term.match(/^\d/) && !countryOverride) {
        const suggestions = await cachedGet(`${API}/api/search`, { q: term, country: countryCode, limit: 5 });
        if (suggestions && suggestions.length > 0) {
          const best = suggestions[0];
          // Utiliser les données de la suggestion directement
          setLoadingMessage('🌍 Analyse...');
          const data = buildLocationFromData(best, countryCode);
          setLocation(data);
          saveToHistory(data);
          setShowSuggestions(false);
          trackSearch(data.city);
          trackServer(railFallbackActive ? 'render' : 'railway');
          setLoadingMessage('🌤️ Météo...');
          fetchWeather(data.latitude, data.longitude);
          setLoadingMessage('🖼️ Ville...');
          setLoading(false);
          setLoadingMessage('');
          return;
        }
      }
      const data = await cachedGet(`${API}/api/location/${encodeURIComponent(term)}`, { country: countryCode });
      setLoadingMessage('🌍 Analyse...');
      setLocation(data);
      saveToHistory(data);
      setShowSuggestions(false);
      // Tracker la recherche + serveur utilisé pour les stats admin
      trackSearch(data.city);
      trackServer(railFallbackActive ? 'render' : 'railway');
      // Charger la météo
      setLoadingMessage('🌤️ Météo...');
      fetchWeather(data.latitude, data.longitude);
      setLoadingMessage('🖼️ Ville...');
    } catch (err) {
      const errMsg = err?.response?.status === 404 || (err?.response?.data?.detail || '').includes('non trouvé') ? 'Ville non trouvée.' : `Erreur: ${err?.message || 'Réseau indisponible'}`;
      setError(errMsg);
      setLocation(null);
    } finally { setLoading(false); setLoadingMessage(''); }
  };

  // ===== Ville au hasard (Random Voyage) =====
  const handleRandomVoyage = () => {
    // Nettoyer l'ancien affichage pour éviter les mélanges
    setLocation(null);
    setWeather(null);
    setCityImage(null);
    setFallbackImgError(false);
    setError(null);
    // Choisir un pays aléatoire parmi ceux qui ont des villes dans SAMPLE_CITIES
    const codes = Object.keys(SAMPLE_CITIES);
    const randomCode = codes[Math.floor(Math.random() * codes.length)];
    const cities = SAMPLE_CITIES[randomCode];
    const randomCity = cities[Math.floor(Math.random() * cities.length)];
    // Mettre à jour le sélecteur de pays et le champ de recherche
    setCountry(randomCode);
    setSearchInput(randomCity);
    // Déclencher la recherche immédiatement avec le bon pays (pas de setTimeout)
    handleSearch(randomCity, randomCode);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setSearchInput(v);
    // Reset erreur dès qu'une nouvelle saisie commence
    setError(null);
    if (v.trim().length >= 3) {
      setSearchingDebounce(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          // Uniquement les villes/localités (pas d'adresses/rues)
          const promises = [
            cachedGet(`${API}/api/search`, { q: v, country, limit: 10 }).catch(() => [])
          ];
          const results = await Promise.all(promises);
          const cityResp = Array.isArray(results[0]) ? results[0] : (results[0]?.data || []);

          const cities = (cityResp || []).filter(c => c.city).slice(0, 10);
          setSuggestions(cities);
          setShowSuggestions(cities.length > 0);
        } catch { setSuggestions([]); }
        setSearchingDebounce(false);
      }, 800);
    } else { setSuggestions([]); setShowSuggestions(false); setSearchingDebounce(false); }
  };

  const selectSuggestion = async (item) => {
    setSearchInput(item.city || '');
    setShowSuggestions(false);
    setLoading(true);
    setLoadingMessage('📡 Connexion...');
    setError(null);
    
    try {
      setLoadingMessage('🌍 Analyse...');
      let data;
      if (item.postal_code) {
        data = await cachedGet(`${API}/api/location/${encodeURIComponent(item.postal_code)}`, { country: item.country_code || country, city: item.city });
      } else {
        data = buildLocationFromData(item, country);
      }
      // Population pour les pays supportés
      const cc = data.country_code || '';
      if (shouldFetchPopulation(cc, data.country)) {
        setLoadingMessage('👥 Population...');
        fetchPopulation(data.postal_code, data.city, cc).then(pop => {
          if (pop != null) setLocation(prev => ({ ...prev, population: pop }));
        });
      }
      setLoadingMessage('🌤️ Météo...');
      setLocation(data);
      saveToHistory(data);
      fetchWeather(data.latitude, data.longitude);
      setLoadingMessage('🖼️ Ville...');
    } catch (err) {
      setError(`Erreur: ${err?.message || 'Réseau indisponible'}`);
      setLocation(null);
    } finally { setLoading(false); setLoadingMessage(''); }
  };

  // ===== Helper pour la population côté itinéraire =====
  const fetchPopForCity = (locData, side) => {
    const cc = locData.country_code || '';
    if (shouldFetchPopulation(cc, locData.country)) {
      fetchPopulation(locData.postal_code, locData.city, cc).then(pop => {
        if (pop != null) {
          const updated = { ...locData, population: pop };
          if (side === 'A') setCityA(updated);
          else if (side === 'B') setCityB(updated);
          else if (side === 'wp') setWaypoints(prev => {
            const newWp = [...prev];
            newWp[newWp.length - 1] = { ...newWp[newWp.length - 1], population: pop };
            return newWp;
          });
        }
      });
    }
  };

  // ===== Mode Itinéraire =====
  const handleDistanceCity = async (cityData, side) => {
    const data = cityData;
    const countryForLookup = side === 'A' ? (countryA || 'FR') : (countryB || 'FR');
    const setter = (val) => { if (side === 'A') setCityA(val); else setCityB(val); };
    
    // Si c'est une adresse complète, on a déjà les coordonnées exactes
    if (data._type === 'address') {
      const addrData = { ...buildLocationFromData(data, countryForLookup), is_address: true };
      fetchPopForCity(addrData, side);
      setter(addrData);
      return;
    }
    
    // Sinon, ville normale : chercher les détails via l'API
    try {
      let locResp;
      if (data.postal_code) {
        locResp = await cachedGet(`${API}/api/location/${encodeURIComponent(data.postal_code)}`, { country: data.country_code || countryForLookup, city: data.city });
      } else {
        locResp = buildLocationFromData(data, countryForLookup);
      }
      fetchPopForCity(locResp, side);
      setter(locResp);
    } catch {
      setter(buildLocationFromData(data, countryForLookup));
    }
  };

  // ===== Waypoints (Multi-étapes) =====
  const addWaypoint = () => {
    setWaypoints([...waypoints, null]);
    setWaypointCountries([...waypointCountries, 'FR']);
  };

  const addWaypointWithData = (cityData) => {
    const wp = {
      city: cityData.city,
      postal_code: cityData.postal_code,
      country: cityData.country || '',
      country_code: cityData.country_code || 'FR',
      latitude: cityData.latitude,
      longitude: cityData.longitude,
    };
    setWaypoints([...waypoints, wp]);
    setWaypointCountries([...waypointCountries, cityData.country_code || 'FR']);
  };

  const removeWaypoint = (idx) => {
    const newWp = [...waypoints];
    newWp.splice(idx, 1);
    setWaypoints(newWp);
    const newWpC = [...waypointCountries];
    newWpC.splice(idx, 1);
    setWaypointCountries(newWpC);
  };

  const handleWaypointSelect = async (cityData, idx) => {
    const newWp = [...waypoints];
    const newWpC = [...waypointCountries];
    const lookupCountry = cityData.country_code || waypointCountries[idx] || 'FR';
    
    if (cityData._type === 'address') {
      newWp[idx] = { ...buildLocationFromData(cityData, lookupCountry), is_address: true };
      newWpC[idx] = lookupCountry;
      setWaypoints(newWp);
      setWaypointCountries(newWpC);
      return;
    }
    
    try {
      if (cityData.postal_code) {
        newWp[idx] = await cachedGet(`${API}/api/location/${encodeURIComponent(cityData.postal_code)}`, { country: lookupCountry, city: cityData.city });
      } else {
        newWp[idx] = buildLocationFromData(cityData, lookupCountry);
      }
    } catch {
      newWp[idx] = buildLocationFromData(cityData, lookupCountry);
    }
    newWpC[idx] = lookupCountry;
    setWaypoints(newWp);
    setWaypointCountries(newWpC);
  };

  // ===== Inverser départ et arrivée (simple échange mémoire, zéro appel API) =====
  const swapCities = () => {
    const tmpCity = cityA;
    const tmpCountry = countryA;
    setCityA(cityB);
    setCountryA(countryB);
    setCityB(tmpCity);
    setCountryB(tmpCountry);
  };

  const resetCities = () => {
    setCityA(null);
    setCityB(null);
    setCountryA('FR');
    setCountryB('FR');
    setWaypoints([]);
    setWaypointCountries([]);
    setDistance(null);
    setDuration(null);
    setRouteCoords(null);
    setShowFuelCalc(false);
  };

  // ===== Géolocalisation =====
  const locateMe = () => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n\'est pas disponible sur votre navigateur.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserPos({ lat: latitude, lon: longitude, accuracy });
        // Reverse geocoding via notre API
        try {
          const data = await cachedGet(`${API}/api/reverse`, { lat: latitude, lon: longitude });
          setUserCity(data);
          if (mode === 'search') {
            setLocation(data);
            setSearchInput(data.city || '');
          }
        } catch { /* ignore */ }
        setLocating(false);
      },
      (err) => {
        setError(`Géolocalisation impossible: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Icône pour la position utilisateur (point bleu pulsant)
  const userIcon = L.divIcon({
    className: 'user-location-dot',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });

  // Vitesses moyennes pour estimer la durée selon le profil
  const PROFILE_SPEEDS = { driving: 50, cycling: 15, walking: 5 };

  // ===== Export PDF =====
  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    setExporting(true);
    setError('');
    try {
      const payload = {
        mode: mode,
        from_city: cityA?.city || '',
        to_city: cityB?.city || '',
        distance_km: distance || 0,
        duration_s: duration || 0,
        profile: modeProfile,
        waypoints: waypoints.filter(w => w && w.city).map(w => w.city),
        city: location?.city || '',
        postal_code: location?.postal_code || '',
        country: location?.country || '',
        latitude: location?.latitude || cityA?.latitude || '',
        longitude: location?.longitude || cityA?.longitude || '',
        weather: weather || null,
        fuel_cost: showFuelCalc ? calculateFuelCost().toFixed(2) : null
      };
      const resp = await apiPost(`${API}/api/export/pro-pdf`, payload, { responseType: 'blob', timeout: 30000 });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `geoloc-itineraire-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setError('PDF téléchargé !');
      setTimeout(() => setError(''), 2000);
    } catch (e) {
      setError('Erreur téléchargement PDF');
    } finally { setExporting(false); }
  };

  // ===== Pages légales =====
  const [legalPage, setLegalPage] = useState(null); // 'terms' | 'privacy' | null

  // ===== Page API / Développeurs =====
  const [showApi, setShowApi] = useState(false);
  const [apiKeyGenerated, setApiKeyGenerated] = useState(null);
  const [apiKeyEmail, setApiKeyEmail] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [apiKeyError, setApiKeyError] = useState('');
  const generateApiKey = async () => {
    if (!apiKeyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(apiKeyEmail)) {
      setApiKeyError('Email valide requis');
      return;
    }
    setApiKeyStatus('loading');
    setApiKeyError('');
    try {
      const data = await cachedGet(`${API}/api/auth/register`, { email: apiKeyEmail });
      setApiKeyGenerated(data.api_key);
      setApiKeyStatus('done');
    } catch (err) {
      let errDetail = err?.response?.data?.detail;
      if (errDetail && typeof errDetail !== 'string') { try { errDetail = JSON.stringify(errDetail); } catch { errDetail = String(errDetail); } }
      setApiKeyError(errDetail || err?.message || 'Erreur réseau');
      setApiKeyStatus('error');
    }
  };

  // ===== Admin (messages) =====
  const urlParams = new URLSearchParams(window.location.search);
  const adminToken = urlParams.get('admin');
  const [showAdmin, setShowAdmin] = useState(!!adminToken);
  const [adminMessages, setAdminMessages] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  useEffect(() => {
    if (showAdmin && adminToken) {
      setAdminLoading(true);
      cachedGet(`${API}/api/admin/messages`, { token: adminToken })
        .then(data => { setAdminMessages(data.messages || []); setAdminLoading(false); })
        .catch(err => { setAdminLoading(false); let admDetail = err?.response?.data?.detail; if (admDetail && typeof admDetail !== 'string') { try { admDetail = JSON.stringify(admDetail); } catch { admDetail = String(admDetail); } }; alert('Erreur admin: ' + (admDetail || err?.message || 'Erreur réseau')); });
    }
  }, [showAdmin, adminToken]);

  // ===== Formulaire de contact =====
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactStatus, setContactStatus] = useState(null); // null | 'sending' | 'done' | 'error'
  const [contactErrorMsg, setContactErrorMsg] = useState('');
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const sendContact = async () => {
    // Validation email
    if (!contactForm.email) {
      setContactErrorMsg("❌ L'adresse email est obligatoire.");
      setContactStatus('error');
      return;
    }
    if (!EMAIL_REGEX.test(contactForm.email)) {
      setContactErrorMsg("❌ L'adresse email n'est pas valide. Exemple : votrenom@email.com");
      setContactStatus('error');
      return;
    }
    // Validation message
    if (!contactForm.message) {
      setContactErrorMsg("❌ Le message est vide. Écrivez votre message avant d'envoyer.");
      setContactStatus('error');
      return;
    }
    setContactStatus('sending');
    setContactErrorMsg('');
    try {
      await apiPost(`${API}/api/contact`, contactForm, { timeout: 10000 });
      setContactStatus('done');
      setContactErrorMsg('');
      setContactForm({ name: '', email: '', subject: '', message: '' });
      setTimeout(() => { setShowContact(false); setContactStatus(null); }, 2000);
    } catch (e) {
      console.error('Contact error (full):', e);
      if (e.response) {
        console.error('Response status:', e.response.status);
        console.error('Response data:', e.response.data);
      }
      let detail = e.response?.data?.detail;
      // Si le détail est un objet/tableau, le formater lisiblement
      if (detail && typeof detail !== 'string') {
        try { detail = JSON.stringify(detail); } catch { detail = String(detail); }
      }
      setContactErrorMsg(detail ? `❌ ${detail}` : "❌ Erreur d'envoi. Vérifiez votre connexion et réessayez.");
      setContactStatus('error');
    }
  };

  // ===== Calcul itinéraire via API backend avec waypoints =====
  const buildWaypointsParam = () => {
    const validWp = waypoints.filter(w => w && w.latitude && w.longitude);
    if (validWp.length === 0) return '';
    return validWp.map(w => `${w.latitude},${w.longitude}`).join(';');
  };

  useEffect(() => {
    if (!cityA || !cityB) {
      setDistance(null);
      setDuration(null);
      setRouteCoords(null);
      setRouteAlternatives(null);
      setSelectedRouteIdx(0);
      return;
    }

    // Construire la chaîne de waypoints
    const waypointsParam = buildWaypointsParam();

    // Calculer la distance totale à vol d'oiseau (fallback)
    let totalAirKm = haversineKm(cityA.latitude, cityA.longitude, cityB.latitude, cityB.longitude);
    if (waypointsParam) {
      const validWp = waypoints.filter(w => w && w.latitude && w.longitude);
      totalAirKm = haversineKm(cityA.latitude, cityA.longitude, validWp[0].latitude, validWp[0].longitude);
      for (let i = 0; i < validWp.length - 1; i++) {
        totalAirKm += haversineKm(validWp[i].latitude, validWp[i].longitude, validWp[i+1].latitude, validWp[i+1].longitude);
      }
      totalAirKm += haversineKm(validWp[validWp.length - 1].latitude, validWp[validWp.length - 1].longitude, cityB.latitude, cityB.longitude);
    }
    setDistance(Math.round(totalAirKm));
    setRouteCoords(null);
    setRouteAlternatives(null);
    setSelectedRouteIdx(0);

    const profile = modeProfile;
    let url = `${API}/api/directions?origin_lat=${cityA.latitude}&origin_lon=${cityA.longitude}&dest_lat=${cityB.latitude}&dest_lon=${cityB.longitude}&profile=${profile}&alternatives=3`;
    if (waypointsParam) {
      url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    // Fallback Railway → Render pour les directions
    const fetchDirections = async () => {
      if (!railFallbackActive) {
        try {
          return await RAILWAY_CLIENT.get(url).then(r => r.data);
        } catch (e) {
          console.warn('⚠️ Railway directions indisponible, fallback Render :', e.message);
          railFallbackActive = true;
        }
      }
      const renderUrl = url.replace(API_RAILWAY, API_FALLBACK);
      return await API_CLIENT.get(renderUrl).then(r => r.data);
    };
    fetchDirections().then(data => {
        if (data.distance) {
          const km = data.distance / 1000;
          const coords = data.route_coords || [];
          const leafletCoords = coords.map(c => [c[1], c[0]]);

          setDistance(Math.round(km));
          setRouteCoords(leafletCoords.length > 0 ? leafletCoords : null);
          setDuration(data.duration || null);

          // Stocker toutes les routes alternatives (nouveau format: data.routes, ancien: 1 seule route)
          if (data.routes && data.routes.length > 1) {
            const alternatives = data.routes.map((r, idx) => {
              const rCoords = (r.route_coords || []).map(c => [c[1], c[0]]);
              return {
                distance: Math.round(r.distance / 1000),
                duration: r.duration || null,
                route_coords: rCoords,
                selected: idx === 0
              };
            });
            setRouteAlternatives(alternatives);
          } else if (data.routes && data.routes.length === 1) {
            // Si le backend n'a retourné qu'une seule route, on crée tout de même un tableau
            const r = data.routes[0];
            const rCoords = (r.route_coords || []).map(c => [c[1], c[0]]);
            setRouteAlternatives([{
              distance: Math.round(r.distance / 1000),
              duration: r.duration || null,
              route_coords: rCoords
            }]);
          } else {
            // Ancien format (sans data.routes) : créer une seule alternative avec les données principales
            setRouteAlternatives([{
              distance: Math.round(data.distance / 1000),
              duration: data.duration || null,
              route_coords: (data.route_coords || []).map(c => [c[1], c[0]])
            }]);
          }
        }
      })
      .catch(() => {
        // Fallback : la distance à vol d'oiseau reste affichée
        const speedKmh = PROFILE_SPEEDS[profile] || 50;
        setDuration(Math.round((totalAirKm / speedKmh) * 3600));
      });
  }, [cityA, cityB, waypoints, modeProfile]);

  // Calcul du coût carburant
  const calculateFuelCost = () => {
    if (!distance) return 0;
    const cost = (distance / 100) * fuelConsumption * fuelPrice;
    return Math.round(cost * 100) / 100;
  };

  // ===== POIs (liens affiliés) =====
  const getAffiliateLinks = (cityName, countryCode) => {
    const searchCity = encodeURIComponent(cityName || '');
    return [
      {
        name: '🏨 Hôtels',
        url: `https://www.booking.com/searchresults.html?ss=${searchCity}`,
        label: `Hôtels à ${cityName}`
      },
      {
        name: '🚗 Voitures',
        url: `https://www.kayak.com/cars/${searchCity}`,
        label: `Location de voiture à ${cityName}`
      },
      {
        name: '🎟️ Activités',
        url: `https://www.tripadvisor.com/Search?q=${searchCity}`,
        label: `Activités à ${cityName}`
      },
    ];
  };

  // Centrer la carte sur les deux points
  const getMapCenter = () => {
    if (mode === 'distance' && cityA && cityB) {
      return [(cityA.latitude + cityB.latitude) / 2, (cityA.longitude + cityB.longitude) / 2];
    }
    if (location) return [location.latitude, location.longitude];
    return [48.8566, 2.3522];
  };

  const getMapZoom = () => {
    if (mode === 'distance' && cityA && cityB) return 8;
    return 13;
  };

  // Positions des marqueurs
  const aPos = cityA ? [cityA.latitude, cityA.longitude] : null;
  const bPos = cityB ? [cityB.latitude, cityB.longitude] : null;

  // Ligne de vol d'oiseau (directe, sans waypoints)
  const getLineCoords = () => {
    const points = [];
    if (aPos) points.push(aPos);
    waypoints.filter(w => w && w.latitude).forEach(w => points.push([w.latitude, w.longitude]));
    if (bPos) points.push(bPos);
    return points.length >= 2 ? points : null;
  };
  const lineCoords = getLineCoords();

  // ===== Rendu =====
  return (
    <div className="App">
      <header>
        <div className="app-brand">
          <div className="app-logo">
            <svg viewBox="0 0 60 60" className="logo-svg">
              <defs>
                <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea"/>
                  <stop offset="100%" stopColor="#764ba2"/>
                </linearGradient>
              </defs>
              <circle cx="30" cy="30" r="27" fill="none" stroke="url(#lg)" strokeWidth="3" opacity="0.9"/>
              <ellipse cx="30" cy="30" rx="16" ry="27" fill="none" stroke="url(#lg)" strokeWidth="2.5" opacity="0.7"/>
              <ellipse cx="30" cy="30" rx="27" ry="12" fill="none" stroke="url(#lg)" strokeWidth="2" opacity="0.6"/>
              <circle cx="30" cy="14" r="4" fill="white" opacity="0.9"/>
              <circle cx="43" cy="22" r="3" fill="white" opacity="0.6"/>
              <circle cx="22" cy="42" r="3.5" fill="white" opacity="0.7"/>
              <circle cx="16" cy="25" r="2.5" fill="white" opacity="0.5"/>
              <circle cx="38" cy="44" r="2" fill="white" opacity="0.4"/>
            </svg>
          </div>
          <div className="app-title">GeoLoc</div>
          <div className="app-tagline">Recherche · Itinéraire · Météo</div>
        </div>

        {/* Onglets */}
        <div className="tabs">
          <button className={`tab ${mode === 'search' ? 'active' : ''}`} onClick={() => { setMode('search'); setError(''); setLocation(null); setSearchInput(''); setWeather(null); setCityImage(null); setFallbackImgError(false); }}>🏠 {lang === 'fr' ? 'Accueil' : 'Home'}</button>
          <button className={`tab ${mode === 'distance' ? 'active' : ''}`} onClick={() => { setMode('distance'); setError(''); }}>🗺️ Itinéraire</button>
          <button className="tab tab-dark" onClick={() => setDarkMode(!darkMode)} title="Mode sombre">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button className="tab tab-lang" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} title="Langue">
            {lang === 'fr' ? '🇬🇧' : '🇫🇷'}
          </button>
          <button className="tab tab-settings" onClick={() => setShowSettings(true)} title="Paramètres">
            ⚙️
          </button>
        </div>

        {/* Barre d'outils */}
        <div className="search-bar" style={{ marginTop: '10px' }}>
          <button className="btn-locate" onClick={locateMe} disabled={locating} title="Ma position">
            {locating ? '⏳' : '📍'}
          </button>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="country-select">
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>

          {mode === 'search' && (
            <>
              <div className="search-input-wrapper">
                <input type="text" value={searchInput} onChange={handleInputChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={tr("searchPlaceholder", lang)} />
                {searchingDebounce && <span className="search-spinner">⏳ Recherche...</span>}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions">
                    {suggestions.map((s, idx) => {
                      const code = s.postal_code ? `(${s.postal_code})` : '';
                      const countryName = s.country || s.country_code || '';
                      return (
                        <li key={idx} onMouseDown={() => selectSuggestion(s)}>
                          <span className="suggestion-city">
                            🏙️ {s.city}
                          </span>
                          <span className="suggestion-code">
                            {code} {countryName}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <button onClick={() => handleSearch()} disabled={loading || searchingDebounce}>
                {loading ? '⏳' : searchingDebounce ? '⏳' : '🔍 Rechercher'}
              </button>
            </>
          )}

          {mode === 'search' && (
            <div className="random-row">
              <button className="btn-random" onClick={handleRandomVoyage} disabled={loading} title={lang === 'fr' ? 'Ville au hasard' : 'Random city'}>
                🎲 {lang === 'fr' ? 'Ville au Hasard' : 'Random City'} 🎲
              </button>
            </div>
          )}

          {mode === 'distance' && (
            <button className="btn-reset" onClick={resetCities}>↺ Réinitialiser</button>
          )}
        </div>

        {/* Zone Distance : départ + waypoints + arrivée */}
        {mode === 'distance' && (
          <>
            <div className="distance-multi">
              {/* Départ */}
              <div className="city-with-country waypoint-main">
                <CityInput label="Départ" value={cityA?.city || ''} country={countryA}
                  placeholder="Paris" onSelect={(data) => handleDistanceCity(data, 'A')} />
                <select className="country-select-mini" value={countryA} onChange={(e) => setCountryA(e.target.value)}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code} title={c.name}>{c.flag}</option>)}
                </select>
              </div>

              {/* Bouton inverser départ/arrivée */}
              <div className="swap-container">
                <button className="btn-swap" onClick={swapCities} title="Inverser départ et arrivée"
                  disabled={!cityA && !cityB}>
                  ⇄
                </button>
              </div>

              {/* Flèche */}
              <div className="waypoint-connector">
                <span className="wp-arrow">↓</span>
              </div>

              {/* Waypoints (arrêts) */}
              {waypoints.map((wp, idx) => (
                <div key={idx} className="waypoint-row">
                  <div className="wp-number-badge">{idx + 1}</div>
                  <div className="city-with-country waypoint-item">
                    <CityInput label={`Arrêt ${idx + 1}`} value={wp?.city || ''} country={waypointCountries[idx] || 'FR'}
                      placeholder={`Arrêt ${idx + 1}`}
                      onSelect={(data) => handleWaypointSelect(data, idx)} />
                    <select className="country-select-mini" value={waypointCountries[idx] || 'FR'}
                      onChange={(e) => {
                        const newC = [...waypointCountries];
                        newC[idx] = e.target.value;
                        setWaypointCountries(newC);
                      }}>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code} title={c.name}>{c.flag}</option>)}
                    </select>
                  </div>
                  <button className="btn-remove-wp" onClick={() => removeWaypoint(idx)} title="Supprimer cet arrêt">✕</button>
                  <div className="waypoint-connector">
                    <span className="wp-arrow">↓</span>
                  </div>
                </div>
              ))}

              {/* Bouton Ajouter un arrêt */}
              <button className="btn-add-stop" onClick={addWaypoint}>
                + Ajouter un arrêt
              </button>

              <div className="waypoint-connector">
                <span className="wp-arrow">↓</span>
              </div>

              {/* Arrivée */}
              <div className="city-with-country waypoint-main">
                <CityInput label="Arrivée" value={cityB?.city || ''} country={countryB}
                  placeholder="Marseille" onSelect={(data) => handleDistanceCity(data, 'B')} />
                <select className="country-select-mini" value={countryB} onChange={(e) => setCountryB(e.target.value)}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code} title={c.name}>{c.flag}</option>)}
                </select>
              </div>
            </div>

            <div className="profile-selector">
              <label>Mode :</label>
              <select value={modeProfile} onChange={(e) => setModeProfile(e.target.value)}>
                <option value="driving">🚗 Voiture</option>
                <option value="cycling">🚲 Vélo</option>
                <option value="walking">🚶 Piéton</option>
              </select>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {notification && <p className="notification">{notification}</p>}
        {isOffline && <p className="offline-banner">📡 {lang === 'fr' ? 'Vous êtes hors ligne — données en cache uniquement' : 'You are offline — cached data only'}</p>}
      </header>
      {/* Overlay de chargement réactif */}
      {loading && loadingMessage && (
        <div className="loading-overlay">
          <div className="loading-modal">
            <div className="loading-spinner"></div>
            <p className="loading-text">{loadingMessage}</p>
          </div>
        </div>
      )}

      {/* Résultat distance */}
      {mode === 'distance' && distance !== null && (
        <div className="result-info distance-result">
          <h2>🗺️ Itinéraire</h2>
          
          {/* Sélecteur d'itinéraires alternatifs */}
          {routeAlternatives && routeAlternatives.length >= 1 && (
            <div className="route-alternatives">
              <h4 className="alt-title">{routeAlternatives.length > 1 ? 'Choisissez votre itinéraire :' : 'Itinéraire proposé :'}</h4>
              <div className="alt-cards">
                {routeAlternatives.map((alt, idx) => (
                  <button
                    key={idx}
                    className={`alt-card ${selectedRouteIdx === idx ? 'alt-card-active' : ''}`}
                    onClick={() => {
                      setSelectedRouteIdx(idx);
                      setDistance(alt.distance);
                      setDuration(alt.duration);
                      setRouteCoords(alt.route_coords.length > 0 ? alt.route_coords : null);
                    }}
                  >
                    <span className="alt-number">#{idx + 1}</span>
                    <span className="alt-detail">
                      <strong>{alt.distance.toLocaleString()} km</strong>
                      {alt.duration !== null && (
                        <span className="alt-time">
                          ⏱️ {Math.floor(alt.duration / 3600)}h{Math.round((alt.duration % 3600) / 60)}min
                        </span>
                      )}
                    </span>
                    {idx === 0 && <span className="alt-badge">Recommandé</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="distance-value">{distance.toLocaleString()} km</p>
          {duration !== null && (
            <p className="duration-value">
              ⏱️ {Math.floor(duration / 3600)}h{Math.round((duration % 3600) / 60)}min
              {routeAlternatives && routeAlternatives.length > 1 && (
                <span className="wp-badge"> 🛣️ {routeAlternatives.length} propositions</span>
              )}
              {waypoints.filter(w => w && w.city).length > 0 && (
                <span className="wp-badge"> 🛑 {waypoints.filter(w => w && w.city).length} arrêt(s)</span>
              )}
            </p>
          )}
          {/* Villes visitées */}
          <div className="route-stops">
            <span className="stop-chip" title={cityA?.display_name || cityA?.city}>
              {cityA?.is_address ? (cityA.display_name?.split(',')[0] || cityA.city) : cityA?.city}
            </span>
            {waypoints.filter(w => w && w.city).map((wp, idx) => (
              <span key={idx} className="stop-chip stop-chip-wp" title={wp.display_name || wp.city}>
                {wp.is_address ? (wp.display_name?.split(',')[0] || wp.city) : wp.city}
              </span>
            ))}
            <span className="stop-chip" title={cityB?.display_name || cityB?.city}>
              {cityB?.is_address ? (cityB.display_name?.split(',')[0] || cityB.city) : cityB?.city}
            </span>
          </div>
          <p className="coords">
            {routeCoords ? 'Route calculée' : 'Vol d\'oiseau'}
            <span className="profile-badge">
              {modeProfile === 'driving' ? '🚗' : modeProfile === 'cycling' ? '🚲' : '🚶'}
              {' '}{modeProfile === 'driving' ? 'Voiture' : modeProfile === 'cycling' ? 'Vélo' : 'Piéton'}
            </span>
          </p>

          {/* Coût carburant */}
          <div className="fuel-cost-section">
            <button className="btn-fuel-toggle" onClick={() => setShowFuelCalc(!showFuelCalc)}>
              ⛽ {showFuelCalc ? 'Masquer' : 'Estimer'} le coût carburant
            </button>
            {showFuelCalc && (
              <div className="fuel-calc">
                <div className="fuel-row">
                  <label>Consommation :</label>
                  <input type="number" value={fuelConsumption} min="0" step="0.1"
                    onChange={(e) => setFuelConsumption(parseFloat(e.target.value) || 0)}
                    className="fuel-input" /> L/100km
                </div>
                <div className="fuel-row">
                  <label>Carburant :</label>
                  <select value={fuelType} onChange={(e) => {
                    setFuelType(e.target.value);
                    if (e.target.value === 'essence') setFuelPrice(1.85);
                    else if (e.target.value === 'diesel') setFuelPrice(1.75);
                    else if (e.target.value === 'electrique') setFuelPrice(0.25);
                    else setFuelPrice(1.85);
                  }} className="fuel-select">
                    <option value="essence">⛽ Essence</option>
                    <option value="diesel">🛢️ Diesel</option>
                    <option value="electrique">⚡ Électrique</option>
                    <option value="gpl">🔥 GPL</option>
                  </select>
                </div>
                <div className="fuel-row">
                  <label>Prix au litre :</label>
                  <input type="number" value={fuelPrice} min="0" step="0.01"
                    onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)}
                    className="fuel-input" /> €/L
                </div>
                <div className="fuel-result">
                  <strong>💰 Coût estimé : {calculateFuelCost().toFixed(2)} €</strong>
                  <small>({distance} km × {fuelConsumption}L/100km × {fuelPrice}€/L)</small>
                </div>
              </div>
            )}
          </div>

          {/* POIs (liens affiliés) */}
          {(cityA || cityB) && (
            <div className="poi-section">
              <h3>🔗 Hébergement & Transport</h3>
              <div className="poi-links">
                {cityA && getAffiliateLinks(cityA.city, cityA.country_code).map((link, idx) => (
                  <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="poi-link">
                    {link.name}
                    <small>{link.label.split(' ').slice(1).join(' ')}</small>
                  </a>
                ))}
                {cityA && cityB && cityA.city !== cityB.city && (
                  <a href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(cityB.city)}`}
                    target="_blank" rel="noopener noreferrer" className="poi-link">
                    🏨 Hôtels
                    <small>à {cityB.city}</small>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Boutons d'action */}
          <div className="actions">
            <button className="btn-share" onClick={shareApp}>📤 Partager</button>
            <button className="btn-qr" onClick={() => setShowQR(!showQR)}>
              📱 {showQR ? 'Masquer QR' : 'QR Code'}
            </button>
            <button className="btn-export" onClick={exportPdf} disabled={exporting}>
              {exporting ? '⏳' : '📄'} Export PDF
            </button>
          </div>
          {showQR && (
            <QRCodeView url={getSearchUrl()} lang={lang} />
          )}
        </div>
      )}

      {/* Résultat recherche */}
      {mode === 'search' && location && (
        <div className="result-info">
          <div className="city-header">
            {cityImageLoading ? (
              <div className="city-thumbnail-placeholder">
                <div className="thumbnail-spinner"></div>
              </div>
            ) : cityImage ? (
              <a href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(location.city)}`} target="_blank" rel="noopener noreferrer" className="city-thumbnail-link" title={lang === 'fr' ? 'Voir sur Wikipédia' : 'View on Wikipedia'}>
                <img src={cityImage} alt={location.city} className="city-thumbnail" loading="lazy" onError={() => { setCityImage(null); setCityImageLoading(false); }} />
              </a>
            ) : fallbackImgError ? (
              <div className="city-thumbnail-fallback">🏙️</div>
            ) : (
              <div className="city-thumbnail-fallback">
                <img src={`https://source.unsplash.com/featured/80x80/?${encodeURIComponent(location.country || 'landscape')},landscape`} alt={location.country || ''} className="city-thumbnail-fallback-img" loading="lazy" onError={() => setFallbackImgError(true)} />
              </div>
            )}
            <div className="city-info">
              {location.display_name ? (
                <>
                  <h2>{location.display_name.split(',')[0]}</h2>
                  <p className="address-full">{location.display_name}</p>
                  <p className="country-name">
                {location.country}
                {location.country_code && CURRENCY_MAP[location.country_code] && exchangeRates && (
                  <span className="currency-badge">
                    {CURRENCY_MAP[location.country_code] === 'EUR'
                      ? '💱 Euro'
                      : `💱 1 € = ${exchangeRates[CURRENCY_MAP[location.country_code]].toFixed(2)} ${CURRENCY_MAP[location.country_code]}`
                    }
                  </span>
                )}
              </p>
                </>
              ) : (
                <>
                  <h2>{location.city} {location.postal_code ? <span className="postal-code">({location.postal_code})</span> : ''}</h2>
                  <p className="country-name">
                {location.country}
                {location.country_code && CURRENCY_MAP[location.country_code] && exchangeRates && (
                  <span className="currency-badge">
                    {CURRENCY_MAP[location.country_code] === 'EUR'
                      ? '💱 Euro'
                      : `💱 1 € = ${exchangeRates[CURRENCY_MAP[location.country_code]].toFixed(2)} ${CURRENCY_MAP[location.country_code]}`
                    }
                  </span>
                )}
              </p>
                </>
              )}
              {location.latitude && location.longitude && localTimeStr && (
                <span className="local-time">🕐 <span className="local-time-label">{lang === 'fr' ? 'Heure locale' : 'Local time'} :</span> {localTimeStr}{timeOffsetStr}</span>
              )}
            </div>
          </div>
          <div className="details">
            {location.department && <span className="detail-badge">📍 {location.department}</span>}
            {location.region && <span className="detail-badge">🗺️ {location.region}</span>}
            <div className="population-badge"><span className="pop-icon">👤</span><span className="pop-label">Population :</span>{location.population > 0 ? <><span className="pop-value">{location.population.toLocaleString('fr-FR')}</span><span className="pop-unit">habitants</span></> : <span className="pop-value pop-unknown">Non spécifiée</span>}</div>
            {location.is_address && <span className="detail-badge address-badge">📍 Adresse précise</span>}
          </div>
          {weather && weather.current && !weather.error ? (
            <>
              <WeatherWidget weather={weather} cityName={location?.city} lang={lang} />
              <ActivitiesWidget weatherCode={weather.current.weathercode} cityName={location?.city} lang={lang} />
            </>
          ) : location && !loading && (
            <div className="weather-fallback">
              🌤️ {lang === 'fr' ? 'Météo temporairement indisponible' : 'Weather temporarily unavailable'}
            </div>
          )}

          {/* Chat Guide Touristiqu IA conversationnel */}
          {location?.country_code && !chatStarted && (
            <div className="ai-guide-section">
              <button className="ai-guide-btn" onClick={startChat} disabled={chatLoading}>
                {chatLoading ? '⏳ Démarrage...' : '🤖 Mon guide touristique IA'}
              </button>
            </div>
          )}

          {chatStarted && (
            <div className="chat-section">
              <div className="chat-header">
                <span>🤖 Guide IA - {location.city}</span>
                <button className="chat-close-btn" onClick={() => { setChatStarted(false); setChatMessages([]); }} title={lang === 'fr' ? 'Fermer' : 'Close'}>✕</button>
              </div>
              <div className="chat-messages">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-model'}`}>
                    <div className="chat-msg-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
                    <div className="chat-msg-bubble">{msg.text}</div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-msg chat-msg-model">
                    <div className="chat-msg-avatar">🤖</div>
                    <div className="chat-msg-bubble chat-msg-typing">
                      <span>.</span><span>.</span><span>.</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="chat-input-area">
                <input
                  type="text"
                  className="chat-input"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) sendChatMessage(chatInput); }}
                  placeholder={lang === 'fr' ? 'Posez une question...' : 'Ask a question...'}
                  disabled={chatLoading}
                />
                <button className="chat-send-btn" onClick={() => sendChatMessage(chatInput)} disabled={chatLoading || !chatInput.trim()}>
                  {chatLoading ? '⏳' : '➤'}
                </button>
              </div>
            </div>
          )}

          <p className="coords">Coordonnées : {location.latitude}, {location.longitude}</p>

          {/* POIs (liens affiliés) */}
          <div className="poi-section">
            <h3>🔗 Hébergement & Transport</h3>
            <div className="poi-links">
              {getAffiliateLinks(location.city, location.country_code).map((link, idx) => (
                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="poi-link">
                  {link.name}
                  <small>{link.label.split(' ').slice(1).join(' ')}</small>
                </a>
              ))}
            </div>
          </div>

          <div className="actions">
            <button className="btn-route-from-here" onClick={() => {
              setMode('distance');
              if (location) {
                setCityA(location);
                setCountryA(location.country_code || 'FR');
              }
              setError('');
              // Focus sur le champ arrivée après un court délai (rendu React)
              setTimeout(() => {
                const arrivalInput = document.querySelector('.distance-multi .city-input-wrapper:last-child input');
                if (arrivalInput) arrivalInput.focus();
              }, 300);
            }}>
              🚗 Calculer un itinéraire à partir d'ici
            </button>
            <button className="btn-share" onClick={shareApp}>📤 Partager</button>
            <button className="btn-qr" onClick={() => setShowQR(!showQR)}>
              📱 {showQR ? 'Masquer QR' : 'QR Code'}
            </button>
            <button className="btn-export" onClick={exportPdf} disabled={exporting}>
              {exporting ? '⏳' : '📄'} Export PDF
            </button>
          </div>
          {showQR && (
            <div className="qr-section">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getSearchUrl())}`}
                alt="QR Code" className="qr-image" />
              <p className="qr-hint">Scannez pour ouvrir cette page</p>
            </div>
          )}
        </div>
      )}

      {/* Historique déroulant (mode recherche) */}
      {mode === 'search' && history.length > 0 && (
        <div className="history-dropdown-wrapper">
          <select className="history-dropdown" defaultValue=""
            onChange={async (e) => {
              const idx = e.target.value;
              if (idx === '') return;
              const h = history[idx];
              setSearchInput(h.postal_code || h.city || '');
              try {
                let data;
                if (h.postal_code) {
                  data = await cachedGet(`${API}/api/location/${encodeURIComponent(h.postal_code)}`, { country: h.country_code || country });
                } else {
                  data = h;
                }
                setLocation(data);
              } catch { setLocation(h); }
              e.target.value = '';
            }}>
            <option value="">📋 Historique des recherches</option>
            {history.slice(0, 5).map((h, idx) => (
              <option key={idx} value={idx}>{h.city}{h.postal_code ? ` (${h.postal_code})` : ''} - {h.country_code}</option>
            ))}
          </select>
        </div>
      )}

      {/* Controles carte */}
      <div className="map-controls">
        <div className="map-layer-buttons">
          {Object.entries(MAP_TILES).map(([key, val]) => (
            <button key={key}
              className={`map-layer-btn ${mapStyle === key ? 'active' : ''}`}
              onClick={() => setMapStyle(key)}
              title={tr(key, lang)}>
              {key === 'street' ? '🗺️' : key === 'satellite' ? '🛰️' : '⛰️'} {tr(key, lang)}
            </button>
          ))}
        </div>
        <button className="map-fullscreen-btn" onClick={() => setFullScreenMap(!fullScreenMap)}
          title={tr(fullScreenMap ? 'exitFullscreen' : 'fullscreen', lang)}>
          {fullScreenMap ? '⛶' : '⛶'}
        </button>
      </div>

      {/* Carte */}
      <div className={`map-container ${fullScreenMap ? 'map-fullscreen' : ''}`}>
        {(mode === 'search' && location) || (mode === 'distance' && (cityA || cityB)) ? (
          <MapContainer key={mode + (cityA?.postal_code || '') + (cityB?.postal_code || '') + waypoints.length}
            center={getMapCenter()} zoom={getMapZoom()}
            scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
            {/* Auto-zoom : centrer la carte sur les marqueurs visibles */}
            <FitBoundsOnChange
              markers={[
                (mode === 'search' && location) ? [location.latitude, location.longitude] : null,
                (mode === 'distance' && aPos) ? aPos : null,
                (mode === 'distance' && bPos) ? bPos : null,
                ...waypoints.filter(w => w && w.latitude).map(w => [w.latitude, w.longitude]),
              ]}
              routeCoords={routeCoords}
            />
            <TileLayer
              attribution={MAP_TILES[mapStyle].attr}
              url={MAP_TILES[mapStyle].url}
              key={mapStyle}
            />

            {/* Position utilisateur (point bleu) */}
            {userPos && (
              <>
                <Circle center={[userPos.lat, userPos.lon]} radius={userPos.accuracy}
                  pathOptions={{ color: '#4285f4', fillColor: '#4285f4', fillOpacity: 0.15, weight: 2 }} />
                <Marker position={[userPos.lat, userPos.lon]} icon={userIcon}>
                  <Popup>
                    <b>📍 Vous êtes ici</b><br />
                    {userCity?.city || 'Position actuelle'}<br />
                    Précision : {Math.round(userPos.accuracy)}m
                  </Popup>
                </Marker>
              </>
            )}

            {mode === 'search' && location && (
              <Marker position={[location.latitude, location.longitude]} icon={getFlagIcon(location.country_code)}>
                <Popup>
                  <b>{location.city}</b><br />{location.postal_code ? <>{location.postal_code}<br /></> : ''}{location.country}
                </Popup>
              </Marker>
            )}

            {/* Mode Distance : marqueurs */}
            {mode === 'distance' && aPos && (
              <Marker position={aPos} icon={getFlagIcon(cityA?.country_code)}>
                <Popup><b>{cityA.city}</b><br />Départ</Popup>
              </Marker>
            )}

            {/* Waypoints (arrêts) */}
            {mode === 'distance' && waypoints.filter(w => w && w.latitude).map((wp, idx) => (
              <Marker key={idx} position={[wp.latitude, wp.longitude]} icon={waypointIcon}>
                <Popup>
                  <b>{wp.city}</b><br />Arrêt {idx + 1}
                </Popup>
              </Marker>
            ))}

            {mode === 'distance' && bPos && (
              <Marker position={bPos} icon={getFlagIcon(cityB?.country_code)}>
                <Popup><b>{cityB.city}</b><br />Arrivée</Popup>
              </Marker>
            )}

            {/* Routes alternatives non sélectionnées (grisées) */}
            {routeAlternatives && routeAlternatives.length > 1 && routeAlternatives.map((alt, idx) => (
              idx !== selectedRouteIdx && alt.route_coords.length > 0 && (
                <Polyline key={'alt-' + idx} positions={alt.route_coords}
                  color="#cccccc" weight={3} opacity={0.4} dashArray="6,4" />
              )
            ))}

            {/* Tracé route sélectionnée (trait plein) ou vol d'oiseau (traitillés) */}
            {routeCoords && (
              <Polyline positions={routeCoords} color="#ff4444" weight={4} />
            )}
            {!routeCoords && lineCoords && (
              <Polyline positions={lineCoords} color="#ff4444" weight={3} dashArray="8,6" />
            )}
          </MapContainer>
        ) : (
          <div className="map-placeholder">
            <p>{mode === 'search' ? 'Veuillez effectuer une recherche' : 'Sélectionnez deux villes'}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-links">
          <span className="footer-brand">🌍 GeoLoc v5.1</span>
          <button className="footer-link" onClick={() => setLegalPage('terms')}>📜 CGU</button>
          <button className="footer-link" onClick={() => setLegalPage('privacy')}>🔒 Confidentialité</button>
          <button className="footer-link" onClick={() => setShowContact(true)}>✉️ Contact</button>
          <button className="footer-link" onClick={() => setShowApi(true)}>🔑 API</button>
          <span className="footer-link" style={{cursor:'default', opacity:0.7}}>📱 Installez l'app via Chrome (PWA)</span>
        </div>
        <p className="footer-note" style={{marginTop:'2px'}}>
          OpenStreetMap · OpenRouteService · Open-Meteo · Nominatim
        </p>
        <p className="footer-note" style={{marginTop:'3px', fontWeight:'500'}}>
          Créé par <strong>BEN MESLI Hamiche</strong> © {new Date().getFullYear()}
        </p>
      </footer>

      {/* Modale paramètres */}
      {showSettings && (
        <div className="legal-overlay" onClick={() => setShowSettings(false)}>
          <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
            <button className="legal-close" onClick={() => setShowSettings(false)}>✕</button>
            <h2>⚙️ {lang === 'fr' ? 'Paramètres' : 'Settings'}</h2>

            <label style={{display:'block', margin:'15px 0 5px'}}>
              {lang === 'fr' ? 'Langue' : 'Language'}
            </label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={{width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc'}}>
              <option value="fr">🇫🇷 Français</option>
              <option value="en">🇬🇧 English</option>
            </select>

            <label style={{display:'block', margin:'15px 0 5px'}}>
              {lang === 'fr' ? 'Mode sombre' : 'Dark mode'}
            </label>
            <button onClick={() => setDarkMode(!darkMode)} style={{padding:'8px 16px', borderRadius:'6px', border:'1px solid #ccc', cursor:'pointer'}}>
              {darkMode ? '☀️ ' + (lang === 'fr' ? 'Clair' : 'Light') : '🌙 ' + (lang === 'fr' ? 'Sombre' : 'Dark')}
            </button>

            <label style={{display:'block', margin:'15px 0 5px'}}>
              {lang === 'fr' ? 'Mise à jour' : 'Update'}
            </label>
            <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
              <button onClick={() => {
                if (window.checkForUpdates) {
                  const ok = window.checkForUpdates();
                  if (ok) {
                    setUpdateCheckMsg('checking');
                    // Si aucun update trouvé après 4s, afficher "À jour"
                    const timeoutId = setTimeout(() => {
                      setUpdateCheckMsg(prev => {
                        if (prev === 'checking') {
                          setUpdateCheckMsg('uptodate');
                          setTimeout(() => setUpdateCheckMsg(null), 4000);
                          return 'uptodate';
                        }
                        return prev;
                      });
                    }, 4000);
                    window.__updateCheckTimeout = timeoutId;
                  } else {
                    setUpdateCheckMsg('error');
                    setTimeout(() => setUpdateCheckMsg(null), 4000);
                  }
                } else {
                  setUpdateCheckMsg('nosw');
                  setTimeout(() => setUpdateCheckMsg(null), 4000);
                }
              }} style={{padding:'8px 16px', borderRadius:'6px', border:'1px solid #ccc', cursor:'pointer'}}>
                🔄 {lang === 'fr' ? 'Vérifier les mises à jour' : 'Check for updates'}
              </button>
              {/* Message de statut visible */}
              {updateCheckMsg === 'checking' && (
                <span style={{fontSize:'13px', color:'var(--text-secondary)'}}>
                  🔄 {lang === 'fr' ? 'Vérification...' : 'Checking...'}
                </span>
              )}
              {updateCheckMsg === 'uptodate' && (
                <span style={{fontSize:'13px', color:'#27ae60'}}>
                  ✅ {lang === 'fr' ? 'Application à jour' : 'App is up to date'}
                </span>
              )}
              {updateCheckMsg === 'found' && (
                <span style={{fontSize:'13px', color:'#e67e22', cursor:'pointer', textDecoration:'underline'}}
                      onClick={() => { if (window.applyUpdate) window.applyUpdate(); }}>
                  🔄 {lang === 'fr' ? 'Mise à jour disponible — cliquer pour appliquer' : 'Update available — click to apply'}
                </span>
              )}
              {updateCheckMsg === 'error' && (
                <span style={{fontSize:'13px', color:'#e74c3c'}}>
                  ❌ {lang === 'fr' ? 'Erreur de vérification' : 'Check failed'}
                </span>
              )}
              {updateCheckMsg === 'nosw' && (
                <span style={{fontSize:'13px', color:'#e74c3c'}}>
                  ❌ {lang === 'fr' ? 'Service Worker indisponible' : 'Service Worker unavailable'}
                </span>
              )}
            </div>

            {/* Indicateur discret du backend actif */}
            <div style={{marginTop:'12px', fontSize:'12px', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'6px', borderTop:'1px solid var(--border)', paddingTop:'10px'}}>
              <span style={{display:'inline-block', width:'8px', height:'8px', borderRadius:'50%', background: railFallbackActive ? '#e67e22' : '#27ae60'}}></span>
              {railFallbackActive
                ? (lang === 'fr' ? '🛡️ Backup : Render' : '🛡️ Backup: Render')
                : (lang === 'fr' ? '🚆 Principal : Railway' : '🚆 Primary: Railway')}
            </div>

            {pwaInstallAvailable && (
              <button onClick={() => { if (window.installPwa) window.installPwa(); }}
                style={{padding:'8px 16px', borderRadius:'6px', border:'1px solid var(--accent)', cursor:'pointer', background:'var(--accent)', color:'white', marginTop:'8px', display:'block', width:'100%'}}>
                📲 {lang === 'fr' ? "Installer l'application" : 'Install the app'}
              </button>
            )}

            <label style={{display:'block', margin:'15px 0 5px'}}>
              {lang === 'fr' ? 'Couleur principale' : 'Primary color'}
            </label>
            <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
              <input type="color" value={customPrimary || '#1976D2'} onChange={(e) => {
                setCustomPrimary(e.target.value);
                document.documentElement.style.setProperty('--wl-primary', e.target.value);
                document.querySelector('header').style.background = e.target.value;
              }} style={{width:'50px', height:'40px', borderRadius:'6px', border:'none', cursor:'pointer'}} />
              <button onClick={() => {
                setCustomPrimary('');
                document.documentElement.style.removeProperty('--wl-primary');
                document.querySelector('header').style.background = '';
              }} style={{padding:'6px 12px', borderRadius:'6px', border:'1px solid #ccc', cursor:'pointer', fontSize:'12px'}}>
                {lang === 'fr' ? 'Réinitialiser' : 'Reset'}
              </button>
            </div>

            <label style={{display:'block', margin:'15px 0 5px'}}>
              {lang === 'fr' ? "Couleur d'accent" : 'Accent color'}
            </label>
            <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
              <input type="color" value={customAccent || '#4CAF50'} onChange={(e) => {
                setCustomAccent(e.target.value);
                document.documentElement.style.setProperty('--accent', e.target.value);
              }} style={{width:'50px', height:'40px', borderRadius:'6px', border:'none', cursor:'pointer'}} />
              <button onClick={() => {
                setCustomAccent('');
                document.documentElement.style.removeProperty('--accent');
              }} style={{padding:'6px 12px', borderRadius:'6px', border:'1px solid #ccc', cursor:'pointer', fontSize:'12px'}}>
                {lang === 'fr' ? 'Réinitialiser' : 'Reset'}
              </button>
            </div>

            <p style={{marginTop:'20px', opacity:0.6, fontSize:'12px'}}>
              {lang === 'fr' ? 'Les couleurs sont réinitialisées au rechargement de la page.' : 'Colors reset on page reload.'}
            </p>

            {/* 🔒 Admin secret — accessible uniquement à mon créateur */}
            <div style={{marginTop:'25px', borderTop:'1px dashed var(--border)', paddingTop:'15px', textAlign:'center'}}>
              <p style={{fontSize:'11px', color:'var(--text-secondary)', margin:'0 0 8px', opacity:0.4}}>
                ──── {lang === 'fr' ? 'Espace créateur' : 'Creator area'} ────
              </p>
              <button onClick={() => setShowAdminLogin(true)}
                style={{padding:'10px 24px', borderRadius:'30px', border:'2px solid var(--accent)', cursor:'pointer', fontSize:'14px', fontWeight:600, background:'transparent', color:'var(--accent)', letterSpacing:'0.5px'}}>
                🔒 {lang === 'fr' ? 'Tableau de bord Admin' : 'Admin Dashboard'}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* ===== Admin Dashboard (après connexion) ===== */}
        {showAdminLogin && (
          <div className="modal-overlay" onClick={() => { setShowAdminLogin(false); setAdminPin(''); setAdminStats(null); setAdminError(''); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}
              style={{maxWidth:'480px', textAlign:'center'}}>
              
              {!adminStats ? (
                <>
                  <h3>🔒 {lang === 'fr' ? 'Accès Admin' : 'Admin Access'}</h3>
                  <p style={{fontSize:'13px', color:'var(--text-secondary)', margin:'10px 0'}}>
                    {lang === 'fr' ? 'Code secret requis' : 'Secret code required'}
                  </p>
                  <input type="password" value={adminPin} onChange={e => { setAdminPin(e.target.value); setAdminError(''); }}
                    placeholder="••••••"
                    style={{padding:'10px 16px', borderRadius:'8px', border:'2px solid var(--border)', width:'80%', maxWidth:'200px', textAlign:'center', fontSize:'18px', letterSpacing:'4px', background:'var(--bg)', color:'var(--text)'}} />
                  {adminError && <p style={{color:'#e74c3c', fontSize:'13px', margin:'8px 0'}}>{adminError}</p>}
                  <div style={{display:'flex', gap:'10px', justifyContent:'center', marginTop:'12px'}}>
                    <button onClick={async () => {
                      if (!adminPin.trim()) { setAdminError('Code requis'); return; }
                      try {
                        const resp = await API_CLIENT.get(`${API}/api/admin/stats`, { params: { token: adminPin.trim() } });
                        setAdminStats(resp.data);
                      } catch (e) {
                        if (e?.response?.status === 403) setAdminError('⛔ Mauvais code');
                        else setAdminError('❌ Erreur réseau');
                      }
                    }} style={{padding:'10px 24px', borderRadius:'8px', border:'none', background:'var(--accent)', color:'white', cursor:'pointer'}}>
                      🔓 {lang === 'fr' ? 'Connexion' : 'Login'}
                    </button>
                    <button onClick={() => { setShowAdminLogin(false); setAdminPin(''); setAdminStats(null); setAdminError(''); }}
                      style={{padding:'10px 24px', borderRadius:'8px', border:'1px solid var(--border)', cursor:'pointer', background:'transparent', color:'var(--text)'}}>
                      {lang === 'fr' ? 'Annuler' : 'Cancel'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{marginBottom:'5px'}}>📊 {lang === 'fr' ? 'Tableau de Bord' : 'Dashboard'}</h3>
                  <p style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:'15px'}}>
                    {lang === 'fr' ? 'Statistiques du mois' : 'Monthly statistics'} · {adminStats.month}
                  </p>

                  {/* Compteur recherches */}
                  <div className="admin-stat-card">
                    <div className="admin-stat-icon">🔍</div>
                    <div className="admin-stat-value">{adminStats.total_searches}</div>
                    <div className="admin-stat-label">{lang === 'fr' ? 'Recherches ce mois-ci' : 'Searches this month'}</div>
                  </div>

                  {/* Top 3 villes */}
                  <div style={{textAlign:'left', margin:'15px 0'}}>
                    <h4 style={{fontSize:'14px', margin:'0 0 8px'}}>🏆 {lang === 'fr' ? 'Top 3 des villes' : 'Top 3 cities'}</h4>
                    {adminStats.top_cities && adminStats.top_cities.length > 0 ? (
                      <ol style={{margin:0, paddingLeft:'20px'}}>
                        {adminStats.top_cities.map((c, i) => (
                          <li key={i} style={{fontSize:'14px', margin:'4px 0'}}>
                            {c.city} <span style={{color:'var(--text-secondary)', fontSize:'12px'}}>({c.count}×)</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p style={{fontSize:'13px', color:'var(--text-secondary)'}}>
                        {lang === 'fr' ? 'Aucune recherche ce mois-ci' : 'No searches this month'}
                      </p>
                    )}
                    {adminStats.total_cities > 3 && (
                      <p style={{fontSize:'11px', color:'var(--text-secondary)', margin:'5px 0 0'}}>
                        {lang === 'fr' ? `et ${adminStats.total_cities - 3} autre(s) ville(s)` : `and ${adminStats.total_cities - 3} other city(ies)`}
                      </p>
                    )}
                  </div>

                  {/* Combat de serveurs */}
                  <div style={{margin:'15px 0'}}>
                    <h4 style={{fontSize:'14px', margin:'0 0 8px'}}>⚔️ {lang === 'fr' ? 'Serveurs' : 'Servers'}</h4>
                    <div style={{display:'flex', gap:'20px', justifyContent:'center', flexWrap:'wrap'}}>
                      <div style={{background:'rgba(39,174,96,0.1)', borderRadius:'12px', padding:'12px 20px', minWidth:'100px'}}>
                        <div style={{fontSize:'20px', fontWeight:'bold', color:'#27ae60'}}>🚆 {adminStats.servers?.railway || 0}</div>
                        <div style={{fontSize:'11px', color:'var(--text-secondary)'}}>Railway</div>
                      </div>
                      <div style={{background:'rgba(230,126,34,0.1)', borderRadius:'12px', padding:'12px 20px', minWidth:'100px'}}>
                        <div style={{fontSize:'20px', fontWeight:'bold', color:'#e67e22'}}>🛡️ {adminStats.servers?.render || 0}</div>
                        <div style={{fontSize:'11px', color:'var(--text-secondary)'}}>Render</div>
                      </div>
                    </div>
                    {adminStats.servers?.railway + adminStats.servers?.render > 0 && (
                      <p style={{fontSize:'11px', color:'var(--text-secondary)', marginTop:'6px'}}>
                        {lang === 'fr'
                          ? `Ratio Railway : ${Math.round(adminStats.servers.railway / (adminStats.servers.railway + adminStats.servers.render) * 100)}%`
                          : `Railway ratio: ${Math.round(adminStats.servers.railway / (adminStats.servers.railway + adminStats.servers.render) * 100)}%`}
                      </p>
                    )}
                  </div>

                  <button onClick={() => { setShowAdminLogin(false); setAdminPin(''); setAdminStats(null); setAdminError(''); }}
                    style={{padding:'10px 24px', borderRadius:'8px', border:'none', background:'var(--accent)', color:'white', cursor:'pointer', marginTop:'10px'}}>
                    {lang === 'fr' ? 'Fermer' : 'Close'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      {/* Admin panel (messages) */}
      {showAdmin && (
        <div className="legal-overlay" onClick={() => setShowAdmin(false)}>
          <div className="legal-modal contact-modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: '700px'}}>
            <button className="legal-close" onClick={() => setShowAdmin(false)}>✕</button>
            <h2>📋 Messages de contact</h2>
            <p style={{marginBottom: '15px', opacity: 0.7}}>
              <a href={`${API}/api/admin/messages?token=${adminToken}`} target="_blank" rel="noreferrer">
                API JSON
              </a>
            </p>
            {adminLoading ? (
              <p>Chargement...</p>
            ) : adminMessages.length === 0 ? (
              <p>Aucun message pour le moment.</p>
            ) : (
              <div style={{maxHeight: '60vh', overflowY: 'auto'}}>
                {adminMessages.slice().reverse().map(msg => (
                  <div key={msg.id} style={{
                    background: '#f5f5f5', borderRadius: '8px', padding: '12px', marginBottom: '10px',
                    borderLeft: '4px solid var(--wl-accent, #4CAF50)'
                  }}>
                    <small style={{opacity: 0.6}}>#{msg.id} — {msg.date}</small>
                    <p><strong>{msg.name || 'Anonyme'}</strong> &lt;{msg.email}&gt;</p>
                    <p><em>Sujet : {msg.subject}</em></p>
                    <p style={{whiteSpace: 'pre-wrap', marginTop: '6px'}}>{msg.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale contact */}
      {showContact && (
        <div className="legal-overlay" onClick={() => { setShowContact(false); setContactStatus(null); setContactErrorMsg(''); }}>
          <div className="legal-modal contact-modal" onClick={(e) => e.stopPropagation()}>
            <button className="legal-close" onClick={() => { setShowContact(false); setContactStatus(null); setContactErrorMsg(''); }}>✕</button>
            <h2>✉️ Nous contacter</h2>
            <p className="legal-version">Une question ? Un projet ? Écrivez-nous !</p>

            {contactStatus === 'done' ? (
              <div className="contact-success">
                <span className="contact-success-icon">✅</span>
                <p>Message envoyé ! Nous vous répondrons rapidement.</p>
              </div>
            ) : (
              <div className="contact-form">
                <label className="contact-label">Nom (optionnel)</label>
                <input type="text" className="contact-input" placeholder="Votre nom"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />

                <label className="contact-label">Email *</label>
                <input type="email" className="contact-input" placeholder="votre@email.com"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />

                <label className="contact-label">Sujet</label>
                <input type="text" className="contact-input" placeholder="Sujet de votre message"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })} />

                <label className="contact-label">Message *</label>
                <textarea className="contact-textarea" rows="4" placeholder="Votre message..."
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} />

                {contactStatus === 'error' && contactErrorMsg && (
                  <p className="contact-error">{contactErrorMsg}</p>
                )}

                <button className="contact-submit" onClick={sendContact} disabled={contactStatus === 'sending'}>
                  {contactStatus === 'sending' ? '⏳ Envoi...' : '✉️ Envoyer'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale légale */}
      {legalPage && (
        <div className="legal-overlay" onClick={() => setLegalPage(null)}>
          <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
            <button className="legal-close" onClick={() => setLegalPage(null)}>✕</button>
            {legalPage === 'terms' ? (
              <>
                <h2>📜 Conditions Générales d'Utilisation</h2>
                <p className="legal-version">Version 1.0 - Mai 2026</p>
                <div className="legal-sections">
                  <div className="legal-section">
                    <h3>1. Objet</h3>
                    <p>Les présentes CGU régissent l'utilisation de l'application GeoLoc. L'application permet la recherche de codes postaux, le calcul d'itinéraires, l'affichage météorologique et la planification d'itinéraires.</p>
                  </div>
                  <div className="legal-section">
                    <h3>2. Service gratuit</h3>
                    <p>GeoLoc est un service gratuit. Aucun paiement n'est requis pour les fonctionnalités de base. Une API payante est disponible pour les professionnels.</p>
                  </div>
                  <div className="legal-section">
                    <h3>3. Données géographiques</h3>
                    <p>Les données proviennent de sources ouvertes : OpenStreetMap (Nominatim), OpenRouteService, et Open-Meteo. GeoLoc ne garantit pas l'exactitude de ces données.</p>
                  </div>
                  <div className="legal-section">
                    <h3>4. Responsabilité</h3>
                    <p>GeoLoc fournit des informations à titre indicatif. L'application ne peut être tenue responsable des conséquences de l'utilisation des données fournies.</p>
                  </div>
                  <div className="legal-section">
                    <h3>5. API Payante</h3>
                    <p>GeoLoc propose une API payante pour les développeurs. Tarifs sur demande. Contact : contact.fr.geoloc@gmail.com</p>
                  </div>
                  <div className="legal-section">
                    <h3>6. Liens affiliés</h3>
                    <p>L'application contient des liens affiliés (Booking, Skyscanner, Kayak, TripAdvisor). GeoLoc peut percevoir une commission sans coût supplémentaire pour l'utilisateur.</p>
                  </div>
                  <div className="legal-section">
                    <h3>7. Contact</h3>
                    <p>Email : contact.fr.geoloc@gmail.com</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2>🔒 Politique de Confidentialité</h2>
                <p className="legal-version">Version 1.0 - Mai 2026</p>
                <div className="legal-sections">
                  <div className="legal-section">
                    <h3>1. Collecte des données</h3>
                    <p>GeoLoc ne collecte aucune donnée personnelle identifiable. Pas de compte, pas d'email requis.</p>
                  </div>
                  <div className="legal-section">
                    <h3>2. Stockage local</h3>
                    <p>L'historique est stocké localement dans votre navigateur (localStorage). Aucune donnée n'est transmise à nos serveurs.</p>
                  </div>
                  <div className="legal-section">
                    <h3>3. Services tiers</h3>
                    <p>OpenStreetMap, OpenRouteService, Open-Meteo, Nominatim peuvent collecter des données selon leurs propres politiques.</p>
                  </div>
                  <div className="legal-section">
                    <h3>4. Cookies</h3>
                    <p>GeoLoc n'utilise pas de cookies. Aucun traceur publicitaire.</p>
                  </div>
                  <div className="legal-section">
                    <h3>5. Géolocalisation</h3>
                    <p>Optionnelle. Les coordonnées GPS ne sont utilisées que pour la carte et ne sont jamais stockées.</p>
                  </div>
                  <div className="legal-section">
                    <h3>6. Contact RGPD</h3>
                    <p>Email : contact.fr.geoloc@gmail.com</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Modale API / Développeurs ===== */}
      {showApi && (
        <div className="legal-overlay" onClick={() => setShowApi(false)}>
          <div className="legal-modal api-modal" onClick={(e) => e.stopPropagation()}>
            <button className="legal-close" onClick={() => setShowApi(false)}>✕</button>
            <h2>🔑 GeoLoc API</h2>
            <p style={{opacity:0.7, marginBottom:'15px'}}>
              Intégrez la géolocalisation, la météo et les itinéraires dans vos applications.
            </p>

            <div className="api-section">
              <h3>📋 Offres</h3>
              <div className="api-pricing">
                <div className="api-tier api-tier-free">
                  <h4>Gratuit</h4>
                  <div className="api-price">0€</div>
                  <ul>
                    <li>100 requêtes / jour</li>
                    <li>Tous les endpoints</li>
                    <li>Clé API personnelle</li>
                    <li>Support email</li>
                  </ul>
                </div>
                <div className="api-tier api-tier-pro">
                  <h4>Pro</h4>
                  <div className="api-price">Sur devis</div>
                  <ul>
                    <li>Jusqu'à 10 000 requêtes / jour</li>
                    <li>Tous les endpoints</li>
                    <li>Support prioritaire</li>
                    <li>Pas de limite de débit</li>
                  </ul>
                  <p style={{fontSize:'12px', opacity:0.6, marginTop:'8px'}}>
                    Contactez-nous pour un devis personnalisé
                  </p>
                </div>
              </div>
            </div>

            <div className="api-section">
              <h3>🚀 Obtenir une clé gratuite</h3>
              {!apiKeyGenerated ? (
                <div className="api-key-form">
                  <input
                    type="email"
                    placeholder="Votre email"
                    value={apiKeyEmail}
                    onChange={(e) => setApiKeyEmail(e.target.value)}
                    className="api-input"
                  />
                  <button onClick={generateApiKey} disabled={apiKeyStatus === 'loading'} className="api-btn">
                    {apiKeyStatus === 'loading' ? '⏳ Génération...' : '🔑 Générer ma clé'}
                  </button>
                  {apiKeyError && <p className="api-error">{apiKeyError}</p>}
                </div>
              ) : (
                <div className="api-key-done">
                  <p style={{color:'#4CAF50', fontWeight:'bold'}}>✅ Clé générée avec succès !</p>
                  <div className="api-key-display">
                    <code>{apiKeyGenerated}</code>
                    <button onClick={() => { navigator.clipboard.writeText(apiKeyGenerated); setError('Clé copiée !'); setTimeout(() => setError(''), 2000); }}
                      style={{padding:'4px 10px', borderRadius:'6px', border:'1px solid #ccc', cursor:'pointer', fontSize:'12px'}}>
                      📋 Copier
                    </button>
                  </div>
                  <p style={{fontSize:'12px', opacity:0.6, marginTop:'8px'}}>
                    Incluez cette clé dans vos requêtes via l'en-tête <code>X-API-Key</code> ou le paramètre <code>api_key</code>.
                  </p>
                </div>
              )}
            </div>

            <div className="api-section">
              <h3>📚 Endpoints disponibles</h3>
              <div className="api-endpoints">
                <div className="api-category">
                  <h4>📍 Géolocalisation</h4>
                  <div className="api-ep"><code>GET /api/location/{'{code}'}</code> <span>Infos ville par code postal</span></div>
                  <div className="api-ep"><code>GET /api/search?q=...</code> <span>Recherche de villes</span></div>
                  <div className="api-ep"><code>GET /api/reverse?lat=&amp;lon=</code> <span>Coordonnées → adresse</span></div>
                  <div className="api-ep"><code>GET /api/geocode?q=...</code> <span>Géocodage d'adresse</span></div>
                  <div className="api-ep"><code>GET /api/geocode-fr?q=...</code> <span>Géocodage France (gouvernement)</span></div>
                </div>
                <div className="api-category">
                  <h4>🌤️ Météo</h4>
                  <div className="api-ep"><code>GET /api/weather?lat=&amp;lon=</code> <span>Météo actuelle + 4 jours</span></div>
                </div>
                <div className="api-category">
                  <h4>🗺️ Itinéraires</h4>
                  <div className="api-ep"><code>GET /api/directions?origin_lat=&amp;origin_lon=&amp;dest_lat=&amp;dest_lon=</code> <span>Calcul d'itinéraire</span></div>
                  <div className="api-ep"><code>GET /api/v2/directions?...</code> <span>Itinéraire multi-étapes</span></div>
                  <div className="api-ep"><code>GET /api/export/pdf?...</code> <span>Export PDF de l'itinéraire</span></div>
                </div>
                <div className="api-category">
                  <h4>👥 Population</h4>
                  <div className="api-ep"><code>GET /api/population-fr?postal_code=</code> <span>Population France (INSEE)</span></div>
                  <div className="api-ep"><code>GET /api/population-be?city_name=</code> <span>Population Belgique (Statbel)</span></div>
                </div>
                <div className="api-category">
                  <h4>⚖️ Légal</h4>
                  <div className="api-ep"><code>GET /api/legal/terms</code> <span>Conditions générales</span></div>
                  <div className="api-ep"><code>GET /api/legal/privacy</code> <span>Politique de confidentialité</span></div>
                </div>
                <div className="api-category">
                  <h4>✉️ Contact</h4>
                  <div className="api-ep"><code>GET /api/contact?...</code> <span>Envoyer un message</span></div>
                </div>
              </div>
            </div>

            <div className="api-section">
              <h3>🔧 Utilisation</h3>
              <p>Envoyez vos requêtes avec votre clé API :</p>
              <pre className="api-code-block">{`curl -H "X-API-Key: votre_cle_ici" \\
  "https://geo-app-1-z314.onrender.com/api/location/75001"`}</pre>
              <p style={{fontSize:'12px', opacity:0.6, marginTop:'8px'}}>
                L'API est accessible à : <code>https://geo-app-1-z314.onrender.com/api/*</code>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
