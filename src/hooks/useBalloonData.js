import { useState, useEffect } from 'react';

const BASE = 'https://windborne-jet.vercel.app/api/treasure/';

// dev purposes -- avoid CORS error
// const BASE = 'http://localhost:3001/api/treasure/';

const HOURS = [...Array(24).keys()].map(n => String(n).padStart(2, '0') + '.json');

async function robustFetchJSON(url) {
  try {
    const res = await fetch(url);
    const txt = await res.text();
    // Try to parse JSON
    return JSON.parse(txt);
  } catch (err) {
    console.warn('Failed parsing', url, err);
    return null;
  }
}

export default function useBalloonData() {
  const [data, setData] = useState({}); // balloon_id -> [{lat, lon, alt, hour}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = async () => {
    setLoading(true);
    setError(null);

    try {
      const snapshots = [];

      // Fetch each hourly snapshot
      for (const h of HOURS) {
        const snapshot = await robustFetchJSON(BASE + h);
        snapshots.push(snapshot);
      }

      // Merge by array index
      const merged = {};
      snapshots.forEach((snapshot, hour) => {
        if (!snapshot) return; // skip missing/corrupt snapshots

        snapshot.forEach(([lat, lon, alt], idx) => {
        if (lon == null || lat == null || alt == null) return;
        const id = `balloon_${idx}`;
        merged[id] = merged[id] || [];
        merged[id].push({ lat, lon, alt, hour, ts: new Date(Date.now() - hour * 3600 * 1000) });
        });

      });
      


      setData(merged);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    reload();
  }, []);

  return { data, reload, loading, error };
}