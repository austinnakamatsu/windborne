import React, { useState } from 'react';
import MapView from './components/MapView';
import useBalloonData from './hooks/useBalloonData';

export default function App() {
  const { data, reload, loading, error } = useBalloonData();
  const [showPaths, setShowPaths] = useState(true);

  return (
    <div className="app">
      <header>
        <h1>WindBorne Constellation — Live 24H Explorer</h1>
        <p>Combines live WindBorne balloon data with TBD.</p>
        <div className="controls">
          <button onClick={reload}>Reload Data</button>
          <label>
            <input
              type="checkbox"
              checked={showPaths}
              onChange={e => setShowPaths(e.target.checked)}
            /> Show flight paths
          </label>
          <span className="status">
            {loading ? 'Loading...' : error ? 'Error fetching data' : `Loaded ${Object.keys(data).length} balloons`}
          </span>
        </div>
      </header>


      <main className="map-area">
        <div className="map-panel">
            <MapView histories={data} showPaths={showPaths} />
        </div>
      </main>

      <footer>
        <p>
          External dataset: TBD -- thinking of Open-Meteo to show wind speeds
        </p>
      </footer>
    </div>
  );
}