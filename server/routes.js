const express = require('express');
const { fetchConsensusData, processAndSave, getHistory } = require('./consensus');
const { getDb } = require('./database');
const { getMapData, getHarvesterStats, runHarvest } = require('./harvester');

const router = express.Router();

router.get('/weather', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat e lon obrigatórios' });
    const data = await fetchConsensusData(lat, lon);
    const saved = await processAndSave(data);
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const hours = parseInt(req.query.hours) || 24;
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat e lon obrigatórios' });
    res.json(await getHistory(lat, lon, hours));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/map-data', async (req, res) => {
  try {
    const data = await getMapData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/db-stats', async (req, res) => {
  try {
    const db = await getDb();
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM weather_history`).get([]);
    const distinct = db.prepare(`SELECT COUNT(DISTINCT lat || ',' || lon) as cnt FROM weather_history`).get([]);
    const latest = db.prepare(`SELECT timestamp FROM weather_history ORDER BY timestamp DESC LIMIT 1`).get([]);
    res.json({
      totalRecords: count?.cnt || 0,
      distinctLocations: distinct?.cnt || 0,
      latestTimestamp: latest?.timestamp || null,
      harvester: getHarvesterStats(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/harvest', async (req, res) => {
  try {
    runHarvest().catch(e => console.error(e));
    res.json({ message: 'Recolha iniciada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
