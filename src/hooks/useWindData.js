import { useState, useEffect, useRef } from "react";
import pLimit from "p-limit";

const TILE_SIZE = 10; // 10x10° pseudo-tile
const FIXED_BATCH_SIZE = 24;
const NUM_BATCHES = 27;
const FIRST_DELAY = 60 * 1000; // 1 min
const REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in ms
const limit = pLimit(10); // max 10 requests at a time

// Convert tile center into a bounding box
function makeTileBounds(lat, lon) {
  return {
    north: Math.min(lat + TILE_SIZE / 2, 90),
    south: Math.max(lat - TILE_SIZE / 2, -90),
    west: Math.max(lon - TILE_SIZE / 2, -180),
    east: Math.min(lon + TILE_SIZE / 2, 180)
  };
}

// Fetch wind data for a single tile center
async function fetchWindPoint(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,winddirection_10m&timezone=UTC`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API fetch failed: ${res.status}`);
    const json = await res.json();
    const speeds = json.hourly?.windspeed_10m || [];
    const dirs = json.hourly?.winddirection_10m || [];

    if (!speeds.length || !dirs.length) {
        console.warn(`No wind arrays for tile ${lat},${lon}`);
        return null; // skip this tile entirely
    }
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / (speeds.length || 1);
    // average direction: direct mean can be wrong near wrap-around; do vector mean
    let x = 0, y = 0;
    for (let d of dirs) {
      const rad = (d % 360) * Math.PI / 180;
      x += Math.cos(rad);
      y += Math.sin(rad);
    }
    const avgDir = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return { tile: makeTileBounds(lat, lon), speed: avgSpeed, direction: avgDir };
  } catch (err) {
    console.error(`Wind fetch error for (${lat},${lon}):`, err);
    return null;
  }
}

// Generate all 10x10 tile centers globally
function generateGlobalTiles() {
  const tiles = [];
  for (let lat = -90 + TILE_SIZE / 2; lat < 90; lat += TILE_SIZE) {
    for (let lon = -180 + TILE_SIZE / 2; lon < 180; lon += TILE_SIZE) {
      tiles.push({ lat, lon });
    }
  }
  return tiles;
}

// Helper to produce consistent tile keys
function tileKey(lat, lon) {
  return `${lat.toFixed(6)}_${lon.toFixed(6)}`;
}

export default function useWindData() {
  const [windData, setWindData] = useState([]); // [{ tile, speed }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tilesRef = useRef(generateGlobalTiles()); // all tiles
  const fetchedTilesRef = useRef(new Set()); // track which tiles already fetched
  const batchCountRef = useRef(0);


  useEffect(() => {
    let mounted = true;

    async function fetchBatch() {
    if (!mounted) return;
    setLoading(true);
    setError(null);

    try {
        const allRemaining = tilesRef.current.filter(
            t => !fetchedTilesRef.current.has(tileKey(t.lat, t.lon))
        );

        if (!allRemaining.length) {
            setLoading(false);
            return;
        }

        const batchTiles = allRemaining.slice(0, FIXED_BATCH_SIZE);

        // 1) FIRST PASS — SLOW SUBBATCHES
        const subbatchResults = [];
        for (let i = 0; i < batchTiles.length; i += 24) {
            const subBatch = batchTiles.slice(i, i + 24);

            const results = await Promise.all(
                subBatch.map(t => limit(() => fetchWindPoint(t.lat, t.lon)))
            );

            // Store only successful results
            subbatchResults.push(...results.map((r, i) => ({
                key: tileKey(subBatch[i].lat, subBatch[i].lon),
                result: r
            })));

            await new Promise(r => setTimeout(r, 5000)); // 5s delay
        }

        // 2) SECOND PASS — FAST BURST for tiles that failed
        const missingTiles = batchTiles.filter(t => {
        const key = tileKey(t.lat, t.lon);
        return !subbatchResults.some(r => r.key === key && r.result);
        });

        const burstResults = await Promise.all(
        missingTiles.map(t => limit(() => fetchWindPoint(t.lat, t.lon)))
        );

        const finalResults = [...subbatchResults];

        burstResults.forEach((res, i) => {
        finalResults.push({
            key: tileKey(missingTiles[i].lat, missingTiles[i].lon),
            result: res
        });
        });

        // FINAL WRITE (only once)
        const valid = finalResults
        .filter(r => r.result)
        .map(r => r.result);

        if (mounted && valid.length) {
        setWindData(prev => [...prev, ...valid]);

        finalResults.forEach(r => {
            if (r.result) fetchedTilesRef.current.add(r.key);
        });
        }

        batchCountRef.current += 1;

    } catch (err) {
        if (mounted) setError(err.message);
    } finally {
        setLoading(false);

        const remaining = tilesRef.current.length - fetchedTilesRef.current.size;
        if (remaining > 0) {
            const delay =
                batchCountRef.current < NUM_BATCHES
                ? FIRST_DELAY
                : REFRESH_INTERVAL;

            if (batchCountRef.current >= NUM_BATCHES)
                batchCountRef.current = 0;

            setTimeout(fetchBatch, delay);
        }
        else {
            // Auto-refresh every 2 hours
            setTimeout(() => {
                fetchedTilesRef.current.clear();
                batchCountRef.current = 0;
                
                setWindData([]); // clear existing data
                fetchBatch();
            }, REFRESH_INTERVAL);
        }
    }
}
    fetchBatch();

    return () => { mounted = false; };
  }, []);

  return { windData, loading, error };
}
