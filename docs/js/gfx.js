'use strict';

// Canvas helpers that mimic the small slice of pygame.draw the game was built on:
// filled/outlined shapes (outlines sit *inside* the shape, like pygame), text with
// pygame-style anchors, translucent panels and the water background.

const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');

/** Runs `draw` with every helper below aimed at another canvas (for cached sprites). */
function renderOnto(target, draw) {
  const previous = ctx;
  ctx = target.getContext('2d');
  try {
    draw();
  } finally {
    ctx = previous;
  }
}

// ------------------------------------------------------------------ geometry

class Rect {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
  get right() { return this.x + this.w; }
  get bottom() { return this.y + this.h; }
  get centerx() { return this.x + this.w / 2; }
  get centery() { return this.y + this.h / 2; }
  get center() { return [this.centerx, this.centery]; }
  contains(px, py) { return px >= this.x && px < this.right && py >= this.y && py < this.bottom; }
  inflate(dw, dh) { return new Rect(this.x - dw / 2, this.y - dh / 2, this.w + dw, this.h + dh); }
  move(dx, dy) { return new Rect(this.x + dx, this.y + dy, this.w, this.h); }
  overlaps(other) {
    return this.x < other.right && other.x < this.right && this.y < other.bottom && other.y < this.bottom;
  }
}

/** Latest pointer position in game coordinates (-1000 when the pointer is away). */
const mouse = { x: -1000, y: -1000 };
const mouseOver = (rect) => rect.contains(mouse.x, mouse.y);

// ------------------------------------------------------------------- colours

/** CSS colour for [r, g, b] or [r, g, b, a(0-255)], times an extra 0-1 alpha. */
function css(color, alpha = 1) {
  const a = (color.length > 3 ? color[3] / 255 : 1) * alpha;
  return `rgba(${color[0]},${color[1]},${color[2]},${a})`;
}

// -------------------------------------------------------------------- shapes

function roundedPath(x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRect(x, y, w, h, color, radius = 0, alpha = 1) {
  ctx.fillStyle = css(color, alpha);
  if (radius > 0) {
    roundedPath(x, y, w, h, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

function ringRect(x, y, w, h, color, width = 1, radius = 0, alpha = 1) {
  const half = width / 2;
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  roundedPath(x + half, y + half, w - width, h - width, Math.max(0, radius - half));
  ctx.stroke();
}

function fillCircle(cx, cy, r, color, alpha = 1) {
  if (r <= 0) return;
  ctx.fillStyle = css(color, alpha);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
}

function ringCircle(cx, cy, r, color, width = 1, alpha = 1) {
  const radius = r - width / 2;
  if (radius <= 0) return;
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
}

function ellipsePath(x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.01, w / 2), Math.max(0.01, h / 2), 0, 0, TAU);
}

function fillEllipse(x, y, w, h, color, alpha = 1) {
  ctx.fillStyle = css(color, alpha);
  ellipsePath(x, y, w, h);
  ctx.fill();
}

function ringEllipse(x, y, w, h, color, width = 1, alpha = 1) {
  const half = width / 2;
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  ellipsePath(x + half, y + half, w - width, h - width);
  ctx.stroke();
}

function polyPath(points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  });
}

function fillPoly(points, color, alpha = 1) {
  ctx.fillStyle = css(color, alpha);
  polyPath(points);
  ctx.closePath();
  ctx.fill();
}

function ringPoly(points, color, width = 1, alpha = 1) {
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  polyPath(points);
  ctx.closePath();
  ctx.stroke();
}

function drawLine(x1, y1, x2, y2, color, width = 1, alpha = 1, cap = 'butt') {
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawPolyline(points, color, width = 1, alpha = 1) {
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  polyPath(points);
  ctx.stroke();
}

/** Arc drawn counter-clockwise on screen from `start` to `end` radians, like pygame.draw.arc. */
function drawArc(cx, cy, rx, ry, start, end, color, width = 1, alpha = 1) {
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, -end, -start);
  ctx.stroke();
}

/** Soft radial blob: brightest in the middle, fading with (1 - r)^power. */
function glow(cx, cy, radius, color, maxAlpha, power = 1.5) {
  if (radius <= 0) return;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (let step = 0; step <= 10; step++) {
    const t = step / 10;
    gradient.addColorStop(t, css(color, (maxAlpha / 255) * Math.pow(1 - t, power)));
  }
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fill();
}

// --------------------------------------------------------------------- text

const FAMILY = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
const FONT = { size: 22, bold: false };
const SMALL_FONT = { size: 16, bold: false };
const MEDIUM_FONT = { size: 30, bold: true };
const BIG_FONT = { size: 48, bold: true };
const TITLE_FONT = { size: 72, bold: true };
const GAUGE_FONT = { size: 11, bold: true };
const TINY_FONT = { size: 13, bold: false };

const fontString = (font) => `${font.bold ? 'bold ' : ''}${font.size}px ${FAMILY}`;

const fontMetricsCache = new Map();
function fontMetrics(font) {
  const key = fontString(font);
  let metrics = fontMetricsCache.get(key);
  if (!metrics) {
    ctx.font = key;
    const probe = ctx.measureText('Hg');
    const ascent = probe.fontBoundingBoxAscent ?? font.size * 0.9;
    const descent = probe.fontBoundingBoxDescent ?? font.size * 0.25;
    metrics = { ascent, height: ascent + descent };
    fontMetricsCache.set(key, metrics);
  }
  return metrics;
}

function textWidth(font, text) {
  ctx.font = fontString(font);
  return ctx.measureText(text).width;
}

const ANCHORS = {
  topleft: ['left', 'top'],
  midtop: ['center', 'top'],
  topright: ['right', 'top'],
  midleft: ['left', 'mid'],
  center: ['center', 'mid'],
  midright: ['right', 'mid'],
  bottomleft: ['left', 'bottom'],
  midbottom: ['center', 'bottom'],
  bottomright: ['right', 'bottom'],
};

/** Text placed by a pygame-style anchor. Returns the rectangle it covers. */
function drawText(font, text, color, x, y, anchor = 'topleft', shadow = true, alpha = 255) {
  const metrics = fontMetrics(font);
  ctx.font = fontString(font);
  const width = ctx.measureText(text).width;
  const [horizontal, vertical] = ANCHORS[anchor];
  const top = vertical === 'top' ? y : vertical === 'mid' ? y - metrics.height / 2 : y - metrics.height;
  const left = horizontal === 'left' ? x : horizontal === 'center' ? x - width / 2 : x - width;
  const baseline = top + metrics.ascent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (shadow) {
    ctx.fillStyle = css([0, 12, 25], (150 / 255) * (alpha / 255));
    ctx.fillText(text, left + 2, baseline + 2);
  }
  ctx.fillStyle = css(color, alpha / 255);
  ctx.fillText(text, left, baseline);
  return new Rect(left, top, width, metrics.height);
}

/** The rectangle text would cover, without drawing it (for sizing panels around it). */
function textRect(font, text, anchor, x, y) {
  const metrics = fontMetrics(font);
  const width = textWidth(font, text);
  const [horizontal, vertical] = ANCHORS[anchor];
  const top = vertical === 'top' ? y : vertical === 'mid' ? y - metrics.height / 2 : y - metrics.height;
  const left = horizontal === 'left' ? x : horizontal === 'center' ? x - width / 2 : x - width;
  return new Rect(left, top, width, metrics.height);
}

// -------------------------------------------------------------------- panels

function drawPanel(rect, alpha = 185, border = PANEL_BORDER, borderAlpha = 120, radius = 12) {
  fillRect(rect.x, rect.y, rect.w, rect.h, PANEL, radius, alpha / 255);
  drawLine(rect.x + radius, rect.y + 2.5, rect.right - radius, rect.y + 2.5, WHITE, 1, 30 / 255);
  ringRect(rect.x, rect.y, rect.w, rect.h, border, 2, radius, borderAlpha / 255);
}

// ---------------------------------------------------------------- backgrounds

function makeCanvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function biomeColorAt(biome, y) {
  return lerpColor(biome.top, biome.bottom, Math.pow(y / (HEIGHT - 1), 1.2));
}

function makeVerticalGradient(top, bottom) {
  const surface = makeCanvas(WIDTH, HEIGHT);
  const g = surface.getContext('2d');
  for (let y = 0; y < HEIGHT; y++) {
    g.fillStyle = css(lerpColor(top, bottom, Math.pow(y / (HEIGHT - 1), 1.2)));
    g.fillRect(0, y, WIDTH, 1);
  }
  return surface;
}

function makeVignette() {
  const small = makeCanvas(90, 60);
  const g = small.getContext('2d');
  const image = g.createImageData(90, 60);
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 90; x++) {
      const dx = (x - 44.5) / 45;
      const dy = (y - 29.5) / 30;
      const distance = Math.min(1.0, Math.hypot(dx, dy));
      const alpha = Math.trunc(150 * Math.pow(Math.max(0, distance - 0.45) / 0.55, 2));
      const offset = (y * 90 + x) * 4;
      image.data[offset] = 0;
      image.data[offset + 1] = 8;
      image.data[offset + 2] = 20;
      image.data[offset + 3] = alpha;
    }
  }
  g.putImageData(image, 0, 0);
  return small;
}

function makeLightRays() {
  const rng = seededRandom(0.4);
  const rays = makeCanvas(WIDTH + 240, HEIGHT);
  const g = rays.getContext('2d');
  for (let ray = 0; ray < 7; ray++) {
    const topX = rng.randint(0, WIDTH + 240);
    const topW = rng.randint(30, 80);
    const slant = rng.randint(120, 260);
    const spread = rng.randint(60, 160);
    g.fillStyle = `rgba(200,240,255,${rng.randint(10, 22) / 255})`;
    g.beginPath();
    g.moveTo(topX, 0);
    g.lineTo(topX + topW, 0);
    g.lineTo(topX + topW + slant + spread, HEIGHT);
    g.lineTo(topX + slant, HEIGHT);
    g.closePath();
    g.fill();
  }
  // Down- then up-scaling acts as a cheap blur for soft ray edges.
  const blurred = makeCanvas(Math.floor(rays.width / 10), Math.floor(HEIGHT / 10));
  const b = blurred.getContext('2d');
  b.imageSmoothingQuality = 'high';
  b.drawImage(rays, 0, 0, blurred.width, blurred.height);
  const result = makeCanvas(rays.width, HEIGHT);
  const r = result.getContext('2d');
  r.imageSmoothingQuality = 'high';
  r.drawImage(blurred, 0, 0, result.width, result.height);
  return result;
}

const BIOME_SURFACES = BIOMES.map((biome) => makeVerticalGradient(biome.top, biome.bottom));
const VIGNETTE = makeVignette();
const LIGHT_RAYS = makeLightRays();

const PARTICLES = (() => {
  const rng = seededRandom(0.11);
  return Array.from({ length: 80 }, () => [
    rng.uniform(0, WIDTH),
    rng.uniform(0, HEIGHT),
    rng.choice([1, 1, 1, 2, 2, 3]),
    rng.uniform(0, TAU),
  ]);
})();
const DEPTH_MARKS = [100, 200, 300, 400, 500];

function drawWaterBackground(ceilingIntensity = 1.0, biome = 0, previous = null, blend = 1.0) {
  const t = now();
  if (previous !== null && blend < 1.0) {
    ctx.drawImage(BIOME_SURFACES[previous], 0, 0);
    ctx.globalAlpha = blend;
    ctx.drawImage(BIOME_SURFACES[biome], 0, 0);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(BIOME_SURFACES[biome], 0, 0);
  }
  ctx.globalAlpha = (40 + 215 * ceilingIntensity) / 255;
  ctx.drawImage(LIGHT_RAYS, -120 + Math.sin(t * 0.25) * 90, 0);
  ctx.globalAlpha = 1;

  for (const depth of DEPTH_MARKS) {
    const lineColor = lighten(biomeColorAt(BIOMES[biome], depth), 0.08);
    ctx.fillStyle = css(lineColor);
    for (let dashX = 0; dashX < WIDTH; dashX += 24) ctx.fillRect(dashX, depth, 12, 1);
    drawText(SMALL_FONT, `${depth} m`, [170, 220, 235], 10, depth + 4, 'topleft', false, 90);
  }

  for (const [baseX, baseY, radius, phase] of PARTICLES) {
    const speed = 6 + radius * 9;
    let px = (((baseX - t * speed * 2.2) % (WIDTH + 20)) + (WIDTH + 20)) % (WIDTH + 20) - 10;
    const py = (((baseY - t * speed * 0.35) % (HEIGHT + 20)) + (HEIGHT + 20)) % (HEIGHT + 20) - 10;
    px += Math.sin(t * 0.8 + phase) * 6;
    fillCircle(px + radius + 1, py + radius + 1, radius, [210, 240, 255], (40 + radius * 25) / 255);
  }

  const topColor = BIOMES[biome].top;
  const surfacePoints = [];
  for (let x = 0; x < WIDTH + 20; x += 20) surfacePoints.push([x, 4 + Math.sin(x * 0.03 + t * 2.0) * 2.5]);
  fillPoly([[0, 0], ...surfacePoints, [WIDTH, 0]], lighten(topColor, 0.35));
  drawPolyline(surfacePoints, lighten(topColor, 0.65), 2);

  const sandPoints = [];
  for (let x = 0; x < WIDTH + 20; x += 15) {
    sandPoints.push([x, HEIGHT - 10 + Math.sin(x * 0.021) * 4 + Math.sin(x * 0.057 + 1) * 2]);
  }
  fillPoly([[0, HEIGHT], ...sandPoints, [WIDTH, HEIGHT]], darken(SAND_COLOR, 0.35));
  drawPolyline(sandPoints, darken(SAND_COLOR, 0.1), 2);
}

function drawVignette() {
  ctx.drawImage(VIGNETTE, 0, 0, WIDTH, HEIGHT);
}

// ------------------------------------------------------------------ darkness

const DARK_SCALE = 4;
const DARK_W = WIDTH / DARK_SCALE;
const DARK_H = HEIGHT / DARK_SCALE;
const darkCanvas = makeCanvas(DARK_W, DARK_H);
const darkContext = darkCanvas.getContext('2d');
const darkImage = darkContext.createImageData(DARK_W, DARK_H);
for (let offset = 0; offset < darkImage.data.length; offset += 4) {
  darkImage.data[offset] = 0;
  darkImage.data[offset + 1] = 6;
  darkImage.data[offset + 2] = 18;
}
const ceilingRows = new Float32Array(DARK_H);

class CeilingLight {
  /** The lamp above the water switches on and off during a run. */
  constructor() {
    this.on = true;
    this.timer = rand(...CEILING_ON_SECONDS);
    this.intensity = 1.0;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.on = !this.on;
      this.timer = rand(...(this.on ? CEILING_ON_SECONDS : CEILING_OFF_SECONDS));
    }
    const target = this.on ? 1.0 : 0.0;
    const speed = this.on ? 3.5 : 2.5;
    this.intensity += clamp(target - this.intensity, -speed * dt, speed * dt);
    if (this.on && this.intensity > 0.25 && Math.random() < 0.05) this.intensity *= 0.6;
    return this.intensity;
  }
}

/** Your own lamp flickers; a bound SpyCatcher-GFP keeps it steady and wide. */
function lampRadius(bacterium) {
  if (bacterium.module === 'gfp') return [LIGHT_GFP_RADIUS, DARKNESS_GFP_ALPHA];
  const t = now();
  let flicker = 0.78 + 0.13 * Math.sin(t * 11.3) + 0.07 * Math.sin(t * 19.7) + 0.05 * Math.sin(t * 3.1);
  if (Math.sin(t * 0.83) > 0.985) flicker *= 0.55;
  return [LIGHT_BASE_RADIUS * flicker, DARKNESS_ALPHA];
}

function drawDarkness(bacterium, ceilingIntensity) {
  const [radius, baseAlpha] = lampRadius(bacterium);
  // Whichever light reaches a spot wins: the lamp above or your own.
  for (let y = 0; y < DARK_H; y++) {
    const lit = Math.max(0, 1 - (y / DARK_H) * CEILING_LIGHT_DEPTH);
    ceilingRows[y] = 1 - lit * ceilingIntensity;
  }
  const half = Math.max(2, radius / DARK_SCALE);
  const halfSquared = half * half;
  const cx = Math.trunc(bacterium.x / DARK_SCALE);
  const cy = Math.trunc(bacterium.y / DARK_SCALE);
  const data = darkImage.data;
  for (let y = 0; y < DARK_H; y++) {
    const dy = y - cy;
    const row = ceilingRows[y];
    for (let x = 0; x < DARK_W; x++) {
      const dx = x - cx;
      const distanceSquared = dx * dx + dy * dy;
      const lamp = distanceSquared >= halfSquared ? 1 : Math.pow(distanceSquared / halfSquared, 0.9);
      const light = 255 * (row < lamp ? row : lamp);
      data[(y * DARK_W + x) * 4 + 3] = light < baseAlpha ? light : baseAlpha;
    }
  }
  darkContext.putImageData(darkImage, 0, 0);
  ctx.drawImage(darkCanvas, 0, 0, WIDTH, HEIGHT);
}
