'use strict';

// Game state, input handling and the frame loop.

const progress = loadProgress();
const menuRects = menuLayout();

let state = 'menu'; // menu | characters | shop | stats | playing
let selectedCharacter = CHARACTERS[0];
let difficulty = findDifficulty(progress.difficulty);
let bestScore = bestFor(progress, difficulty);

let pendingPurchase = null;
let codeInput = '';
let codeFocus = false;
let menuNotice = '';
let menuNoticeTimer = 0.0;

let runStats = EMPTY_RUN_STATS();
let missionNotice = '';
let paused = false;
let gameOver = false;
let newHighscore = false;

let tutorialTimer = 0.0;
let tutorial = null;
let runBanner = '';
let runBannerColor = PANEL_BORDER;
let runBannerTimer = 0.0;

let biomeIndex = 0;
let previousBiome = null;
let biomeBlend = 1.0;
let biomeNoticeTimer = 0.0;
let hazardTimer = rand(...HAZARD_INTERVAL);
const ceilingLight = new CeilingLight();
let ceilingIntensity = 1.0;

let bacterium = null;
let objects = [];
let bonuses = [];
let hazards = [];
let projectiles = [];
let score = 0;
let spawnState = null;
let boss = null;
let nextBossScore = BOSS_SCORE_INTERVAL;

ensureMissions(progress);
saveProgress(progress);

// -------------------------------------------------------------------- input

const held = new Set();
const isDown = (...names) => names.some((name) => held.has(name));

function startRun() {
  tutorial = newTutorial(progress);
  tutorialTimer = tutorial && tutorial.stage === 0 ? TUTORIAL_SECONDS : 0.0;
  ({ bacterium, objects, bonuses, hazards, score, spawnState } = resetRun(
    selectedCharacter, progress, tutorial, tutorialTimer > 0, difficulty,
  ));
  runBannerTimer = 0.0;
  runStats = EMPTY_RUN_STATS();
  boss = null;
  nextBossScore = BOSS_SCORE_INTERVAL;
  projectiles = [];
  missionNotice = '';
  paused = false;
  biomeIndex = 0;
  previousBiome = null;
  biomeBlend = 1.0;
  gameOver = false;
  newHighscore = false;
  state = 'playing';
}

function tryPurchase(item, price) {
  if (progress.coins < price) return `Not enough coins: ${price} needed`;
  progress.coins -= price;
  if (item.startsWith('upgrade:')) {
    const kind = item.split(':')[1];
    progress[`${kind}_level`] += 1;
    checkFinalSkinUnlock(progress);
    saveProgress(progress);
    return `${MODULE_LABELS[kind]} upgraded`;
  }
  progress.owned.push(item);
  checkFinalSkinUnlock(progress);
  saveProgress(progress);
  return `${item} bought`;
}

function continueTutorialCard() {
  tutorial.card = null;
  tutorial.watch = null;
  tutorial.stage += 1;
  progress.tutorial_stage = tutorial.stage;
  if (tutorial.stage >= TUTORIAL_FEATURES.length) {
    progress.tutorial_done = true;
    tutorial = null;
    runBanner = 'Tutorial complete. Good luck!';
    runBannerColor = YELLOW;
    runBannerTimer = 3.5;
  }
  saveProgress(progress);
}

/** A left click on the menu, the character screen or the shop. */
function handleMenuClick(x, y) {
  let clicked = null;
  codeFocus = state === 'menu' && menuRects.promo.contains(x, y);
  if (state !== 'menu') {
    if (menuRects.back.contains(x, y)) {
      state = 'menu';
      pendingPurchase = null;
      return;
    }
    if (state === 'characters') {
      for (let index = 0; index < CHARACTERS.length; index++) {
        if (!menuRects.characters[index].contains(x, y)) continue;
        const character = CHARACTERS[index];
        if (owns(character, progress)) selectedCharacter = character;
        else clicked = character;
        break;
      }
    } else {
      for (const [kind, rect] of Object.entries(menuRects.upgrades)) {
        if (rect.contains(x, y)) {
          clicked = `upgrade:${kind}`;
          break;
        }
      }
    }
  } else if (menuRects.stats.contains(x, y)) {
    state = 'stats';
    return;
  } else if (menuRects.change.contains(x, y)) {
    state = 'characters';
  } else if (menuRects.shop.contains(x, y)) {
    state = 'shop';
  } else if (menuRects.diffPrev.contains(x, y) || menuRects.diffNext.contains(x, y)) {
    const step = menuRects.diffPrev.contains(x, y) ? -1 : 1;
    const index = DIFFICULTIES.indexOf(difficulty);
    difficulty = DIFFICULTIES[(index + step + DIFFICULTIES.length) % DIFFICULTIES.length];
    progress.difficulty = difficulty.name;
    bestScore = bestFor(progress, difficulty);
    saveProgress(progress);
  }

  if (clicked) {
    let price;
    if (clicked.startsWith('upgrade:')) price = upgradePrice(progress[`${clicked.split(':')[1]}_level`]);
    else price = SKIN_PRICES[clicked];
    if (price === null) {
      menuNotice = clicked.startsWith('upgrade:')
        ? 'Already fully upgraded'
        : `${clicked} ${lockedSkinReason(clicked, progress)}`;
      menuNoticeTimer = 1.6;
    } else if (pendingPurchase === clicked) {
      menuNotice = tryPurchase(clicked, price);
      menuNoticeTimer = 1.8;
      pendingPurchase = null;
    } else if (progress.coins < price) {
      menuNotice = `Not enough coins: ${price} needed`;
      menuNoticeTimer = 1.6;
    } else {
      pendingPurchase = clicked;
    }
  } else {
    pendingPurchase = null;
  }

  if (state === 'menu' && menuRects.start.contains(x, y)) startRun();
}

function handleClick(x, y) {
  if (state === 'menu' || state === 'characters' || state === 'shop') {
    handleMenuClick(x, y);
  } else if (state === 'stats') {
    state = 'menu';
  } else if (state === 'playing' && tutorial && tutorial.card && !gameOver) {
    continueTutorialCard();
  }
}

function handleKeyDown(key) {
  const isEnter = key === 'enter';
  if ((state === 'characters' || state === 'shop') && key === 'escape') {
    state = 'menu';
    pendingPurchase = null;
  } else if (state === 'stats') {
    state = 'menu';
  } else if (state === 'playing' && tutorial && tutorial.card && !gameOver) {
    if (key === ' ' || isEnter) continueTutorialCard();
  } else if (state === 'playing' && !gameOver && (key === 'escape' || key === 'p')) {
    paused = !paused;
  } else if (state === 'playing' && !gameOver && !paused && key === ' ') {
    const shot = bacterium.fireAmpicillin();
    if (shot !== null) projectiles.push(shot);
  } else if (state === 'playing' && paused) {
    if (key === 'e') {
      paused = false;
      state = 'menu';
    }
  } else if (state === 'menu') {
    if (codeFocus) {
      if (isEnter) {
        menuNotice = redeemCode(progress, codeInput);
        menuNoticeTimer = 2.2;
        codeInput = '';
      } else if (key === 'backspace') {
        codeInput = codeInput.slice(0, -1);
      } else if (key === 'escape') {
        codeFocus = false;
      }
    } else if (isEnter) {
      startRun();
    }
  } else if (state === 'playing' && gameOver) {
    if (key === 'r' || isEnter) startRun();
    else if (key === 'e') state = 'menu';
  }
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  held.add(key);
  if (state === 'menu' && codeFocus) {
    // Typing into the promo field: letters and digits only, repeat allowed for backspace.
    if (key === 'backspace') event.preventDefault();
    if (event.key.length === 1 && /^[\p{L}\p{N}]$/u.test(event.key) && codeInput.length < MAX_CODE_LENGTH) {
      codeInput += event.key;
      return;
    }
    if (event.repeat && key !== 'backspace') return;
  } else if (event.repeat) {
    return;
  }
  handleKeyDown(key);
});

window.addEventListener('keyup', (event) => {
  held.delete(event.key.toLowerCase());
});
window.addEventListener('blur', () => held.clear());

function pointerPosition(event) {
  const box = canvas.getBoundingClientRect();
  return [((event.clientX - box.left) * WIDTH) / box.width, ((event.clientY - box.top) * HEIGHT) / box.height];
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return;
  [mouse.x, mouse.y] = pointerPosition(event);
  handleClick(mouse.x, mouse.y);
});
canvas.addEventListener('pointermove', (event) => {
  [mouse.x, mouse.y] = pointerPosition(event);
});
canvas.addEventListener('pointerleave', () => {
  mouse.x = -1000;
  mouse.y = -1000;
});

// The page decides how big the game may be; the canvas just fills its stage
// and renders at the screen's pixel density.
const stage = document.getElementById('stage');
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = Math.max(1, stage.clientWidth);
  const cssHeight = Math.max(1, Math.round((cssWidth * HEIGHT) / WIDTH));
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
}
window.addEventListener('resize', resizeCanvas);
new ResizeObserver(resizeCanvas).observe(stage);
resizeCanvas();

// --------------------------------------------------------------------- frame

function menuState() {
  return {
    character: selectedCharacter,
    progress,
    coins: progress.coins,
    bestScore,
    pending: pendingPurchase,
    codeInput,
    codeFocus,
    notice: menuNotice,
    noticeTimer: menuNoticeTimer,
    difficulty,
  };
}

function playFrame(dt) {
  const frameScale = dt * FPS;
  const [level, speed, gapSize, spacing] = difficultyForScore(score, difficulty);
  const transducersActive = tutorial ? tutorialAllows(tutorial, 'transducer') : score >= TRANSDUCER_START_SCORE;
  const cardOpen = Boolean(tutorial && tutorial.card);

  const newBiome = biomeForScore(score);
  if (newBiome !== biomeIndex) {
    previousBiome = biomeIndex;
    biomeIndex = newBiome;
    biomeBlend = 0.0;
    biomeNoticeTimer = 3.0;
  }
  if (biomeBlend < 1.0) biomeBlend = Math.min(1.0, biomeBlend + dt / BIOME_FADE_SECONDS);
  if (!cardOpen) {
    biomeNoticeTimer = Math.max(0.0, biomeNoticeTimer - dt);
    runBannerTimer = Math.max(0.0, runBannerTimer - dt);
  }

  if (!gameOver && !paused && !cardOpen) {
    ceilingIntensity = ceilingLight.update(dt);

    if (boss === null && !tutorial && score >= nextBossScore) {
      boss = startBoss(nextBossScore);
      objects = [];
      bonuses = [];
      hazards = [];
      bacterium.bindModule('ampicillin');
      bacterium.infiniteAmpicillin = true;
      runBanner = 'GIANT DENDRITIC CELL! SPACE shoots Amp at its weak spots';
      runBannerColor = RED;
      runBannerTimer = 3.5;
    }

    for (const obj of objects) obj.update(speed, frameScale);
    for (const bonus of bonuses) bonus.update(speed, frameScale, bacterium);

    if (tutorialTimer > 0) tutorialTimer = Math.max(0.0, tutorialTimer - dt);

    // Send in the next new thing once the previous one has been explained.
    if (
      tutorial
      && tutorialTimer === 0
      && tutorial.watch === null
      && tutorial.forcing === null
      && tutorial.stage < TUTORIAL_FEATURES.length
    ) {
      const [feature, threshold] = TUTORIAL_FEATURES[tutorial.stage];
      if (score >= threshold) {
        if (feature === 'hazards') {
          const cell = new DriftingCell(WIDTH + 60, clamp(bacterium.y, 160, HEIGHT - 160), 'macrophage');
          cell.amplitude = 12;
          hazards.push(cell);
          tutorial.watch = cell;
        } else {
          tutorial.forcing = feature;
        }
      }
    }

    if (boss === null) {
      hazardTimer -= dt;
      if (tutorialTimer > 0 || !tutorialAllows(tutorial, 'hazards')) hazardTimer = Math.max(hazardTimer, 1.0);
      if (hazardTimer <= 0) {
        hazards.push(new DriftingCell(WIDTH + 60, randint(110, HEIGHT - 110), choice(HAZARD_KINDS)));
        const interval = rand(...HAZARD_INTERVAL);
        hazardTimer = (interval * Math.max(0.6, 1.0 - (level - 1) * 0.04)) / difficulty.hazards;
      }
    }
    for (const hazard of hazards) hazard.update(speed, frameScale);
    hazards = hazards.filter((hazard) => !hazard.offScreen());

    const productionLocked = objects.some(
      (obj) => obj instanceof Transducer && obj.kind === 'collapse' && obj.overlaps(bacterium),
    );

    for (const obj of objects) {
      if (obj instanceof Transducer && obj.overlaps(bacterium) && !obj.triggered) {
        if (obj.kind === 'collapse') bacterium.applyTransducer(obj.collapseFraction);
        else if (obj.kind === 'top') bacterium.applyTransducerPush(1);
        else bacterium.applyTransducerPush(-1);
        obj.triggered = true;
      }
    }

    bacterium.update(
      { up: isDown('w', 'arrowup'), down: isDown('s', 'arrowdown') },
      dt,
      productionLocked,
    );

    const remainingBonuses = [];
    for (const bonus of bonuses) {
      if (bonus.collectedBy(bacterium)) {
        const result = bonus.apply(bacterium);
        if (result === 'coin') {
          let gained = 1;
          const extra = (bacterium.perk.coins ?? 1.0) - 1.0;
          if (extra > 0 && Math.random() < extra) gained += 1;
          progress.coins += gained;
          runStats.coins += gained;
        } else if (result === 'special_prize') {
          progress.special_prizes = (progress.special_prizes || 0) + 1;
          progress.coins += SPECIAL_PRIZE_COINS;
          runStats.coins += SPECIAL_PRIZE_COINS;
          const newTier = updateBiobrickTier(progress);
          checkFinalSkinUnlock(progress);
          if (newTier) bacterium.setNotice(`BioBrick unlocked: ${BIOBRICK_TIER_NAMES[newTier]}!`);
          else bacterium.setNotice(`iGEM Special Prize! (${progress.special_prizes} found)`);
        } else if (bonus instanceof GvpC) {
          runStats.gvpc += 1;
        } else {
          runStats.modules += 1;
        }
      } else if (!bonus.offScreen()) {
        remainingBonuses.push(bonus);
      }
    }
    bonuses = remainingBonuses;

    if (bacterium.module === 'granzyme') {
      for (const hazard of hazards) {
        if (hazard.collidesWith(bacterium)) {
          hazard.kill();
          runStats.kills += 1;
          progress.coins += KILL_COINS;
          runStats.coins += KILL_COINS;
        }
      }
    }

    const shotTargets = [...hazards, ...bossTargets(boss)];
    const remainingProjectiles = [];
    for (const shot of projectiles) {
      shot.update(frameScale, shotTargets);
      const target = shotTargets.find((candidate) => candidate.alive() && shot.collidesWith(candidate));
      if (target !== undefined) {
        target.kill();
        if (target instanceof DriftingCell) {
          runStats.kills += 1;
          progress.coins += KILL_COINS;
          runStats.coins += KILL_COINS;
        }
      } else if (bossAbsorbs(boss, shot)) {
        // The body soaks it up.
      } else if (!shot.offScreen()) {
        remainingProjectiles.push(shot);
      }
    }
    projectiles = remainingProjectiles;

    const hit = objects.some((obj) => obj.collidesWith(bacterium))
      || hazards.some((hazard) => hazard.collidesWith(bacterium))
      || bossHitsPlayer(boss, bacterium);

    if (boss === null) {
      for (const obj of objects) {
        if (!obj.passed && obj.x + obj.width < bacterium.x) {
          obj.passed = true;
          score += 1;
          bestScore = Math.max(bestScore, score);
          if (score === TRANSDUCER_START_SCORE && !tutorial) {
            runBanner = 'Transducers ahead: ultrasound fields join the run';
            runBannerColor = TRANSDUCER_CORE;
            runBannerTimer = 3.0;
          } else if (score === LEVEL_START_SCORE && difficulty.levels) {
            runBanner = 'Level system on: the current speeds up from here';
            runBannerColor = YELLOW;
            runBannerTimer = 3.0;
          }
        }
      }
    }

    objects = objects.filter((obj) => !obj.offScreen());

    if (boss !== null) {
      if (updateBoss(boss, dt, hazards, bacterium) === 'defeated') {
        const reward = BOSS_REWARD_COINS + boss.stage * BOSS_REWARD_PER_STAGE;
        progress.coins += reward;
        runStats.coins += reward;
        progress.stats.bosses_defeated = (progress.stats.bosses_defeated || 0) + 1;
        saveProgress(progress);
        runBanner = `Dendritic cell defeated! +${reward} coins`;
        runBannerColor = GREEN;
        runBannerTimer = 3.0;
        nextBossScore += BOSS_SCORE_INTERVAL;
        bacterium.infiniteAmpicillin = false;
        boss = null;
      }
    } else if (!objects.length || objects[objects.length - 1].x < WIDTH - spacing) {
      const spawnX = objects.length ? objects[objects.length - 1].x + spacing : WIDTH;
      const forcing = tutorial ? tutorial.forcing : null;
      const newObject = makeNextObject(
        spawnX, gapSize, transducersActive, spawnState, biomeIndex,
        forcing === 'transducer', difficulty.transducer,
      );
      objects.push(newObject);
      if (newObject instanceof Obstacle) {
        spawnState.sinceSpecialPrize += 1;
        const prizeReady = !tutorial
          && score >= SPECIAL_PRIZE_MIN_SCORE
          && spawnState.sinceSpecialPrize >= MIN_OBSTACLES_BETWEEN_SPECIAL_PRIZES;
        if (prizeReady && Math.random() < SPECIAL_PRIZE_CHANCE) {
          const gapTop = newObject.gapY - Math.floor(newObject.gapSize / 2);
          const gapBottom = newObject.gapY + Math.floor(newObject.gapSize / 2);
          const edgeY = choice([gapTop + SPECIAL_PRIZE_EDGE_MARGIN, gapBottom - SPECIAL_PRIZE_EDGE_MARGIN]);
          bonuses.push(new SpecialPrize(newObject.x + newObject.width / 2, edgeY));
          spawnState.sinceSpecialPrize = 0;
        }
      }
      if (forcing === 'transducer') {
        tutorial.watch = newObject;
        tutorial.forcing = null;
      } else if (forcing === 'gvpc' || forcing === 'module') {
        tutorial.watch = spawnBonus(bonuses, spawnX + Math.floor(spacing / 2), bacterium, undefined, forcing, difficulty.powerups);
        tutorial.forcing = null;
      } else if (Math.random() < BONUS_SPAWN_CHANCE) {
        spawnBonus(bonuses, spawnX + Math.floor(spacing / 2), bacterium, allowedBonusKinds(tutorial), null, difficulty.powerups);
      }
    }

    if (tutorial && tutorial.watch && tutorialWatchVisible(tutorial.watch)) {
      tutorial.card = TUTORIAL_FEATURES[tutorial.stage][0];
    }

    const outOfBounds = bacterium.y < bacterium.halfHeight || bacterium.y > HEIGHT - bacterium.halfHeight;

    if (bacterium.invulnerableTimer <= 0 && (hit || outOfBounds)) {
      if (bacterium.shell > 0) {
        bacterium.absorbHit();
        if (outOfBounds) {
          // Push back into the water column so the wall is survivable.
          const top = bacterium.y < HEIGHT / 2;
          bacterium.y = top ? bacterium.halfHeight + 2 : HEIGHT - bacterium.halfHeight - 2;
          bacterium.velocityY = top ? SHELL_BOUNCE_SPEED : -SHELL_BOUNCE_SPEED;
        }
      } else {
        gameOver = true;
      }
    }

    if (gameOver) {
      newHighscore = score > bestFor(progress, difficulty);
      runStats.score = score;
      recordRun(progress, selectedCharacter, score, runStats, difficulty);
      const completed = checkMissions(progress, runStats);
      if (completed.length) {
        const reward = completed.reduce((sum, mission) => sum + mission.reward, 0);
        missionNotice = `${completed.length} mission(s) done: +${reward} coins`;
      }
      saveProgress(progress);
    }
  }

  drawWaterBackground(ceilingIntensity, biomeIndex, previousBiome, biomeBlend);
  for (const obj of objects) obj.draw();
  for (const bonus of bonuses) bonus.draw();
  for (const hazard of hazards) hazard.draw();
  for (const shot of projectiles) shot.draw();
  if (boss !== null) drawBoss(boss);
  bacterium.draw();
  drawDarkness(bacterium, ceilingIntensity);
  drawVignette();
  drawHud(
    bacterium,
    score,
    difficulty.levels ? (level > 1 ? `Level ${level}` : 'Warm-up') : difficulty.name,
    BIOMES[biomeIndex].name,
    bestScore,
    progress.coins,
  );
  drawRunMissionsPanel(new Rect(WIDTH - 230, 12, 215, 93), progress.missions, runStats, score);

  if (tutorialTimer > 0) drawTutorialHint(tutorialTimer);
  else if (tutorial && !tutorial.card) drawTutorialProgress(tutorial.stage);
  if (runBannerTimer > 0) {
    drawBannerText(runBanner, runBannerColor, 178, 255 * Math.min(1.0, runBannerTimer / 0.5));
  }
  if (biomeNoticeTimer > 0) {
    drawBannerText(`Entering: ${BIOMES[biomeIndex].name}`, PANEL_BORDER, 138, 255 * Math.min(1.0, biomeNoticeTimer / 0.5));
  }

  if (gameOver) drawGameOver(score, newHighscore, missionNotice);
  else if (paused) drawPauseOverlay();
  else if (tutorial && tutorial.card) drawTutorialCard(tutorial.card, tutorial.watch, tutorial.stage);
}

function frame(dt) {
  if (state === 'stats') {
    drawStatsPage(progress, menuRects.back);
  } else if (state === 'menu' || state === 'characters' || state === 'shop') {
    menuNoticeTimer = Math.max(0.0, menuNoticeTimer - dt);
    const menu = menuState();
    if (state === 'characters') drawCharactersScreen(menu, menuRects);
    else if (state === 'shop') drawShopScreen(menu, menuRects);
    else drawMenu(menu, menuRects);
  } else {
    playFrame(dt);
  }
}

let lastTimestamp = null;
function loop(timestamp) {
  requestAnimationFrame(loop);
  const dt = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  frame(dt);
}
requestAnimationFrame(loop);
