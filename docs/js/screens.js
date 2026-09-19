'use strict';

// HUD, menus, shop, statistics and the overlays drawn on top of a run.

// ------------------------------------------------------------------ widgets

/** Small icon version of the golden-protein pickup, for panels and counters. */
function drawCoinIcon(cx, cy, radius) {
  const lobes = [
    [-radius * 0.4, -radius * 0.3, radius * 0.62],
    [radius * 0.38, -radius * 0.34, radius * 0.56],
    [0, radius * 0.42, radius * 0.62],
  ];
  for (const [dx, dy, r] of lobes) {
    fillCircle(cx + dx, cy + dy, Math.max(1, Math.trunc(r) + 1), COIN_EDGE);
    fillCircle(cx + dx, cy + dy, Math.max(1, Math.trunc(r)), COIN_COLOR);
  }
  fillCircle(cx - radius * 0.25, cy - radius * 0.45, 1, lighten(COIN_COLOR, 0.65));
}

function drawCoinCounter(coins, rect) {
  drawPanel(rect, 170, PANEL_BORDER, 80, 13);
  drawCoinIcon(rect.x + 22, rect.centery, 9);
  drawText(FONT, String(coins), WHITE, rect.x + 40, rect.centery, 'midleft');
}

function drawPadlock(x, y) {
  drawArc(x, y - 5, 5, 6, 0, Math.PI, GRAY, 2);
  drawLine(x - 5, y - 5, x - 5, y - 2, GRAY, 2);
  drawLine(x + 6, y - 5, x + 6, y - 2, GRAY, 2);
  fillRect(x - 9, y - 3, 18, 14, GRAY, 3);
  fillCircle(x, y + 3, 2, PANEL);
}

function drawBackButton(rect) {
  const over = mouseOver(rect);
  drawPanel(rect, over ? 210 : 180, PANEL_BORDER, 180, 12);
  drawText(FONT, 'BACK', WHITE, rect.centerx, rect.centery, 'center', false);
}

function drawMenuNotice(menu, x, y, idleText = null) {
  if (menu.noticeTimer > 0) {
    drawText(SMALL_FONT, menu.notice, YELLOW, x, y, 'midtop', false, 255 * Math.min(1.0, menu.noticeTimer / 0.4));
  } else if (idleText) {
    drawText(SMALL_FONT, idleText, GRAY, x, y, 'midtop', false);
  }
}

function drawBannerText(text, color, y = 138, alpha = 255) {
  const rect = textRect(FONT, text, 'midtop', WIDTH / 2, y);
  const banner = rect.inflate(36, 16);
  ctx.globalAlpha = alpha / 255;
  fillRect(banner.x, banner.y, banner.w, banner.h, PANEL, 14, 215 / 255);
  ringRect(banner.x, banner.y, banner.w, banner.h, color, 2, 14, 220 / 255);
  ctx.globalAlpha = 1;
  drawText(FONT, text, color, WIDTH / 2, y, 'midtop', false, alpha);
}

// ---------------------------------------------------------------------- HUD

/** SpyCatcher slot, drawn in the GV panel right next to the GvpC pip. */
function drawModuleStatus(bacterium, area) {
  if (!bacterium.module) {
    drawText(SMALL_FONT, 'SpyCatcher', PANEL_BORDER, area.x, area.y + 2, 'topleft', false);
    drawText(SMALL_FONT, 'none', GRAY, area.right, area.y + 2, 'topright', false, 150);
    return;
  }

  const color = moduleColor(bacterium.module);
  drawModuleIcon(bacterium.module, area.x + 9, area.centery, 9);
  drawText(SMALL_FONT, MODULE_SHORT[bacterium.module], color, area.x + 24, area.y, 'topleft', false);
  const isAmpicillin = bacterium.module === 'ampicillin';
  const label = isAmpicillin ? `x${bacterium.ammo}` : `${bacterium.moduleTimer.toFixed(0)}s`;
  drawText(SMALL_FONT, label, WHITE, area.right, area.y, 'topright', false);
  const bar = new Rect(area.x + 24, area.bottom - 3, area.right - area.x - 24, 4);
  fillRect(bar.x, bar.y, bar.w, bar.h, [4, 16, 28], 2);
  let fraction;
  if (isAmpicillin && bacterium.ampicillinCapacity) fraction = bacterium.ammo / bacterium.ampicillinCapacity;
  else fraction = bacterium.moduleDuration ? bacterium.moduleTimer / bacterium.moduleDuration : 0;
  const left = Math.trunc(bar.w * fraction);
  if (left > 0) fillRect(bar.x, bar.y, left, bar.h, color, 2);
}

function drawHud(bacterium, score, levelText, biomeName, bestScore, coins) {
  const gvPanel = new Rect(15, 12, 285, 128);
  drawPanel(gvPanel);

  drawText(SMALL_FONT, 'GAS VESICLES', PANEL_BORDER, 30, 20, 'topleft', false);
  drawText(MEDIUM_FONT, `${bacterium.gvLevel.toFixed(1)}%`, WHITE, gvPanel.right - 18, 16, 'topright');

  drawText(SMALL_FONT, 'GvpC', PANEL_BORDER, 30, 46, 'topleft', false);
  for (let layer = 0; layer < MAX_SHELL_LAYERS; layer++) {
    const filled = layer < bacterium.shell;
    const px = 76 + layer * 28;
    fillRect(px, 50, 24, 12, filled ? SHELL_COLOR : [26, 52, 68], 6);
    ringRect(px, 50, 24, 12, filled ? lighten(SHELL_COLOR, 0.4) : [58, 88, 104], 1, 6);
  }

  const dividerX = 76 + MAX_SHELL_LAYERS * 28 + 6;
  fillRect(dividerX, 46, 1, 24, [58, 88, 104]);
  drawModuleStatus(bacterium, new Rect(dividerX + 10, 46, gvPanel.right - 18 - dividerX - 10, 28));

  const bar = new Rect(30, 82, 250, 26);
  fillRect(bar.x, bar.y, bar.w, bar.h, [4, 16, 28], 13);
  const fillWidth = Math.trunc((bar.w * bacterium.gvLevel) / 100.0);
  if (fillWidth > 0) {
    const color = gvBarColor(bacterium.gvLevel);
    const width = Math.min(Math.max(fillWidth, 14), bar.w);
    fillRect(bar.x, bar.y, width, bar.h, darken(color, 0.2), 13);
    fillRect(bar.x, bar.y, width, bar.h - 8, color, 13);
    fillRect(bar.x + 8, bar.y + 4, Math.max(0, width - 16), 4, lighten(color, 0.45), 2);
  }
  const neutralX = bar.x + Math.floor(bar.w / 2);
  drawLine(neutralX, bar.y - 4, neutralX, bar.bottom + 4, WHITE, 2);
  ringRect(bar.x, bar.y, bar.w, bar.h, lighten(PANEL, 0.4), 2, 13);
  drawText(SMALL_FONT, 'sink', GRAY, bar.x + 4, bar.bottom + 2, 'topleft', false, 170);
  drawText(SMALL_FONT, 'float', GRAY, bar.right - 4, bar.bottom + 2, 'topright', false, 170);

  drawText(SMALL_FONT, 'SCORE', PANEL_BORDER, WIDTH / 2, 12, 'midtop');
  drawText(BIG_FONT, String(score), WHITE, WIDTH / 2, 28, 'midtop');
  drawText(SMALL_FONT, `BEST ${bestScore}`, GRAY, WIDTH / 2, 74, 'midtop', false);

  const info = `${levelText}   ·   ${biomeName}`;
  const infoBox = textRect(SMALL_FONT, info, 'midtop', WIDTH / 2, 100).inflate(26, 8);
  drawPanel(infoBox, 150, PANEL_BORDER, 70, 13);
  drawText(SMALL_FONT, info, WHITE, WIDTH / 2, 100, 'midtop', false);

  drawCoinCounter(coins, new Rect(WIDTH - 230, 112, 215, 34));

  const controls = 'W / UP:  produce GVs      S / DOWN:  collapse GVs';
  const controlsBox = textRect(SMALL_FONT, controls, 'midbottom', WIDTH / 2, HEIGHT - 16).inflate(28, 8);
  drawPanel(controlsBox, 140, PANEL_BORDER, 60, 13);
  drawText(SMALL_FONT, controls, WHITE, WIDTH / 2, HEIGHT - 16, 'midbottom', false);

  if (bacterium.noticeTimer > 0) {
    const alpha = 255 * Math.min(1.0, bacterium.noticeTimer / 0.4);
    const rise = (1.5 - bacterium.noticeTimer) * 12;
    drawText(MEDIUM_FONT, bacterium.notice, YELLOW, WIDTH / 2, HEIGHT - 60 - rise, 'midbottom', true, alpha);
  }
}

/** Same three missions as the menu, now with a live progress bar each. Compact HUD version. */
function drawRunMissionsPanel(rect, missions, runStats, score) {
  drawPanel(rect, 160, PANEL_BORDER, 70, 10);
  drawText(TINY_FONT, 'MISSIONS', PANEL_BORDER, rect.x + 10, rect.y + 7, 'topleft', false);

  const active = missions.slice(0, ACTIVE_MISSIONS);
  const rowHeight = (rect.h - 22) / Math.max(1, active.length);
  active.forEach((mission, index) => {
    const rowY = rect.y + 22 + index * rowHeight;
    // The run's live score isn't in runStats until the run ends.
    const rawProgress = mission.kind === 'score' ? score : (runStats[mission.kind] || 0);
    const current = Math.min(rawProgress, mission.target);
    const fraction = mission.target ? current / mission.target : 1.0;
    const done = fraction >= 1.0;

    drawText(TINY_FONT, mission.text, done ? GREEN : WHITE, rect.x + 10, rowY, 'topleft', false, 225);
    drawText(TINY_FONT, `+${mission.reward}`, done ? GREEN : YELLOW, rect.right - 10, rowY, 'topright', false);

    const bar = new Rect(rect.x + 10, Math.trunc(rowY + 13), rect.w - 56, 4);
    fillRect(bar.x, bar.y, bar.w, bar.h, [4, 16, 28], 2);
    const fillWidth = Math.trunc(bar.w * fraction);
    if (fillWidth > 0) fillRect(bar.x, bar.y, fillWidth, bar.h, done ? GREEN : YELLOW, 2);
    drawText(GAUGE_FONT, `${current}/${mission.target}`, done ? GREEN : GRAY, bar.right + 6, bar.y - 2, 'topleft', false);
  });
}

function drawPauseOverlay() {
  fillRect(0, 0, WIDTH, HEIGHT, [0, 10, 20], 0, 150 / 255);
  const card = new Rect(WIDTH / 2 - 200, 230, 400, 150);
  drawPanel(card, 225, PANEL_BORDER, 200, 18);
  drawText(BIG_FONT, 'PAUSED', WHITE, WIDTH / 2, 252, 'midtop');
  drawText(FONT, 'ESC / P: resume      E: menu', GRAY, WIDTH / 2, 322, 'midtop', false);
}

function drawGameOver(score, newHighscore, missionNotice = '') {
  fillRect(0, 0, WIDTH, HEIGHT, [0, 10, 20], 0, 150 / 255);
  const card = new Rect(WIDTH / 2 - 270, 180, 540, 260);
  drawPanel(card, 225, newHighscore ? YELLOW : RED, 200, 18);

  if (newHighscore) drawText(BIG_FONT, 'NEW PERSONAL BEST!', YELLOW, WIDTH / 2, 210, 'midtop');
  else drawText(BIG_FONT, 'GV COLLAPSE!', RED, WIDTH / 2, 210, 'midtop');
  drawText(SMALL_FONT, 'SCORE', PANEL_BORDER, WIDTH / 2, 280, 'midtop', false);
  drawText(BIG_FONT, String(score), WHITE, WIDTH / 2, 296, 'midtop');
  drawText(FONT, 'R / ENTER: Retry      E: Menu', WHITE, WIDTH / 2, 380, 'midtop', false);
  if (missionNotice) drawText(SMALL_FONT, missionNotice, YELLOW, WIDTH / 2, 412, 'midtop', false);
}

// ------------------------------------------------------------------ tutorial

function drawTutorialHint(remaining) {
  let text = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1][1];
  for (const [threshold, stepText] of TUTORIAL_STEPS) {
    if (remaining <= threshold) text = stepText;
  }
  drawText(MEDIUM_FONT, text, WHITE, WIDTH / 2, 430, 'midtop');
  drawText(SMALL_FONT, `Tutorial — obstacles start in ${remaining.toFixed(0)}s`, PANEL_BORDER, WIDTH / 2, 470, 'midtop', false);
}

function drawTutorialProgress(stage) {
  drawText(
    SMALL_FONT, `Tutorial  ·  ${stage}/${TUTORIAL_FEATURES.length} explained`, PANEL_BORDER,
    WIDTH / 2, 128, 'midtop', false, 200,
  );
}

function drawTutorialCard(feature, watch, stage) {
  const t = now();
  fillRect(0, 0, WIDTH, HEIGHT, [0, 10, 20], 0, 120 / 255);

  // Spotlight the thing that is being explained.
  watch.draw();
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  if (watch instanceof Transducer) {
    ringRect(Math.trunc(watch.x) - 10, 4, watch.width + 20, HEIGHT - 8, YELLOW, 3, 12);
  } else {
    ringCircle(Math.trunc(watch.x), Math.trunc(watch.drawY ?? watch.y), Math.trunc(watch.radius + 14 + pulse * 5), YELLOW, 3);
  }

  const [title, lines] = TUTORIAL_CARDS[feature];
  const card = new Rect(WIDTH / 2 - 300, 170, 540, 128 + lines.length * 24);
  drawPanel(card, 235, YELLOW, 220, 18);
  drawText(SMALL_FONT, `NEW  ·  ${stage + 1}/${TUTORIAL_FEATURES.length}`, YELLOW, card.x + 28, card.y + 16, 'topleft', false);
  drawText(MEDIUM_FONT, title, WHITE, card.x + 28, card.y + 36);

  const iconY = card.y + 50;
  if (feature === 'gvpc') {
    const cx = card.right - 60;
    glow(cx, iconY, 30, GVPC_COLOR, 90);
    drawHelix(cx, iconY, 34, 2.2, GVPC_COLOR, GVPC_CORE, t * 2);
  } else if (feature === 'module') {
    MODULE_KINDS.forEach((kind, index) => drawModuleIcon(kind, card.right - 170 + index * 32, iconY, 10));
  } else if (feature === 'hazards') {
    for (const [x, kind] of [[card.right - 90, 'macrophage'], [card.right - 44, 'ciliate']]) {
      const cell = new DriftingCell(x, iconY, kind);
      cell.phase = 0.0;
      cell.draw();
    }
  } else {
    [[TRANSDUCER_COLOR, TRANSDUCER_CORE], [TRANSDUCER_PUSH_COLOR, TRANSDUCER_PUSH_CORE]].forEach(([color, core], index) => {
      const bx = card.right - 96 + index * 40;
      const by = iconY - 26;
      fillRect(bx, by, 20, 52, darken(color, 0.3), 5);
      fillRect(bx + 4, by + 4, 12, 44, lerpColor(color, core, pulse), 3);
    });
  }

  lines.forEach((line, index) => {
    drawText(SMALL_FONT, line, WHITE, card.x + 28, card.y + 84 + index * 24, 'topleft', false, 230);
  });
  drawText(SMALL_FONT, 'SPACE / ENTER: continue', YELLOW, card.centerx, card.bottom - 12, 'midbottom', false, 160 + 95 * pulse);
}

// ---------------------------------------------------------------- menu parts

function drawLockedCharacterButton(rect, character, progress, pending) {
  const price = SKIN_PRICES[character];
  const coins = progress.coins;
  const affordable = price !== null && coins >= price;
  const over = mouseOver(rect);
  const border = pending ? YELLOW : (!affordable ? GRAY : PANEL_BORDER);
  drawPanel(rect, over ? 190 : 150, border, pending ? 220 : 70, 10);

  // A dark silhouette of what the skin will look like.
  const preview = new Bacterium(character);
  preview.gvLevel = 67.0;
  preview.x = 35;
  preview.y = 30;
  renderOnto(silhouetteCanvas, () => {
    ctx.clearRect(0, 0, 70, 60);
    preview.draw({ tilt: false, showGlow: false, trail: false });
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(10,30,45,0.93)';
    ctx.fillRect(0, 0, 70, 60);
    ctx.globalCompositeOperation = 'source-over';
  });
  ctx.drawImage(silhouetteCanvas, rect.x + 28 - 35, rect.centery - 30);

  drawText(SMALL_FONT, character, GRAY, rect.x + 56, rect.y + 5, 'topleft', false, 190);
  drawText(TINY_FONT, SKIN_PERKS[character].short, GVPC_CORE, rect.x + 56, rect.bottom - 6, 'bottomleft', false, 150);

  let label;
  let color;
  if (pending) [label, color] = [`buy? ${price}`, YELLOW];
  else if (price === null) [label, color] = [lockedSkinBadge(character, progress), GRAY];
  else [label, color] = [String(price), affordable ? YELLOW : GRAY];
  const iconX = rect.right - 16;
  const iconY = rect.y + 14;
  if (affordable) drawCoinIcon(iconX, iconY, 8);
  else drawPadlock(iconX, iconY + 1);
  drawText(SMALL_FONT, label, color, rect.right - 30, rect.y + 5, 'topright', false, affordable || pending ? 255 : 150);
}
const silhouetteCanvas = makeCanvas(70, 60);

function drawCharacterButton(rect, character, selected, progress) {
  const over = mouseOver(rect);
  if (selected) drawPanel(rect, 215, YELLOW, 255, 10);
  else drawPanel(rect, over ? 200 : 170, PANEL_BORDER, over ? 180 : 90, 10);

  const preview = new Bacterium(character);
  if (character === 'BioBrick') preview.biobrickTier = progress.biobrick_tier || 0;
  preview.x = rect.x + 28;
  preview.y = rect.centery + (selected ? Math.sin(now() * 3) * 2 : 0);
  preview.gvLevel = 67.0;
  preview.draw({ tilt: false, trail: false });

  drawText(SMALL_FONT, character, selected ? YELLOW : WHITE, rect.x + 56, rect.y + 5, 'topleft', selected);
  drawText(TINY_FONT, skinShortText(character, progress), GVPC_CORE, rect.x + 56, rect.bottom - 6, 'bottomleft', false, selected ? 230 : 190);
  if (character === 'BioBrick') {
    const tier = progress.biobrick_tier || 0;
    drawText(TINY_FONT, BIOBRICK_TIER_NAMES[tier].toUpperCase(), BIOBRICK_TIER_COLORS[tier], rect.right - 12, rect.y + 7, 'topright', true);
  } else if (selected) {
    drawText(TINY_FONT, 'SELECTED', YELLOW, rect.right - 12, rect.y + 7, 'topright', false);
  }
}

function drawUpgradeButton(rect, kind, level, coins, pending) {
  const price = upgradePrice(level);
  const affordable = price !== null && coins >= price;
  const over = mouseOver(rect);
  const color = moduleColor(kind);
  drawPanel(rect, over ? 205 : 175, pending ? YELLOW : color, pending ? 220 : 90, 10);

  const iconX = rect.x + 20;
  const iconY = rect.centery;
  const t = now();
  let effect;
  if (kind === 'gfp') {
    drawGfpBarrel(iconX, iconY, 9, t);
    effect = `lamp ${(MODULE_BASE_DURATION.gfp + level * GFP_BONUS_SECONDS).toFixed(0)}s`;
  } else if (kind === 'granzyme') {
    drawGranzyme(iconX, iconY, 10, t * 1.5);
    effect = `kills ${(MODULE_BASE_DURATION.granzyme + level * GRANZYME_BONUS_SECONDS).toFixed(0)}s`;
  } else if (kind === 'ampicillin') {
    drawAmpicillin(iconX, iconY, 9, -Math.PI / 2);
    const shots = AMPICILLIN_BASE_SHOTS + level * AMPICILLIN_BONUS_SHOTS_PER_LEVEL;
    effect = `${shots} shots` + (level >= UPGRADE_MAX_LEVEL ? ' · homing' : '');
  } else {
    drawAntibody(iconX, iconY, 10, -Math.PI / 2);
    effect = `pull ${Math.trunc(COIN_MAGNET_RADIUS + level * ANTIBODY_BONUS_RADIUS)}px`;
  }

  drawText(SMALL_FONT, MODULE_SHORT[kind], color, rect.x + 38, rect.y + 3, 'topleft', false);
  drawText(SMALL_FONT, effect, WHITE, rect.x + 38, rect.bottom - 4, 'bottomleft', false, 200);

  for (let step = 0; step < UPGRADE_MAX_LEVEL; step++) {
    fillRect(rect.right - 8 - (UPGRADE_MAX_LEVEL - step) * 9, rect.y + 8, 6, 8, step < level ? color : [30, 58, 74], 1);
  }

  let label;
  let labelColor;
  if (price === null) [label, labelColor] = ['MAX', color];
  else if (pending) [label, labelColor] = [`buy? ${price}`, YELLOW];
  else [label, labelColor] = [`${price} coins`, affordable ? YELLOW : GRAY];
  drawText(SMALL_FONT, label, labelColor, rect.right - 12, rect.bottom - 4, 'bottomright', false, affordable || price === null || pending ? 255 : 140);
}

function drawPromoField(rect, text, focused, blink) {
  drawPanel(rect, focused ? 215 : 175, focused ? YELLOW : PANEL_BORDER, focused ? 230 : 80, 10);
  drawText(SMALL_FONT, 'PROMO CODE', PANEL_BORDER, rect.centerx, rect.y - 20, 'midtop', false);
  if (text) {
    drawText(FONT, text + (focused && blink ? '_' : ''), WHITE, rect.x + 14, rect.centery, 'midleft', false);
  } else {
    drawText(
      SMALL_FONT, !focused ? 'click, type, ENTER' : 'type a code' + (blink ? '_' : ''), GRAY,
      rect.x + 14, rect.centery, 'midleft', false, 150,
    );
  }
}

function drawMissionsPanel(rect, missions) {
  drawPanel(rect, 175, PANEL_BORDER, 80, 10);
  drawText(SMALL_FONT, 'MISSIONS', PANEL_BORDER, rect.centerx, rect.y - 20, 'midtop', false);
  missions.slice(0, ACTIVE_MISSIONS).forEach((mission, index) => {
    const rowY = rect.y + 6 + index * 18;
    drawText(SMALL_FONT, mission.text, WHITE, rect.x + 10, rowY, 'topleft', false, 215);
    drawText(SMALL_FONT, `+${mission.reward}`, YELLOW, rect.right - 10, rowY, 'topright', false);
  });
}

/** The current character as a large, gently bobbing picture. */
function drawCharacterShowcase(rect, character, progress, changeRect) {
  const t = now();
  drawPanel(rect, 205, YELLOW, 210, 18);

  const preview = new Bacterium(character);
  if (character === 'BioBrick') preview.biobrickTier = progress.biobrick_tier || 0;
  preview.gvLevel = 67.0;
  const cx = rect.centerx;
  const cy = rect.y + 102 + Math.sin(t * 2.2) * 5;
  glow(cx, cy, 140, [170, 230, 255], 55, 1.6);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(3.6, 3.6);
  preview.drawSprite(0, 0, t);
  ctx.restore();

  drawText(MEDIUM_FONT, character, YELLOW, rect.centerx, rect.y + 214, 'midtop');
  drawText(SMALL_FONT, skinShortText(character, progress), GVPC_CORE, rect.centerx, rect.y + 254, 'midtop', false);

  const over = mouseOver(changeRect);
  drawPanel(changeRect, over ? 225 : 190, YELLOW, over ? 255 : 170, 10);
  drawText(SMALL_FONT, 'CHANGE CHARACTER', WHITE, changeRect.centerx, changeRect.centery, 'center', false);
}

/** A loud, pulsing button: the shop is where coins turn into power. */
function drawShopButton(rect, progress) {
  const t = now();
  const over = mouseOver(rect);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
  const base = lerpColor([60, 190, 110], [100, 230, 140], pulse);
  const top = over ? lighten(base, 0.25) : base;
  fillRect(rect.x - 20, rect.y - 20, rect.w + 40, rect.h + 40, [110, 240, 150], 26, (12 + 22 * pulse) / 255);
  fillRect(rect.x, rect.y + 5, rect.w, rect.h, darken(base, 0.55), 16);
  fillRect(rect.x, rect.y, rect.w, rect.h, darken(base, 0.15), 16);
  fillRect(rect.x, rect.y, rect.w, rect.h - 10, top, 16);
  fillRect(rect.x + 16, rect.y + 6, rect.w - 32, 5, lighten(top, 0.5), 3);
  ringRect(rect.x, rect.y, rect.w, rect.h, lighten(base, 0.6), 2, 16);

  drawCoinIcon(rect.x + 40, rect.y + 44, 20);
  drawText(BIG_FONT, 'SHOP', [12, 50, 28], rect.x + 74, rect.y + 10, 'topleft', false);
  drawText(TINY_FONT, 'SpyCatcher upgrades', [12, 50, 28], rect.x + 76, rect.y + 62, 'topleft', false);

  const canBuy = UPGRADE_KEYS.some((key) => {
    const price = upgradePrice(progress[key]);
    return price !== null && progress.coins >= price;
  });
  if (canBuy) {
    const bx = rect.right - 10 - 29;
    const by = rect.y + 4 - 12;
    fillRect(bx, by + 2, 58, 24, [200, 45, 60], 12);
    fillRect(bx, by, 58, 24, RED, 12);
    drawText(TINY_FONT, 'READY', WHITE, bx + 29, by + 12, 'center', false);
  }
}

function drawDifficultyPanel(rect, difficulty, best, prevRect, nextRect) {
  drawPanel(rect, 195, difficulty.color, 190, 14);
  drawText(SMALL_FONT, 'DIFFICULTY', PANEL_BORDER, rect.centerx, rect.y + 10, 'midtop', false);
  for (const [arrowRect, direction] of [[prevRect, -1], [nextRect, 1]]) {
    const over = mouseOver(arrowRect);
    drawPanel(arrowRect, over ? 220 : 170, PANEL_BORDER, over ? 200 : 100, 8);
    const [cx, cy] = arrowRect.center;
    fillPoly([[cx + direction * 5, cy], [cx - direction * 4, cy - 7], [cx - direction * 4, cy + 7]], WHITE);
  }
  drawText(MEDIUM_FONT, difficulty.name, difficulty.color, rect.centerx, prevRect.centery, 'center');
  difficultyLines(difficulty).forEach((line, index) => {
    drawText(TINY_FONT, line, WHITE, rect.x + 20, rect.y + 90 + index * 24, 'topleft', false, 225);
  });
  drawText(SMALL_FONT, `BEST  ${best}`, YELLOW, rect.x + 20, rect.bottom - 30, 'topleft', false);
}

// ------------------------------------------------------------------- layouts

function menuLayout() {
  const diffPanel = new Rect(620, 112, 250, 240);
  const rects = {
    showcase: new Rect(300, 92, 300, 330),
    change: new Rect(330, 372, 240, 38),
    shop: new Rect(30, 112, 250, 104),
    difficulty: diffPanel,
    diffPrev: new Rect(diffPanel.x + 14, diffPanel.y + 40, 30, 30),
    diffNext: new Rect(diffPanel.right - 44, diffPanel.y + 40, 30, 30),
    start: new Rect(WIDTH / 2 - 150, 452, 300, 56),
    promo: new Rect(618, 460, 232, 40),
    missions: new Rect(50, 460, 232, 62),
    stats: new Rect(15, 54, 170, 30),
    back: new Rect(WIDTH / 2 - 90, HEIGHT - 70, 180, 44),
  };
  // Character screen: a 3-column grid of skins.
  rects.characters = CHARACTERS.map(
    (_, index) => new Rect(51 + (index % 3) * 274, 112 + Math.floor(index / 3) * 54, 262, 46),
  );
  // Shop screen: a 2-column grid of SpyCatcher upgrades.
  const columns = 2;
  const colGap = 266;
  const rowGap = 62;
  const buttonWidth = 250;
  const startX = Math.floor((WIDTH - (colGap * (columns - 1) + buttonWidth)) / 2);
  rects.upgrades = {};
  MODULE_KINDS.forEach((kind, index) => {
    rects.upgrades[kind] = new Rect(
      startX + (index % columns) * colGap,
      150 + Math.floor(index / columns) * rowGap,
      buttonWidth,
      50,
    );
  });
  return rects;
}

// ------------------------------------------------------------------- screens

function drawMenu(menu, rects) {
  const t = now();
  drawWaterBackground();
  drawVignette();

  const titleY = 10 + Math.sin(t * 1.5) * 4;
  drawText(TITLE_FONT, 'GV FLOAT', [140, 220, 245], WIDTH / 2 + 3, titleY + 3, 'midtop', false, 90);
  drawText(TITLE_FONT, 'GV FLOAT', WHITE, WIDTH / 2, titleY, 'midtop');

  drawCoinCounter(menu.coins, new Rect(15, 12, 170, 36));

  const statsRect = rects.stats;
  const overStats = mouseOver(statsRect);
  drawPanel(statsRect, overStats ? 200 : 165, PANEL_BORDER, overStats ? 140 : 70, 10);
  drawText(SMALL_FONT, 'STATISTICS', WHITE, statsRect.centerx, statsRect.centery, 'center', false);

  drawMissionsPanel(rects.missions, menu.progress.missions);

  drawShopButton(rects.shop, menu.progress);
  drawCharacterShowcase(rects.showcase, menu.character, menu.progress, rects.change);
  drawDifficultyPanel(rects.difficulty, menu.difficulty, menu.bestScore, rects.diffPrev, rects.diffNext);

  drawPromoField(rects.promo, menu.codeInput, menu.codeFocus, Math.trunc(now() * 2) % 2 === 0);

  const startRect = rects.start;
  const over = mouseOver(startRect);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  const baseYellow = lerpColor(YELLOW, lighten(YELLOW, 0.2), pulse);
  const topColor = over ? lighten(YELLOW, 0.35) : baseYellow;
  fillRect(startRect.x, startRect.y + 5, startRect.w, startRect.h, darken(ORANGE, 0.35), 14);
  fillRect(startRect.x, startRect.y, startRect.w, startRect.h, ORANGE, 14);
  fillRect(startRect.x, startRect.y, startRect.w, startRect.h - 10, topColor, 14);
  fillRect(startRect.x + 16, startRect.y + 6, startRect.w - 32, 5, lighten(topColor, 0.5), 3);
  drawText(MEDIUM_FONT, 'START RUN', [60, 35, 5], startRect.centerx, startRect.centery - 3, 'center', false);

  drawMenuNotice(menu, WIDTH / 2, startRect.bottom + 4, 'or press ENTER');
}

function drawCharactersScreen(menu, rects) {
  drawWaterBackground();
  drawVignette();
  drawText(BIG_FONT, 'CHOOSE YOUR CHARACTER', WHITE, WIDTH / 2, 24, 'midtop');
  drawCoinCounter(menu.coins, new Rect(15, 12, 170, 36));

  const ownedCount = CHARACTERS.filter((c) => owns(c, menu.progress)).length;
  drawText(SMALL_FONT, `${ownedCount}/${CHARACTERS.length} unlocked`, GRAY, WIDTH / 2, 84, 'midtop', false);

  CHARACTERS.forEach((character, index) => {
    const rect = rects.characters[index];
    if (owns(character, menu.progress)) {
      drawCharacterButton(rect, character, character === menu.character, menu.progress);
    } else {
      drawLockedCharacterButton(rect, character, menu.progress, menu.pending === character);
    }
  });

  const perk = SKIN_PERKS[menu.character].label;
  drawText(SMALL_FONT, `${menu.character}:  ${perk}`, YELLOW, WIDTH / 2, 348, 'midtop', false);
  drawText(TINY_FONT, 'Click a locked skin twice to buy it', GRAY, WIDTH / 2, 376, 'midtop', false);
  drawMenuNotice(menu, WIDTH / 2, 410);
  drawBackButton(rects.back);
}

function drawShopScreen(menu, rects) {
  drawWaterBackground();
  drawVignette();
  drawText(TITLE_FONT, 'SHOP', WHITE, WIDTH / 2, 10, 'midtop');
  drawCoinCounter(menu.coins, new Rect(15, 12, 170, 36));
  drawText(SMALL_FONT, 'SPYCATCHER UPGRADES', PANEL_BORDER, WIDTH / 2, 104, 'midtop', false);
  const upgradeLevels = UPGRADE_KEYS.reduce((sum, key) => sum + menu.progress[key], 0);
  drawText(TINY_FONT, `${upgradeLevels}/${UPGRADE_KEYS.length * UPGRADE_MAX_LEVEL} levels`, GRAY, WIDTH / 2, 126, 'midtop', false);
  for (const [kind, rect] of Object.entries(rects.upgrades)) {
    drawUpgradeButton(rect, kind, menu.progress[`${kind}_level`], menu.coins, menu.pending === `upgrade:${kind}`);
  }
  drawText(TINY_FONT, 'Click an upgrade twice to buy it', GRAY, WIDTH / 2, 290, 'midtop', false);
  drawMenuNotice(menu, WIDTH / 2, 320);
  drawBackButton(rects.back);
}

function drawStatsPage(progress, backRect) {
  drawWaterBackground();
  drawVignette();
  drawText(TITLE_FONT, 'STATISTICS', WHITE, WIDTH / 2, 24, 'midtop');

  const stats = progress.stats;
  const runs = Object.entries(stats.skin_runs);
  const favourite = runs.length ? runs.reduce((best, item) => (item[1] > best[1] ? item : best))[0] : '—';
  const average = stats.runs ? stats.total_score / stats.runs : 0;
  const rows = [
    ['Runs played', String(stats.runs)],
    ...DIFFICULTIES.map((d) => [`Best score · ${d.name}`, String(bestFor(progress, d))]),
    ['Average score', average.toFixed(1)],
    ['Coins collected', String(stats.coins_earned)],
    ['Coins in the bank', String(progress.coins)],
    ['Cells killed with Granzyme', String(stats.cells_killed)],
    ['GvpC bound', String(stats.gvpc)],
    ['SpyCatchers bound', String(stats.modules)],
    ['Missions completed', String(stats.missions_done)],
    ['Bosses defeated', String(stats.bosses_defeated || 0)],
    ['Skins owned', `${CHARACTERS.filter((c) => owns(c, progress)).length}/${CHARACTERS.length}`],
    ['Favourite skin', favourite],
  ];
  const card = new Rect(WIDTH / 2 - 290, 100, 580, rows.length * 26 + 24);
  drawPanel(card, 215, PANEL_BORDER, 140, 16);
  rows.forEach(([label, value], index) => {
    const rowY = card.y + 14 + index * 26;
    drawText(FONT, label, WHITE, card.x + 24, rowY, 'topleft', false, 210);
    drawText(FONT, value, YELLOW, card.right - 24, rowY, 'topright', false);
  });

  const over = mouseOver(backRect);
  drawPanel(backRect, over ? 210 : 180, PANEL_BORDER, 180, 12);
  drawText(FONT, 'BACK', WHITE, backRect.centerx, backRect.centery, 'center', false);
}
