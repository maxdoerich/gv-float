'use strict';

// Everything that lives in the water: the player, pillars, pickups, cells,
// transducers and the dendritic-cell boss.

// ------------------------------------------------------------------ helpers

function drawBubble(x, y, radius) {
  fillCircle(x, y, radius, [200, 240, 255], 50 / 255);
  ringCircle(x, y, radius, [230, 250, 255], 1, 190 / 255);
  if (radius >= 3) {
    fillCircle(x - Math.floor(radius / 3), y - Math.floor(radius / 3), 1, [255, 255, 255], 220 / 255);
  }
}

function circleHitsRect(cx, cy, radius, rect) {
  const nearestX = clamp(cx, rect.x, rect.right);
  const nearestY = clamp(cy, rect.y, rect.bottom);
  return Math.hypot(cx - nearestX, cy - nearestY) < radius;
}

// ---- small module icons, shared by pickups, the HUD and the shop

/** GvpC is an alpha helix that clamps along the ribs of the vesicle shell. */
function drawHelix(cx, cy, height, turns, color, core, phase) {
  const steps = 26;
  for (let step = 0; step < steps; step++) {
    const fraction = step / (steps - 1);
    const angle = phase + fraction * turns * TAU;
    const x = cx + Math.sin(angle) * 8;
    const y = cy - height / 2 + fraction * height;
    const depth = (Math.cos(angle) + 1) / 2;
    fillCircle(x, y, 2 + Math.trunc(depth * 2), lerpColor(darken(color, 0.45), core, depth));
    if (step % 4 === 0) {
      const backX = cx - Math.sin(angle) * 8;
      drawLine(x, y, backX, y, darken(color, 0.3), 1);
    }
  }
}

/** GFP's beta barrel: a stubby cylinder with a bright chromophore. */
function drawGfpBarrel(cx, cy, radius, t) {
  const bx = cx - radius;
  const by = cy - radius - 1;
  const bw = radius * 2;
  const bh = radius * 2 + 2;
  fillRect(bx, by, bw, bh, darken(GFP_COLOR, 0.45), Math.floor(radius / 2));
  fillRect(bx + 1.5, by + 1.5, bw - 3, bh - 3, GFP_COLOR, Math.floor(radius / 2));
  for (let offset = -radius + 3; offset < radius - 1; offset += 3) {
    drawLine(cx + offset + 0.5, by + 2, cx + offset + 0.5, by + bh - 3, darken(GFP_COLOR, 0.25), 1);
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  fillCircle(cx, cy, 2, lerpColor(GFP_COLOR, WHITE, pulse));
}

/** Granzyme: a serrated protease that cuts approaching cells open. */
function drawGranzyme(cx, cy, size, angle) {
  const points = [];
  for (let step = 0; step < 10; step++) {
    const spin = angle + (step / 10) * TAU;
    const reach = step % 2 === 0 ? size : size * 0.5;
    points.push([cx + Math.cos(spin) * reach, cy + Math.sin(spin) * reach]);
  }
  fillPoly(points, darken(GRANZYME_COLOR, 0.4));
  ringPoly(points, GRANZYME_COLOR, 2);
  fillCircle(cx, cy, Math.max(2, Math.floor(size / 3)), lighten(GRANZYME_COLOR, 0.6));
}

/** Y-shaped antibody: the SpyCatcher fusion that grabs nearby targets. */
function drawAntibody(cx, cy, size, angle) {
  const stemX = cx - Math.cos(angle) * size;
  const stemY = cy - Math.sin(angle) * size;
  for (const arm of [-0.7, 0.7]) {
    const tipX = cx + Math.cos(angle + arm) * size;
    const tipY = cy + Math.sin(angle + arm) * size;
    drawLine(cx, cy, tipX, tipY, darken(ANTIBODY_COLOR, 0.4), 4);
    drawLine(cx, cy, tipX, tipY, ANTIBODY_COLOR, 2);
    fillCircle(tipX, tipY, 2, WHITE);
  }
  drawLine(cx, cy, stemX, stemY, darken(ANTIBODY_COLOR, 0.4), 4);
  drawLine(cx, cy, stemX, stemY, ANTIBODY_COLOR, 2);
}

/** Ampicillin: a two-tone capsule with its beta-lactam ring. */
function drawAmpicillin(cx, cy, size, angle) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const half = size * 1.15;
  const tailX = cx - ux * half;
  const tailY = cy - uy * half;
  const tipX = cx + ux * half;
  const tipY = cy + uy * half;
  const thickness = Math.max(3, Math.trunc(size * 0.9));
  drawLine(tailX, tailY, cx, cy, darken(AMPICILLIN_COLOR, 0.4), thickness);
  drawLine(cx, cy, tipX, tipY, lighten(AMPICILLIN_COLOR, 0.35), thickness);
  const cap = Math.max(2, Math.floor(size / 2));
  fillCircle(tailX, tailY, cap, darken(AMPICILLIN_COLOR, 0.5));
  fillCircle(tipX, tipY, cap, lighten(AMPICILLIN_COLOR, 0.55));
  const ring = Math.max(3, Math.floor(size / 2));
  ringRect(cx - ring / 2, cy - ring / 2, ring, ring, WHITE, 1);
}

function drawModuleIcon(kind, cx, cy, size) {
  const t = now();
  if (kind === 'gfp') drawGfpBarrel(cx, cy, size - 1, t);
  else if (kind === 'granzyme') drawGranzyme(cx, cy, size, t * 1.5);
  else if (kind === 'ampicillin') drawAmpicillin(cx, cy, size, -Math.PI / 2);
  else drawAntibody(cx, cy, size, -Math.PI / 2);
}

// ---------------------------------------------------------------- Bacterium

let zeppelinBanner = null;
function getZeppelinBanner() {
  if (zeppelinBanner) return zeppelinBanner;
  const scale = 2; // drawn at twice the size so the text stays sharp
  const label = 'VOYAGE';
  const width = Math.ceil(textWidth(GAUGE_FONT, label)) + 12;
  const height = Math.ceil(fontMetrics(GAUGE_FONT).height) + 6;
  const element = makeCanvas(width * scale, height * scale);
  renderOnto(element, () => {
    ctx.scale(scale, scale);
    fillRect(0, 0, width, height, PANEL_BORDER, 2);
    ringRect(0, 0, width, height, lighten(PANEL_BORDER, 0.5), 1, 2);
    drawText(GAUGE_FONT, label, [10, 40, 58], width / 2, height / 2, 'center', false);
  });
  zeppelinBanner = { element, width, height, scale };
  return zeppelinBanner;
}

class Bacterium {
  constructor(character) {
    this.character = character;
    [this.halfWidth, this.halfHeight] = HITBOXES[character];
    this.perk = SKIN_PERKS[character];
    this.reset();
  }

  reset() {
    this.x = BACTERIUM_X;
    this.y = HEIGHT / 2;
    this.velocityY = 0.0;
    this.gvLevel = this.perk.start_gv ?? 50.0;
    this.productionHoldSeconds = 0.0;
    this.collapseHoldSeconds = 0.0;
    this.notice = '';
    this.noticeTimer = 0.0;
    this.shell = 0;
    this.invulnerableTimer = 0.0;
    this.module = null;
    this.moduleTimer = 0.0;
    this.moduleDuration = MODULE_BASE_DURATION.gfp;
    this.durations = { ...MODULE_BASE_DURATION };
    this.magnetRadius = COIN_MAGNET_RADIUS;
    this.ammo = 0;
    this.ampicillinCapacity = AMPICILLIN_BASE_SHOTS;
    this.ampicillinHoming = false;
    this.infiniteAmpicillin = false;
    this.biobrickTier = 0;
    this.bubbles = [];
  }

  applyUpgrades(progress) {
    this.durations = {
      gfp: MODULE_BASE_DURATION.gfp + progress.gfp_level * GFP_BONUS_SECONDS,
      antibody: MODULE_BASE_DURATION.antibody,
      granzyme: MODULE_BASE_DURATION.granzyme + progress.granzyme_level * GRANZYME_BONUS_SECONDS,
    };
    this.magnetRadius = COIN_MAGNET_RADIUS + progress.antibody_level * ANTIBODY_BONUS_RADIUS;
    const ampicillinLevel = progress.ampicillin_level;
    this.ampicillinCapacity = AMPICILLIN_BASE_SHOTS + ampicillinLevel * AMPICILLIN_BONUS_SHOTS_PER_LEVEL;
    this.ampicillinHoming = ampicillinLevel >= UPGRADE_MAX_LEVEL;
    this.shell = Math.min(MAX_SHELL_LAYERS, this.perk.start_shell ?? 0);
    if (this.character === 'BioBrick') {
      this.biobrickTier = progress.biobrick_tier || 0;
      this.perk = { ...this.perk, module: BIOBRICK_TIER_MODULE_BONUS[this.biobrickTier] };
    }
  }

  /** `keys` is { up, down }: whether the produce / collapse keys are held. */
  update(keys, dt, productionLocked = false) {
    const frameScale = dt * FPS;
    const producing = keys.up && !productionLocked;
    const collapsing = keys.down;

    if (producing) {
      this.productionHoldSeconds += dt;
      const multiplier = Math.min(
        MAX_GV_PRODUCTION_MULTIPLIER,
        Math.pow(GV_HOLD_ACCELERATION, this.productionHoldSeconds),
      );
      this.gvLevel += GV_PRODUCTION_RATE * multiplier * frameScale * (this.perk.production ?? 1.0);
    } else {
      this.productionHoldSeconds = 0.0;
    }

    if (collapsing) {
      this.collapseHoldSeconds += dt;
      const multiplier = Math.min(
        MAX_GV_COLLAPSE_MULTIPLIER,
        Math.pow(GV_HOLD_ACCELERATION, this.collapseHoldSeconds),
      );
      this.gvLevel -= GV_COLLAPSE_RATE * multiplier * frameScale * (this.perk.collapse ?? 1.0);
    } else {
      this.collapseHoldSeconds = 0.0;
    }

    this.gvLevel = clamp(this.gvLevel, 0.0, 100.0);

    const gvFraction = this.gvLevel / 100.0;
    const acceleration = GRAVITY - MAX_BUOYANCY * gvFraction * (this.perk.buoyancy ?? 1.0);
    this.velocityY += acceleration * frameScale;
    this.velocityY *= Math.pow(DRAG, frameScale);
    const topSpeed = MAX_VERTICAL_SPEED * (this.perk.speed ?? 1.0);
    this.velocityY = clamp(this.velocityY, -topSpeed, topSpeed);
    this.y += this.velocityY * frameScale;

    // Mild passive pressure loss at the bottom of the water column.
    const depthFraction = this.y / HEIGHT;
    if (depthFraction > 0.80) {
      this.gvLevel -= (depthFraction - 0.80) * 0.15 * frameScale;
      this.gvLevel = Math.max(0.0, this.gvLevel);
    }

    this.noticeTimer = Math.max(0.0, this.noticeTimer - dt);
    this.invulnerableTimer = Math.max(0.0, this.invulnerableTimer - dt);
    if (this.module === 'ampicillin') {
      // No expiry timer: the magazine runs out on its own once it's empty.
      if (this.ammo <= 0 && !this.infiniteAmpicillin) this.module = null;
    } else if (this.module) {
      this.moduleTimer = Math.max(0.0, this.moduleTimer - dt);
      if (this.moduleTimer === 0.0) this.module = null;
    }
    this.updateBubbles(dt, producing, collapsing);
  }

  setNotice(text) {
    this.notice = text;
    this.noticeTimer = 1.5;
  }

  reinforce() {
    this.shell = Math.min(MAX_SHELL_LAYERS, this.shell + 1);
    for (let i = 0; i < 10; i++) this.spawnBubble(true);
    this.setNotice('GvpC bound: shell reinforced');
  }

  bindModule(kind) {
    this.module = kind;
    if (kind === 'ampicillin') {
      this.ammo = this.ampicillinCapacity;
      this.moduleDuration = 0.0;
      this.moduleTimer = 0.0;
    } else {
      this.moduleDuration = this.durations[kind] * (this.perk.module ?? 1.0);
      this.moduleTimer = this.moduleDuration;
    }
    for (let i = 0; i < 8; i++) this.spawnBubble(true);
    const suffix = kind === 'ampicillin' ? ' · SPACE to fire' : '';
    this.setNotice(`${MODULE_LABELS[kind]} bound${suffix}`);
  }

  /** Spends one dose and returns the projectile to spawn, or null if empty. */
  fireAmpicillin() {
    if (this.module !== 'ampicillin' || this.ammo <= 0) return null;
    this.ammo -= 1;
    for (let i = 0; i < 4; i++) this.spawnBubble(true);
    const shot = new AmpicillinShot(this.x + this.halfWidth + 6, this.y, this.ampicillinHoming);
    if (this.ammo <= 0 && !this.infiniteAmpicillin) {
      this.module = null;
      this.setNotice('Ampicillin spent');
    }
    return shot;
  }

  /** Spend one reinforced shell layer instead of dying. */
  absorbHit() {
    this.shell -= 1;
    this.invulnerableTimer = SHELL_HIT_INVULNERABILITY;
    for (let i = 0; i < 20; i++) this.spawnBubble(false);
    this.setNotice('Shell cracked! GvpC lost');
  }

  updateBubbles(dt, producing, collapsing) {
    const frameScale = dt * FPS;
    if (producing && Math.random() < 0.35 * frameScale) this.spawnBubble(true);
    if (collapsing && Math.random() < 0.5 * frameScale) this.spawnBubble(false);

    for (const bubble of this.bubbles) {
      bubble.x += bubble.vx * frameScale;
      bubble.y += bubble.vy * frameScale;
      bubble.x += Math.sin(bubble.life * 9) * 0.3 * frameScale;
      bubble.life -= dt;
    }
    this.bubbles = this.bubbles.filter((bubble) => bubble.life > 0);
  }

  spawnBubble(rising) {
    if (rising) {
      this.bubbles.push({
        x: this.x + rand(-12, 8),
        y: this.y + rand(-10, 6),
        vx: rand(-2.2, -1.2),
        vy: rand(-1.6, -0.8),
        life: rand(0.7, 1.2),
        radius: randint(2, 5),
      });
    } else {
      const angle = rand(0, TAU);
      const speed = rand(1.0, 2.4);
      this.bubbles.push({
        x: this.x + Math.cos(angle) * 14,
        y: this.y + Math.sin(angle) * 14,
        vx: Math.cos(angle) * speed - 1.0,
        vy: Math.sin(angle) * speed,
        life: rand(0.25, 0.45),
        radius: randint(1, 2),
      });
    }
  }

  applyTransducer(collapseFraction) {
    const before = this.gvLevel;
    collapseFraction *= this.perk.transducer ?? 1.0;

    // Only collapse GVs. If the player is already below the 20% floor,
    // the transducer must not create new GVs by raising the level to 20%.
    if (before > TRANSDUCER_GV_FLOOR) {
      this.gvLevel = Math.max(TRANSDUCER_GV_FLOOR, before * (1.0 - collapseFraction));
    }
    for (let i = 0; i < 18; i++) this.spawnBubble(false);
    this.setNotice(`Transducer: ${(collapseFraction * 100).toFixed(0)}% collapsed`);
  }

  /** Apply one speed-independent impulse away from a top/bottom emitter. */
  applyTransducerPush(direction) {
    this.velocityY = clamp(
      this.velocityY + direction * TRANSDUCER_PUSH_IMPULSE,
      -MAX_VERTICAL_SPEED,
      MAX_VERTICAL_SPEED,
    );
    this.setNotice(`Transducer presses ${direction > 0 ? 'down' : 'up'}`);
  }

  draw({ tilt = true, showGlow = true, trail = true } = {}) {
    const t = now();
    if (trail && this.character === 'Zeppelin') this.drawBanner(t);

    for (const bubble of this.bubbles) drawBubble(Math.trunc(bubble.x), Math.trunc(bubble.y), bubble.radius);

    if (showGlow && this.character !== 'Purified GVs') {
      glow(this.x, this.y, 42 * (1.0 + 0.04 * Math.sin(t * 3)), [170, 230, 255], 55, 1.6);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    if (tilt) {
      const angle = clamp(-this.velocityY * 3.5, -18, 18);
      if (Math.abs(angle) > 0.5) ctx.rotate((-angle * Math.PI) / 180);
    }
    this.drawSprite(0, 0, t);
    ctx.restore();

    this.drawShell(t);
    if (trail) this.drawModule(t);
  }

  /** Character body plus GV level, centred on (cx, cy) in the current transform. */
  drawSprite(cx, cy, t) {
    const visibleGvs = Math.trunc((this.gvLevel / 100.0) * GV_POSITIONS.length);

    switch (this.character) {
      case 'Zeppelin': drawZeppelin(cx, cy); break;
      case 'E. coli': drawEcoli(cx, cy, t); break;
      case 'HEK cell': drawHek(cx, cy, t); break;
      case 'Anabaena': drawAnabaena(cx, cy, t); break;
      case 'Yeast': drawYeast(cx, cy, t); break;
      case 'Salmonella': drawSalmonella(cx, cy, t); break;
      case 'Serratia': drawSerratia(cx, cy, t); break;
      case 'Halobacterium': drawHalobacterium(cx, cy, t); break;
      case 'BioBrick': drawBiobrick(cx, cy, BIOBRICK_TIER_COLORS[this.biobrickTier]); break;
      case FINAL_SKIN: drawIgemLegacy(cx, cy, t); break;
      default: break;
    }

    if (this.character === 'Purified GVs') {
      drawPurified(cx, cy, t, visibleGvs);
    } else if (this.character === 'Zeppelin') {
      this.drawZeppelinGauge(cx, cy);
    } else if (this.character === 'BioBrick') {
      // A standardised chassis: it hides its gas vesicles behind the casing.
    } else {
      // Show the current GV level inside all cell/zeppelin characters.
      for (const [dx, dy] of GV_POSITIONS.slice(0, visibleGvs)) {
        fillEllipse(cx + dx - 2, cy + dy - 4, 5, 9, GV_COLOR);
        ringEllipse(cx + dx - 2, cy + dy - 4, 5, 9, GV_OUTLINE, 1);
      }
    }
  }

  drawModule(t) {
    if (!this.module) return;
    const cx = this.x;
    const cy = this.y;
    const fading = this.module === 'ampicillin'
      ? this.ammo <= 1 && Math.trunc(t * 6) % 2 === 0
      : this.moduleTimer < 3.0 && Math.trunc(this.moduleTimer * 6) % 2 === 0;
    if (this.module === 'gfp') {
      glow(cx, cy, 34, GFP_COLOR, fading ? 40 : 90, 1.6);
      const angle = t * 2.2;
      drawGfpBarrel(cx + Math.cos(angle) * 26, cy + Math.sin(angle) * 20, 7, t);
    } else if (this.module === 'granzyme') {
      glow(cx, cy, 36, GRANZYME_COLOR, fading ? 35 : 75, 1.6);
      for (let index = 0; index < 3; index++) {
        const spin = t * 3.0 + (index * TAU) / 3;
        drawGranzyme(cx + Math.cos(spin) * 30, cy + Math.sin(spin) * 24, 7, spin);
      }
    } else if (this.module === 'ampicillin') {
      glow(cx, cy, 34, AMPICILLIN_COLOR, fading ? 40 : 85, 1.6);
      for (let index = 0; index < Math.min(3, this.ammo); index++) {
        const spin = t * 2.0 + (index * TAU) / 3;
        drawAmpicillin(cx + Math.cos(spin) * 28, cy + Math.sin(spin) * 22, 7, spin);
      }
    } else {
      const angle = t * 2.2;
      for (let index = 0; index < 2; index++) {
        const spin = angle + index * Math.PI;
        drawAntibody(cx + Math.cos(spin) * 27, cy + Math.sin(spin) * 21, 8, spin);
      }
      ringCircle(cx, cy, this.magnetRadius, ANTIBODY_COLOR, 2, (fading ? 25 : 45) / 255);
    }
  }

  drawBanner(t) {
    const banner = getZeppelinBanner();
    const rightEdge = this.x - 32;
    drawLine(this.x - 22, this.y + 1, rightEdge, this.y + Math.sin(t * 5) * 2, [215, 225, 235], 1);
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (let column = 0; column < banner.width; column++) {
      // Columns further from the tow line swing wider, like cloth in the water.
      const sway = Math.sin(t * 5 - column * 0.22) * (2.0 + (banner.width - column) * 0.07);
      ctx.drawImage(
        banner.element,
        column * banner.scale, 0, banner.scale, banner.height * banner.scale,
        rightEdge - banner.width + column, this.y - banner.height / 2 + sway, 1, banner.height,
      );
    }
    ctx.imageSmoothingEnabled = smoothing;
  }

  drawShell(t) {
    if (this.shell <= 0) return;
    const flashing = this.invulnerableTimer > 0 && Math.trunc(this.invulnerableTimer * 12) % 2 === 0;
    for (let layer = 0; layer < this.shell; layer++) {
      const grow = 16 + layer * 10;
      const alpha = flashing ? 255 : Math.trunc(185 + 55 * Math.sin(t * 3 + layer));
      const width = this.halfWidth * 2 + grow;
      const height = this.halfHeight * 2 + grow;
      ringEllipse(this.x - width / 2, this.y - height / 2, width, height, SHELL_COLOR, 2, alpha / 2 / 255);
      for (let segment = 0; segment < 7; segment++) {
        const start = (segment / 7) * TAU + t * (0.6 + layer * 0.3);
        drawArc(this.x, this.y, width / 2 - 1.5, height / 2 - 1.5, start, start + 0.62, SHELL_COLOR, 3, alpha / 255);
      }
    }
  }

  drawZeppelinGauge(cx, cy) {
    const dx = cx - 16;
    const dy = cy - 7;
    fillRect(dx, dy, 33, 13, [18, 30, 36], 3);
    ringRect(dx, dy, 33, 13, BACTERIUM_OUTLINE, 1, 3);
    const color = gvBarColor(this.gvLevel);
    const fillWidth = Math.trunc(((33 - 4) * this.gvLevel) / 100.0);
    if (fillWidth > 0) fillRect(dx + 2, dy + 2, fillWidth, 13 - 4, darken(color, 0.55));
    drawText(GAUGE_FONT, `${this.gvLevel.toFixed(0)}%`, lighten(color, 0.5), dx + 16.5, dy + 6.5, 'center', false);
  }

  getRect() {
    return new Rect(
      Math.trunc(this.x - this.halfWidth),
      Math.trunc(this.y - this.halfHeight),
      this.halfWidth * 2,
      this.halfHeight * 2,
    );
  }
}

// ---- character sprites (drawn around a centre point in the current transform)

function drawZeppelin(cx, cy) {
  const base = BACTERIUM_COLOR;
  const fin = darken(base, 0.3);
  for (const sign of [-1, 1]) {
    const points = [
      [cx - 13, cy + sign * 4],
      [cx - 24, cy + sign * 13],
      [cx - 20, cy + sign * 2],
    ];
    fillPoly(points, fin);
    ringPoly(points, BACTERIUM_OUTLINE, 1);
  }

  fillRect(cx - 7, cy + 9, 14, 6, darken(base, 0.55), 3);
  fillRect(cx - 4, cy + 11, 3, 2, [160, 220, 240]);
  fillRect(cx + 1, cy + 11, 3, 2, [160, 220, 240]);

  fillEllipse(cx - 20, cy - 11, 40, 22, darken(base, 0.22));
  fillEllipse(cx - 19, cy - 11, 38, 17, base);
  fillEllipse(cx - 12, cy - 9, 20, 5, lighten(base, 0.5));
  ringEllipse(cx - 8, cy - 11, 16, 22, darken(base, 0.18), 1);
  ringEllipse(cx - 20, cy - 11, 40, 22, BACTERIUM_OUTLINE, 2);
}

function flagellum(points, color) {
  drawPolyline(points, color, 2);
}

function drawEcoli(cx, cy, t) {
  const color = ECOLI_COLOR;
  const tail = darken(color, 0.35);
  [-7, 0, 7].forEach((offset, index) => {
    const points = [];
    for (let step = 0; step < 9; step++) {
      points.push([cx - 17 - step * 1.4, cy + offset + step * 0.45 + Math.sin(t * 14 - step * 0.9 + index) * 2.0]);
    }
    flagellum(points, tail);
  });

  fillRect(cx - 20, cy - 13, 40, 26, darken(color, 0.3), 13);
  fillRect(cx - 18, cy - 12, 36, 20, color, 10);
  fillRect(cx - 12, cy - 9, 22, 4, lighten(color, 0.45), 2);
  ringRect(cx - 20, cy - 13, 40, 26, BACTERIUM_OUTLINE, 2, 13);
}

function drawHek(cx, cy, t) {
  const points = [];
  for (let step = 0; step < 28; step++) {
    const angle = (step / 28) * TAU;
    const radius = 19 + Math.sin(angle * 5 + t * 3) * 1.2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  fillPoly(points, darken(HEK_COLOR, 0.25));
  fillCircle(cx - 2, cy - 2, 16, HEK_COLOR);
  fillCircle(cx - 8, cy - 8, 5, lighten(HEK_COLOR, 0.35));
  fillCircle(cx + 4, cy + 2, 8, darken(HEK_NUCLEUS, 0.2));
  fillCircle(cx + 3, cy + 1, 7, HEK_NUCLEUS);
  fillCircle(cx + 5, cy + 3, 2, darken(HEK_NUCLEUS, 0.45));
  ringPoly(points, BACTERIUM_OUTLINE, 2);
}

function drawAnabaena(cx, cy, t) {
  const color = ANABAENA_COLOR;
  const cellY = (index) => cy + Math.trunc(Math.sin(t * 2 + index) * 1.5);
  [-14, 0, 14].forEach((dx, index) => {
    const y = cy + Math.sin(t * 2 + index) * 1.5;
    fillCircle(cx + dx, y, 11, darken(color, 0.3));
    fillCircle(cx + dx - 1, y - 1, 9, color);
    fillCircle(cx + dx - 4, y - 4, 3, lighten(color, 0.4));
  });
  // Thicker heterocyst at the end of the filament.
  const hy = cy + Math.sin(t * 2 + 2) * 1.5;
  fillCircle(cx + 14, hy, 7, lighten(color, 0.45));
  ringCircle(cx + 14, hy, 7, darken(color, 0.45), 2);
  [-14, 0, 14].forEach((dx, index) => {
    ringCircle(cx + dx, cellY(index), 11, darken(color, 0.5), 2);
  });
}

function drawYeast(cx, cy, t) {
  const color = YEAST_COLOR;
  // A daughter bud pinching off the mother cell.
  const budX = cx + 13;
  const budY = cy - 11 + Math.trunc(Math.sin(t * 2) * 1.5);
  fillCircle(budX, budY, 9, darken(color, 0.3));
  fillCircle(budX - 1, budY - 1, 7, color);

  fillCircle(cx - 3, cy + 2, 18, darken(color, 0.3));
  fillCircle(cx - 4, cy, 15, color);
  fillCircle(cx - 10, cy - 7, 5, lighten(color, 0.45));
  fillCircle(cx + 1, cy + 5, 6, YEAST_VACUOLE);
  ringCircle(cx + 1, cy + 5, 6, darken(YEAST_VACUOLE, 0.3), 1);
  // Bud scars left over from earlier divisions.
  for (const [dx, dy] of [[-14, 8], [-9, -13]]) ringCircle(cx + dx, cy + dy, 3, darken(color, 0.4), 1);
  ringCircle(cx - 3, cy + 2, 18, darken(color, 0.55), 2);
  ringCircle(budX, budY, 9, darken(color, 0.55), 2);
}

function drawSalmonella(cx, cy, t) {
  const color = SALMONELLA_COLOR;
  const tail = darken(color, 0.3);
  // Peritrichous flagella: they sit all around the rod, not just at the back.
  const anchors = [[-16, -9, -1], [-17, 8, 1], [2, -12, -1], [6, 12, 1], [-19, 0, 0]];
  anchors.forEach(([ax, ay, direction], index) => {
    const points = [];
    for (let step = 0; step < 8; step++) {
      points.push([
        cx + ax - step * 1.9,
        cy + ay + direction * step * 0.9 + Math.sin(t * 12 - step * 0.8 + index) * 2.2,
      ]);
    }
    flagellum(points, tail);
  });

  fillRect(cx - 19, cy - 12, 38, 24, darken(color, 0.32), 12);
  fillRect(cx - 17, cy - 11, 34, 18, color, 9);
  fillRect(cx - 11, cy - 8, 20, 4, lighten(color, 0.5), 2);
  ringRect(cx - 19, cy - 12, 38, 24, BACTERIUM_OUTLINE, 2, 12);
}

function drawSerratia(cx, cy, t) {
  const color = SERRATIA_COLOR;
  const tail = darken(color, 0.35);
  [[-18, -7, -1], [-19, 0, 0], [-18, 7, 1]].forEach(([ax, ay, direction], index) => {
    const points = [];
    for (let step = 0; step < 9; step++) {
      points.push([
        cx + ax - step * 1.5,
        cy + ay + direction * step * 0.7 + Math.sin(t * 13 - step * 0.9 + index) * 2.0,
      ]);
    }
    flagellum(points, tail);
  });

  fillRect(cx - 20, cy - 13, 40, 26, darken(color, 0.4), 13);
  fillRect(cx - 18, cy - 12, 36, 20, color, 10);
  fillRect(cx - 12, cy - 9, 22, 4, lighten(color, 0.5), 2);
  // Prodigiosin: the red pigment Serratia is known for, as dark granules.
  for (const [dx, dy] of [[-11, 3], [-3, 5], [6, 3], [13, 5]]) fillCircle(cx + dx, cy + dy, 2, darken(color, 0.5));
  ringRect(cx - 20, cy - 13, 40, 26, BACTERIUM_OUTLINE, 2, 13);
}

function drawHalobacterium(cx, cy, t) {
  const color = HALO_COLOR;
  // Slightly curved rod, the way halophilic archaea look under the scope.
  for (let step = 0; step < 9; step++) {
    const fraction = step / 8;
    const px = cx - 18 + fraction * 36;
    const py = cy + Math.sin(fraction * Math.PI) * -3 + Math.sin(t * 2) * 1.0;
    fillCircle(Math.trunc(px), Math.trunc(py), 12, darken(color, 0.32));
  }
  for (let step = 0; step < 9; step++) {
    const fraction = step / 8;
    const px = cx - 17 + fraction * 34;
    const py = cy - 1 + Math.sin(fraction * Math.PI) * -3 + Math.sin(t * 2) * 1.0;
    fillCircle(Math.trunc(px), Math.trunc(py), 9, color);
    if (step % 2 === 0) fillCircle(Math.trunc(px), Math.trunc(py - 4), 2, lighten(color, 0.4));
  }
}

function drawBiobrick(cx, cy, color = BIOBRICK_COLOR) {
  // Studs on top, then the brick wall below, like a plastic building block.
  // A sealed, opaque casing: no gas vesicles are ever shown through it.
  for (const dx of [-13, 0, 13]) {
    const sx = cx + dx - 6;
    const sy = cy - 17;
    fillEllipse(sx, sy + 2, 12, 7, darken(color, 0.4));
    fillEllipse(sx, sy, 12, 7, color);
    fillEllipse(sx + 2, sy + 1, 8, 3, lighten(color, 0.4));
  }
  const bx = cx - 20;
  const by = cy - 12;
  fillRect(bx, by, 40, 24, darken(color, 0.35), 2);
  fillRect(bx, by, 40, 24 - 5, color, 2);
  fillRect(bx + 3, by + 2, 40 - 6, 3, lighten(color, 0.45));
  ringRect(bx, by, 40, 24, darken(color, 0.55), 2, 2);
}

/** An original ring-of-bricks design in the iGEM palette; not the iGEM logo itself. */
function drawIgemLegacy(cx, cy, t) {
  const palette = [
    [232, 181, 61], [235, 80, 80], [95, 215, 205],
    [120, 240, 120], [150, 205, 235], [235, 225, 130],
  ];
  ringCircle(cx, cy, 21, darken([232, 181, 61], 0.55), 2);
  palette.forEach((color, index) => {
    const angle = t * 0.6 + (index / palette.length) * TAU;
    const px = cx + Math.cos(angle) * 15;
    const py = cy + Math.sin(angle) * 15;
    fillRect(px - 5.5, py - 4.5, 11, 9, darken(color, 0.4), 2);
    fillRect(px - 4, py - 3, 8, 6, color, 1);
  });
  const corePulse = 0.5 + 0.5 * Math.sin(t * 3);
  fillCircle(cx, cy, 6, lerpColor([232, 181, 61], WHITE, corePulse * 0.4));
  ringCircle(cx, cy, 6, darken([232, 181, 61], 0.4), 1);
}

function drawPurified(cx, cy, t, visibleGvs) {
  GV_POSITIONS.forEach(([dx, dy], index) => {
    const bob = Math.sin(t * 2.5 + index * 1.3) * 1.2;
    const rx = cx + dx - 3;
    const ry = cy + dy - 6 + bob;
    if (index < visibleGvs) {
      fillEllipse(rx, ry, 7, 13, GV_COLOR);
      ringEllipse(rx, ry, 7, 13, GV_OUTLINE, 1);
      drawLine(rx + 2, ry + 3, rx + 2, ry + 6, WHITE, 1);
    } else {
      ringEllipse(rx, ry, 7, 13, [110, 165, 185, 170], 1);
    }
  });
}

// ---------------------------------------------------------------- obstacles

/** A stone pillar texture, cached on its own canvas. */
function makeStonePillar(width, height, capAtBottom, seed, base) {
  const element = makeCanvas(width, height);
  renderOnto(element, () => {
    const radius = Math.min(16, Math.floor(height / 2));
    // Round the two outer corners (the ones facing the screen edge).
    ctx.beginPath();
    if (capAtBottom) {
      ctx.moveTo(0, 0);
      ctx.lineTo(width, 0);
      ctx.lineTo(width, height - radius);
      ctx.arcTo(width, height, width - radius, height, radius);
      ctx.lineTo(radius, height);
      ctx.arcTo(0, height, 0, height - radius, radius);
    } else {
      ctx.moveTo(0, height);
      ctx.lineTo(width, height);
      ctx.lineTo(width, radius);
      ctx.arcTo(width, 0, width - radius, 0, radius);
      ctx.lineTo(radius, 0);
      ctx.arcTo(0, 0, 0, radius, radius);
    }
    ctx.closePath();
    ctx.clip();

    const columnColor = (x) => {
      const shade = clamp(1.0 - Math.abs(x / (width - 1) - 0.35) * 1.6, 0.0, 1.0);
      return lerpColor(darken(base, 0.6), lighten(base, 0.18), shade);
    };
    for (let x = 0; x < width; x++) fillRect(x, 0, 1, height, columnColor(x));

    const rng = seededRandom(seed);
    for (let spot = 0; spot < Math.max(2, Math.floor(height / 16)); spot++) {
      const spotX = rng.randint(6, width - 7);
      const spotY = rng.randint(0, height - 1);
      const column = columnColor(spotX);
      const color = rng.random() < 0.7 ? darken(column, 0.28) : lerpColor(column, [120, 190, 110], 0.35);
      fillCircle(spotX, spotY, rng.randint(2, 6), color);
    }

    const capHeight = Math.min(16, height);
    const capY = capAtBottom ? height - capHeight : 0;
    for (let x = 0; x < width; x++) fillRect(x, capY, 1, capHeight, lerpColor(columnColor(x), [150, 205, 150], 0.35));
    const edgeY = capAtBottom ? capY - 1 : capY + capHeight;
    fillRect(0, edgeY - 1, width, 2, darken(base, 0.55));
  });
  return element;
}

class Obstacle {
  constructor(x, gapSize, pillarColor = OBSTACLE_COLOR) {
    this.x = x;
    this.width = 70;
    const margin = 100;
    this.gapSize = gapSize;
    this.gapY = randint(margin + Math.floor(gapSize / 2), HEIGHT - margin - Math.floor(gapSize / 2));
    this.passed = false;
    const gapTop = this.gapY - Math.floor(this.gapSize / 2);
    const gapBottom = this.gapY + Math.floor(this.gapSize / 2);
    const seed = Math.random();
    this.topSurface = makeStonePillar(this.width, gapTop, true, seed, pillarColor);
    this.bottomSurface = makeStonePillar(this.width, HEIGHT - gapBottom, false, seed + 1, pillarColor);
  }

  update(speed, frameScale) {
    this.x -= speed * frameScale;
  }

  draw() {
    const gapBottom = this.gapY + Math.floor(this.gapSize / 2);
    const x = Math.trunc(this.x);
    ctx.drawImage(this.topSurface, x, 0);
    ctx.drawImage(this.bottomSurface, x, gapBottom);
  }

  collidesWith(bacterium) {
    const gapTop = this.gapY - Math.floor(this.gapSize / 2);
    const gapBottom = this.gapY + Math.floor(this.gapSize / 2);
    const x = Math.trunc(this.x);
    const rect = bacterium.getRect();
    return (
      rect.overlaps(new Rect(x, 0, this.width, gapTop))
      || rect.overlaps(new Rect(x, gapBottom, this.width, HEIGHT - gapBottom))
    );
  }

  overlaps() {
    return false;
  }

  offScreen() {
    return this.x + this.width < 0;
  }
}

// ------------------------------------------------------------------ bonuses

/** Anything floating in the water that the player can pick up. */
class Bonus {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.phase = rand(0, TAU);
    this.drawY = y;
    this.radius = 14;
    this.label = '';
    this.labelColor = WHITE;
  }

  update(speed, frameScale) {
    this.x -= speed * frameScale;
    this.drawY = this.y + Math.sin(now() * 2 + this.phase) * 5;
  }

  /** Antibody pulls anything magnetic in: coins and GvpC alike. */
  applyMagnet(bacterium, frameScale) {
    if (bacterium.module !== 'antibody') return;
    const dx = bacterium.x - this.x;
    const dy = bacterium.y - this.drawY;
    const distance = Math.hypot(dx, dy);
    const radius = bacterium.magnetRadius;
    if (distance > 0 && distance < radius) {
      const pull = MAGNET_SPEED * frameScale * (1 - distance / radius);
      this.x += (dx / distance) * pull;
      this.y += (dy / distance) * pull;
      this.drawY += (dy / distance) * pull;
    }
  }

  drawLabel(cx, cy) {
    if (!this.label) return;
    drawText(GAUGE_FONT, this.label, this.labelColor, cx, cy + this.radius + 4, 'midtop', false);
  }

  collectedBy(bacterium) {
    return circleHitsRect(this.x, this.drawY, this.radius + 6, bacterium.getRect());
  }

  offScreen() {
    return this.x + this.radius < 0;
  }
}

/** Collectible GvpC helix: binding it reinforces the shell for one hit. */
class GvpC extends Bonus {
  constructor(x, y) {
    super(x, y);
    this.radius = GVPC_RADIUS;
    this.label = 'GvpC';
    this.labelColor = GVPC_CORE;
  }

  update(speed, frameScale, bacterium) {
    super.update(speed, frameScale);
    this.applyMagnet(bacterium, frameScale);
  }

  draw() {
    const t = now();
    const cx = Math.trunc(this.x);
    const cy = Math.trunc(this.drawY);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + this.phase);
    glow(cx, cy, this.radius * 2, GVPC_COLOR, 70 + 45 * pulse);
    drawHelix(cx, cy, 26, 2.2, GVPC_COLOR, GVPC_CORE, t * 2 + this.phase);
    this.drawLabel(cx, cy);
  }

  apply(bacterium) {
    bacterium.reinforce();
  }
}

/** SpyCatcher fusion that clips onto the SpyTag of the shell. */
class SpyCatcherModule extends Bonus {
  constructor(x, y, kind) {
    super(x, y);
    this.radius = 15;
    this.kind = kind;
    this.label = MODULE_SHORT[kind];
    this.labelColor = moduleColor(kind);
  }

  draw() {
    const t = now();
    const cx = Math.trunc(this.x);
    const cy = Math.trunc(this.drawY);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + this.phase);
    const color = moduleColor(this.kind);
    glow(cx, cy, this.radius * 2, color, 70 + 50 * pulse);
    if (this.kind === 'gfp') drawGfpBarrel(cx, cy, 9, t);
    else if (this.kind === 'granzyme') drawGranzyme(cx, cy, 11, t * 1.5);
    else if (this.kind === 'ampicillin') drawAmpicillin(cx, cy, 10, t * 1.2);
    else drawAntibody(cx, cy, 11, -Math.PI / 2 + Math.sin(t * 2) * 0.3);
    // The SpyTag hook that snaps onto the vesicle shell.
    drawArc(cx, cy, 14, 14, t * 1.5, t * 1.5 + 1.1, lighten(color, 0.4), 2);
    this.drawLabel(cx, cy);
  }

  apply(bacterium) {
    bacterium.bindModule(this.kind);
  }
}

/** A small golden protein: the run's currency pickup. */
class Coin extends Bonus {
  constructor(x, y) {
    super(x, y);
    this.radius = COIN_RADIUS;
  }

  update(speed, frameScale, bacterium) {
    super.update(speed, frameScale);
    this.applyMagnet(bacterium, frameScale);
  }

  draw() {
    const t = now();
    const cx = Math.trunc(this.x);
    const cy = Math.trunc(this.drawY);
    const r = this.radius;
    glow(cx, cy, r * 2, COIN_COLOR, 55);
    // Three fused lobes, like a small folded protein catching the light.
    const wobble = Math.sin(t * 3 + this.phase) * 1.2;
    const lobes = [
      [-r * 0.38, -r * 0.28 + wobble, r * 0.62],
      [r * 0.36, -r * 0.32 + wobble, r * 0.56],
      [0, r * 0.4 + wobble, r * 0.62],
    ];
    for (const [dx, dy, lobe] of lobes) {
      fillCircle(cx + dx, cy + dy, Math.trunc(lobe) + 1, COIN_EDGE);
      fillCircle(cx + dx, cy + dy, Math.trunc(lobe), COIN_COLOR);
    }
    fillCircle(cx - r * 0.25, cy - r * 0.45 + wobble, 2, lighten(COIN_COLOR, 0.65));
  }

  apply() {
    return 'coin';
  }
}

/** A rare iGEM special prize, tucked hard against a gap's edge. */
class SpecialPrize extends Bonus {
  constructor(x, y) {
    super(x, y);
    this.radius = 13;
    this.label = 'iGEM Prize';
    this.labelColor = [232, 181, 61];
  }

  update(speed, frameScale) {
    // Barely any bob: it has to stay exactly where the tight spot put it.
    this.x -= speed * frameScale;
    this.drawY = this.y + Math.sin(now() * 2 + this.phase) * 2;
  }

  draw() {
    const t = now();
    const cx = Math.trunc(this.x);
    const cy = Math.trunc(this.drawY);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4 + this.phase);
    const gold = [232, 181, 61];
    glow(cx, cy, this.radius * 3, [255, 225, 140], 90 + 60 * pulse);

    for (const side of [-1, 1]) {
      fillPoly(
        [
          [cx + side * 2, cy + 3],
          [cx + side * 9, cy + 3],
          [cx + side * 6, cy + this.radius + 11],
        ],
        [200, 60, 70],
      );
    }

    fillCircle(cx, cy, this.radius + 2, darken(gold, 0.45));
    fillCircle(cx, cy, this.radius, lerpColor(gold, WHITE, pulse * 0.3));

    const points = [];
    for (let step = 0; step < 10; step++) {
      const angle = -Math.PI / 2 + (step * Math.PI) / 5;
      const reach = this.radius * (step % 2 === 0 ? 0.78 : 0.34);
      points.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]);
    }
    fillPoly(points, darken(gold, 0.55));
    this.drawLabel(cx, cy);
  }

  apply() {
    return 'special_prize';
  }
}

// ------------------------------------------------------------------ hazards

/** A foreign cell swimming against the current, straight at the player. */
class DriftingCell {
  constructor(x, y, kind) {
    this.kind = kind;
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.phase = rand(0, TAU);
    if (kind === 'macrophage') {
      this.radius = 20;
      this.extraSpeed = 1.1;
      this.amplitude = rand(10, 26);
      this.color = [212, 118, 162];
    } else {
      this.radius = 14;
      this.extraSpeed = 2.2;
      this.amplitude = rand(24, 46);
      this.color = [150, 205, 185];
    }
    this.wobbleSpeed = rand(1.1, 1.9);
    this.killed = false;
    this.deadTimer = 0.0;
  }

  kill() {
    this.killed = true;
    this.deadTimer = 0.35;
  }

  alive() {
    return !this.killed;
  }

  finished() {
    return this.killed && this.deadTimer <= 0;
  }

  update(speed, frameScale) {
    if (this.killed) {
      this.deadTimer -= frameScale / FPS;
      return;
    }
    this.x -= (speed + this.extraSpeed) * frameScale;
    this.y = clamp(
      this.baseY + Math.sin(now() * this.wobbleSpeed + this.phase) * this.amplitude,
      this.radius + 30,
      HEIGHT - this.radius - 30,
    );
  }

  draw() {
    const t = now();
    const cx = Math.trunc(this.x);
    const cy = Math.trunc(this.y);
    if (this.killed) {
      this.drawLysis(cx, cy);
      return;
    }
    // A warning halo keeps them readable while the lamp flickers.
    glow(cx, cy, this.radius * 2, [255, 120, 90], 55);

    if (this.kind === 'macrophage') {
      const points = [];
      for (let step = 0; step < 20; step++) {
        const angle = (step / 20) * TAU;
        const reach = this.radius + Math.sin(angle * 3 + t * 2 + this.phase) * 4;
        points.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]);
      }
      fillPoly(points, darken(this.color, 0.35));
      fillCircle(cx - 2, cy - 2, this.radius - 5, this.color);
      ringPoly(points, darken(this.color, 0.6), 2);
      for (const [dx, dy] of [[-6, 2], [4, -5], [6, 6]]) fillCircle(cx + dx, cy + dy, 3, darken(this.color, 0.5));
    } else {
      for (let step = 0; step < 16; step++) {
        const angle = (step / 16) * TAU;
        const beat = Math.sin(t * 9 + step) * 2;
        drawLine(
          cx + Math.cos(angle) * (this.radius - 1), cy + Math.sin(angle) * (this.radius + 3),
          cx + Math.cos(angle) * (this.radius + 6 + beat), cy + Math.sin(angle) * (this.radius + 9 + beat),
          darken(this.color, 0.2), 2,
        );
      }
      const bw = this.radius * 2;
      const bh = this.radius * 2 + 6;
      fillEllipse(cx - bw / 2, cy - bh / 2, bw, bh, darken(this.color, 0.3));
      fillEllipse(cx - bw / 2 + 2.5, cy - bh / 2 + 3, bw - 5, bh - 6, this.color);
      fillEllipse(cx - 6, cy - 7, 6, 5, lighten(this.color, 0.45));
      fillCircle(cx + 3, cy + 2, 4, darken(this.color, 0.6));
    }
  }

  drawLysis(cx, cy) {
    const progress = 1 - Math.max(0.0, this.deadTimer) / 0.35;
    const alpha = 220 * (1 - progress);
    ringCircle(cx, cy, Math.trunc(this.radius * (1 + progress)), GRANZYME_COLOR, 3, alpha / 2 / 255);
    for (let step = 0; step < 9; step++) {
      const angle = (step / 9) * TAU + this.phase;
      const reach = this.radius * (0.5 + progress * 2);
      fillCircle(
        cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach,
        Math.max(1, Math.trunc(5 * (1 - progress))), this.color, alpha / 255,
      );
    }
  }

  collidesWith(bacterium) {
    return this.alive() && circleHitsRect(this.x, this.y, this.radius, bacterium.getRect());
  }

  offScreen() {
    return this.x + this.radius < 0 || this.finished();
  }
}

function nearestAliveHazard(x, y, hazards) {
  let best = null;
  let bestDistance = Infinity;
  for (const hazard of hazards) {
    if (!hazard.alive()) continue;
    const distance = (hazard.x - x) ** 2 + (hazard.y - y) ** 2;
    if (distance < bestDistance) {
      best = hazard;
      bestDistance = distance;
    }
  }
  return best;
}

/** One fired dose: flies straight ahead, or homes in once upgraded. */
class AmpicillinShot {
  constructor(x, y, homing) {
    this.radius = 5;
    this.x = x;
    this.y = y;
    this.homing = homing;
    this.vx = AMPICILLIN_SHOT_SPEED;
    this.vy = 0.0;
  }

  update(frameScale, hazards) {
    if (this.homing) {
      const target = nearestAliveHazard(this.x, this.y, hazards);
      if (target !== null) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.hypot(dx, dy) || 1.0;
        const desiredVx = (dx / distance) * AMPICILLIN_SHOT_SPEED;
        const desiredVy = (dy / distance) * AMPICILLIN_SHOT_SPEED;
        const turn = Math.min(1.0, AMPICILLIN_HOMING_TURN_RATE * frameScale);
        this.vx += (desiredVx - this.vx) * turn;
        this.vy += (desiredVy - this.vy) * turn;
        const speed = Math.hypot(this.vx, this.vy) || 1.0;
        this.vx = (this.vx / speed) * AMPICILLIN_SHOT_SPEED;
        this.vy = (this.vy / speed) * AMPICILLIN_SHOT_SPEED;
      }
    }
    this.x += this.vx * frameScale;
    this.y += this.vy * frameScale;
  }

  draw() {
    const angle = Math.atan2(this.vy, this.vx);
    drawLine(
      this.x - Math.cos(angle) * 14, this.y - Math.sin(angle) * 14, this.x, this.y,
      darken(AMPICILLIN_COLOR, 0.3), 2,
    );
    drawAmpicillin(this.x, this.y, this.radius, angle);
  }

  collidesWith(hazard) {
    return Math.hypot(this.x - hazard.x, this.y - hazard.y) < this.radius + hazard.radius;
  }

  offScreen() {
    return (
      this.x - this.radius > WIDTH
      || this.x + this.radius < 0
      || this.y + this.radius < 0
      || this.y - this.radius > HEIGHT
    );
  }
}

/** The soft spot on the dendritic cell. Shoot it while it is exposed. */
class BossWeakpoint {
  constructor() {
    this.radius = 17;
    this.x = 0.0;
    this.y = 0.0;
    this.exposed = false;
    this.hit = false;
  }

  alive() {
    return this.exposed && !this.hit;
  }

  kill() {
    this.hit = true;
  }
}

// -------------------------------------------------------------- transducers

class Transducer {
  constructor(x, kind, collapseNumber = 1) {
    this.x = x;
    this.width = TRANSDUCER_WIDTH;
    this.kind = kind;
    this.collapseFraction = transducerStrength(collapseNumber);
    this.triggered = false;
    this.passed = false;
  }

  update(speed, frameScale) {
    this.x -= speed * frameScale;
  }

  draw() {
    const t = now();
    const x = Math.trunc(this.x);
    const fieldColor = this.kind === 'collapse' ? TRANSDUCER_COLOR : TRANSDUCER_PUSH_COLOR;
    const coreColor = this.kind === 'collapse' ? TRANSDUCER_CORE : TRANSDUCER_PUSH_CORE;
    const strength = this.triggered ? 0.5 : 1.0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);

    // The field always covers the complete screen height.
    fillRect(x, 0, this.width, HEIGHT, fieldColor, 0, ((30 + 25 * pulse) * strength) / 255);
    for (let i = 0; i < 7; i++) {
      const alpha = ((110 - i * 15) * strength) / 255;
      fillRect(x + i, 0, 1, HEIGHT, coreColor, 0, alpha);
      fillRect(x + this.width - 1 - i, 0, 1, HEIGHT, coreColor, 0, alpha);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, this.width, HEIGHT);
    ctx.clip();
    const spacing = 34;
    const travel = (t * 70) % spacing;
    const waveAlpha = (150 * strength) / 255;
    for (let baseY = -spacing; baseY < HEIGHT + spacing; baseY += spacing) {
      let y;
      let bend;
      if (this.kind === 'top') {
        y = baseY + travel;
        bend = 1;
      } else if (this.kind === 'bottom') {
        y = baseY - travel + spacing;
        bend = -1;
      } else if (baseY < HEIGHT / 2) {
        y = baseY + travel;
        bend = 1;
      } else {
        y = baseY - travel + spacing;
        bend = -1;
      }
      if (this.kind === 'collapse' && ((bend === 1 && y > HEIGHT / 2) || (bend === -1 && y < HEIGHT / 2))) continue;
      const points = [];
      for (let px = 6; px < this.width - 5; px += 4) {
        points.push([x + px, y + Math.sin((px / (this.width - 1)) * Math.PI) * 7 * bend]);
      }
      drawPolyline(points, coreColor, 2, waveAlpha);
    }
    ctx.restore();

    if (this.kind === 'collapse' || this.kind === 'top') this.drawEmitter(true, fieldColor, coreColor, pulse);
    if (this.kind === 'collapse' || this.kind === 'bottom') this.drawEmitter(false, fieldColor, coreColor, pulse);

    const arrowShift = (t * 45) % 92;
    let labelText;
    if (this.kind === 'top') {
      for (let y = 0; y < HEIGHT; y += 92) {
        const arrowY = y + arrowShift;
        if (arrowY > 60 && arrowY < HEIGHT - 30) Transducer.drawArrow(x + Math.floor(this.width / 2), arrowY, 1, coreColor);
      }
      labelText = 'PRESSURE DOWN';
    } else if (this.kind === 'bottom') {
      for (let y = 0; y < HEIGHT; y += 92) {
        const arrowY = HEIGHT - y - arrowShift;
        if (arrowY > 30 && arrowY < HEIGHT - 60) Transducer.drawArrow(x + Math.floor(this.width / 2), arrowY, -1, coreColor);
      }
      labelText = 'PRESSURE UP';
    } else {
      labelText = `GV -${(this.collapseFraction * 100).toFixed(0)}%`;
    }

    // The label runs bottom-to-top along the field, inside a small pill.
    const textW = textWidth(SMALL_FONT, labelText);
    const textH = fontMetrics(SMALL_FONT).height;
    const centerX = this.x + this.width / 2;
    const centerY = HEIGHT / 2;
    const pill = new Rect(centerX - textH / 2 - 5, centerY - textW / 2 - 8, textH + 10, textW + 16);
    fillRect(pill.x, pill.y, pill.w, pill.h, PANEL, 12, 190 / 255);
    ringRect(pill.x, pill.y, pill.w, pill.h, coreColor, 1, 12, 150 / 255);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-Math.PI / 2);
    drawText(SMALL_FONT, labelText, WHITE, 0, 0, 'center', false);
    ctx.restore();
  }

  drawEmitter(top, color, core, pulse) {
    const x = Math.trunc(this.x);
    const emitterHeight = 28;
    const y = top ? 0 : HEIGHT - emitterHeight;
    const bx = x - 6;
    const bw = this.width + 12;
    fillRect(bx, y, bw, emitterHeight, darken(color, 0.55), 6);
    fillRect(bx + 2, y + 2, bw - 4, emitterHeight - 4, darken(color, 0.15), 5);
    fillRect(bx + 2 + 3, y + 2 + 2, bw - 4 - 6, 5, lighten(color, 0.3), 3);

    const lensY = top ? y + emitterHeight - 9 : y + 3;
    const lensX = x + 8;
    const lensW = this.width - 16;
    const glowW = lensW + 30;
    fillEllipse(lensX + lensW / 2 - glowW / 2, lensY + 3 - 20, glowW, 40, core, (60 + 60 * pulse) / 255);
    fillRect(lensX, lensY, lensW, 6, lerpColor(core, WHITE, pulse), 3);
  }

  static drawArrow(x, y, direction, color) {
    const tipY = y + direction * 13;
    const points = [
      [x, tipY + direction * 2],
      [x - 9, tipY - direction * 8],
      [x - 3, tipY - direction * 8],
      [x - 3, y - direction * 12],
      [x + 3, y - direction * 12],
      [x + 3, tipY - direction * 8],
      [x + 9, tipY - direction * 8],
    ];
    fillPoly(points, color);
    ringPoly(points, darken(color, 0.5), 1);
  }

  collidesWith() {
    return false;
  }

  overlaps(bacterium) {
    return bacterium.getRect().overlaps(new Rect(Math.trunc(this.x), 0, this.width, HEIGHT));
  }

  offScreen() {
    return this.x + this.width < 0;
  }
}

// --------------------------------------------------------------------- boss

const bossHitsNeeded = (stage) => Math.min(BOSS_MAX_HITS, BOSS_BASE_HITS + stage - 1);

/** Spins up a fresh dendritic-cell encounter. `nextScore` is the milestone that triggered it. */
function startBoss(nextScore) {
  const stage = Math.max(1, Math.floor(nextScore / BOSS_SCORE_INTERVAL));
  return {
    stage,
    phase: 'enter',
    timer: BOSS_ENTER_SECONDS,
    clock: 0.0,
    x: WIDTH + BOSS_RADIUS * 2,
    y: HEIGHT / 2,
    hits: 0,
    hitsNeeded: bossHitsNeeded(stage),
    weakpoint: new BossWeakpoint(),
    weakTimer: 1.5,
    weakAngle: 0.0,
    ammoTimer: BOSS_AMMO_REGEN_SECONDS,
    attackTimer: 2.0,
    tentacles: [],
    queuedTentacles: [],
    spitFlash: 0.0,
    hurtFlash: 0.0,
  };
}

/** Things a shot may hit besides cells: the weak spot, while it is exposed. */
function bossTargets(boss) {
  if (boss !== null && boss.weakpoint.alive()) return [boss.weakpoint];
  return [];
}

/** The body soaks up any shot that isn't a weak-spot hit. */
function bossAbsorbs(boss, shot) {
  if (boss === null || boss.phase === 'defeated') return false;
  return Math.hypot(shot.x - boss.x, shot.y - boss.y) < BOSS_RADIUS + shot.radius;
}

/** Current reach of a striking tentacle (0 while warning). */
function tentacleLength(tentacle) {
  if (tentacle.state === 'strike') {
    return BOSS_TENTACLE_LENGTH * clamp(tentacle.t / BOSS_TENTACLE_STRIKE_SECONDS, 0.0, 1.0);
  }
  if (tentacle.state === 'hold') return BOSS_TENTACLE_LENGTH;
  if (tentacle.state === 'retract') {
    return BOSS_TENTACLE_LENGTH * (1 - clamp(tentacle.t / BOSS_TENTACLE_RETRACT_SECONDS, 0.0, 1.0));
  }
  return 0.0;
}

function tentacleSegment(tentacle, length) {
  const [dx, dy] = tentacle.dir;
  const [rx, ry] = tentacle.root;
  return [[rx, ry], [rx + dx * length, ry + dy * length]];
}

/** True while any tentacle is out and touching the bacterium. */
function bossHitsPlayer(boss, bacterium) {
  if (boss === null) return false;
  const rect = bacterium.getRect().inflate(BOSS_TENTACLE_HIT_WIDTH, BOSS_TENTACLE_HIT_WIDTH);
  for (const tentacle of boss.tentacles) {
    const length = tentacleLength(tentacle);
    if (length <= 0) continue;
    const [[rx, ry], [ex, ey]] = tentacleSegment(tentacle, length);
    const steps = Math.max(2, Math.floor(length / 10));
    for (let step = 0; step <= steps; step++) {
      const fraction = step / steps;
      if (rect.contains(rx + (ex - rx) * fraction, ry + (ey - ry) * fraction)) return true;
    }
  }
  return false;
}

function bossLaunchTentacle(boss, bacterium) {
  const warn = Math.max(BOSS_TENTACLE_MIN_WARN_SECONDS, BOSS_TENTACLE_WARN_SECONDS - (boss.stage - 1) * 0.1);
  boss.tentacles.push({
    state: 'warn',
    t: 0.0,
    warn,
    root: [boss.x - BOSS_RADIUS * 0.55, boss.y + rand(-45, 45)],
    target: [bacterium.x, bacterium.y],
    dir: [-1.0, 0.0],
  });
}

function bossSpitCells(boss, hazards) {
  const count = 2 + (boss.stage >= 3 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    hazards.push(
      new DriftingCell(
        boss.x - BOSS_RADIUS + rand(-10, 20),
        clamp(boss.y + rand(-90, 90), 110, HEIGHT - 110),
        choice(HAZARD_KINDS),
      ),
    );
  }
  boss.spitFlash = 0.45;
}

/**
 * Advances the dendritic-cell fight by one frame; may add cells to `hazards`.
 * Returns 'defeated' the one frame the fight is won, else null.
 */
function updateBoss(boss, dt, hazards, bacterium) {
  boss.clock += dt;
  boss.timer -= dt;
  boss.spitFlash = Math.max(0.0, boss.spitFlash - dt);
  boss.hurtFlash = Math.max(0.0, boss.hurtFlash - dt);
  boss.y = HEIGHT / 2 + Math.sin(boss.clock * 0.8) * 35;

  // Ampicillin is part of the fight: it can't run dry for good.
  bacterium.infiniteAmpicillin = true;
  if (bacterium.module !== 'ampicillin') {
    bacterium.module = 'ampicillin';
    bacterium.ammo = 0;
  }
  boss.ammoTimer -= dt;
  if (boss.ammoTimer <= 0) {
    boss.ammoTimer = BOSS_AMMO_REGEN_SECONDS;
    bacterium.ammo = Math.min(bacterium.ampicillinCapacity, bacterium.ammo + 1);
  }

  const weakpoint = boss.weakpoint;
  const angle = boss.weakAngle + Math.sin(boss.clock * 1.7) * 0.08;
  weakpoint.x = boss.x - Math.cos(angle) * BOSS_RADIUS * 1.0;
  weakpoint.y = boss.y + Math.sin(angle) * BOSS_RADIUS * 1.0;

  if (boss.phase === 'enter') {
    const progress = 1 - clamp(boss.timer / BOSS_ENTER_SECONDS, 0.0, 1.0);
    const startX = WIDTH + BOSS_RADIUS * 2;
    boss.x = startX + (BOSS_X - startX) * progress;
    if (boss.timer <= 0) boss.phase = 'fight';
  } else if (boss.phase === 'fight') {
    boss.x = BOSS_X;

    if (weakpoint.hit) {
      boss.hits += 1;
      boss.hurtFlash = 0.35;
      weakpoint.exposed = false;
      weakpoint.hit = false;
      boss.weakTimer = rand(...BOSS_WEAKPOINT_HIDDEN_SECONDS) * 0.6;
      bacterium.setNotice('Direct hit!');
      if (boss.hits >= boss.hitsNeeded) {
        boss.phase = 'defeated';
        boss.timer = BOSS_DEFEATED_SECONDS;
        boss.tentacles = [];
        boss.queuedTentacles = [];
        for (const hazard of hazards) hazard.kill();
        return null;
      }
    } else {
      boss.weakTimer -= dt;
      if (boss.weakTimer <= 0) {
        if (weakpoint.exposed) {
          weakpoint.exposed = false;
          boss.weakTimer = rand(...BOSS_WEAKPOINT_HIDDEN_SECONDS);
        } else {
          weakpoint.exposed = true;
          boss.weakAngle = rand(-0.85, 0.85);
          boss.weakTimer = BOSS_WEAKPOINT_SECONDS;
        }
      }
    }

    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      const [low, high] = BOSS_ATTACK_INTERVAL;
      boss.attackTimer = rand(low, high) * Math.max(0.65, 1.0 - (boss.stage - 1) * 0.06);
      if (Math.random() < 0.6) {
        const volleys = 1 + (boss.stage >= 3 ? 1 : 0) + (boss.stage >= 5 ? 1 : 0);
        for (let index = 0; index < volleys; index++) boss.queuedTentacles.push(index * 0.45);
      } else {
        bossSpitCells(boss, hazards);
      }
    }

    const remaining = [];
    for (let delay of boss.queuedTentacles) {
      delay -= dt;
      if (delay <= 0) bossLaunchTentacle(boss, bacterium);
      else remaining.push(delay);
    }
    boss.queuedTentacles = remaining;
  } else if (boss.phase === 'defeated') {
    weakpoint.exposed = false;
    if (boss.timer <= 0) return 'defeated';
  }

  const live = [];
  for (const tentacle of boss.tentacles) {
    tentacle.t += dt;
    if (tentacle.state === 'warn') {
      const lockAt = tentacle.warn * (1 - BOSS_TENTACLE_LOCK_FRACTION);
      if (tentacle.t < lockAt) tentacle.target = [bacterium.x, bacterium.y];
      if (tentacle.t >= tentacle.warn) {
        const dx = tentacle.target[0] - tentacle.root[0];
        const dy = tentacle.target[1] - tentacle.root[1];
        const norm = Math.hypot(dx, dy) || 1.0;
        tentacle.dir = [dx / norm, dy / norm];
        tentacle.state = 'strike';
        tentacle.t = 0.0;
      }
    } else if (tentacle.state === 'strike' && tentacle.t >= BOSS_TENTACLE_STRIKE_SECONDS) {
      tentacle.state = 'hold';
      tentacle.t = 0.0;
    } else if (tentacle.state === 'hold' && tentacle.t >= BOSS_TENTACLE_HOLD_SECONDS) {
      tentacle.state = 'retract';
      tentacle.t = 0.0;
    } else if (tentacle.state === 'retract' && tentacle.t >= BOSS_TENTACLE_RETRACT_SECONDS) {
      continue;
    }
    live.push(tentacle);
  }
  boss.tentacles = live;
  return null;
}

function drawBossBody(boss, t) {
  const x = boss.x;
  const defeated = boss.phase === 'defeated';
  let cx = Math.trunc(x);
  const cy = Math.trunc(boss.y);
  if (defeated) {
    const progress = 1 - clamp(boss.timer / BOSS_DEFEATED_SECONDS, 0.0, 1.0);
    cx = Math.trunc(x + Math.sin(t * 45) * 7 * (1 - progress));
  }
  glow(cx, cy, Math.trunc(BOSS_RADIUS * 1.5), [170, 130, 255], 55);

  let color = BOSS_COLOR;
  if (boss.hurtFlash > 0) color = lerpColor(BOSS_COLOR, WHITE, boss.hurtFlash / 0.35);
  const core = Math.trunc(BOSS_RADIUS * 0.66);
  const outline = darken(color, 0.55);

  // Dendrites: long, waving, forked arms all the way around the cell body.
  const arms = 16;
  for (let index = 0; index < arms; index++) {
    const angle = (index / arms) * TAU + Math.sin(t * 0.8 + index) * 0.05;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const nx = -uy;
    const ny = ux;
    let length = BOSS_RADIUS * (0.98 + 0.06 * Math.sin(t * 1.7 + index * 1.9));
    if (boss.spitFlash > 0 && ux < -0.6) length += 12 * (boss.spitFlash / 0.45);
    const tip = [cx + ux * length, cy + uy * length];
    const points = [];
    for (let step = 0; step < 7; step++) {
      const fraction = step / 6;
      const reach = core * 0.6 + (length - core * 0.6) * fraction;
      const wave = Math.sin(fraction * 5 - t * 2.4 + index) * 5 * fraction;
      points.push([cx + ux * reach + nx * wave, cy + uy * reach + ny * wave]);
    }
    for (let a = 0; a < points.length - 1; a++) {
      const width = Math.trunc(17 - (11 * a) / 6);
      drawLine(points[a][0], points[a][1], points[a + 1][0], points[a + 1][1], outline, width + 4, 1, 'round');
    }
    for (let a = 0; a < points.length - 1; a++) {
      const width = Math.trunc(17 - (11 * a) / 6);
      drawLine(points[a][0], points[a][1], points[a + 1][0], points[a + 1][1], color, width, 1, 'round');
    }
    // A fork at the end of each dendrite.
    const forkFrom = points[4];
    for (const side of [-1, 1]) {
      const forkAngle = angle + side * 0.5;
      const forkX = forkFrom[0] + Math.cos(forkAngle) * BOSS_RADIUS * 0.3;
      const forkY = forkFrom[1] + Math.sin(forkAngle) * BOSS_RADIUS * 0.3;
      drawLine(forkFrom[0], forkFrom[1], forkX, forkY, outline, 9, 1, 'round');
      drawLine(forkFrom[0], forkFrom[1], forkX, forkY, color, 5, 1, 'round');
    }
    fillCircle(tip[0], tip[1], 5, lighten(color, 0.25));
  }

  fillCircle(cx, cy, core + 4, outline);
  fillCircle(cx, cy, core, darken(color, 0.25));
  fillCircle(cx - 8, cy - 10, Math.trunc(core * 0.86), color);
  fillCircle(cx - 30, cy - 34, 12, lighten(color, 0.35));
  // A lobed nucleus, the way dendritic cells carry it.
  const lobes = [[-26, 8, 26], [-2, 16, 22], [-12, -14, 20]];
  for (const [dx, dy, radius] of lobes) fillCircle(cx + dx, cy + dy, radius, darken(color, 0.55));
  for (const [dx, dy, radius] of lobes) fillCircle(cx + dx, cy + dy, radius - 4, darken(color, 0.4));
  for (const [dx, dy, radius] of [[28, -18, 6], [32, 24, 5], [-40, -30, 5]]) {
    fillCircle(cx + dx, cy + dy, radius, darken(color, 0.35));
  }
}

function drawTentacle(tentacle, t) {
  const [rootX, rootY] = tentacle.root;
  if (tentacle.state === 'warn') {
    const lockAt = tentacle.warn * (1 - BOSS_TENTACLE_LOCK_FRACTION);
    const locked = tentacle.t >= lockAt;
    const [tx, ty] = tentacle.target;
    const dx = tx - rootX;
    const dy = ty - rootY;
    const norm = Math.hypot(dx, dy) || 1.0;
    const ux = dx / norm;
    const uy = dy / norm;
    const color = locked ? RED : [255, 170, 130];
    if (!locked || Math.trunc(t * 14) % 2 === 0) {
      for (let dash = 0; dash < Math.trunc(norm) + 200; dash += 26) {
        drawLine(
          rootX + ux * dash, rootY + uy * dash,
          rootX + ux * (dash + 14), rootY + uy * (dash + 14),
          color, locked ? 3 : 2,
        );
      }
    }
    ringCircle(tx, ty, locked ? 26 : 20, color, 2);
    return;
  }
  const length = tentacleLength(tentacle);
  if (length <= 0) return;
  const [[rx, ry], [ex, ey]] = tentacleSegment(tentacle, length);
  const dx = ex - rx;
  const dy = ey - ry;
  const norm = Math.hypot(dx, dy) || 1.0;
  const nx = -dy / norm;
  const ny = dx / norm;
  const count = Math.max(4, Math.floor(length / 22));
  let previous = null;
  for (let index = 0; index <= count; index++) {
    const fraction = index / count;
    const wobble = Math.sin(fraction * 9 - t * 12) * 7 * (1 - fraction * 0.5);
    const px = rx + dx * fraction + nx * wobble;
    const py = ry + dy * fraction + ny * wobble;
    if (previous !== null) {
      const width = Math.trunc(22 - 12 * fraction);
      drawLine(previous[0], previous[1], px, py, darken(BOSS_COLOR, 0.5), width + 4, 1, 'round');
      drawLine(previous[0], previous[1], px, py, BOSS_COLOR, width, 1, 'round');
    }
    previous = [px, py];
  }
  fillCircle(previous[0], previous[1], 8, lighten(BOSS_COLOR, 0.3));
}

/** Giant dendritic cell, its weak spot and tentacles, plus the HP pips above the fight. */
function drawBoss(boss) {
  const t = now();
  drawBossBody(boss, t);

  const weakpoint = boss.weakpoint;
  if (weakpoint.alive()) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    const wx = Math.trunc(weakpoint.x);
    const wy = Math.trunc(weakpoint.y);
    glow(wx, wy, weakpoint.radius * 3, BOSS_WEAK_COLOR, 110);
    fillCircle(wx, wy, weakpoint.radius, darken(BOSS_WEAK_COLOR, 0.45));
    fillCircle(wx, wy, weakpoint.radius - 5, lerpColor(BOSS_WEAK_COLOR, WHITE, pulse));
    ringCircle(wx, wy, weakpoint.radius, WHITE, 2);
    drawText(TINY_FONT, 'SHOOT', WHITE, wx - weakpoint.radius - 8, wy, 'midright');
  }

  for (const tentacle of boss.tentacles) drawTentacle(tentacle, t);

  const label = boss.phase !== 'defeated' ? 'GIANT DENDRITIC CELL' : 'DEFEATED';
  drawText(SMALL_FONT, label, RED, WIDTH / 2, 134, 'midtop');

  const pipGap = 16;
  const startX = WIDTH / 2 - ((boss.hitsNeeded - 1) * pipGap) / 2;
  for (let index = 0; index < boss.hitsNeeded; index++) {
    const remaining = index >= boss.hits;
    const px = Math.trunc(startX + index * pipGap);
    fillCircle(px, 164, 6, remaining ? BOSS_COLOR : [40, 24, 34]);
    ringCircle(px, 164, 6, WHITE, 1);
  }
}

// ------------------------------------------------------------ spawning / run

function makeNextObject(x, gapSize, transducersActive, spawnState, biome = 0, forceTransducer = false, collapseScale = 1.0) {
  const normals = spawnState.normalSinceTransducer;
  const transducerAllowed = transducersActive && normals >= MIN_NORMALS_BETWEEN_TRANSDUCERS;
  const transducerDue = normals >= MAX_NORMALS_BETWEEN_TRANSDUCERS;
  const spawnTransducer = forceTransducer
    || (transducerAllowed && (transducerDue || Math.random() < TRANSDUCER_SPAWN_CHANCE));

  if (spawnTransducer) {
    // The tutorial shows the classic collapse field first.
    const kind = forceTransducer ? 'collapse' : choice(TRANSDUCER_KINDS);
    let collapseNumber = Math.max(1, spawnState.collapseCount);
    if (kind === 'collapse') {
      spawnState.collapseCount += 1;
      collapseNumber = spawnState.collapseCount;
    }
    spawnState.normalSinceTransducer = 0;
    const transducer = new Transducer(x, kind, collapseNumber);
    transducer.collapseFraction *= collapseScale;
    return transducer;
  }

  spawnState.normalSinceTransducer += 1;
  return new Obstacle(x, gapSize, BIOMES[biome].pillar);
}

/**
 * One bonus per gap: a coin arc, a GvpC helix or a SpyCatcher module.
 * Returns the bonus that was added last, so the tutorial can keep an eye on it.
 */
function spawnBonus(bonuses, x, bacterium, allowed = ['coins', 'module', 'gvpc'], force = null, powerups = 1.0) {
  const kinds = [];
  const weights = [];
  for (const [kind, weight] of [
    ['coins', COIN_WEIGHT],
    ['module', MODULE_WEIGHT * powerups],
    ['gvpc', GVPC_WEIGHT * powerups],
  ]) {
    if (allowed.includes(kind) && (kind !== 'gvpc' || bacterium.shell < MAX_SHELL_LAYERS)) {
      kinds.push(kind);
      weights.push(weight);
    }
  }

  const kind = force || weightedChoice(kinds, weights);
  if (kind === 'coins') {
    const count = randint(3, 6);
    const baseY = randint(150, HEIGHT - 150);
    const curve = choice([-1, 1]);
    for (let index = 0; index < count; index++) {
      const offset = index - (count - 1) / 2;
      const y = clamp(baseY + curve * offset * offset * 7, 100, HEIGHT - 100);
      bonuses.push(new Coin(x + index * 30, y));
    }
  } else if (kind === 'gvpc') {
    bonuses.push(new GvpC(x, randint(110, HEIGHT - 110)));
  } else {
    bonuses.push(new SpyCatcherModule(x, randint(110, HEIGHT - 110), choice(MODULE_KINDS)));
  }
  return bonuses[bonuses.length - 1];
}

function newTutorial(progress) {
  if (progress.tutorial_done) return null;
  return { stage: progress.tutorial_stage, forcing: null, watch: null, card: null };
}

/** Outside the tutorial everything is allowed; inside, only what was explained. */
function tutorialAllows(tutorial, feature) {
  if (tutorial === null) return true;
  const names = TUTORIAL_FEATURES.map(([name]) => name);
  return names.indexOf(feature) < tutorial.stage;
}

function allowedBonusKinds(tutorial) {
  return ['coins', ...['module', 'gvpc'].filter((kind) => tutorialAllows(tutorial, kind))];
}

function tutorialWatchVisible(watch) {
  if (watch instanceof Transducer) return watch.x + watch.width < WIDTH - 10;
  return watch.x + watch.radius < WIDTH - 40;
}

function resetRun(character, progress, tutorial = null, calmStart = false, difficulty = null) {
  const bacterium = new Bacterium(character);
  bacterium.applyUpgrades(progress);
  const objects = [];
  const bonuses = [];
  const spawnState = {
    normalSinceTransducer: 0,
    collapseCount: 0,
    sinceSpecialPrize: MIN_OBSTACLES_BETWEEN_SPECIAL_PRIZES,
  };
  // The tutorial pushes the first pillar far enough out for a calm start.
  let x = WIDTH + (calmStart ? 1100 : 180);
  const [, , gapSize, spacing] = difficultyForScore(0, difficulty);

  for (let i = 0; i < 4; i++) {
    objects.push(makeNextObject(x, gapSize, false, spawnState));
    if (Math.random() < BONUS_SPAWN_CHANCE) {
      spawnBonus(
        bonuses, x + Math.floor(spacing / 2), bacterium, allowedBonusKinds(tutorial), null,
        difficulty ? difficulty.powerups : 1.0,
      );
    }
    x += spacing;
  }
  return { bacterium, objects, bonuses, hazards: [], score: 0, spawnState };
}
