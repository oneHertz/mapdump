import {
  LatLng,
  Point,
  cornerCalTransform,
  cornerBackTransform,
  getResolution,
} from "./index.js";

const extractSpeed = (route) => {
  const speeds = [];
  let prevSpeed = 1;
  //const data = [];
  for (let i = 0; i < route.length; i++) {
    const minIdx = Math.max(i - 10, 0);
    const maxIdx = Math.min(minIdx + 10, route.length - 1);
    const partial = route.slice(minIdx, maxIdx);
    let d = 0;
    for (let j = 0; j < partial.length - 1; j++) {
      const a = new LatLng(partial[j].latlng[0], partial[j].latlng[1]);
      const b = new LatLng(partial[j + 1].latlng[0], partial[j + 1].latlng[1]);
      d += a.distance(b);
    }
    let speed = (d / (route[maxIdx].time - route[minIdx].time)) * 3600;
    if (isNaN(speed)) {
      speed = prevSpeed;
    }
    speeds.push(speed);
    prevSpeed = speed;
  }
  return speeds;
};

const extractDistance = (route) => {
  let d = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = new LatLng(route[i].latlng[0], route[i].latlng[1]);
    const b = new LatLng(route[i + 1].latlng[0], route[i + 1].latlng[1]);
    d += a.distance(b);
  }
  return d;
};

const extractBounds = function (img, corners_coords, route, hOffset = 0) {
  const transform = cornerCalTransform(
    img.width,
    img.height,
    corners_coords.top_left,
    corners_coords.top_right,
    corners_coords.bottom_right,
    corners_coords.bottom_left,
    hOffset
  );
  let minX = 0;
  let maxX = img.width;
  let minY = hOffset;
  let maxY = img.height + hOffset;
  for (let i = 0; i < route.length; i++) {
    const pt = transform(new LatLng(route[i].latlng[0], route[i].latlng[1]));
    minX = pt.x < minX ? pt.x : minX;
    maxX = pt.x > maxX ? pt.x : maxX;
    minY = pt.y < minY ? pt.y : minY;
    maxY = pt.y > maxY ? pt.y : maxY;
  }
  return {
    minX: Math.floor(minX),
    maxX: Math.ceil(maxX),
    minY: Math.min(0, Math.floor(minY)),
    maxY: Math.ceil(maxY),
  };
};

export const getCorners = function (
  img,
  corners_coords,
  route,
  includeHeader = false
) {
  const bounds = extractBounds(
    img,
    corners_coords,
    route,
    includeHeader ? 70 : 0
  );
  const transform = cornerBackTransform(
    img.width,
    img.height,
    corners_coords.top_left,
    corners_coords.top_right,
    corners_coords.bottom_right,
    corners_coords.bottom_left,
    includeHeader ? 70 : 0
  );

  return {
    top_left: transform(new Point(bounds.minX, bounds.minY)),
    top_right: transform(new Point(bounds.maxX, bounds.minY)),
    bottom_right: transform(new Point(bounds.maxX, bounds.maxY)),
    bottom_left: transform(new Point(bounds.minX, bounds.maxY)),
  };
};

export const drawOriginalMap = function (img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);
  return canvas;
};

export const scaleImage = (img, ratio) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(img.width * ratio);
  canvas.height = Math.floor(img.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    0,
    0,
    Math.floor(img.width * ratio),
    Math.floor(img.height * ratio)
  );
  return canvas;
};

export const drawRoute = (
  img,
  corners_coords,
  route,
  includeHeader = false,
  includeRoute = true
) => {
  const bounds = extractBounds(img, corners_coords, route);

  const mWidth = bounds.maxX - bounds.minX;
  const mHeight = bounds.maxY - bounds.minY;
  const MAX = 3000;

  if (mHeight > MAX || mWidth > MAX) {
    const scaledImg = scaleImage(img, MAX / Math.max(mHeight, mWidth));
    return drawRoute(
      scaledImg,
      corners_coords,
      route,
      includeHeader,
      includeRoute
    );
  }

  const resolution =
    getResolution(
      img.width,
      img.height,
      corners_coords.top_left,
      corners_coords.top_right,
      corners_coords.bottom_right,
      corners_coords.bottom_left
    ) / 1.702;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = bounds.maxX - bounds.minX;
  canvas.height = bounds.maxY - bounds.minY;
  // draw a background
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    img,
    Math.round(-bounds.minX),
    Math.round(-bounds.minY),
    Math.round(img.width),
    Math.round(img.height)
  );

  const outlineWidth = Math.max(2, 2 / resolution);
  const weight = Math.max(4, 4 / resolution);

  const speeds = extractSpeed(route);

  let minSpeed = null;
  let maxSpeed = null;
  if (speeds.length) {
    const sumSpeeds = speeds.reduce((a, b) => a + b, 0);
    const avgSpeed = sumSpeeds / speeds.length;
    const sumVariance = speeds.reduce((a, b) => a + (b - avgSpeed) ** 2, 0);
    const standardDev = Math.sqrt(sumVariance / speeds.length);
    minSpeed = avgSpeed - standardDev;
    maxSpeed = avgSpeed + standardDev;
  }

  const palette = (function (initPalette) {
    const pCanvas = document.createElement("canvas"),
      pCtx = pCanvas.getContext("2d"),
      gradient = pCtx.createLinearGradient(0, 0, 0, 256);

    pCanvas.width = 1;
    pCanvas.height = 256;

    for (let i in initPalette) {
      gradient.addColorStop(i, initPalette[i]);
    }

    pCtx.fillStyle = gradient;
    pCtx.fillRect(0, 0, 1, 256);
    return pCtx.getImageData(0, 0, 1, 256).data;
  })({
    0.0: "#ff0000",
    0.5: "#ffff00",
    1.0: "#008800",
  });

  const getRGBForPercent = function (valueRelative) {
    const paletteIndex = Math.min(
      Math.floor(valueRelative * 256) * 4,
      palette.length - 4
    );

    return [
      palette[paletteIndex],
      palette[paletteIndex + 1],
      palette[paletteIndex + 2],
    ];
  };

  const getRGBForValue = function (value) {
    let valueRelative = Math.min(
      Math.max((value - minSpeed) / (maxSpeed - minSpeed), 0),
      0.999
    );
    if (isNaN(valueRelative)) {
      valueRelative = 0;
    }
    return getRGBForPercent(valueRelative);
  };

  if (includeRoute) {
    const canvas2 = document.createElement("canvas");
    canvas2.width = canvas.width;
    canvas2.height = canvas.height;
    const ctx2 = canvas2.getContext("2d");

    const canvas3 = document.createElement("canvas");
    canvas3.width = canvas.width;
    canvas3.height = canvas.height;
    const ctx3 = canvas3.getContext("2d");

    const transform = cornerCalTransform(
      img.width,
      img.height,
      corners_coords.top_left,
      corners_coords.top_right,
      corners_coords.bottom_right,
      corners_coords.bottom_left
    );

    // drawOutline
    ctx3.lineWidth = weight + 2 * outlineWidth;
    ctx3.strokeStyle = "black";
    ctx3.beginPath();
    ctx3.lineCap = "round";
    ctx3.lineJoin = "round";
    let prevPt = null;
    for (let i = 0; i < route.length; i++) {
      const pt = transform(new LatLng(route[i].latlng[0], route[i].latlng[1]));
      if (
        !prevPt ||
        Math.sqrt(
          Math.pow(Math.round(prevPt.x) - Math.round(pt.x), 2) +
            Math.pow(Math.round(prevPt.y) - Math.round(pt.y), 2)
        ) > weight
      ) {
        prevPt = pt;
        ctx3.lineTo(
          Math.round(pt.x - bounds.minX),
          Math.round(pt.y - bounds.minY)
        );
      }
    }
    ctx3.stroke();

    ctx3.globalCompositeOperation = "destination-out";
    ctx3.lineWidth = weight;
    ctx3.stroke();
    ctx3.globalCompositeOperation = "source-over";

    // drawColoredPath
    ctx2.lineWidth = weight;
    ctx2.lineCap = "round";
    ctx2.lineJoin = "round";
    let pointStart = transform(
      new LatLng(route[0].latlng[0], route[0].latlng[1])
    );
    for (let j = 1; j < route.length; j++) {
      const pointEnd = transform(
        new LatLng(route[j].latlng[0], route[j].latlng[1])
      );
      const distanceX = pointEnd.x - pointStart.x;
      const distanceY = pointEnd.x - pointStart.x;
      const d = Math.sqrt(distanceX ** 2 + distanceY ** 2);

      if (d < 1) {
        continue;
      }

      // Create a gradient for each segment, pick start end end colors from palette gradient
      const gradient = ctx2.createLinearGradient(
        Math.round(pointStart.x - bounds.minX),
        Math.round(pointStart.y - bounds.minY),
        Math.round(pointEnd.x - bounds.minX),
        Math.round(pointEnd.y - bounds.minY)
      );
      ctx2.strokeStyle = gradient;
      const gradientStartRGB = getRGBForValue(speeds[j - 1]);
      const gradientEndRGB = getRGBForValue(speeds[j]);
      gradient.addColorStop(0, "rgb(" + gradientStartRGB.join(",") + ")");
      gradient.addColorStop(1, "rgb(" + gradientEndRGB.join(",") + ")");

      ctx2.beginPath();
      ctx2.moveTo(
        Math.round(pointStart.x - bounds.minX),
        Math.round(pointStart.y - bounds.minY)
      );
      ctx2.lineTo(
        Math.round(pointEnd.x - bounds.minX),
        Math.round(pointEnd.y - bounds.minY)
      );
      ctx2.stroke();

      pointStart = pointEnd;
    }

    if (route.length && route[0].time) {
      let prevT = +route[0].time - 20e3;
      let count = 0;
      ctx3.strokeStyle = "#222";
      const size = Math.min(3, 3 / resolution);
      for (let j = 1; j < route.length - 1; j++) {
        if (+route[j].time >= +prevT + 10e3) {
          ctx3.lineWidth = (count % 6 === 0 ? 3 : 1) / resolution;
          const pointStart = transform(
            new LatLng(route[j-1].latlng[0], route[j-1].latlng[1])
          );
          const point = transform(
            new LatLng(route[j].latlng[0], route[j].latlng[1])
          );
          const pointNext = transform(
            new LatLng(route[j+1].latlng[0], route[j+1].latlng[1])
          );
          const angle = Math.atan2(pointNext.y-pointStart.y, pointNext.x-pointStart.x) + Math.PI / 2;
          ctx3.beginPath();
          ctx3.moveTo(
            Math.round(point.x - bounds.minX - Math.cos(angle) * size),
            Math.round(point.y - bounds.minY - Math.sin(angle) * size),
          );
          ctx3.lineTo(
            Math.round(point.x - bounds.minX + Math.cos(angle) * size),
            Math.round(point.y - bounds.minY + Math.sin(angle) * size),
          );
          ctx3.stroke();
          prevT = route[j].time;
          count++;
        }
      }
    }
    ctx.globalAlpha = 0.45;
    ctx.drawImage(canvas2, 0, 0);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(canvas3, 0, 0);
  }
  if (includeHeader) {
    const headerHeight = 70;
    const paletteWidth = 180;
    const paletteX = 40;
    const paletteY = 30;
    const lineWidth = 16;
    const canvas4 = document.createElement("canvas");
    canvas4.width = canvas.width;
    canvas4.height = canvas.height + headerHeight;

    const ctx4 = canvas4.getContext("2d");
    ctx4.drawImage(canvas, 0, headerHeight);
    // draw a background
    ctx4.fillStyle = "#222";
    ctx4.fillRect(0, 0, canvas4.width, headerHeight);

    ctx4.font = "15px Arial";
    ctx4.fillStyle = "white";
    if (includeRoute && route.length && route[0].time) {
      const gradient = ctx4.createLinearGradient(
        paletteX,
        0,
        paletteWidth + paletteX,
        0
      );
      gradient.addColorStop(0, "rgb(" + getRGBForPercent(0).join(",") + ")");
      gradient.addColorStop(
        0.5,
        "rgb(" + getRGBForPercent(0.5).join(",") + ")"
      );
      gradient.addColorStop(1, "rgb(" + getRGBForPercent(1).join(",") + ")");

      ctx4.lineWidth = 16;
      ctx4.strokeStyle = gradient;
      ctx4.beginPath();
      ctx4.moveTo(paletteX, paletteY);
      ctx4.lineTo(paletteX + paletteWidth, paletteY);
      ctx4.stroke();

      ctx4.lineWidth = 1;
      ctx4.strokeStyle = "#222";
      ctx4.beginPath();
      ctx4.moveTo(paletteX + paletteWidth / 2, paletteY - lineWidth / 2);
      ctx4.lineTo(paletteX + paletteWidth / 2, paletteY + lineWidth / 2);
      ctx4.stroke();

      const minSpeedTxt = getSpeedText(minSpeed);
      const medSpeedTxt = getSpeedText((maxSpeed + minSpeed) / 2);
      const maxSpeedTxt = getSpeedText(maxSpeed);

      ctx4.textAlign = "center";
      ctx4.fillText(minSpeedTxt, paletteX, paletteY + lineWidth / 2 + 15);
      ctx4.fillText(
        medSpeedTxt,
        paletteX + paletteWidth / 2,
        paletteY + lineWidth / 2 + 15
      );
      ctx4.fillText(
        maxSpeedTxt,
        paletteX + paletteWidth,
        paletteY + lineWidth / 2 + 15
      );
    }
    ctx4.textAlign = "left";
    if (includeRoute && route.length && route[0].time) {
      const dist = extractDistance(route);
      ctx4.fillText(
        `${(dist / 1e3).toFixed(3)}km`,
        paletteX + paletteWidth + 35,
        paletteY
      );
      ctx4.fillText(
        printTime(route[route.length - 1].time - route[0].time),
        paletteX + paletteWidth + 115,
        paletteY
      );
      ctx4.fillText(
        `${new Date(route[0].time).toLocaleString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZoneName: "long",
          hour12: false,
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        })}`,
        paletteX + paletteWidth + 35,
        paletteY + 20
      );
    }

    ctx4.font = "60px Arial";
    ctx4.fillText("mapdump.com", canvas.width - 400, headerHeight - 17);
    return canvas4;
  }
  return canvas;
};

const getSpeedText = (s) => {
  return `${s.toFixed(2)}km/h`;
};

export const printTime = (t) => {
  var date = new Date(null);
  date.setSeconds(t / 1e3);
  const iso = date.toISOString().substr(11, 8);
  const h = parseInt(iso.slice(0, 2));
  const hasH = h > 0;
  const hPart = hasH ? h + "h" : "";
  const m = parseInt(iso.slice(3, 5));
  const hasM = hasH || m > 0;
  let mPart = hasM ? m + "m" : "";
  if (hasH) {
    mPart = mPart.padStart(3, "0");
  }
  const s = parseInt(iso.slice(6, 8));
  const hasS = hasM || s > 0;
  let sPart = hasS ? s + "s" : "";
  if (hasM) {
    sPart = sPart.padStart(3, "0");
  }
  return hPart + mPart + sPart;
};

export const printPace = (p) => {
  return `${printTime(p * 1000)}/km`;
};
