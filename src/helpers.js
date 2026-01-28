import * as Cesium from "cesium";

export async function fetchTerrainTile(url) {
  console.log("url",url)
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");
  console.log("ctx",ctx)
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, 256, 256).data;
  const grid = new Float32Array(256 * 256);

  for (let i = 0; i < grid.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    grid[i] = r * 256 * 256 + g * 256 + b - 10000;
  }

  console.log("grid",grid)

  return grid;
}


export function buildContoursFromGrid({
  grid,
  width,
  height,
  minLon,
  maxLon,
  minLat,
  maxLat,
  interval,
}) {
  const contours = [];
  const maxH = Math.max(...grid);

  for (let h = 0; h <= maxH; h += interval) {
    const positions = [];

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = y * width + x;
        if (Math.abs(grid[idx] - h) < interval / 2) {
          const lon = minLon + (x / width) * (maxLon - minLon);
          const lat = minLat + (y / height) * (maxLat - minLat);
          positions.push({ lon, lat, h });
        }
      }
    }

    if (positions.length > 6) {
      contours.push({ h, positions });
    }
  }

  return contours;
}


export function renderContourPolylines(viewer, contours) {
  const layerOffset = 8;
  let layerIndex = 0;

  for (const contour of contours) {
    const positions = contour.positions.map(p =>
      Cesium.Cartesian3.fromDegrees(
        p.lon,
        p.lat,
        p.h + layerIndex * layerOffset
      )
    );

    positions.push(positions[0]); // close loop

    const t = contour.h / contours[contours.length - 1].h;
    const color = Cesium.Color.fromHsl(
      0.65 - t * 0.6,
      1.0,
      0.5,
      0.95
    );

    viewer.entities.add({
      polyline: {
        positions,
        width: 2,
        clampToGround: false,
        material: color,
      },
    });

    layerIndex++;
  }
}

