const {createCanvas, loadImage} = require('canvas');
const { LatLon, cornerCalTransform } = require('./Utils');


const extractSpeed = (route) => {
  const speeds = [];
  let prevSpeed = 1;
  //const data = [];
  for (let i = 0; i < route.length; i++) {
    const minIdx = Math.max(i - 10, 0);
    const maxIdx = Math.min(minIdx + 10, route.length - 1);
    const partial = route.slice(minIdx, maxIdx);
    let d = 0;
    for(let j=0; j < partial.length - 1; j++) {
      const a = new LatLon(partial[j].latLon[0], partial[j].latLon[1]);
      const b = new LatLon(partial[j+1].latLon[0], partial[j+1].latLon[1]);
      d += a.distance(b);
    }
    let speed = d/(route[maxIdx].time - route[minIdx].time)*3600;
    if (isNaN(speed)) {
      speed = prevSpeed;
    }
    speeds.push(speed);
    prevSpeed = speed;
    //data.push([route[i].latLon[0], route[i].latLon[1]]);
  }
  return speeds; //[speeds, data];
};
const extractDistance = (route) => {
  let d = 0;
  for (let i = 0; i < route.length-1; i++) {
    const a = new LatLon(route[i].latLon[0], route[i].latLon[1]);
    const b = new LatLon(route[i+1].latLon[0], route[i+1].latLon[1]);
    d += a.distance(b);
  }
  return d;
};

const extractBounds = function(img, corners_coords, route) {
  const transform = cornerCalTransform(
    img.width,
    img.height,
    corners_coords.top_left,
    corners_coords.top_right,
    corners_coords.bottom_right,
    corners_coords.bottom_left
  );

  let minX = 0;
  let maxX = img.width;
  let minY = 0;
  let maxY = img.height;
  for(let i = 0; i < route.length; i++) {
    const pt = transform(new LatLon(route[i].latLon[0], route[i].latLon[1]));
    minX = pt.x < minX ? pt.x : minX;
    maxX = pt.x > maxX ? pt.x : maxX;
    minY = pt.y < minY ? pt.y : minY;
    maxY = pt.y > maxY ? pt.y : maxY;
  }
  return {
    minX: Math.floor(minX),
    maxX: Math.ceil(maxX),
    minY: Math.floor(minY),
    maxY: Math.ceil(maxY)
  }
};

const drawRoute = async (img, corners_coords, route, includeHeader=false, includeRoute=true) => {
  const bounds = extractBounds(img, corners_coords, route);
  const canvas =  createCanvas(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  const ctx = canvas.getContext('2d');

  // draw a background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(img, Math.round(-bounds.minX), Math.round(-bounds.minY), Math.round(img.width), Math.round(img.height));

  const outlineWidth = 2;
  const weight = 4;

  const speeds = extractSpeed(route);

  let minSpeed = null;
  let maxSpeed = null;
  if (speeds.length){
    const sumSpeeds = speeds.reduce((a, b) => a + b, 0);
    const avgSpeed = sumSpeeds / speeds.length
    const sumVariance = speeds.reduce((a, b) => a + (b - avgSpeed) ** 2, 0)
    const standardDev = Math.sqrt(sumVariance / speeds.length)
    minSpeed = avgSpeed - standardDev;
    maxSpeed = avgSpeed + standardDev;
  }

  const palette = (function (initPalette) {
    const pCanvas =  createCanvas(1, 256),
      pCtx = pCanvas.getContext('2d'),
      gradient = pCtx.createLinearGradient(0, 0, 0, 256);

    for (let i in initPalette) {
      gradient.addColorStop(parseFloat(i), initPalette[i]);
    }

    pCtx.fillStyle = gradient;
    pCtx.fillRect(0, 0, 1, 256);
    return pCtx.getImageData(0, 0, 1, 256).data;
  })({
    0.0: '#ff0000',
    0.5: '#ffff00',
    1.0: '#008800'
  });

  const getRGBForPercent = function (valueRelative) {
    const paletteIndex = Math.min(Math.floor(valueRelative * 256) * 4, palette.length - 4);

    return [
        palette[paletteIndex],
        palette[paletteIndex + 1],
        palette[paletteIndex + 2]
    ];
  };

  const getRGBForValue = function (value) {
    let valueRelative = Math.min(Math.max((value - minSpeed) / (maxSpeed - minSpeed), 0), 0.999);
    if(isNaN(valueRelative)) {
      valueRelative = 0;
    }
    return getRGBForPercent(valueRelative);
  };

  if (includeRoute) {
    const canvas2 = createCanvas(canvas.width, canvas.height);
    const ctx2 = canvas2.getContext('2d');
    const canvas3 = createCanvas(canvas.width, canvas.height);
    const ctx3 = canvas3.getContext('2d');

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
    ctx3.strokeStyle = 'black';
    ctx3.beginPath();
    for(let i=0; i < route.length; i++) {
      const pt = transform(new LatLon(route[i].latLon[0], route[i].latLon[1]));
      ctx3.lineTo(Math.round(pt.x - bounds.minX), Math.round(pt.y - bounds.minY));
    }
    ctx3.stroke();

    ctx3.globalCompositeOperation = 'destination-out'
    ctx3.lineWidth = weight;
    ctx3.stroke();
    ctx3.globalCompositeOperation = 'source-over'
    
    // drawColoredPath
    for (let j = 1; j < route.length; j++) {
      const pointStart = transform(new LatLon(route[j-1].latLon[0], route[j-1].latLon[1]));
      const pointEnd = transform(new LatLon(route[j].latLon[0], route[j].latLon[1]));

      // Create a gradient for each segment, pick start end end colors from palette gradient
      const gradient = ctx2.createLinearGradient(
          Math.round(pointStart.x - bounds.minX),
          Math.round(pointStart.y - bounds.minY),
          Math.round(pointEnd.x - bounds.minX),
          Math.round(pointEnd.y - bounds.minY)
      );
      const gradientStartRGB = getRGBForValue(speeds[j-1]);
      const gradientEndRGB = getRGBForValue(speeds[j]);
      gradient.addColorStop(0, 'rgb(' + gradientStartRGB.join(',') + ')');
      gradient.addColorStop(1, 'rgb(' + gradientEndRGB.join(',') + ')');

      ctx2.lineWidth = weight;
      ctx2.strokeStyle = gradient;
      ctx2.beginPath();
      ctx2.moveTo(Math.round(pointStart.x - bounds.minX), Math.round(pointStart.y - bounds.minY));
      ctx2.lineTo(Math.round(pointEnd.x - bounds.minX), Math.round(pointEnd.y - bounds.minY));
      ctx2.stroke();
    }
    
    if (route.length && route[0].time) {
      let prevT = +route[0].time-20e3;
      let count = 0;
      ctx3.lineWidth = 1
      ctx3.strokeStyle = '#000';
      for (let j = 0; j < route.length; j++) {
        if (+route[j].time >= +prevT + 10e3) {
          const point = transform(new LatLon(route[j].latLon[0], route[j].latLon[1]));
          ctx3.beginPath();
          ctx3.arc(
            Math.round(point.x - bounds.minX),
            Math.round(point.y - bounds.minY),
            count % 6 === 0 ? 3 : 1,
            0,
            2 * Math.PI
          );
          ctx3.fill()
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
    const paletteY = 30
    const lineWidth = 16;
    const canvas4 = createCanvas(canvas.width, canvas.height + headerHeight);
    const ctx4 = canvas4.getContext('2d');

    ctx4.drawImage(canvas, 0, headerHeight)
    // draw a background
    ctx4.fillStyle = '#222';
    ctx4.fillRect(0, 0, canvas4.width, headerHeight);
    
    ctx4.font = '10px Arial';
    ctx4.fillStyle = 'white';
    if (includeRoute && route.length && route[0].time) {
      const gradient = ctx4.createLinearGradient(paletteX, 0, paletteWidth + paletteX, 0);
      gradient.addColorStop(0, 'rgb(' + getRGBForPercent(0).join(',') + ')');
      gradient.addColorStop(0.5, 'rgb(' + getRGBForPercent(0.5).join(',') + ')');
      gradient.addColorStop(1, 'rgb(' + getRGBForPercent(1).join(',') + ')');

      ctx4.lineWidth = 16;
      ctx4.strokeStyle = gradient;
      ctx4.beginPath();
      ctx4.moveTo(paletteX, paletteY);
      ctx4.lineTo(paletteX + paletteWidth, paletteY);
      ctx4.stroke();

      ctx4.lineWidth = 1;
      ctx4.strokeStyle = '#222'
      ctx4.beginPath();
      ctx4.moveTo(paletteX + paletteWidth / 2, paletteY - lineWidth / 2);
      ctx4.lineTo(paletteX + paletteWidth / 2, paletteY + lineWidth / 2);
      ctx4.stroke();


      const minSpeedTxt = getSpeedText(minSpeed);
      const medSpeedTxt = getSpeedText((maxSpeed + minSpeed)/2);
      const maxSpeedTxt = getSpeedText(maxSpeed);
      
      ctx4.textAlign = 'center';
      ctx4.fillText(minSpeedTxt, paletteX, paletteY + lineWidth / 2 + 12);
      ctx4.fillText(medSpeedTxt, paletteX + paletteWidth/2, paletteY + lineWidth / 2 + 12);
      ctx4.fillText(maxSpeedTxt, paletteX + paletteWidth, paletteY + lineWidth / 2 + 12);
    }
    ctx4.textAlign = 'left';
    if (includeRoute && route.length && route[0].time) {
      const dist = extractDistance(route);
      ctx4.fillText(`${(dist/1e3).toFixed(3)}km`, paletteX + paletteWidth + 30, paletteY - 5);
      ctx4.fillText(printTime(route[route.length-1].time-route[0].time), paletteX + paletteWidth + 100, paletteY - 5);
      ctx4.fillText(`${(new Date(route[0].time))}`, paletteX + paletteWidth + 30, paletteY + 15);
    }
    ctx4.fillText('https://drawmyroute.com', canvas.width - 120, headerHeight - 5);
    return canvas4;
  }
  return canvas;
};

const getSpeedText = (s) => {
  return `${s.toFixed(2)}km/h`;
}

const printTime = (t) => {
  var date = new Date(null);
  date.setSeconds(t/1e3);
  const iso = date.toISOString().substr(11, 8);
  const h = parseInt(iso.slice(0, 2))
  const hasH = h > 0
  const hPart = hasH ? (h + 'h') : ''
  const m = parseInt(iso.slice(3, 5))
  const hasM = hasH || m > 0
  let mPart = hasM ? (m + 'm') : ''
  if (hasH) {
    mPart = mPart.padStart(3, '0')
  }
  const s = parseInt(iso.slice(6, 8))
  const hasS = hasM || s > 0
  let sPart = hasS? (s + 's') : ''
  if (hasM) {
    sPart = sPart.padStart(3, '0')
  }
  return hPart + mPart + sPart
}

module.exports = {
  drawRoute,
}