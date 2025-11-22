import React, { useState } from 'react';
import MapView from './components/MapView';
import useBalloonData from './hooks/useBalloonData';
import useWindData from './hooks/useWindData';

export default function App() {
  const { data, reload, loading, error } = useBalloonData();
  const wind = useWindData();
  const [showPaths, setShowPaths] = useState(true);
  const [showBalloons, setShowBalloons] = useState(true);
  const [showWind, setShowWind] = useState(true);



  return (
    <div className="app">
      <header>
        <h1>WindBorne Constellation — Live 24H Explorer</h1>
        <p>Combines live WindBorne balloon data with live wind data from Open-Meteo.</p>
        <div className="controls">
          <button onClick={reload}>Reload Data</button>
          <label>
            <input
              type="checkbox"
              checked={showPaths}
              onChange={e => setShowPaths(e.target.checked)}
            /> Show flight paths
          </label>
          <label>
            <input
              type="checkbox"
              checked={showBalloons}
              onChange={e => setShowBalloons(e.target.checked)}
            /> Show balloons
          </label>
          <label>
            <input type="checkbox" checked={showWind} onChange={e => setShowWind(e.target.checked)} />
            Show wind arrows
        </label>
          <span className="status">
            {loading ? 'Loading...' : error ? 'Error fetching data' : `Loaded ${Object.keys(data).length} balloons`}
          </span>
        </div>
      </header>


      <main>
        <div style={{ display: 'flex', flexDirection: 'column', height: '70vh', width: '100%' }}>
            <div style={{ flex: 1, width: '100%', height: '70vh' }}>
              <MapView histories={data} wind={wind} showPaths={showPaths} showBalloons={showBalloons} />
            </div>
        </div>
      </main>

      <footer>
        <p>
          External dataset: <b>Open-Meteo</b> (free hourly global forecast) — provides windspeed/direction for comparison with in-situ balloon data.
        </p>
      </footer>
    </div>
  );
}
