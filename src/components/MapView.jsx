import { useRef, useState, useMemo, useEffect } from "react";
import Map, { Source, Layer, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import useWindData from "../hooks/useWindData";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

const COLORS = [
  '#e63946','#457b9d','#2a9d8f','#f4a261',
  '#8d99ae','#ffb703','#219ebc','#d62828',
  '#7209b7','#06ffa5','#ff006e','#8338ec'
];

// compute tile center
function tileCenter(tile) {
  return {
    lat: (tile.north + tile.south) / 2,
    lon: (tile.west + tile.east) / 2
  };
}

// Create arrow
function makeArrowShaft(centerLat, centerLon, directionDeg, lengthDeg) {
    const rad = (directionDeg % 360) * Math.PI / 180;
    const dLat = Math.cos(rad) * lengthDeg;
    const dLon = Math.sin(rad) * lengthDeg;
    return [
        [centerLon, centerLat],
        [centerLon + dLon, centerLat + dLat]
    ];
}

// point arrow tip in right direction
function makeArrowHead(tipLon, tipLat, directionDeg, headLenDeg = 0.05, headAngleDeg = 25) {
    const rad = (directionDeg % 360) * Math.PI / 180;
    const angleA = rad + (headAngleDeg * Math.PI / 180);
    const angleB = rad - (headAngleDeg * Math.PI / 180);
    const ax = tipLon - Math.sin(angleA) * headLenDeg;
    const ay = tipLat - Math.cos(angleA) * headLenDeg;
    const bx = tipLon - Math.sin(angleB) * headLenDeg;
    const by = tipLat - Math.cos(angleB) * headLenDeg;

    return [
        [[ax, ay], [tipLon, tipLat]],
        [[bx, by], [tipLon, tipLat]]
    ];
}

// color coordinate speeds
function speedToColor(speed) {
    const MIN_SPEED = 0;
    const MAX_SPEED = 40;
    const t = Math.min(Math.max((speed - MIN_SPEED) / (MAX_SPEED- MIN_SPEED), 0), 1);
    const r = Math.round(255 * t);
    const g = 0;
    const b = Math.round(255 * (1 - t));
    return `rgba(${r},${g},${b},0.85)`;
}

// handle the line error
function normalizeAcrossAntimeridian(points) {
    if (points.length < 2) return points;
    const adjusted = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = adjusted[i - 1], curr = { ...points[i] };
        const delta = curr.lon - prev.lon;
        if (delta > 180) curr.lon -= 360;
        if (delta < -180) curr.lon += 360;
        adjusted.push(curr);
    }
    return adjusted;
}

export default function MapView({ histories, showPaths = true, showBalloons = true, showWind = true}) {
    const mapRef = useRef(null);
    const [selected, setSelected] = useState(null);
    const { windData } = useWindData();
    const [zoom, setZoom] = useState(3);

    // scale arrows according to zoom factor
    function handleMove(e) {
        setZoom(e.viewState.zoom);
    }

    // Balloon markers
    const balloonMarkers = useMemo(() => {
    return Object.entries(histories || {}).map(([id, samples], idx) => {
        if (!samples?.length) return null;
        const valid = samples.filter(s => s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180);
        if (!valid.length) return null;
        const last = valid[valid.length - 1];
        return { ...last, id, color: COLORS[idx % COLORS.length] };
    }).filter(Boolean);
    }, [histories]);

    // Balloon trails
    const trailsGeoJSON = useMemo(() => ({
    type: "FeatureCollection",
    features: Object.entries(histories || {}).map(([id, samples], idx) => {
        const valid = samples.filter(s => s.lat >= -90 && s.lat <= 90 && s.lon >= -180 && s.lon <= 180);
        if (valid.length < 2) return null;
        const adjusted = normalizeAcrossAntimeridian(valid);
        return {
        type: "Feature",
        properties: { id, color: COLORS[idx % COLORS.length] },
        geometry: { type: "LineString", coordinates: adjusted.map(s => [s.lon, s.lat]) }
        };
    }).filter(Boolean)
    }), [histories]);

    // Balloon points
    const markersGeoJSON = useMemo(() => ({
    type: "FeatureCollection",
    features: balloonMarkers.map(m => ({
        type: "Feature",
        properties: { id: m.id, color: m.color, alt: m.alt },
        geometry: { type: "Point", coordinates: [m.lon, m.lat] }
    }))
    }), [balloonMarkers]);

    // Need to work on css here
    useEffect(() => {
    if (!mapRef.current) return;
        const map = mapRef.current.getMap();
        const handleZoom = () => setZoom(map.getZoom());
        map.on("zoom", handleZoom);
        return () => map.off("zoom", handleZoom);
    }, [mapRef]);

    const { arrowsShafts, arrowsHeads } = useMemo(() => {
    if (!windData?.length) return { arrowsShafts: null, arrowsHeads: null };

    const zoomFactor = 5;
    const shafts = [];
    const heads = [];

    for (const w of windData) {
        const { lat, lon } = tileCenter(w.tile);
        const speed = w.speed || 0;
        const direction = w.direction || 0;

        // Speed-based base length
        const minLen = 0.08;
        const maxLen = 1.0;
        const length = minLen + Math.min(speed / 50, 1) * (maxLen - minLen);

        // ZOOM-SCALED
        const scaledLength = length / Math.pow(2, zoomFactor - zoom);

        const shaft = makeArrowShaft(lat, lon, direction, scaledLength);
        shafts.push({
        type: "Feature",
        properties: { speed, color: speedToColor(speed) },
        geometry: { type: "LineString", coordinates: shaft }
        });

        const tip = shaft[1];
        const headSegs = makeArrowHead(tip[0], tip[1], direction, scaledLength * 0.7, 22);
        for (const seg of headSegs) {
        heads.push({
            type: "Feature",
            properties: { speed, color: speedToColor(speed) },
            geometry: { type: "LineString", coordinates: seg }
        });
        }
    }

    return {
        arrowsShafts: { type: "FeatureCollection", features: shafts },
        arrowsHeads: { type: "FeatureCollection", features: heads }
    };
    }, [windData, zoom]);

    useEffect(() => {
    let raf = null;
    let mounted = true;
    const mapbox = () => mapRef.current && mapRef.current.getMap && mapRef.current.getMap();

    // Precompute arrow shafts and heads as array of objects for animation
    const animatedArrows = windData.map(w => {
        const { lat: centerLat, lon: centerLon } = tileCenter(w.tile);
        const s = Math.max(0, w.speed || 0);

        // Length scaling
        const minLenDeg = 0.08;
        const maxLenDeg = 1.5;
        const maxSpeed = 40;
        const frac = Math.min(1, s / maxSpeed);
        const lengthDeg = minLenDeg + frac * (maxLenDeg - minLenDeg);

        const shaftCoords = makeArrowShaft(centerLat, centerLon, w.direction || 0, lengthDeg);
        const headSegs = makeArrowHead(shaftCoords[1][0], shaftCoords[1][1], w.direction || 0, lengthDeg * 0.7, 22);

        return {
        shaftStart: shaftCoords[0],
        shaftEnd: shaftCoords[1],
        headSegments: headSegs,
        direction: w.direction || 0,
        speed: s,
        progress: Math.random(), // random start for staggered animation
        lengthDeg
        };
    });

    function tick() {
        if (!mounted) return;
        const shafts = [];
        const heads = [];

        for (const a of animatedArrows) {
            // move along vector proportional to speed
            const speedFactor = 0.0005; // tweak this for faster/slower motion
            a.progress += (a.speed * speedFactor);

            // reset after 10° of travel
            if (a.progress >= 1) a.progress = 0;

            // current position along shaft
            const curLat = a.shaftStart[1] + (a.shaftEnd[1] - a.shaftStart[1]) * a.progress;
            const curLon = a.shaftStart[0] + (a.shaftEnd[0] - a.shaftStart[0]) * a.progress;

            // shaft line (short segment from current position along direction)
            const shaftCoords = makeArrowShaft(curLat, curLon, a.direction, a.lengthDeg);
            shafts.push({
                type: "Feature",
                properties: { speed: a.speed, color: speedToColor(a.speed) },
                geometry: { type: "LineString", coordinates: shaftCoords }
            });

            // arrowhead segments
            const headSegs = makeArrowHead(shaftCoords[1][0], shaftCoords[1][1], a.direction, a.lengthDeg * 0.7, 22);
            for (const seg of headSegs) {
                heads.push({
                type: "Feature",
                properties: { speed: a.speed, color: speedToColor(a.speed) },
                geometry: { type: "LineString", coordinates: seg }
                });
            }
        }

        // update Mapbox sources
        const map = mapbox();
        if (map) {
            if (map.getSource("wind-shafts")) map.getSource("wind-shafts").setData({ type: "FeatureCollection", features: shafts });
            if (map.getSource("wind-heads-src")) map.getSource("wind-heads-src").setData({ type: "FeatureCollection", features: heads });
        }

        raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
        mounted = false;
        if (raf) cancelAnimationFrame(raf);
    };
    }, [windData]);

    // for dev purposes
    // if (!MAPBOX_TOKEN) return <div><h3>Missing Mapbox token</h3></div>;

    return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        initialViewState={{ longitude: windData?.longitude || 0, latitude: windData?.latitude || 0, zoom: 3 }}
        style={{ width: "100%", height: "100%" }}
        maxBounds={[[-180, -90], [180, 90]]}
        interactiveLayerIds={["markers-layer", "wind-layer"]}
        onClick={e => {
            const features = e.features;
            if (features?.length) {
            const f = features[0];
            setSelected({ id: f.properties.id || "Wind", lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], alt: f.properties.alt || f.properties.windspeed });
            }
        }}
        onMove={handleMove}
        >
        {showPaths && <Source id="trails" type="geojson" data={trailsGeoJSON}>
            <Layer id="trails-layer" type="line" paint={{ "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.8 }} />
        </Source>}

        {showBalloons && <Source id="markers" type="geojson" data={markersGeoJSON}>
            <Layer id="markers-layer" type="circle" paint={{ "circle-radius": 4, "circle-color": ["get", "color"], "circle-stroke-width": 1, "circle-stroke-color": "#fff" }} />
        </Source>}

        {showWind && arrowsShafts && <Source id="wind-shafts" type="geojson" data={arrowsShafts}>
            <Layer
            id="wind-lines"
            type="line"
            layout={{
                "line-cap": "round",
                "line-join": "round"
            }}
            paint={{
                "line-color": ["get", "color"],
                "line-width": 4.5,
                "line-opacity": 0.95
            }}
            />
        </Source>}

        {showWind && arrowsHeads && <Source id="wind-heads-src" type="geojson" data={arrowsHeads}>
            <Layer
            id="wind-heads"
            type="line"
            layout={{
                "line-cap": "round",
                "line-join": "round"
            }}
            paint={{
                "line-color": ["get", "color"],
                "line-width": 5.0,
                "line-opacity": 0.95
            }}
            />
        </Source>} 

        {selected && <Popup longitude={selected.lon} latitude={selected.lat} anchor="bottom" onClose={() => setSelected(null)} closeOnClick={false}>
            <div style={{
                padding: '8px 12px',
                background: '#333',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.9)',
                textAlign: 'center',
            }}>
            <strong>{selected.id}</strong><br />
            Lat: {selected.lat.toFixed(2)}°<br />
            Lon: {selected.lon.toFixed(2)}°<br />
            {selected.alt != null && <>AGL: {selected.alt.toFixed(2)} km</>}
            </div>
        </Popup>}
        </Map>
    </div>
    );
}