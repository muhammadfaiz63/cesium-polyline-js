import * as Cesium from "cesium";

let viewer;

function testPolylineContourHill(viewer) {
  const centerLon = 103.825;
  const centerLat = -3.785;

  const maxHeight = 1000;
  const heightStep = 40;
  const layerOffset = 6;

  let layerIndex = 0;

  for (let h = 0; h <= maxHeight; h += heightStep) {
    const ring = [];

    for (let angle = 0; angle <= Math.PI * 2; angle += Math.PI / 120) {
      const radius = Math.sqrt(
        (1 - h / maxHeight) * 6000000
      );

      const jitter = 1 + 0.18 * Math.sin(angle * 5 + h / 120);

      const dx = Math.cos(angle) * radius * jitter;
      const dy = Math.sin(angle) * radius * jitter;

      const lon = centerLon + dx / 100000;
      const lat = centerLat + dy / 100000;

      const baseHill =
        1000 * Math.exp(-(dx * dx + dy * dy) / 6000000) +
        120 * Math.sin(dx / 700) +
        90 * Math.cos(dy / 500);

      if (Math.abs(baseHill - h) < heightStep) {
        ring.push(
          Cesium.Cartesian3.fromDegrees(
            lon,
            lat,
            baseHill + layerIndex * layerOffset
          )
        );
      }
    }

    if (ring.length > 6) {
      ring.push(ring[0]);

      const t = h / maxHeight;
      const color = Cesium.Color.fromHsl(
        0.6 - t * 0.5,
        1.0,
        0.45,
        0.95
      );

      viewer.entities.add({
        polyline: {
          positions: ring,
          width: 2,
          clampToGround: false,
          material: color,
        },
      });

      layerIndex++;
    }
  }

  console.log("CONTOUR HILL FIXED");
}


async function startCesium() {
  if (viewer) return;

  const container = document.getElementById("cesiumContainer");
  if (!container) return;

  viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.verticalExaggeration = 4.0;
  viewer.scene.screenSpaceCameraController.enableTilt = true;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      103.825,
      -3.785,
      240
    ),
    orientation: {
      pitch: Cesium.Math.toRadians(-80),
      heading: Cesium.Math.toRadians(35),
    },
    duration: 0,
  });
  
  testPolylineContourHill(viewer);
}

startCesium();
