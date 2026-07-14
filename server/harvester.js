const cities = require('./cities.json');
const { getDb } = require('./database');
const { fetchConsensusData } = require('./consensus');

let running = false;
let interval = null;
let broadcastFn = null;
let stats = { totalFetches: 0, successes: 0, failures: 0, lastRun: null, status: 'parado' };

async function harvestCity(city) {
  try {
    const data = await fetchConsensusData(city.lat, city.lon);
    stats.successes++;
    const db = await getDb();
    db.run(`INSERT OR REPLACE INTO harvester_status
      (city_name, country, lat, lon, last_update, temperature, wind_speed, wind_direction, pressure, humidity, precipitation, condition, region)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [city.name, data.country, city.lat, city.lon, data.timestamp,
       data.temperature, data.windSpeedKph, data.windDirection, data.pressure,
       data.humidity, data.precipitation ?? null, data.condition, city.region || null]);
    return true;
  } catch (err) {
    stats.failures++;
    console.warn(`[Harvester] ${city.name}: ${err.message}`);
    return false;
  }
}

async function runHarvest() {
  if (running) return;
  running = true;
  stats.status = 'em execução';

  const db = await getDb();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const fresh = db.prepare(`SELECT lat, lon FROM harvester_status WHERE last_update >= ?`).all([cutoff]);
  const freshSet = new Set(fresh.map(r => `${r.lat},${r.lon}`));

  const toFetch = cities.filter(c => !freshSet.has(`${c.lat},${c.lon}`));
  if (toFetch.length === 0) {
    stats.status = 'pronto';
    running = false;
    console.log(`[Harvester] Todos os dados ainda frescos, skip`);
    return;
  }

  console.log(`[Harvester] A recolher dados para ${toFetch.length} cidades (${freshSet.length} frescas)...`);

  for (let i = 0; i < toFetch.length; i++) {
    await harvestCity(toFetch[i]);
      if (i < toFetch.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  stats.lastRun = new Date().toISOString();
  stats.totalFetches += toFetch.length;
  stats.status = 'pronto';
  running = false;
  const ok = stats.successes;
  stats.successes = 0;
  stats.failures = 0;
  console.log(`[Harvester] Concluído: ${ok} cidades com dados reais`);
  if (broadcastFn) broadcastFn({ type: 'harvest-complete', timestamp: stats.lastRun, cities: ok });
}

function startHarvester(intervalMinutes = 15, broadcast) {
  broadcastFn = broadcast || null;
  console.log(`[Harvester] Agendado a cada ${intervalMinutes} minutos`);
  setTimeout(() => runHarvest(), 5000);
  interval = setInterval(runHarvest, intervalMinutes * 60 * 1000);
}

function stopHarvester() {
  if (interval) { clearInterval(interval); interval = null; }
  stats.status = 'parado';
}

function getHarvesterStats() {
  return { ...stats, cityCount: cities.length };
}

async function getMapData() {
  const db = await getDb();
  return db.prepare(`SELECT * FROM harvester_status WHERE last_update IS NOT NULL ORDER BY last_update DESC`).all([]).map(r => ({
    city: r.city_name, country: r.country, lat: r.lat, lon: r.lon, region: r.region || null,
    temperature: r.temperature, windSpeed: r.wind_speed, windDirection: r.wind_direction,
    pressure: r.pressure, humidity: r.humidity, precipitation: r.precipitation,
    condition: r.condition, lastUpdate: r.last_update,
  }));
}

module.exports = { startHarvester, stopHarvester, getHarvesterStats, getMapData, runHarvest };
