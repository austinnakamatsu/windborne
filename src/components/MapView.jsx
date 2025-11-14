import { useMemo, useRef, useEffect, useState } from "react";
import Map, { Source, Layer, Popup } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Mapbox access token - set VITE_MAPBOX_TOKEN in your .env file
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// Balloon colors
const COLORS = [
  '#e63946', '#457b9d', '#2a9d8f', '#f4a261',
  '#8d99ae', '#ffb703', '#219ebc', '#d62828',
  '#7209b7', '#06ffa5', '#ff006e', '#8338ec'
];

// helper function for trail glitch
function normalizeAcrossAntimeridian(points) {
  if (points.length < 2) return points;

  let adjusted = [points[0]];
  for (let i = 1; i < points.length; i++) {
    let prev = adjusted[i - 1];
    let curr = { ...points[i] };

    let delta = curr.lon - prev.lon;

    if (delta > 180) curr.lon -= 360;
    if (delta < -180) curr.lon += 360;

    adjusted.push(curr);
  }

  return adjusted;
}

export default function BalloonMap({ histories }) {
  const mapRef = useRef(null);
  const [selected, setSelected] = useState(null);

  // Last positions of balloons
  const balloonMarkers = useMemo(() => {
    return Object.entries(histories).map(([id, samples], idx) => {
      if (!samples?.length) return null;
      const valid = samples.filter(s => s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180);
      if (!valid.length) return null;
      const last = valid[valid.length - 1];
      return { id, ...last, color: COLORS[idx % COLORS.length] };
    }).filter(Boolean);
  }, [histories]);

  // Trails as GeoJSON
  const trailsGeoJSON = useMemo(() => ({
    type: "FeatureCollection",
    features: Object.entries(histories).map(([id, samples], idx) => {
      const valid = samples.filter(s => s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180);
      if (valid.length < 2) return null;

      // ensure trails don't glitch
      const adjusted = normalizeAcrossAntimeridian(valid);

      return {
        type: "Feature",
        properties: { id, color: COLORS[idx % COLORS.length] },
        geometry: {
          type: "LineString",
          coordinates: adjusted.map(s => [s.lon, s.lat])
        }
      };
    }).filter(Boolean)
  }), [histories]);

  // Markers as GeoJSON
  const markersGeoJSON = useMemo(() => ({
    type: "FeatureCollection",
    features: balloonMarkers.map(m => ({
      type: "Feature",
      properties: { id: m.id, color: m.color, alt: m.alt },
      geometry: { type: "Point", coordinates: [m.lon, m.lat] }
    }))
  }), [balloonMarkers]);

  // Fit bounds safely after map is loaded
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded() || !balloonMarkers.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    balloonMarkers.forEach(({ lon, lat }) => bounds.extend([lon, lat]));
  }, [balloonMarkers]);

  if (!MAPBOX_TOKEN) {
    return (
      <div>
        <h3>Mapbox token err</h3>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        initialViewState={{ longitude: 0, latitude: 0, zoom: 1.5 }}
        style={{ width: "100%", height: "100%" }}
        maxBounds={[[-180, -90], [180, 90]]}
        interactiveLayerIds={["markers-layer"]}
        onClick={(e) => {
          const features = e.features;
          if (features?.length) {
            const f = features[0];
            setSelected({
              id: f.properties.id,
              lon: f.geometry.coordinates[0],
              lat: f.geometry.coordinates[1],
              alt: f.properties.alt
            });
          }
        }}
      >
        {/* Balloon trails */}
        <Source id="trails" type="geojson" data={trailsGeoJSON}>
          <Layer
            id="trails-layer"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 2,
              "line-opacity": 0.8
            }}
          />
        </Source>

        {/* Balloon markers */}
        <Source id="markers" type="geojson" data={markersGeoJSON}>
          <Layer
            id="markers-layer"
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": ["get", "color"],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff"
            }}
          />
        </Source>

        {/* Popup */}
        {/* TODO: work on css for this it's light on light */}
        {selected && (
          <Popup
            longitude={selected.lon}
            latitude={selected.lat}
            anchor="bottom"
            onClose={() => setSelected(null)}
            closeOnClick={false}
          >
            <div>
              <strong>{selected.id}</strong><br />
              Lat: {selected.lat.toFixed(2)}°<br />
              Lon: {selected.lon.toFixed(2)}°<br />
              Alt: {selected.alt.toFixed(2)} km
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
