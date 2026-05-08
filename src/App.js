import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
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

const COUNTRIES = [
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
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
    if (v.length >= 2) {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(async () => {
        try {
          const resp = await axios.get(`${API}/api/search?q=${encodeURIComponent(v)}&country=${country}&limit=5`);
          setSuggestions(resp.data || []);
          setShow(resp.data?.length > 0);
        } catch { setSuggestions([]); }
      }, 300);
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
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null); // tracé routier

  const [error, setError] = useState('');
  const [country, setCountry] = useState('FR');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  // Charger l'historique
  useEffect(() => {
    try {
      const saved = localStorage.getItem('geoHistory');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) { /* ignore */ }
  }, []);

  const saveToHistory = (entry) => {
    const newHistory = [entry, ...history.filter(h => h.postal_code !== entry.postal_code)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('geoHistory', JSON.stringify(newHistory));
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
          const resp = await axios.get(`${API}/api/search?q=${encodeURIComponent(v)}&country=${country}&limit=5`);
          setSuggestions(resp.data || []);
          setShowSuggestions(resp.data?.length > 0);
        } catch { setSuggestions([]); }
      }, 300);
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
    } catch (err) {
      setError(`Erreur: ${err.message}`);
      setLocation(null);
    } finally { setLoading(false); }
  };

  // ===== Mode Distance =====
  const handleDistanceCity = async (cityData, side) => {
    const data = cityData;
    try {
      const url = `${API}/api/location/${encodeURIComponent(data.postal_code)}?country=${data.country_code || country}`;
      const resp = await axios.get(url);
      if (side === 'A') setCityA(resp.data);
      else setCityB(resp.data);
    } catch {
      // Fallback : utiliser les données de la suggestion (latitude/longitude déjà présentes)
      const fallback = {
        city: data.city,
        postal_code: data.postal_code,
        country: data.country || country,
        country_code: data.country_code || country,
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

  // ===== Export =====
  const exportData = (format) => {
    if (!location) return;
    const filename = `geo_${location.city}_${location.postal_code}`;
    let content;
    if (format === 'json') {
      content = JSON.stringify(location, null, 2);
      download(content, `${filename}.json`, 'application/json');
    } else if (format === 'csv') {
      const headers = 'City,Postal Code,Country,Latitude,Longitude,Department,Region,Population\n';
      const row = `"${location.city}","${location.postal_code}","${location.country}",${location.latitude},${location.longitude},"${location.department || ''}","${location.region || ''}",${location.population || 0}\n`;
      content = headers + row;
      download(content, `${filename}.csv`, 'text/csv;charset=utf-8;');
    }
  };

  const download = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetCities = () => { setCityA(null); setCityB(null); setDistance(null); };

  // Calculer la distance réelle via OSRM
  useEffect(() => {
    if (!cityA || !cityB) {
      setDistance(null);
      setDuration(null);
      setRouteCoords(null);
      return;
    }
    
    // Distance à vol d'oiseau (fallback)
    const dAir = haversineKm(cityA.latitude, cityA.longitude, cityB.latitude, cityB.longitude);
    setDistance(Math.round(dAir));
    setRouteCoords(null);

    // Appel OSRM pour la vraie distance routière
    const lon1 = cityA.longitude;
    const lat1 = cityA.latitude;
    const lon2 = cityB.longitude;
    const lat2 = cityB.latitude;
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.code === 'Ok' && data.routes?.length > 0) {
          const route = data.routes[0];
          const meters = route.distance;
          const secs = route.duration;
          
          // Convertir GeoJSON [lon,lat] → Leaflet [lat,lon]
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
          
          setDistance(Math.round(meters / 1000));
          setDuration(Math.round(secs));
          setRouteCoords(coords);
        }
      })
      .catch(() => {
        // Fallback : on garde la distance à vol d'oiseau déjà calculée
      });
  }, [cityA, cityB]);

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

  // Positions des marqueurs de distance
  const aPos = cityA ? [cityA.latitude, cityA.longitude] : null;
  const bPos = cityB ? [cityB.latitude, cityB.longitude] : null;
  const lineCoords = aPos && bPos ? [aPos, bPos] : null;

  // ===== Rendu =====
  return (
    <div className="App">
      <header>
        <h1>🌍 Application Géo</h1>

        {/* Onglets */}
        <div className="tabs">
          <button className={`tab ${mode === 'search' ? 'active' : ''}`} onClick={() => { setMode('search'); setError(''); }}>🔍 Recherche</button>
          <button className={`tab ${mode === 'distance' ? 'active' : ''}`} onClick={() => { setMode('distance'); setError(''); }}>📏 Distance</button>
        </div>

        {/* Pays */}
        <div className="search-bar" style={{ marginTop: '10px' }}>
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

        {/* Zone Distance : deux champs ville */}
        {mode === 'distance' && (
          <div className="distance-inputs">
            <CityInput label="Ville A (départ)" value={cityA?.city || ''} country={country}
              placeholder="Paris" onSelect={(data) => handleDistanceCity(data, 'A')} />
            <span className="distance-sep">→</span>
            <CityInput label="Ville B (arrivée)" value={cityB?.city || ''} country={country}
              placeholder="Marseille" onSelect={(data) => handleDistanceCity(data, 'B')} />
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </header>

      {/* Résultat distance */}
      {mode === 'distance' && distance !== null && (
        <div className="result-info distance-result">
          <h2>📏 Distance</h2>
          <p className="distance-value">{distance.toLocaleString()} km</p>
          {duration !== null && (
            <p className="duration-value">⏱️ {Math.floor(duration / 3600)}h{Math.round((duration % 3600) / 60)}min</p>
          )}
          <p className="distance-cities">{cityA?.city} → {cityB?.city}</p>
          <p className="coords">{routeCoords ? 'Route (OSRM)' : 'Vol d\'oiseau'}</p>
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
          <p className="coords">Coordonnées : {location.latitude}, {location.longitude}</p>
          <div className="actions">
            <button className="btn-export" onClick={() => exportData('json')}>📥 Export JSON</button>
            <button className="btn-export" onClick={() => exportData('csv')}>📥 Export CSV</button>
          </div>
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
          <MapContainer key={mode + (cityA?.postal_code || '') + (cityB?.postal_code || '')}
            center={getMapCenter()} zoom={getMapZoom()}
            scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Mode Recherche : marqueur unique */}
            {mode === 'search' && location && (
              <Marker position={[location.latitude, location.longitude]} icon={getFlagIcon(location.country_code)}>
                <Popup>
                  <b>{location.city}</b><br />{location.postal_code}<br />{location.country}
                </Popup>
              </Marker>
            )}

            {/* Mode Distance : deux marqueurs + ligne */}
            {mode === 'distance' && aPos && (
              <Marker position={aPos} icon={getFlagIcon(cityA?.country_code)}>
                <Popup><b>{cityA.city}</b><br />Départ</Popup>
              </Marker>
            )}
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
