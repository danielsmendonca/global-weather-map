const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'weather_monitor.db');
let db = null;

function wrap(raw) {
  return {
    run(sql, params = []) { raw.run(sql, params); saveDb(); },
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get(params) {
          stmt.bind(params);
          if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
          stmt.free(); return undefined;
        },
        all(params) {
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free(); return rows;
        },
        free() { stmt.free(); },
      };
    },
    export() { return raw.export(); },
    close() { saveDb(); raw.close(); },
  };
}

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  db = wrap(new SQL.Database(buf));
  db.run(`CREATE TABLE IF NOT EXISTS weather_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    timestamp TEXT NOT NULL,
    temperature REAL NOT NULL,
    wind_speed REAL NOT NULL,
    wind_direction REAL,
    pressure REAL,
    humidity REAL,
    precipitation REAL,
    condition TEXT,
    country TEXT,
    city_name TEXT,
    sources TEXT NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lat_lon_time ON weather_history (lat, lon, timestamp DESC)`);
  db.run(`CREATE TABLE IF NOT EXISTS harvester_status (
    city_name TEXT PRIMARY KEY,
    country TEXT,
    lat REAL,
    lon REAL,
    last_update TEXT,
    temperature REAL,
    wind_speed REAL,
    wind_direction REAL,
    pressure REAL,
    humidity REAL,
    precipitation REAL,
    condition TEXT,
    region TEXT
  )`);
  try { db.run(`ALTER TABLE harvester_status ADD COLUMN region TEXT`); } catch {}
  return db;
}

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

module.exports = { getDb, saveDb };
