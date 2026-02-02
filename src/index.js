import * as Cesium from "cesium";

let viewer;

const TILE_JSON_URL =
  "http://localhost:8080/api/map-viewer/topo_2026-01-10.tif/collections/default/terrain-rgb/tile.json";

const ZOOM = 14;

const MIN_VALID_HEIGHT = -100;
const MAX_VALID_HEIGHT = 3000;

async function fetchTileJSONInfo(url) {
  const res = await fetch(url);
  const json = await res.json();

  const [minLon, minLat, maxLon, maxLat] = json.bounds;
  const tileTemplate = json.tiles[0];
  const origin = new URL(url).origin;

  const tileURL = tileTemplate.startsWith("http") ? tileTemplate : origin + tileTemplate;

  return {
    bbox: { minLon, minLat, maxLon, maxLat },
    tileURL,
  };
}

function lonLatToTileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = Cesium.Math.toRadians(lat);
  const y = Math.floor(
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
      n
  );
  return { x, y };
}

function pixelToLonLat(z, tileX, tileY, px, py) {
  const n = 2 ** z;

  const lon =
    ((tileX * 256 + px) / (256 * n)) * 360 - 180;

  const latRad = Math.atan(
    Math.sinh(
      Math.PI * (1 - ((tileY * 256 + py) / (256 * n)) * 2)
    )
  );

  return {
    lon,
    lat: Cesium.Math.toDegrees(latRad),
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function initCesium() {
  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
}
function decodeTerrainRGB(r, g, b) {
  if (r === 0 && g === 0 && b === 0) return NaN;
  return (r * 256 * 256 + g * 256 + b) * 0.1 - 10000;
}

async function loadTerrainPixels(bbox, tileURLTemplate) {
  const minTile = lonLatToTileXY(bbox.minLon, bbox.maxLat, ZOOM);
  const maxTile = lonLatToTileXY(bbox.maxLon, bbox.minLat, ZOOM);

  const points = [];

  for (let x = minTile.x; x <= maxTile.x; x++) {
    for (let y = minTile.y; y <= maxTile.y; y++) {
      const url = tileURLTemplate
        .replace("{z}", ZOOM)
        .replace("{x}", x)
        .replace("{y}", y);

      const img = await loadImage(url);

      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, 256, 256).data;

      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const i = (py * 256 + px) * 4;
          const height = decodeTerrainRGB(
            data[i],
            data[i + 1],
            data[i + 2]
          );

          if (
            isNaN(height) ||
            height < MIN_VALID_HEIGHT ||
            height > MAX_VALID_HEIGHT
          )
            continue;

          const { lon, lat } = pixelToLonLat(ZOOM, x, y, px, py);

          points.push({ lon, lat, height });
        }
      }
    }
  }

  return points;
}

function heightToColor(height) {
  if (height < 0.1)
    return Cesium.Color.BLUE.withAlpha(0.0); 
  if (height < 20)
    return Cesium.Color.CYAN.withAlpha(0.8); 
  if (height < 40)
    return Cesium.Color.YELLOW.withAlpha(0.8);
  if (height < 60)
    return Cesium.Color.ORANGE.withAlpha(0.8);
  return Cesium.Color.RED.withAlpha(0.8);
}


function renderPolyline(viewer, points) {
  const strips = new Map();

  for (const p of points) {
    const key = p.lon.toFixed(6);
    if (!strips.has(key)) strips.set(key, []);
    strips.get(key).push(p);
  }

  for (const strip of strips.values()) {
    strip.sort((a, b) => a.lat - b.lat);

    if (strip.length < 2) continue;

    const buckets = new Map();

    for (let i = 0; i < strip.length - 1; i++) {
      const p1 = strip[i];
      const p2 = strip[i + 1];

      const avgH = (p1.height + p2.height) / 2;
      const color = heightToColor(avgH);

      const key = color.toCssColorString();
      if (!buckets.has(key))
        buckets.set(key, { color, positions: [] });

      buckets.get(key).positions.push(
        Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.height),
        Cesium.Cartesian3.fromDegrees(p2.lon, p2.lat, p2.height)
      );
    }

    for (const { color, positions } of buckets.values()) {
      if (positions.length < 2) continue;

      viewer.entities.add({
        polyline: {
          positions,
          width: 2,
          material: color,
        },
      });
    }
  }
}

async function main() {
  initCesium();

  const { bbox, tileURL } = await fetchTileJSONInfo(TILE_JSON_URL);

  const centerLon = (bbox.minLon + bbox.maxLon) / 2;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 1000),
    duration: 0,
  });

  const points = await loadTerrainPixels(bbox, tileURL);

  renderPolyline(viewer, points);
}

main();