import * as Cesium from "cesium";

let viewer;

const TERRAIN_RGB_BASE =
  "http://localhost:8080/api/map-viewer/topo_2026-01-10.tif/collections/default/terrain-rgb/tiles";

const ZOOM = 14;

const STRIP_SPACING_METER = 5;
const DEG_PER_METER = 1 / 111000;
const STEP = STRIP_SPACING_METER * DEG_PER_METER;

const MIN_HEIGHT_DIFF = 2;
const MIN_VALID_HEIGHT = -100;
const MAX_VALID_HEIGHT = 3000;
const MIN_VALID_RATIO = 0.7;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const xt = n * ((lon + 180) / 360);
  const latRad = Cesium.Math.toRadians(lat);
  const yt =
    n *
    (1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) /
        Math.PI) /
    2;

  return {
    x: Math.floor(xt),
    y: Math.floor(yt),
    px: Math.floor((xt % 1) * 256),
    py: Math.floor((yt % 1) * 256),
  };
}

const tileCache = new Map();

async function sampleTerrainRGB(lon, lat) {
  const tile = lonLatToTile(lon, lat, ZOOM);
  const key = `${ZOOM}/${tile.x}/${tile.y}`;

  let canvas;
  if (tileCache.has(key)) {
    canvas = tileCache.get(key);
  } else {
    const url = `${TERRAIN_RGB_BASE}/${ZOOM}/${tile.x}/${tile.y}`;
    const img = await loadImage(url);

    canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;

    canvas.getContext("2d").drawImage(img, 0, 0);
    tileCache.set(key, canvas);
  }

  const ctx = canvas.getContext("2d");
  const [r, g, b] = ctx.getImageData(tile.px, tile.py, 1, 1).data;

  return (r * 256 * 256 + g * 256 + b) * 0.1 - 10000;
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

async function getTopoFromTerrainRGB() {
  const points = [];

  const bbox = {
    minLon: 103.80,
    maxLon: 103.85,
    minLat: -3.81,
    maxLat: -3.76,
  };

  for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += STEP) {
    for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += STEP) {
      const height = await sampleTerrainRGB(lon, lat);

      if (
        !isNaN(height) &&
        height > MIN_VALID_HEIGHT &&
        height < MAX_VALID_HEIGHT
      ) {
        points.push({ lon, lat, height });
      }
    }
  }

  return points;
}

function smoothHeights(points, window = 4) {
  return points.map((p, i) => {
    let sum = 0;
    let count = 0;

    for (let j = i - window; j <= i + window; j++) {
      if (points[j]) {
        sum += points[j].height;
        count++;
      }
    }

    return { ...p, height: sum / count };
  });
}

function heightToColorIndex(height, minH, maxH) {
  const t = Cesium.Math.clamp((height - minH) / (maxH - minH), 0, 1);

  if (t < 0.25) return 0;
  if (t < 0.5)  return 1;
  if (t < 0.75) return 2;
  return 3;
}

const COLOR_BUCKETS = [
  Cesium.Color.BLUE.withAlpha(0.9),
  Cesium.Color.CYAN.withAlpha(0.9),
  Cesium.Color.YELLOW.withAlpha(0.9),
  Cesium.Color.RED.withAlpha(0.9),
];


function renderPolylineStack(viewer, dataTopo) {
  const strips = new Map();

  for (const p of dataTopo) {
    const key = Math.round(p.lon / STEP);
    if (!strips.has(key)) strips.set(key, []);
    strips.get(key).push(p);
  }

  for (const points of strips.values()) {
    if (points.length < 3) continue;

    const validPoints = points.filter(
      p => p.height > MIN_VALID_HEIGHT && p.height < MAX_VALID_HEIGHT
    );

    if (validPoints.length / points.length < MIN_VALID_RATIO) continue;

    validPoints.sort((a, b) => a.lat - b.lat);

    const smoothed = smoothHeights(validPoints);

    const heights = smoothed.map(p => p.height);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);

    if (maxH - minH < MIN_HEIGHT_DIFF) continue;

    // 4 bucket warna
    const bucketPositions = [[], [], [], []];

    for (let i = 0; i < smoothed.length - 1; i++) {
      const p1 = smoothed[i];
      const p2 = smoothed[i + 1];

      const avgH = (p1.height + p2.height) / 2;
      const bucket = heightToColorIndex(avgH, minH, maxH);

      bucketPositions[bucket].push(
        Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.height),
        Cesium.Cartesian3.fromDegrees(p2.lon, p2.lat, p2.height)
      );
    }

    // maksimal 4 entity per strip
    for (let i = 0; i < bucketPositions.length; i++) {
      if (bucketPositions[i].length < 2) continue;

      viewer.entities.add({
        polyline: {
          positions: bucketPositions[i],
          width: 2,
          clampToGround: false,
          material: COLOR_BUCKETS[i],
        },
      });
    }
  }
}


async function main() {
  initCesium();

  const dataTopo = await getTopoFromTerrainRGB();

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(103.825, -3.785, 800),
    duration: 0,
  });

  renderPolylineStack(viewer, dataTopo);
}

main();
