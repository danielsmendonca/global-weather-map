let map, panelChart = null;
let countriesGeo = null;
let countryLayer, overlaysLayer, labelLayer;
let weatherData = [];
let refreshTimer = null;
let heatmapVisible = false;
let rainParticles = [];
let rainAnimFrame = null;
let isFullscreen = false;

const TEMP_COLORS = [
  { max: -20, fill: '#1a0aaf' },
  { max: -15, fill: '#2010d0' },
  { max: -10, fill: '#2820e8' },
  { max: -5,  fill: '#3040f0' },
  { max: 0,   fill: '#4080ff' },
  { max: 3,   fill: '#30b0f0' },
  { max: 7,   fill: '#20c8e0' },
  { max: 12,  fill: '#30d8a0' },
  { max: 17,  fill: '#50e860' },
  { max: 22,  fill: '#90e830' },
  { max: 27,  fill: '#e0e020' },
  { max: 32,  fill: '#f0b010' },
  { max: 37,  fill: '#f07010' },
  { max: 42,  fill: '#e03020' },
  { max: Infinity, fill: '#b01020' },
];

function tempColor(temp) {
  if (temp == null) return '#1a1a2e';
  for (const r of TEMP_COLORS) if (temp <= r.max) return r.fill;
  return '#b71c1c';
}

function tempColorRGB(temp) {
  const hex = tempColor(temp);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

// ─── LIVE CLOCK ───
function updateClock() {
  const now = new Date();
  const el = document.getElementById('liveClock');
  if (el) {
    el.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// ─── TICKER ───
function updateTicker() {
  const el = document.getElementById('tickerContent');
  if (!el || !weatherData.length) return;
  const ok = weatherData.filter(w => w.temperature != null);
  const temps = ok.map(w => w.temperature);
  const avg = (temps.reduce((s, v) => s + v, 0) / temps.length).toFixed(1);
  const min = Math.min(...temps).toFixed(0);
  const max = Math.max(...temps).toFixed(0);
  const hottest = ok.reduce((a, b) => a.temperature > b.temperature ? a : b);
  const coldest = ok.reduce((a, b) => a.temperature < b.temperature ? a : b);
  const rainy = ok.filter(w => w.precipitation != null && w.precipitation > 0);

  const items = [
    `${ok.length} cidades monitoradas`,
    `Média global: ${avg}°C`,
    `Range: ${min}° ~ ${max}°`,
    `Mais quente: ${hottest.city} ${Math.round(hottest.temperature)}°`,
    `Mais frio: ${coldest.city} ${Math.round(coldest.temperature)}°`,
    ...rainy.slice(0, 5).map(w => `Chuva em ${w.city}: ${w.precipitation.toFixed(1)}mm`),
  ];

  el.innerHTML = items.map(t =>
    `<span class="ticker-item"><span class="ticker-dot"></span>${t}</span>`
  ).join('');
}

// ─── HEATMAP — Choropleth via GeoJSON (zoom/pan nativo) ───
let heatCanvas = null;
function initHeatmap() {}
function showHeatmap() {}
function hideHeatmap() {}
function drawHeatmap() {}

// ─── RAIN ANIMATION ───
function initRainParticles() {
  const particles = [];
  const ok = weatherData.filter(w => w.precipitation != null && w.precipitation > 0);
  for (const s of ok) {
    const count = Math.min(12, Math.ceil(s.precipitation * 2));
    const pt = map.latLngToContainerPoint([s.lat, s.lon]);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: pt.x + (Math.random() - 0.5) * 100,
        y: pt.y + (Math.random() - 0.5) * 100 - Math.random() * 40,
        speed: 1.5 + Math.random() * 2 + s.precipitation * 0.3,
        length: 3 + Math.random() * 4 + s.precipitation * 0.3,
        opacity: 0.15 + Math.random() * 0.25,
      });
    }
  }
  return particles;
}

function animateRain() {
  if (!map) return;
  const w = map.getSize().x;
  const h = map.getSize().y;

  rainParticles.forEach(p => {
    p.y += p.speed;
    p.x -= p.speed * 0.1;
    if (p.y > h + 10) { p.y = -5; p.x = Math.random() * w; }
    if (p.x < -10) p.x = w + 5;
  });

  rainAnimFrame = requestAnimationFrame(animateRain);
}

function startRain() {
  stopRain();
  const ok = weatherData.filter(w => w.precipitation != null && w.precipitation > 0);
  if (ok.length === 0) return;
  rainParticles = initRainParticles();
  animateRain();
}

function stopRain() {
  if (rainAnimFrame) { cancelAnimationFrame(rainAnimFrame); rainAnimFrame = null; }
  rainParticles = [];
}

// ─── HELPERS ───
function degDir(deg) {
  if (deg == null) return '--';
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
}

function condLabel(cond) {
  const c = (cond || '').toLowerCase();
  if (c.includes('trovoada') || c.includes('thunder')) return 'Trovoada';
  if (c.includes('granizo') || c.includes('hail')) return 'Granizo';
  if (c.includes('neve') || c.includes('snow')) return 'Neve';
  if (c.includes('chuva') || c.includes('rain')) return 'Chuva';
  if (c.includes('chuvisc') || c.includes('drizzle')) return 'Chuvisco';
  if (c.includes('nevoeiro') || c.includes('fog')) return 'Nevoeiro';
  if (c.includes('nublado') || c.includes('overcast')) return 'Nublado';
  if (c.includes('cloud')) return 'Nuvens';
  if (c.includes('limpo') || c.includes('clear')) return 'Limpo';
  if (c.includes('sunny') || c.includes('sol')) return 'Ensolarado';
  return cond || '--';
}

function condIconCSS(cond) {
  const c = (cond || '').toLowerCase();
  if (c.includes('trovoada') || c.includes('thunder')) return '<svg viewBox="0 0 16 16" width="10" height="10"><path d="M9 1L6 8h3l-1 6 4-7H9z" fill="#FFD54F" stroke="#F57F17" stroke-width="0.5"/></svg>';
  if (c.includes('chuva') || c.includes('rain') || c.includes('chuvisc') || c.includes('drizzle')) return '<svg viewBox="0 0 16 16" width="10" height="10"><path d="M4 5a4 4 0 018 0 3 3 0 010 6H4a3 3 0 010-6z" fill="#64B5F6" opacity="0.9"/><line x1="6" y1="12" x2="5" y2="15" stroke="#42A5F5" stroke-width="1" stroke-linecap="round"/><line x1="10" y1="12" x2="9" y2="15" stroke="#42A5F5" stroke-width="1" stroke-linecap="round"/></svg>';
  if (c.includes('neve') || c.includes('snow')) return '<svg viewBox="0 0 16 16" width="10" height="10"><circle cx="8" cy="8" r="3" fill="#E3F2FD" opacity="0.8"/><circle cx="4" cy="5" r="1.5" fill="#BBDEFB" opacity="0.6"/><circle cx="12" cy="5" r="1.5" fill="#BBDEFB" opacity="0.6"/></svg>';
  if (c.includes('nublado') || c.includes('overcast') || c.includes('cloud')) return '<svg viewBox="0 0 16 16" width="10" height="10"><path d="M4 6a4 4 0 017.5-1.5A3 3 0 0114 10H4a3 3 0 010-4z" fill="#90A4AE" opacity="0.8"/></svg>';
  if (c.includes('nevoeiro') || c.includes('fog')) return '<svg viewBox="0 0 16 16" width="10" height="10"><line x1="2" y1="6" x2="14" y2="6" stroke="#B0BEC5" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="9" x2="12" y2="9" stroke="#B0BEC5" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg>';
  if (c.includes('limpo') || c.includes('clear') || c.includes('sunny')) return '<svg viewBox="0 0 16 16" width="10" height="10"><circle cx="8" cy="8" r="3" fill="#FFD54F"/><g stroke="#FFB300" stroke-width="0.8" stroke-linecap="round"><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/></g></svg>';
  return '<svg viewBox="0 0 16 16" width="10" height="10"><circle cx="8" cy="8" r="3" fill="#90CAF9" opacity="0.6"/></svg>';
}

function isRain(cond) {
  const c = (cond || '').toLowerCase();
  return c.includes('chuva') || c.includes('rain') || c.includes('trovoada') || c.includes('thunder') || c.includes('chuvisc') || c.includes('drizzle');
}

function isCloud(cond) {
  const c = (cond || '').toLowerCase();
  return c.includes('nublado') || c.includes('cloud') || c.includes('overcast');
}

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

let countryCentroids = [];

function computeCentroids() {
  countryCentroids = [];
  if (!countriesGeo) return;
  for (const feat of countriesGeo.features) {
    let lat = 0, lon = 0, count = 0;
    const geom = feat.geometry;
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    for (const poly of polys) {
      const rings = Array.isArray(poly[0]) && Array.isArray(poly[0][0]) ? poly : [poly];
      for (const ring of rings) {
        for (const coord of ring) {
          if (Array.isArray(coord) && coord.length >= 2) {
            lon += coord[0]; lat += coord[1]; count++;
          }
        }
      }
    }
    if (count > 0) countryCentroids.push({ id: feat.id, lat: lat / count, lon: lon / count });
  }
}

function nearestTemp(lat, lon) {
  let best = null, bestD = Infinity;
  for (const w of weatherData) {
    if (w.temperature == null) continue;
    const d = (w.lat - lat) ** 2 + (w.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}

// ─── MAP ───
function initMap() {
  map = L.map('map', {
    center: [20, 0], zoom: 2.5,
    zoomControl: false, attributionControl: false,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);

  map.on('click', () => {
    document.getElementById('weatherPanel').classList.remove('active');
  });

  map.on('zoomend', () => {
    document.getElementById('zoomInfo').textContent = `Zoom: ${map.getZoom().toFixed(1)}`;
    buildMapLayers();
  });

  initHeatmap();

  loadCountriesData();
}

async function loadCountriesData() {
  try {
    const world = await get('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json');
    countriesGeo = topojson.feature(world, world.objects.countries);
    computeCentroids();
    console.log(`[Mapa] ${countryCentroids.length} países carregados`);
    buildMapLayers();
  } catch (e) { console.warn('Países não carregados:', e); }
}

function buildMapLayers() {
  if (countryLayer) { map.removeLayer(countryLayer); countryLayer = null; }
  if (overlaysLayer) { map.removeLayer(overlaysLayer); overlaysLayer = null; }
  if (labelLayer) { map.removeLayer(labelLayer); labelLayer = null; }

  const showTemp = document.getElementById('layerTemp').checked;
  const showWind = document.getElementById('layerWind').checked;
  const showPrecip = document.getElementById('layerPrecip').checked;
  const showCities = document.getElementById('layerCities').checked;

  if (showTemp) showHeatmap(); else hideHeatmap();
  if (showPrecip) startRain(); else stopRain();

  const overlays = [];

  // Build a lookup: feature id → nearest station
  const countryLookup = new Map();
  for (const c of countryCentroids) {
    const w = nearestTemp(c.lat, c.lon);
    countryLookup.set(c.id, w);
  }

  // Country borders — colored by nearest station temperature
  if (countriesGeo) {
    countryLayer = L.geoJSON(countriesGeo, {
      style: (feature) => {
        const w = countryLookup.get(feature.id);
        if (!w || w.temperature == null) return { fillColor: '#0a1628', fillOpacity: 0.15, color: '#1a3050', weight: 0.4, opacity: 0.5 };
        return {
          fillColor: tempColor(w.temperature),
          fillOpacity: 0.5,
          color: '#1a3050',
          weight: 0.6,
          opacity: 0.6,
        };
      },
    }).addTo(map);
  }

  // ─── ZOOM-BASED CLUSTERING ───
  const zoom = map.getZoom();
  let gridSize;
  if (zoom <= 1) gridSize = 25;
  else if (zoom <= 2) gridSize = 18;
  else if (zoom <= 3) gridSize = 12;
  else if (zoom <= 4) gridSize = 8;
  else if (zoom <= 5) gridSize = 5;
  else if (zoom <= 6) gridSize = 3;
  else gridSize = 0;

  let visibleCities;
  if (gridSize === 0) {
    visibleCities = weatherData.filter(w => w.temperature != null);
  } else {
    const cells = new Map();
    for (const w of weatherData) {
      if (w.temperature == null) continue;
      const key = `${Math.floor(w.lat / gridSize)}_${Math.floor(w.lon / gridSize)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(w);
    }
    visibleCities = [];
    for (const [, group] of cells) {
      const centerLat = group.reduce((s, c) => s + c.lat, 0) / group.length;
      const centerLon = group.reduce((s, c) => s + c.lon, 0) / group.length;
      let best = group[0], bestD = Infinity;
      for (const c of group) {
        const d = (c.lat - centerLat) ** 2 + (c.lon - centerLon) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      visibleCities.push({ ...best, _clusterSize: group.length, _clusterCities: group.map(c => c.city).join(', ') });
    }
  }

  for (const w of visibleCities) {
    if (showTemp && (isCloud(w.condition) || isRain(w.condition))) {
      overlays.push(L.circle([w.lat, w.lon], {
        radius: 100000, weight: 0,
        fillColor: 'rgba(180,195,215,0.08)', fillOpacity: 0.2, interactive: false,
      }));
    }

    if (showWind && w.windSpeed != null && w.windSpeed >= 2) {
      const size = Math.max(18, Math.min(32, w.windSpeed * 1.5));
      const dir = w.windDirection || 0;
      const opacity = Math.min(0.8, 0.15 + w.windSpeed / 30);
      overlays.push(L.marker([w.lat, w.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="wind-arrow" style="--wind-rotate:rotate(${dir}deg);--wind-opacity:${opacity};width:${size}px;height:${size}px;"></div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        }), interactive: false,
      }));
    }

    if (showPrecip && w.precipitation != null && w.precipitation > 0) {
      const n = Math.min(6, Math.ceil(w.precipitation / 2));
      for (let i = 0; i < n; i++) {
        overlays.push(L.circleMarker([
          w.lat + (Math.random() - 0.5) * 0.4,
          w.lon + (Math.random() - 0.5) * 0.4
        ], {
          radius: 1.5 + w.precipitation / 10,
          fillColor: '#42a5f5', fillOpacity: 0.6, weight: 0, interactive: false,
        }));
      }
    }

    if (showCities) {
      const tempHex = tempColor(w.temperature);
      const regionLine = w.region ? `<span class="city-region">${w.region}</span>` : '';
      const isCluster = w._clusterSize > 1;
      const clusterBadge = isCluster ? `<span class="city-cluster-badge">${w._clusterSize}</span>` : '';
      const displayName = isCluster ? (w.city || '') : (w.city || '');
      const subtitle = isCluster ? `<span class="city-cluster-sub">${w._clusterCities}</span>` : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="city-marker ${isCluster ? 'is-cluster' : ''}" style="border-color:${tempHex}80;">
          <span class="city-name">${displayName}</span>
          ${clusterBadge}
          ${regionLine}
          ${subtitle}
          <span class="city-temp-row">
            <span class="city-icon">${condIconCSS(w.condition)}</span>
            <span class="city-temp" style="color:${tempHex};">${Math.round(w.temperature)}°</span>
          </span>
        </div>`,
        iconSize: [0, 0], iconAnchor: [0, 0],
      });
      const mk = L.marker([w.lat, w.lon], { icon });
      mk.on('click', (e) => { L.DomEvent.stopPropagation(e); showPanel(w); });
      overlays.push(mk);
    }
  }

  overlaysLayer = L.layerGroup(overlays).addTo(map);

  // Temperature labels on countries
  if (showTemp && countriesGeo) {
    const labels = [];
    for (const c of countryCentroids) {
      const w = countryLookup.get(c.id);
      if (!w || w.temperature == null) continue;
      const tc = tempColor(w.temperature);
      labels.push(L.marker([c.lat, c.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-family:'Roboto Mono',monospace;font-size:11px;font-weight:700;
            color:${tc};text-shadow:0 0 6px #000,0 0 12px #000,1px 1px 4px rgba(0,0,0,0.9);
            white-space:nowrap;pointer-events:none;letter-spacing:0.03em;
            opacity:0.9;">${Math.round(w.temperature)}°</div>`,
          iconSize: [0, 0],
        }), interactive: false,
      }));
    }
    if (labels.length) labelLayer = L.layerGroup(labels).addTo(map);
  }
}

// ─── PANEL ───
function showPanel(data) {
  const panel = document.getElementById('weatherPanel');
  panel.classList.add('active');

  const tc = tempColor(data.temperature);

  document.getElementById('panelLocation').textContent = data.city || `${data.lat.toFixed(2)}°, ${data.lon.toFixed(2)}°`;
  document.getElementById('panelSubtitle').textContent = `${data.region ? data.region + ' · ' : ''}${data.lat.toFixed(2)}°, ${data.lon.toFixed(2)}° · ${condLabel(data.condition)}`;

  document.getElementById('pTmpMain').textContent = data.temperature != null ? `${data.temperature.toFixed(1)}°C` : '--';
  document.getElementById('pTmpMain').style.color = tc;
  document.getElementById('pCondMain').textContent = condLabel(data.condition);

  document.getElementById('pTmp').textContent = data.temperature != null ? `${data.temperature.toFixed(1)}°C` : '--';
  document.getElementById('pWnd').textContent = data.windSpeed != null ? `${data.windSpeed.toFixed(0)} km/h` : '--';
  document.getElementById('pDir').textContent = data.windDirection != null ? `${degDir(data.windDirection)} (${data.windDirection}°)` : '--';
  document.getElementById('pPrs').textContent = data.pressure != null ? `${data.pressure.toFixed(0)}` : '--';
  document.getElementById('pHum').textContent = data.humidity != null ? `${data.humidity.toFixed(0)}%` : '--';
  document.getElementById('pPrc').textContent = data.precipitation != null ? `${data.precipitation.toFixed(1)} mm` : '0 mm';
  document.getElementById('pCond').textContent = condLabel(data.condition);

  if (data.lastUpdate) {
    const ago = Math.round((Date.now() - new Date(data.lastUpdate).getTime()) / 60000);
    document.getElementById('pTrends').innerHTML =
      `<span class="tag">Atualizado há ${ago} min</span>` +
      `<span class="tag">${data.lat.toFixed(2)}°, ${data.lon.toFixed(2)}°</span>`;
  } else {
    document.getElementById('pTrends').innerHTML = '';
  }

  loadChart(data.lat, data.lon);
}

async function loadChart(lat, lon) {
  try {
    const data = await get(`/api/history?lat=${lat}&lon=${lon}&hours=24`);
    const ctx = document.getElementById('panelChart').getContext('2d');
    if (panelChart) panelChart.destroy();
    if (!data.length) return;
    panelChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => new Date(d.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
        datasets: [{
          label: 'Temperatura °C',
          data: data.map(d => d.temperature),
          borderColor: '#4fc3f7', backgroundColor: 'rgba(79,195,247,0.08)',
          fill: true, tension: 0.4, pointRadius: 1.5, pointBackgroundColor: '#4fc3f7',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#455a64', maxTicksLimit: 6, font: { family: 'Roboto Mono', size: 8 } }, grid: { color: '#0d1e3a' } },
          y: { ticks: { color: '#455a64', font: { family: 'Roboto Mono', size: 8 } }, grid: { color: '#0d1e3a' } },
        },
      },
    });
  } catch {}
}

function updateStats() {
  const el = document.getElementById('headerStats');
  const ok = weatherData.filter(w => w.temperature != null);
  if (!ok.length) { el.textContent = 'A carregar...'; return; }
  const temps = ok.map(w => w.temperature);
  el.textContent = `${ok.length} CIDADES · ${Math.min(...temps).toFixed(0)}° ~ ${Math.max(...temps).toFixed(0)}° · MÉDIA ${(temps.reduce((s, v) => s + v, 0) / temps.length).toFixed(1)}°`;
}

async function refreshAll() {
  try { weatherData = await get('/api/map-data'); } catch { weatherData = []; }
  console.log(`[Dados] ${weatherData.length} cidades com dados`);
  if (weatherData.length > 0) console.log('[Dados] Exemplo:', weatherData[0].city, weatherData[0].temperature);
  updateStats();
  updateTicker();
  buildMapLayers();
  drawHeatmap();
}

// ─── FULLSCREEN ───
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      document.body.classList.add('is-fullscreen');
      isFullscreen = true;
      setTimeout(() => { map.invalidateSize(); drawHeatmap(); }, 300);
    }).catch(() => {});
  } else {
    document.exitFullscreen().then(() => {
      document.body.classList.remove('is-fullscreen');
      isFullscreen = false;
      setTimeout(() => { map.invalidateSize(); drawHeatmap(); }, 300);
    }).catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.body.classList.remove('is-fullscreen');
    isFullscreen = false;
  }
  setTimeout(() => { map.invalidateSize(); drawHeatmap(); }, 300);
});

// ─── EVENTS ───
document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);

document.getElementById('searchBtn').addEventListener('click', () => {
  const lat = parseFloat(document.getElementById('latInput').value);
  const lon = parseFloat(document.getElementById('lonInput').value);
  if (isNaN(lat) || isNaN(lon)) return;
  map.setView([lat, lon], 8);
  get(`/api/weather?lat=${lat}&lon=${lon}`).then(d => showPanel(d.current || d)).catch(e => alert(e.message));
});

document.getElementById('autoDetectBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 8);
      get(`/api/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
        .then(d => showPanel(d.current || d)).catch(e => alert(e.message));
    },
    () => alert('Geolocalização negada')
  );
});

document.getElementById('panelClose').addEventListener('click', () => {
  document.getElementById('weatherPanel').classList.remove('active');
});

document.querySelectorAll('.layer-toggles input').forEach(i => i.addEventListener('change', buildMapLayers));

document.getElementById('latInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('searchBtn').click(); });
document.getElementById('lonInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('searchBtn').click(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (document.activeElement.tagName !== 'INPUT') toggleFullscreen();
  }
});

// ─── SSE (tempo real) ───
function connectSSE() {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'harvest-complete') {
        console.log(`[SSE] Harvester concluído: ${data.cities} cidades, atualizando mapa...`);
        refreshAll();
      }
    } catch {}
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 5000);
  };
}

// ─── INIT ───
document.getElementById('loading').style.display = 'none';
initMap();
updateClock();
setInterval(updateClock, 1000);
refreshAll();
refreshTimer = setInterval(refreshAll, 60000);
connectSSE();
