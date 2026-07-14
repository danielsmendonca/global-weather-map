const { getApisForCountry } = require('./api-registry');
const { getDb } = require('./database');

function calculateWindRotation(oldDir, newDir) {
  let diff = newDir - oldDir;
  while (diff < -180) diff += 360;
  while (diff > 180) diff -= 360;
  return {
    angleDifference: Number(diff.toFixed(1)),
    rotationSense: diff > 5 ? 'sentido horário' : diff < -5 ? 'sentido anti-horário' : 'estável',
  };
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { countryCode: 'XX', countryName: 'Desconhecido', city: 'Desconhecida' };
    const d = await res.json();
    return {
      countryCode: d.countryCode || 'XX',
      countryName: d.countryName || 'Desconhecido',
      city: d.city || d.locality || d.principalSubdivision || 'Desconhecida',
    };
  } catch {
    return { countryCode: 'XX', countryName: 'Desconhecido', city: 'Desconhecida' };
  }
}

async function fetchConsensusData(lat, lon) {
  const loc = await reverseGeocode(lat, lon);
  const apiList = getApisForCountry(loc.countryCode);
  const results = [];

  await Promise.all(apiList.map(async (api) => {
    try {
      const data = await api.fetch(lat, lon);
      results.push({
        source: api.name, sourceId: api.id, weight: api.weight,
        temp: data.temp, wind: data.wind, direction: data.direction,
        pressure: data.pressure, humidity: data.humidity,
        precipitation: data.precipitation, condition: data.condition,
      });
    } catch (err) {
      console.warn(`[${api.name}] ${err.message}`);
    }
  }));

  if (results.length === 0) throw new Error(`Nenhuma API disponível para ${lat},${lon}`);

  // Se só 1 API respondeu, usar direto (sem ponderação desnecessária)
  if (results.length === 1) {
    const r = results[0];
    return {
      lat, lon, country: loc.countryCode, countryName: loc.countryName, city: loc.city,
      timestamp: new Date().toISOString(),
      temperature: Number(r.temp.toFixed(1)),
      windSpeedKph: Number(r.wind.toFixed(1)),
      windDirection: r.direction,
      pressure: r.pressure, humidity: r.humidity, precipitation: r.precipitation,
      condition: r.condition === 'unknown' ? 'Céu Limpo' : r.condition,
      totalSources: 1,
      activeSources: [{ name: r.source, id: r.sourceId }],
    };
  }

  // Múltiplas APIs: outlier filtering + média ponderada
  let pool = results;
  const sorted = [...results].sort((a, b) => a.temp - b.temp);
  const median = sorted[Math.floor(sorted.length / 2)].temp;
  const filtered = results.filter(r => Math.abs(r.temp - median) <= 4.0);
  if (filtered.length >= 2) pool = filtered;

  let totalW = 0, tS = 0, wS = 0, dX = 0, dY = 0, dW = 0;
  let pS = 0, pW = 0, hS = 0, hW = 0, prS = 0, prW = 0;
  const conds = [];

  pool.forEach(r => {
    tS += r.temp * r.weight; wS += r.wind * r.weight; totalW += r.weight;
    if (r.condition && r.condition !== 'unknown') conds.push(r.condition);
    if (r.pressure != null) { pS += r.pressure * r.weight; pW += r.weight; }
    if (r.humidity != null) { hS += r.humidity * r.weight; hW += r.weight; }
    if (r.precipitation != null && r.precipitation >= 0) { prS += r.precipitation * r.weight; prW += r.weight; }
    if (r.direction != null) {
      const rad = (r.direction * Math.PI) / 180;
      dX += Math.cos(rad) * r.weight; dY += Math.sin(rad) * r.weight; dW += r.weight;
    }
  });

  let finalDir = null;
  if (dW > 0) {
    let deg = (Math.atan2(dY / dW, dX / dW) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    finalDir = Number(deg.toFixed(1));
  }

  return {
    lat, lon, country: loc.countryCode, countryName: loc.countryName, city: loc.city,
    timestamp: new Date().toISOString(),
    temperature: Number((tS / totalW).toFixed(1)),
    windSpeedKph: Number((wS / totalW).toFixed(1)),
    windDirection: finalDir,
    pressure: pW > 0 ? Number((pS / pW).toFixed(1)) : null,
    humidity: hW > 0 ? Number((hS / hW).toFixed(1)) : null,
    precipitation: prW > 0 ? Number((prS / prW).toFixed(1)) : null,
    condition: conds.length > 0
      ? conds.sort((a, b) => conds.filter(v => v === a).length - conds.filter(v => v === b).length).pop()
      : 'Céu Limpo',
    totalSources: pool.length,
    activeSources: pool.map(r => ({ name: r.source, id: r.sourceId })),
  };
}

async function processAndSave(currentReading) {
  const db = await getDb();
  const { lat, lon, timestamp, temperature, windSpeedKph, windDirection, pressure, humidity, precipitation, condition, country, city, activeSources } = currentReading;

  const geo = 0.05;
  const prev = db.prepare(`SELECT * FROM weather_history WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`)
    .get([lat - geo, lat + geo, lon - geo, lon + geo, timestamp]);

  const trends = {
    temperatureTrend: 'estável', temperatureDiff: 0,
    windSpeedTrend: 'estável', windSpeedDiff: 0,
    windRotation: { angleDifference: 0, rotationSense: 'dados anteriores insuficientes' },
    pressureTrend: 'estável', pressureDiff: 0,
    humidityTrend: 'estável', humidityDiff: 0,
    hasHistoricalData: false,
  };

  if (prev && prev.temperature !== undefined) {
    trends.hasHistoricalData = true;
    trends.temperatureDiff = Number((temperature - prev.temperature).toFixed(1));
    if (trends.temperatureDiff > 0.5) trends.temperatureTrend = 'subindo';
    else if (trends.temperatureDiff < -0.5) trends.temperatureTrend = 'caindo';
    trends.windSpeedDiff = Number((windSpeedKph - prev.wind_speed).toFixed(1));
    if (trends.windSpeedDiff > 2.0) trends.windSpeedTrend = 'intensificando';
    else if (trends.windSpeedDiff < -2.0) trends.windSpeedTrend = 'diminuindo';
    if (windDirection != null && prev.wind_direction != null)
      trends.windRotation = calculateWindRotation(prev.wind_direction, windDirection);
    if (pressure && prev.pressure) {
      trends.pressureDiff = Number((pressure - prev.pressure).toFixed(1));
      if (trends.pressureDiff > 1.0) trends.pressureTrend = 'subindo (firmando)';
      else if (trends.pressureDiff < -1.0) trends.pressureTrend = 'caindo (instabilidade)';
    }
    if (humidity && prev.humidity) {
      trends.humidityDiff = Number((humidity - prev.humidity).toFixed(1));
      if (trends.humidityDiff > 3) trends.humidityTrend = 'subindo';
      else if (trends.humidityDiff < -3) trends.humidityTrend = 'caindo';
    }
  }

  db.run(`INSERT INTO weather_history (lat, lon, timestamp, temperature, wind_speed, wind_direction, pressure, humidity, precipitation, condition, country, city_name, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [lat, lon, timestamp, temperature, windSpeedKph, windDirection, pressure, humidity, precipitation, condition, country, city, JSON.stringify(activeSources)]);

  const row = db.prepare(`SELECT COUNT(*) as cnt FROM weather_history`).get([]);
  return { current: { ...currentReading }, trends, totalRecords: row ? row.cnt : 0 };
}

async function getHistory(lat, lon, hours = 24) {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const geo = 0.05;
  return db.prepare(`SELECT * FROM weather_history WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND timestamp >= ? ORDER BY timestamp ASC`)
    .all([lat - geo, lat + geo, lon - geo, lon + geo, since])
    .map(r => ({
      id: r.id, timestamp: r.timestamp, temperature: r.temperature,
      windSpeedKph: r.wind_speed, windDirection: r.wind_direction,
      pressure: r.pressure, humidity: r.humidity, precipitation: r.precipitation,
      condition: r.condition,
    }));
}

module.exports = { fetchConsensusData, processAndSave, getHistory, calculateWindRotation };
