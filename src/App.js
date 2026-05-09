import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Icône de drapeau dynamique selon le pays
function getFlagIcon(countryCode) {
  const code = (countryCode || 'FR').toLowerCase();
  return L.icon({
    iconUrl: `https://flagcdn.com/w20/${code}.png`,
    iconSize: [20, 15],
    iconAnchor: [10, 15],
    popupAnchor: [0, -15],
  });
}

const API = 'https://geo-app-1-z314.onrender.com';

// Emoji météo selon code WMO
function getWeatherEmoji(code) {
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

const COUNTRIES = [
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  { code: 'DE', name: 'Allemagne', flag: '🇩🇪' },
  { code: 'IT', name: 'Italie', flag: '🇮🇹' },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸' },
  { code: 'US', name: 'États-Unis', flag: '🇺🇸' },
  { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧' },
];

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

// ========== Composant d'autocomplétion réutilisable ==========
function CityInput({ label, value, onChange, onSelect, country, placeholder }) {
  const [input, setInput] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const debounce = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setInput(v);
    if (onChange) onChange(v);
    if (v.length >= 2) {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(async () => {
        try {
          const resp = await axios.get(`${API}/api/search?q=${encodeURIComponent(v)}&country=${country}&limit=15`);
          setSuggestions(resp.data || []);
          setShow(resp.data?.length > 0);
        } catch { setSuggestions([]); }
      }, 200);
    } else { setSuggestions([]); setShow(false); }
  };

  return (
    <div className="city-input-wrapper">
      <label className="city-input-label">{label}</label>
      <input
        type="text"
        value={input}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={placeholder}
      />
      {show && suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((s, idx) => (
            <li key={idx} onMouseDown={() => { setInput(s.city); setShow(false); onSelect(s); }}>
              <span className="suggestion-city">{s.city}</span>
              <span className="suggestion-code">{s.postal_code}</span>
            </li>
          ))}
        </ul>
      )}
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

  // Multi-étapes (waypoints)
  const [waypoints, setWaypoints] = useState([]); // array de city objects
  const [waypointCountries, setWaypointCountries] = useState([]);

  // Coût carburant
  const [fuelConsumption, setFuelConsumption] = useState(7); // L/100km
  const [fuelType, setFuelType] = useState('essence');
  const [fuelPrice, setFuelPrice] = useState(1.85); // €/L
  const [showFuelCalc, setShowFuelCalc] = useState(false);

  const [userPos, setUserPos] = useState(null);
  const [userCity, setUserCity] = useState(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [country, setCountry] = useState('FR');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState([]);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modeProfile, setModeProfile] = useState('driving'); // driving | cycling | walking
  const [favorites, setFavorites] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const debounceRef = useRef(null);

  // Charger l'historique et les favoris
  useEffect(() => {
    try {
      const saved = localStorage.getItem('geoHistory');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) { /* ignore */ }
    try {
      const saved = localStorage.getItem('geoFavorites');
      if (saved) setFavorites(JSON.parse(saved));
    } catch (e) { /* ignore */ }
  }, []);

  // Sauvegarder les favoris
  useEffect(() => {
    localStorage.setItem('geoFavorites', JSON.stringify(favorites));
  }, [favorites]);

  // Mode sombre
  useEffect(() => {
    document.body.className = darkMode ? 'dark-mode' : '';
  }, [darkMode]);

  // Lecture des paramètres d'URL pour le partage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pc = params.get('pc');
    const city = params.get('city');
    const from = params.get('from');
    const to = params.get('to');
    const wp = params.get('wp'); // waypoints

    if (from && to) {
      // Mode distance partagé
      setMode('distance');
      // Les paramètres contiennent les noms de villes - on fait une recherche inverse
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
        axios.get(`${API}/api/search?q=${encodeURIComponent(from)}&limit=1`),
        axios.get(`${API}/api/search?q=${encodeURIComponent(to)}&limit=1`)
      ]);
      if (fromData.data?.length > 0) {
        handleDistanceCity(fromData.data[0], 'A');
      }
      if (toData.data?.length > 0) {
        handleDistanceCity(toData.data[0], 'B');
      }
      if (wpStr) {
        const wpNames = wpStr.split(';');
        for (const name of wpNames) {
          const resp = await axios.get(`${API}/api/search?q=${encodeURIComponent(name)}&limit=1`);
          if (resp.data?.length > 0) {
            addWaypointWithData(resp.data[0]);
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

  // ===== Météo via Open-Meteo (actuelle + 3 jours) =====
  const fetchWeather = async (lat, lon) => {
    try {
      const resp = await axios.get(`${API}/api/weather?lat=${lat}&lon=${lon}`);
      if (resp.data && !resp.data.error) {
        setWeather(resp.data);
      } else {
        setWeather(null);
      }
    } catch { setWeather(null); }
  };

  // ===== Partage =====
  const shareLocation = () => {
    const url = window.location.origin + `?city=${encodeURIComponent(location.city)}&pc=${location.postal_code}`;
    if (navigator.share) {
      navigator.share({
        title: `${location.city} (${location.postal_code})`,
        text: `📍 ${location.city} (${location.postal_code})\nCoordonnées : ${location.latitude}, ${location.longitude}\nPays : ${location.country}`,
        url: url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setError('Lien copié !');
        setTimeout(() => setError(''), 2000);
      }).catch(() => {});
    }
  };

  // Partage d'itinéraire
  const [showQR, setShowQR] = useState(false);
  const getRouteUrl = () => {
    const params = new URLSearchParams();
    params.set('from', cityA?.city || '');
    params.set('to', cityB?.city || '');
    if (waypoints.length > 0) {
      const wpNames = waypoints.filter(w => w && w.city).map(w => w.city).join(';');
      if (wpNames) params.set('wp', wpNames);
    }
    return window.location.origin + '?' + params.toString();
  };

  const shareRoute = () => {
    const url = getRouteUrl();
    if (navigator.share) {
      navigator.share({
        title: `Itinéraire ${cityA?.city || ''} → ${cityB?.city || ''}`,
        text: `📍 Itinéraire : ${cityA?.city || ''} → ${cityB?.city || ''}` +
          (waypoints.length > 0 ? ` avec ${waypoints.length} arrêt(s)` : '') +
          `\nDistance : ${distance} km` +
          `\nDurée : ${duration ? Math.floor(duration / 3600) + 'h' + Math.round((duration % 3600) / 60) + 'min' : 'N/A'}`,
        url: url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setError('Lien d\'itinéraire copié !');
        setTimeout(() => setError(''), 2000);
      }).catch(() => {});
    }
  };

  const getSearchUrl = () => {
    if (mode === 'search' && location) {
      return window.location.origin + `?city=${encodeURIComponent(location.city)}&pc=${location.postal_code}`;
    }
    return getRouteUrl();
  };

  // ===== Mode Recherche =====
  const handleSearch = async (query) => {
    const term = (query || searchInput).trim();
    if (!term) return;
    setError('');
    setLoading(true);
    try {
      const url = `${API}/api/location/${encodeURIComponent(term)}?country=${country}`;
      const resp = await axios.get(url);
      setLocation(resp.data);
      saveToHistory(resp.data);
      setShowSuggestions(false);
      // Charger la météo
      fetchWeather(resp.data.latitude, resp.data.longitude);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Code postal non trouvé.' : `Erreur: ${err.message}`);
      setLocation(null);
    } finally { setLoading(false); }
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setSearchInput(v);
    if (v.length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const resp = await axios.get(`${API}/api/search?q=${encodeURIComponent(v)}&country=${country}&limit=15`);
          setSuggestions(resp.data || []);
          setShowSuggestions(resp.data?.length > 0);
        } catch { setSuggestions([]); }
      }, 200);
    } else { setSuggestions([]); setShowSuggestions(false); }
  };

  const selectSuggestion = async (item) => {
    setSearchInput(item.city);
    setShowSuggestions(false);
    setLoading(true);
    try {
      const url = `${API}/api/location/${encodeURIComponent(item.postal_code)}?country=${item.country_code || country}`;
      const resp = await axios.get(url);
      setLocation(resp.data);
      saveToHistory(resp.data);
      fetchWeather(resp.data.latitude, resp.data.longitude);
    } catch (err) {
      setError(`Erreur: ${err.message}`);
      setLocation(null);
    } finally { setLoading(false); }
  };

  // ===== Mode Distance =====
  const handleDistanceCity = async (cityData, side) => {
    const data = cityData;
    const countryForLookup = side === 'A' ? (countryA || 'FR') : (countryB || 'FR');
    try {
      const url = `${API}/api/location/${encodeURIComponent(data.postal_code)}?country=${data.country_code || countryForLookup}`;
      const resp = await axios.get(url);
      if (side === 'A') setCityA(resp.data);
      else setCityB(resp.data);
    } catch {
      // Fallback : utiliser les données de la suggestion (latitude/longitude déjà présentes)
      const fallback = {
        city: data.city,
        postal_code: data.postal_code,
        country: data.country || countryForLookup,
        country_code: data.country_code || countryForLookup,
        latitude: data.latitude,
        longitude: data.longitude,
        department: '',
        region: '',
        population: 0
      };
      if (side === 'A') setCityA(fallback);
      else setCityB(fallback);
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
    try {
      const url = `${API}/api/location/${encodeURIComponent(cityData.postal_code)}?country=${lookupCountry}`;
      const resp = await axios.get(url);
      newWp[idx] = resp.data;
    } catch {
      newWp[idx] = {
        city: cityData.city,
        postal_code: cityData.postal_code,
        country: cityData.country || lookupCountry,
        country_code: cityData.country_code || lookupCountry,
        latitude: cityData.latitude,
        longitude: cityData.longitude,
      };
    }
    newWpC[idx] = lookupCountry;
    setWaypoints(newWp);
    setWaypointCountries(newWpC);
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

  // ===== Favoris =====
  const isFavorite = (entry) => favorites.some(f => f.postal_code === entry.postal_code && f.country_code === entry.country_code);
  const toggleFavorite = (entry) => {
    if (isFavorite(entry)) {
      setFavorites(favorites.filter(f => !(f.postal_code === entry.postal_code && f.country_code === entry.country_code)));
    } else {
      setFavorites([entry, ...favorites].slice(0, 10));
    }
  };

  // ===== Géolocalisation =====
  const locateMe = () => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n\'est pas支持ée par votre navigateur.');
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
          const resp = await axios.get(`${API}/api/reverse?lat=${latitude}&lon=${longitude}`);
          setUserCity(resp.data);
          if (mode === 'search') {
            setLocation(resp.data);
            setSearchInput(resp.data.city || '');
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

  // ===== Calcul distance via API backend avec waypoints =====
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
      return;
    }

    // Construire la chaîne de waypoints
    const waypointsParam = buildWaypointsParam();

    // Calculer la distance totale à vol d'oiseau (fallback)
    let totalAirKm = haversineKm(cityA.latitude, cityA.longitude, cityB.latitude, cityB.longitude);
    if (waypointsParam) {
      const validWp = waypoints.filter(w => w && w.latitude && w.longitude);
      // Calculer distance A → WP1 + WP1 → WP2 + ... + WPn → B
      totalAirKm = haversineKm(cityA.latitude, cityA.longitude, validWp[0].latitude, validWp[0].longitude);
      for (let i = 0; i < validWp.length - 1; i++) {
        totalAirKm += haversineKm(validWp[i].latitude, validWp[i].longitude, validWp[i+1].latitude, validWp[i+1].longitude);
      }
      totalAirKm += haversineKm(validWp[validWp.length - 1].latitude, validWp[validWp.length - 1].longitude, cityB.latitude, cityB.longitude);
    }
    setDistance(Math.round(totalAirKm));
    setRouteCoords(null);

    const profile = modeProfile;
    let url = `${API}/api/directions?origin_lat=${cityA.latitude}&origin_lon=${cityA.longitude}&dest_lat=${cityB.latitude}&dest_lon=${cityB.longitude}&profile=${profile}`;
    if (waypointsParam) {
      url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.distance) {
          const km = data.distance / 1000;
          const coords = data.route_coords || [];
          // Convertir [lon, lat] → [lat, lon] pour Leaflet
          const leafletCoords = coords.map(c => [c[1], c[0]]);

          setDistance(Math.round(km));
          setRouteCoords(leafletCoords.length > 0 ? leafletCoords : null);
          setDuration(data.duration || null);
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
        name: '✈️ Vols',
        url: `https://www.skyscanner.fr/transport/flights-to/${searchCity}`,
        label: `Vols vers ${cityName}`
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
        <h1>🌍 GeoLoc</h1>

        {/* Onglets */}
        <div className="tabs">
          <button className={`tab ${mode === 'search' ? 'active' : ''}`} onClick={() => { setMode('search'); setError(''); }}>🔍 Recherche</button>
          <button className={`tab ${mode === 'distance' ? 'active' : ''}`} onClick={() => { setMode('distance'); setError(''); }}>📏 Distance</button>
          <button className="tab tab-dark" onClick={() => setDarkMode(!darkMode)} title="Mode sombre">
            {darkMode ? '☀️' : '🌙'}
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
                  placeholder="Code postal ou nom de ville..." />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions">
                    {suggestions.map((s, idx) => (
                      <li key={idx} onMouseDown={() => selectSuggestion(s)}>
                        <span className="suggestion-city">{s.city}</span>
                        <span className="suggestion-code">{s.postal_code}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => handleSearch()} disabled={loading}>{loading ? '⏳' : '🔍 Rechercher'}</button>
            </>
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
      </header>

      {/* Résultat distance */}
      {mode === 'distance' && distance !== null && (
        <div className="result-info distance-result">
          <h2>📏 Distance</h2>
          <p className="distance-value">{distance.toLocaleString()} km</p>
          {duration !== null && (
            <p className="duration-value">
              ⏱️ {Math.floor(duration / 3600)}h{Math.round((duration % 3600) / 60)}min
              {waypoints.filter(w => w && w.city).length > 0 && (
                <span className="wp-badge"> 🛑 {waypoints.filter(w => w && w.city).length} arrêt(s)</span>
              )}
            </p>
          )}
          {/* Villes visitées */}
          <div className="route-stops">
            <span className="stop-chip">{cityA?.city}</span>
            {waypoints.filter(w => w && w.city).map((wp, idx) => (
              <span key={idx} className="stop-chip stop-chip-wp">{wp.city}</span>
            ))}
            <span className="stop-chip">{cityB?.city}</span>
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
            <button className="btn-share" onClick={shareRoute}>📤 Partager</button>
            <button className="btn-qr" onClick={() => setShowQR(!showQR)}>
              📱 {showQR ? 'Masquer QR' : 'QR Code'}
            </button>
          </div>
          {showQR && (
            <div className="qr-section">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getRouteUrl())}`}
                alt="QR Code de l'itinéraire" className="qr-image" />
              <p className="qr-hint">Scannez pour ouvrir l'itinéraire</p>
            </div>
          )}
        </div>
      )}

      {/* Résultat recherche */}
      {mode === 'search' && location && (
        <div className="result-info">
          <h2>{location.city} <span className="postal-code">({location.postal_code})</span></h2>
          <p className="country-name">{location.country}</p>
          <div className="details">
            {location.department && <span className="detail-badge">📍 {location.department}</span>}
            {location.region && <span className="detail-badge">🗺️ {location.region}</span>}
            {location.population > 0 && <span className="detail-badge">👥 {location.population.toLocaleString()} hab.</span>}
          </div>
          {weather && weather.current && !weather.error && (
            <>
              <div className="weather-info">
                <span className="weather-icon">{getWeatherEmoji(weather.current.weathercode)}</span>
                <span className="weather-temp">{Math.round(weather.current.temperature)}°C</span>
                <span className="weather-desc">{weather.current.description}</span>
                <span className="weather-detail">💨 {weather.current.windspeed} km/h</span>
                {weather.current.humidity != null && <span className="weather-detail">💧 {weather.current.humidity}%</span>}
                {weather.current.feels_like != null && <span className="weather-detail">🌡️ Ressenti {Math.round(weather.current.feels_like)}°C</span>}
                {weather.current.precipitation_probability != null && weather.current.precipitation_probability > 0 && (
                  <span className="weather-detail">🌧️ {weather.current.precipitation_probability}%</span>
                )}
              </div>
              {/* Prévisions 3 jours */}
              {weather.daily && weather.daily.length > 0 && (
                <div className="forecast-bar">
                  {weather.daily.slice(1).map((day, idx) => (
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
            </>
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
            <button className="btn-share" onClick={shareLocation}>📤 Partager</button>
            <button className="btn-qr" onClick={() => setShowQR(!showQR)}>
              📱 {showQR ? 'Masquer QR' : 'QR Code'}
            </button>
            {location && (
              <button className="btn-fav" onClick={() => toggleFavorite(location)}>
                {isFavorite(location) ? '💛 Retirer des favoris' : '🤍 Ajouter aux favoris'}
              </button>
            )}
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

      {/* Favoris */}
      {favorites.length > 0 && (
        <div className="favorites-bar">
          <span>⭐ </span>
          {favorites.slice(0, 5).map((f, idx) => (
            <button key={idx} className="fav-chip" onClick={async () => {
              setSearchInput(f.postal_code);
              try {
                const url = `${API}/api/location/${encodeURIComponent(f.postal_code)}?country=${f.country_code || country}`;
                const resp = await axios.get(url);
                setLocation(resp.data);
              } catch { setLocation(f); }
              setMode('search');
            }}>
              {f.city} <small>({f.country_code})</small>
            </button>
          ))}
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
              setSearchInput(h.postal_code);
              try {
                const url = `${API}/api/location/${encodeURIComponent(h.postal_code)}?country=${h.country_code || country}`;
                const resp = await axios.get(url);
                setLocation(resp.data);
              } catch { setLocation(h); }
              e.target.value = '';
            }}>
            <option value="">📋 Historique des recherches</option>
            {history.slice(0, 5).map((h, idx) => (
              <option key={idx} value={idx}>{h.city} ({h.postal_code}) - {h.country_code}</option>
            ))}
          </select>
        </div>
      )}

      {/* Carte */}
      <div className="map-container">
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
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                  <b>{location.city}</b><br />{location.postal_code}<br />{location.country}
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

            {/* Tracé route OSRM (trait plein) ou vol d'oiseau (traitillés) */}
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
    </div>
  );
}

export default App;
