async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function wmoCode(code) {
  if (code == null) return 'Desconhecido';
  if (code === 0) return 'Céu Limpo';
  if (code <= 3) return 'Parcialmente Nublado';
  if (code <= 48) return 'Nevoeiro';
  if (code <= 57) return 'Chuvisco';
  if (code <= 67) return 'Chuva';
  if (code <= 77) return 'Neve';
  if (code <= 82) return 'Aguaceiros';
  if (code <= 86) return 'Chuva de Neve';
  return 'Trovoada';
}

const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function compassToDeg(compass) {
  const idx = COMPASS_16.indexOf(compass);
  return idx >= 0 ? idx * 22.5 : null;
}

const apis = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    countries: ['*'],
    weight: 1.0,
    fetch: async (lat, lon) => {
      const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,precipitation,weather_code&timezone=auto`);
      const c = d.current;
      if (!c || c.temperature_2m == null) throw new Error('Sem dados');
      return {
        temp: c.temperature_2m,
        wind: c.wind_speed_10m ?? 0,
        direction: c.wind_direction_10m,
        pressure: c.pressure_msl,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation ?? 0,
        condition: wmoCode(c.weather_code),
      };
    },
  },
  {
    id: 'met-norway',
    name: 'MET Norway',
    countries: ['*'],
    weight: 0.8,
    fetch: async (lat, lon) => {
      const d = await fetchJson(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, { 'User-Agent': 'PainelMeteorologicoGlobal/1.0' });
      const ts = d.properties?.timeseries?.[0];
      if (!ts) throw new Error('Sem dados');
      const c = ts.data.instant.details;
      return {
        temp: c.air_temperature,
        wind: c.wind_speed,
        direction: c.wind_from_direction,
        pressure: c.air_pressure_at_sea_level,
        humidity: c.relative_humidity,
        precipitation: ts.data.next_1_hours?.details?.precipitation_amount ?? null,
        condition: 'unknown',
      };
    },
  },
  {
    id: 'wttr-in',
    name: 'wttr.in',
    countries: ['*'],
    weight: 0.9,
    fetch: async (lat, lon) => {
      const d = await fetchJson(`https://wttr.in/${lat},${lon}?format=j1`, { 'User-Agent': 'curl/8.0' });
      const c = d.current_condition?.[0];
      if (!c) throw new Error('Sem dados');
      return {
        temp: parseFloat(c.temp_C),
        wind: parseFloat(c.windspeedKmph) || 0,
        direction: compassToDeg(c.winddir16Point),
        pressure: parseFloat(c.pressure) || null,
        humidity: parseFloat(c.humidity) || null,
        precipitation: parseFloat(c.precipMM) || 0,
        condition: c.weatherDesc?.[0]?.value || 'unknown',
      };
    },
  },
];

function getApisForCountry() { return apis; }

module.exports = { getApisForCountry };
