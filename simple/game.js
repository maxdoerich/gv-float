'use strict';

// GV Float, simple edition: three skins, no SpyCatcher upgrades.
// GV Float, browser edition. This file holds the constants, the game data and
// the pure game logic (progress, missions, unlocks). Drawing lives in gfx.js
// and screens.js, the entities in entities.js, the main loop in main.js.

const WIDTH = 900;
const HEIGHT = 600;
const FPS = 60;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- utilities

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const now = () => performance.now() / 1000;
const rand = (low, high) => low + Math.random() * (high - low);
const randint = (low, high) => low + Math.floor(Math.random() * (high - low + 1));
const choice = (items) => items[Math.floor(Math.random() * items.length)];

function weightedChoice(items, weights) {
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = Math.random() * total;
  for (let index = 0; index < items.length; index++) {
    roll -= weights[index];
    if (roll < 0) return items[index];
  }
  return items[items.length - 1];
}

/** Small deterministic PRNG (mulberry32), for textures that must not change per frame. */
function seededRandom(seed) {
  let state = Math.floor(seed * 4294967296) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: next,
    uniform: (low, high) => low + next() * (high - low),
    randint: (low, high) => low + Math.floor(next() * (high - low + 1)),
    choice: (items) => items[Math.floor(next() * items.length)],
  };
}

// ------------------------------------------------------------------ physics

const BACTERIUM_X = 180;
const GRAVITY = 0.10;
const MAX_BUOYANCY = 0.20;
const DRAG = 0.985;
const MAX_VERTICAL_SPEED = 6;

// The base rates preserve the earlier ratio: collapse is faster than production.
const GV_PRODUCTION_RATE = 0.40;
const GV_COLLAPSE_RATE = 1.20;
const GV_HOLD_ACCELERATION = 1.35;
const MAX_GV_PRODUCTION_MULTIPLIER = 5.0;
const MAX_GV_COLLAPSE_MULTIPLIER = 5.0;

// Difficulty
const BASE_SCROLL_SPEED = 3.0;
const MAX_SCROLL_SPEED = 6.0;
const BASE_OBSTACLE_GAP = 190;
const MIN_OBSTACLE_GAP = 125;
const BASE_OBSTACLE_SPACING = 320;
const MIN_OBSTACLE_SPACING = 235;
const DIFFICULTY_STEP_SCORE = 5;
// Both systems are always on, but they only join in once the run is going.
const LEVEL_START_SCORE = 20;
const TRANSDUCER_START_SCORE = 12;

// Transducers
const TRANSDUCER_SPAWN_CHANCE = 0.35;
const MIN_NORMALS_BETWEEN_TRANSDUCERS = 1;
const MAX_NORMALS_BETWEEN_TRANSDUCERS = 4;
const TRANSDUCER_WIDTH = 54;
const TRANSDUCER_START_COLLAPSE = 0.30;
const TRANSDUCER_COLLAPSE_STEP = 0.05;
const TRANSDUCER_MAX_COLLAPSE = 0.80;
const TRANSDUCER_GV_FLOOR = 20.0;
const TRANSDUCER_PUSH_IMPULSE = 2.6;
const TRANSDUCER_KINDS = ['collapse', 'top', 'bottom'];

// A single GvpC helix can be bound: it reinforces the shell and absorbs one hit.
const MAX_SHELL_LAYERS = 1;
const GVPC_RADIUS = 15;
const SHELL_HIT_INVULNERABILITY = 1.0;
const SHELL_BOUNCE_SPEED = 2.5;

// SpyCatcher fusions clip onto the SpyTag of the bound GvpC.
const MODULE_KINDS = ['gfp', 'antibody', 'granzyme', 'ampicillin'];
const MODULE_LABELS = {
  gfp: 'SpyCatcher-GFP',
  antibody: 'SpyCatcher-Antibody',
  granzyme: 'SpyCatcher-Granzyme',
  ampicillin: 'SpyCatcher-Ampicillin',
};
const MODULE_SHORT = { gfp: 'GFP', antibody: 'Antibody', granzyme: 'Granzyme', ampicillin: 'Amp' };
const MODULE_BASE_DURATION = { gfp: 6.0, antibody: 10.0, granzyme: 5.0 };
const COIN_MAGNET_RADIUS = 90;
const MAGNET_SPEED = 4.5;

// Ampicillin doesn't expire: it's a magazine, not a timer.
const AMPICILLIN_BASE_SHOTS = 5;
const AMPICILLIN_SHOT_SPEED = 8.5;

// Bonus spawning: one bonus per obstacle gap keeps the water readable.
const BONUS_SPAWN_CHANCE = 0.85;
const COIN_WEIGHT = 6;
const GVPC_WEIGHT = 2;
const MODULE_WEIGHT = 2;
const COIN_RADIUS = 11;

// Your own lamp only reaches so far; the light from above comes and goes.
const LIGHT_BASE_RADIUS = 235;
const LIGHT_GFP_RADIUS = 440;
const DARKNESS_ALPHA = 220;
const DARKNESS_GFP_ALPHA = 70;
const CEILING_ON_SECONDS = [4.0, 7.5];
const CEILING_OFF_SECONDS = [3.0, 6.0];
const CEILING_LIGHT_DEPTH = 1.35;

// Characters only change the drawing. Physics and collision size stay identical.
const CHARACTERS = ['E. coli', 'HEK cell', 'Purified GVs'];
// Collision box per skin: half width and half height around the centre.
// Measured from the drawn sprites and pulled in a pixel or two on round shapes,
// so thin flagella and rounded corners never cost a life.
const HITBOXES = {
  'E. coli': [19, 12],
  'HEK cell': [17, 17],
  'Purified GVs': [13, 13],
};

// Difficulty presets, picked in the start menu.
//   levels:     the level system (the current speeds up from score 20 on)
//   transducer: multiplier on how much GV a collapse field destroys
//   hazards:    multiplier on how often macrophages and ciliates swim in
//   powerups:   multiplier on how often SpyCatchers and GvpC show up
const DIFFICULTIES = [
  { name: 'Relaxed', levels: false, transducer: 0.5, hazards: 0.5, powerups: 2.0, color: [211, 252, 255] },
  { name: 'Easy', levels: true, transducer: 0.75, hazards: 0.75, powerups: 1.5, color: [138, 212, 220] },
  { name: 'Normal', levels: true, transducer: 1.0, hazards: 1.0, powerups: 1.0, color: [255, 188, 142] },
  { name: 'Hard', levels: true, transducer: 1.25, hazards: 1.4, powerups: 0.7, color: [243, 125, 70] },
];
const DEFAULT_DIFFICULTY = 'Normal';
const KILL_COINS = 5;

const DIFFICULTY_NAMES = DIFFICULTIES.map((d) => d.name);

function findDifficulty(name) {
  return DIFFICULTIES.find((d) => d.name === name) || DIFFICULTIES.find((d) => d.name === DEFAULT_DIFFICULTY);
}

function difficultyLines(difficulty) {
  const percent = (value) => `${(value * 100).toFixed(0)}%`;
  return [
    'Level system: ' + (difficulty.levels ? 'on' : 'off'),
    `Transducer collapse: ${percent(difficulty.transducer)}`,
    `Incoming cells: ${percent(difficulty.hazards)}`,
    `SpyCatchers & GvpC: ${percent(difficulty.powerups)}`,
  ];
}

// E. coli is free, HEK cell unlocks with a personal best of HEK_UNLOCK_SCORE
// points (price null: it can't be bought), Purified GVs are bought with coins.
const HEK_UNLOCK_SCORE = 20;
const SKIN_PRICES = {
  'E. coli': 0,
  'HEK cell': null,
  'Purified GVs': 50,
};

// Every skin carries one small trait, so buying one changes how a run feels.
const SKIN_PERKS = {
  'E. coli': { label: 'No perk: the plain original', short: 'No perk' },
  'HEK cell': {
    label: 'Sturdy: starts every run with a GvpC shell',
    short: 'Starts with a GvpC shell',
    start_shell: 1,
  },
  'Purified GVs': { label: 'Bare vesicles: +15% GV production', short: '+15% GV production', production: 1.15 },
};

// The water changes as you get deeper into a run.
const BIOMES = [
  { name: 'Sunlit shallows', score: 0, top: [168, 230, 236], bottom: [30, 78, 80], pillar: [59, 124, 122] },
  { name: 'Kelp forest', score: 15, top: [138, 212, 200], bottom: [20, 62, 56], pillar: [74, 140, 110] },
  { name: 'Midnight zone', score: 35, top: [92, 164, 172], bottom: [8, 30, 36], pillar: [42, 96, 112] },
  { name: 'Hydrothermal vents', score: 60, top: [245, 196, 165], bottom: [44, 26, 22], pillar: [213, 100, 40] },
];
const BIOME_FADE_SECONDS = 2.0;

// Missions are checked once a run ends and pay out in coins.
const MISSION_TEMPLATES = [
  ['coins', '{target} coins in a run', [15, 25, 40]],
  ['score', 'Reach score {target}', [10, 20, 30]],
  ['kills', '{target} Granzyme kills', [2, 4, 6]],
  ['modules', 'Bind {target} SpyCatchers', [2, 3, 5]],
  ['gvpc', 'Collect {target} GvpC', [2, 3, 4]],
];
const MISSION_REWARDS = [20, 35, 55];
const ACTIVE_MISSIONS = 3;

const TUTORIAL_SECONDS = 9.0;
const TUTORIAL_STEPS = [
  [9.0, 'Hold W or UP: build gas vesicles and rise'],
  [6.0, 'Hold S or DOWN: collapse them and sink'],
  [3.0, 'Keep an eye on the gauge and aim for the gaps'],
];
// After the controls, every new thing gets its own stop the first time it shows up.
// The score is when it is sent in; it reaches the player a few gaps later.
const TUTORIAL_FEATURES = [
  ['gvpc', 1],
  ['module', 4],
  ['hazards', 7],
  ['transducer', 10],
];
const TUTORIAL_CARDS = {
  gvpc: [
    'GvpC',
    [
      'GvpC is a protein that wraps around your gas vesicles.',
      'Pick it up to reinforce the shell: it absorbs one hit',
      'from a pillar, a cell or the edge of the water.',
      'The GvpC pip in the top-left shows whether it is bound.',
    ],
  ],
  module: [
    'SpyCatcher modules',
    [
      'SpyCatcher fusions clip onto your vesicles for a few seconds.',
      'GFP lights up the dark  ·  Antibody pulls in coins and GvpC',
      'Granzyme kills cells on contact for a few seconds.',
      'Ampicillin loads 5 shots: SPACE fires one straight ahead.',
      "The timer (or shot count) next to GvpC shows what's left.",
    ],
  ],
  hazards: [
    'Drifting cells',
    [
      'Macrophages and ciliates swim straight at you.',
      'Touching one costs your GvpC shell, or the run.',
      'Dodge them, or bind Granzyme and kill them.',
    ],
  ],
  transducer: [
    'Transducers',
    [
      'Ultrasound fields cover the whole water column.',
      'Blue collapses part of your GVs; no production inside.',
      'Purple presses you up or down: follow the arrows.',
      'Get your GV level ready before you enter.',
    ],
  ],
};

// Drifting cells swim toward the player and have to be dodged.
const HAZARD_KINDS = ['macrophage', 'ciliate'];
const HAZARD_INTERVAL = [2.6, 5.2];

// Dendritic-cell boss: a giant dendritic cell docks at the right edge every
// BOSS_SCORE_INTERVAL points. The player always has Ampicillin (it refills
// during the fight); the only way to hurt the boss is to shoot the weak spots
// it exposes now and then. It lashes out with telegraphed tentacles and spits
// out smaller cells. Every repeat ramps up.
const BOSS_SCORE_INTERVAL = 50;
const BOSS_X = WIDTH - 60;
const BOSS_RADIUS = 125;
const BOSS_ENTER_SECONDS = 2.0;
const BOSS_DEFEATED_SECONDS = 1.6;
const BOSS_BASE_HITS = 4;
const BOSS_MAX_HITS = 8;
const BOSS_WEAKPOINT_SECONDS = 3.2;
const BOSS_WEAKPOINT_HIDDEN_SECONDS = [2.5, 4.0];
const BOSS_AMMO_REGEN_SECONDS = 0.7;
const BOSS_ATTACK_INTERVAL = [2.4, 4.0];
const BOSS_TENTACLE_WARN_SECONDS = 1.1;
const BOSS_TENTACLE_MIN_WARN_SECONDS = 0.65;
const BOSS_TENTACLE_LOCK_FRACTION = 0.4;
const BOSS_TENTACLE_STRIKE_SECONDS = 0.22;
const BOSS_TENTACLE_HOLD_SECONDS = 0.35;
const BOSS_TENTACLE_RETRACT_SECONDS = 0.25;
const BOSS_TENTACLE_LENGTH = 1100;
const BOSS_TENTACLE_HIT_WIDTH = 14;
const BOSS_REWARD_COINS = 40;
const BOSS_REWARD_PER_STAGE = 10;
const BOSS_COLOR = [213, 100, 40];
const BOSS_WEAK_COLOR = [211, 252, 255];

// Where the browser keeps coins and skins. Its own key, so the full game's save stays untouched.
const PROGRESS_KEY = 'gv_float_simple_progress';

// ------------------------------------------------------------------- colours

// iGEM Heidelberg 2026 (VOYAGE) palette: Cayenne Red E55B00, Atomic Tangerine F37D46,
// Peach Glow FFBC8E, Frosted Blue 8AD4DC, Pine Blue 3B7C7A, Light Cyan D3FCFF.
const WATER_TOP = [168, 230, 236];
const WATER_BOTTOM = [30, 78, 80];
const PANEL = [30, 76, 78];
const PANEL_BORDER = [138, 212, 220];
const BACTERIUM_COLOR = [240, 200, 80];
const BACTERIUM_OUTLINE = [16, 50, 52];
const GV_COLOR = [211, 252, 255];
const GV_OUTLINE = [138, 212, 220];
const OBSTACLE_COLOR = [59, 124, 122];
const SAND_COLOR = [240, 170, 125];
const TRANSDUCER_COLOR = [47, 185, 225];
const TRANSDUCER_CORE = [190, 244, 255];
const TRANSDUCER_PUSH_COLOR = [160, 105, 230];
const TRANSDUCER_PUSH_CORE = [224, 202, 255];
const GVPC_COLOR = [255, 178, 96];
const GVPC_CORE = [255, 228, 185];
const SHELL_COLOR = [150, 225, 255];
const GFP_COLOR = [120, 240, 120];
const ANTIBODY_COLOR = [235, 225, 130];
const GRANZYME_COLOR = [255, 115, 95];
const AMPICILLIN_COLOR = [140, 195, 250];
const COIN_COLOR = [255, 188, 142];
const COIN_EDGE = [229, 91, 0];
const ECOLI_COLOR = [243, 125, 70];
const HEK_COLOR = [255, 188, 142];
const HEK_NUCLEUS = [59, 124, 122];
const WHITE = [255, 255, 255];
const GRAY = [170, 205, 205];
const RED = [229, 91, 0];
const YELLOW = [255, 188, 142];
const GREEN = [138, 212, 220];
const ORANGE = [243, 125, 70];
const BLACK = [20, 20, 20];
const TITLE_COLOR = [229, 91, 0];
const TITLE_SHADOW = [245, 191, 149];
const LIGHT_CYAN = [211, 252, 255];

function lerpColor(a, b, t) {
  return [
    Math.trunc(a[0] + (b[0] - a[0]) * t),
    Math.trunc(a[1] + (b[1] - a[1]) * t),
    Math.trunc(a[2] + (b[2] - a[2]) * t),
  ];
}
const lighten = (color, amount) => lerpColor(color, WHITE, amount);
const darken = (color, amount) => lerpColor(color, [0, 0, 0], amount);

// ------------------------------------------------------------------ progress

const MISSION_KINDS = MISSION_TEMPLATES.map((template) => template[0]);
const EMPTY_RUN_STATS = () => ({ coins: 0, score: 0, kills: 0, modules: 0, gvpc: 0 });

function emptyStats() {
  return {
    runs: 0,
    best_score: 0,
    best_by_difficulty: {},
    total_score: 0,
    coins_earned: 0,
    cells_killed: 0,
    gvpc: 0,
    modules: 0,
    missions_done: 0,
    bosses_defeated: 0,
    skin_runs: {},
  };
}

function toInt(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

/** Coins and owned skins. Personal bests live in stats.best_by_difficulty. */
function loadProgress() {
  const progress = {
    coins: 0,
    owned: [],
    missions: [],
    stats: emptyStats(),
    tutorial_done: false,
    tutorial_stage: 0,
    difficulty: DEFAULT_DIFFICULTY,
  };
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return progress;
    const data = JSON.parse(raw);
    progress.coins = Math.max(0, toInt(data.coins));
    progress.owned = (data.owned || []).filter((name) => name in SKIN_PRICES);
    progress.tutorial_done = Boolean(data.tutorial_done);
    progress.tutorial_stage = clamp(toInt(data.tutorial_stage), 0, TUTORIAL_FEATURES.length);
    progress.difficulty = findDifficulty(data.difficulty).name;
    progress.missions = (data.missions || []).filter(
      (mission) => mission && typeof mission === 'object' && MISSION_KINDS.includes(mission.kind),
    );
    const stats = data.stats || {};
    for (const key of Object.keys(progress.stats)) {
      if (key === 'best_by_difficulty') {
        const bests = stats[key];
        progress.stats[key] = {};
        if (bests && typeof bests === 'object') {
          for (const [name, value] of Object.entries(bests)) {
            if (DIFFICULTY_NAMES.includes(name)) progress.stats[key][name] = Math.max(0, toInt(value));
          }
        }
      } else if (key === 'skin_runs') {
        const runs = stats[key];
        progress.stats[key] = {};
        if (runs && typeof runs === 'object') {
          for (const [name, count] of Object.entries(runs)) {
            if (name in SKIN_PRICES) progress.stats[key][name] = toInt(count);
          }
        }
      } else {
        progress.stats[key] = Math.max(0, toInt(stats[key]));
      }
    }
    if (!('best_by_difficulty' in stats)) {
      // Saves from before per-difficulty bests: those runs were all Normal.
      progress.stats.best_by_difficulty = { [DEFAULT_DIFFICULTY]: progress.stats.best_score };
    }
  } catch (error) {
    // Unreadable or missing save: start fresh with whatever was parsed so far.
  }
  checkHekUnlock(progress);
  return progress;
}

function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (error) {
    // Private mode or a full disk: the run still works, it just won't be remembered.
  }
}

const bestFor = (progress, difficulty) => progress.stats.best_by_difficulty[difficulty.name] || 0;

const owns = (character, progress) => SKIN_PRICES[character] === 0 || progress.owned.includes(character);

/** A personal best of HEK_UNLOCK_SCORE unlocks the HEK cell. `score` is the run in progress, if any. */
function checkHekUnlock(progress, score = 0) {
  if (progress.owned.includes('HEK cell')) return false;
  if (Math.max(progress.stats.best_score, score) < HEK_UNLOCK_SCORE) return false;
  progress.owned.push('HEK cell');
  return true;
}

const skinShortText = (character) => SKIN_PERKS[character].short;

function lockedSkinReason(character, progress) {
  return `unlocks at a record of ${HEK_UNLOCK_SCORE} (now ${progress.stats.best_score})`;
}

/** Short enough to sit on the button itself without crowding the name. */
const lockedSkinBadge = () => `record ${HEK_UNLOCK_SCORE}`;

function makeMission(takenKinds) {
  let choices = MISSION_TEMPLATES.filter((t) => !takenKinds.has(t[0]));
  if (!choices.length) choices = MISSION_TEMPLATES;
  const [kind, text, targets] = choice(choices);
  const tier = Math.floor(Math.random() * targets.length);
  return {
    kind,
    target: targets[tier],
    reward: MISSION_REWARDS[tier],
    text: text.replace('{target}', targets[tier]),
  };
}

function ensureMissions(progress) {
  while (progress.missions.length < ACTIVE_MISSIONS) {
    const taken = new Set(progress.missions.map((mission) => mission.kind));
    progress.missions.push(makeMission(taken));
  }
}

/** Pay out finished missions and roll fresh ones in their place. */
function checkMissions(progress, runStats) {
  const done = [];
  const kept = [];
  for (const mission of progress.missions) {
    if (runStats[mission.kind] >= mission.target) {
      progress.coins += mission.reward;
      progress.stats.missions_done += 1;
      done.push(mission);
    } else {
      kept.push(mission);
    }
  }
  progress.missions = kept;
  ensureMissions(progress);
  return done;
}

function recordRun(progress, character, score, runStats, difficulty) {
  const stats = progress.stats;
  const bests = stats.best_by_difficulty;
  bests[difficulty.name] = Math.max(bests[difficulty.name] || 0, score);
  stats.runs += 1;
  stats.total_score += score;
  stats.best_score = Math.max(stats.best_score, score);
  stats.coins_earned += runStats.coins;
  stats.cells_killed += runStats.kills;
  stats.gvpc += runStats.gvpc;
  stats.modules += runStats.modules;
  stats.skin_runs[character] = (stats.skin_runs[character] || 0) + 1;
}

/** Returns [level, speed, gap, spacing]. */
function difficultyForScore(score, difficulty = null) {
  if (score < LEVEL_START_SCORE || (difficulty && !difficulty.levels)) {
    return [1, BASE_SCROLL_SPEED, BASE_OBSTACLE_GAP, BASE_OBSTACLE_SPACING];
  }
  const steps = Math.floor((score - LEVEL_START_SCORE) / DIFFICULTY_STEP_SCORE) + 1;
  const level = steps + 1;
  const speed = Math.min(MAX_SCROLL_SPEED, BASE_SCROLL_SPEED + steps * 0.18);
  const gap = Math.max(MIN_OBSTACLE_GAP, BASE_OBSTACLE_GAP - steps * 5);
  const spacing = Math.max(MIN_OBSTACLE_SPACING, BASE_OBSTACLE_SPACING - steps * 6);
  return [level, speed, gap, spacing];
}

/** First transducer: 30%, then +5 percentage points, capped at 80%. */
function transducerStrength(transducerNumber) {
  return Math.min(
    TRANSDUCER_MAX_COLLAPSE,
    TRANSDUCER_START_COLLAPSE + (transducerNumber - 1) * TRANSDUCER_COLLAPSE_STEP,
  );
}

const GV_POSITIONS = [
  [-9, -7], [0, -9], [9, -6], [-11, 2],
  [0, 0], [11, 3], [-6, 9], [6, 9],
];

function biomeForScore(score) {
  let index = 0;
  BIOMES.forEach((biome, number) => {
    if (score >= biome.score) index = number;
  });
  return index;
}

function gvBarColor(gvLevel) {
  if (gvLevel < 25) return RED;
  if (gvLevel < 50) return ORANGE;
  return GREEN;
}

function moduleColor(kind) {
  return { gfp: GFP_COLOR, antibody: ANTIBODY_COLOR, granzyme: GRANZYME_COLOR, ampicillin: AMPICILLIN_COLOR }[kind];
}

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

const CSS_CACHE = new Map();
const CSS_CACHE_LIMIT = 4096;
const byte = (value) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/**
 * CSS colour for [r, g, b] or [r, g, b, a(0-255)], times an extra 0-1 alpha.
 * Called for nearly every shape every frame, so the strings are cached (alpha in 1/255 steps).
 */
function css(color, alpha = 1) {
  const a = byte((color.length > 3 ? color[3] : 255) * alpha);
  const key = ((byte(color[0]) * 256 + byte(color[1])) * 256 + byte(color[2])) * 256 + a;
  let value = CSS_CACHE.get(key);
  if (value === undefined) {
    if (CSS_CACHE.size >= CSS_CACHE_LIMIT) CSS_CACHE.clear();
    value = `rgba(${byte(color[0])},${byte(color[1])},${byte(color[2])},${a / 255})`;
    CSS_CACHE.set(key, value);
  }
  return value;
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

const GLOW_SPRITE_SIZE = 256;
const glowSprites = new Map();

/** One pre-rendered glow per colour and falloff; drawing it scaled is far cheaper than a fresh gradient. */
function glowSprite(color, power) {
  const key = `${color[0]},${color[1]},${color[2]},${color[3] ?? 255},${power}`;
  let sprite = glowSprites.get(key);
  if (!sprite) {
    sprite = makeCanvas(GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
    const g = sprite.getContext('2d');
    const half = GLOW_SPRITE_SIZE / 2;
    const gradient = g.createRadialGradient(half, half, 0, half, half, half);
    for (let step = 0; step <= 10; step++) {
      const t = step / 10;
      gradient.addColorStop(t, css(color, Math.pow(1 - t, power)));
    }
    g.fillStyle = gradient;
    g.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
    glowSprites.set(key, sprite);
  }
  return sprite;
}

/** Soft radial blob: brightest in the middle, fading with (1 - r)^power. */
function glow(cx, cy, radius, color, maxAlpha, power = 1.5) {
  if (radius <= 0) return;
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * Math.min(1, maxAlpha / 255);
  ctx.drawImage(glowSprite(color, power), cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.globalAlpha = previousAlpha;
}

// --------------------------------------------------------------------- text

const FAMILY = '"Nunito Sans", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
const FONT = { size: 22, bold: false };
const SMALL_FONT = { size: 16, bold: false };
const MEDIUM_FONT = { size: 30, bold: true };
const BIG_FONT = { size: 48, bold: true };
const TITLE_FONT = { size: 72, bold: true };
const GAUGE_FONT = { size: 11, bold: true };
const TINY_FONT = { size: 13, bold: false };

const fontStrings = new WeakMap();
function fontString(font) {
  let value = fontStrings.get(font);
  if (value === undefined) {
    value = `${font.bold ? 900 : 600} ${font.size}px ${FAMILY}`;
    fontStrings.set(font, value);
  }
  return value;
}

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

const textWidthCache = new Map();
const TEXT_WIDTH_CACHE_LIMIT = 800;

/** measureText is slow and the same labels are measured every frame, so remember the widths. */
function textWidth(font, text) {
  const fontKey = fontString(font);
  const key = `${fontKey}|${text}`;
  let width = textWidthCache.get(key);
  if (width === undefined) {
    ctx.font = fontKey;
    width = ctx.measureText(text).width;
    if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) textWidthCache.clear();
    textWidthCache.set(key, width);
  }
  return width;
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

/** Text placed by a pygame-style anchor. Use textRect() to get the rectangle it covers. */
function drawText(font, text, color, x, y, anchor = 'topleft', shadow = true, alpha = 255) {
  const metrics = fontMetrics(font);
  const width = textWidth(font, text);
  ctx.font = fontString(font);
  const [horizontal, vertical] = ANCHORS[anchor];
  const top = vertical === 'top' ? y : vertical === 'mid' ? y - metrics.height / 2 : y - metrics.height;
  const left = horizontal === 'left' ? x : horizontal === 'center' ? x - width / 2 : x - width;
  const baseline = top + metrics.ascent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (shadow) {
    ctx.fillStyle = css([16, 50, 52], (150 / 255) * (alpha / 255));
    ctx.fillText(text, left + 2, baseline + 2);
  }
  ctx.fillStyle = css(color, alpha / 255);
  ctx.fillText(text, left, baseline);
}

/** Page-title style from the VOYAGE wiki: Cayenne face over a hard Peach offset. */
function drawTitle(font, text, x, y, anchor = 'midtop', alpha = 255) {
  const offset = Math.max(2, Math.round(font.size * 0.055));
  drawText(font, text, TITLE_SHADOW, x + offset, y + offset, anchor, false, alpha);
  drawText(font, text, TITLE_COLOR, x, y, anchor, false, alpha);
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
      image.data[offset] = 10;
      image.data[offset + 1] = 40;
      image.data[offset + 2] = 42;
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
const DEPTH_LINE_COLORS = BIOMES.map((biome) => DEPTH_MARKS.map((depth) => lighten(biomeColorAt(biome, depth), 0.08)));
const SURFACE_FILL_COLORS = BIOMES.map((biome) => lighten(biome.top, 0.35));
const SURFACE_LINE_COLORS = BIOMES.map((biome) => lighten(biome.top, 0.65));
const SAND_FILL_COLOR = darken(SAND_COLOR, 0.35);
const SAND_LINE_COLOR = darken(SAND_COLOR, 0.1);
const SAND_POINTS = [];
for (let x = 0; x < WIDTH + 20; x += 15) {
  SAND_POINTS.push([x, HEIGHT - 10 + Math.sin(x * 0.021) * 4 + Math.sin(x * 0.057 + 1) * 2]);
}
const SAND_POLY = [[0, HEIGHT], ...SAND_POINTS, [WIDTH, HEIGHT]];

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

  for (let mark = 0; mark < DEPTH_MARKS.length; mark++) {
    const depth = DEPTH_MARKS[mark];
    ctx.fillStyle = css(DEPTH_LINE_COLORS[biome][mark]);
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

  const surfacePoints = [];
  for (let x = 0; x < WIDTH + 20; x += 20) surfacePoints.push([x, 4 + Math.sin(x * 0.03 + t * 2.0) * 2.5]);
  fillPoly([[0, 0], ...surfacePoints, [WIDTH, 0]], SURFACE_FILL_COLORS[biome]);
  drawPolyline(surfacePoints, SURFACE_LINE_COLORS[biome], 2);

  fillPoly(SAND_POLY, SAND_FILL_COLOR);
  drawPolyline(SAND_POINTS, SAND_LINE_COLOR, 2);
}

/** Menu backdrop in the look of the VOYAGE illustrations: Light Cyan fading to Frosted Blue. */
function makeMenuBackdrop() {
  const surface = makeCanvas(WIDTH, HEIGHT);
  const g = surface.getContext('2d');
  const gradient = g.createRadialGradient(WIDTH / 2, -HEIGHT * 0.25, 0, WIDTH / 2, -HEIGHT * 0.25, HEIGHT * 1.45);
  gradient.addColorStop(0, css(LIGHT_CYAN));
  gradient.addColorStop(1, css(PANEL_BORDER));
  g.fillStyle = gradient;
  g.fillRect(0, 0, WIDTH, HEIGHT);
  return surface;
}
const MENU_BACKDROP = makeMenuBackdrop();

function drawMenuBackdrop() {
  ctx.drawImage(MENU_BACKDROP, 0, 0);
  ctx.globalAlpha = 0.6;
  ctx.drawImage(LIGHT_RAYS, -120 + Math.sin(now() * 0.25) * 90, 0);
  ctx.globalAlpha = 1;
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
  darkImage.data[offset] = 30;
  darkImage.data[offset + 1] = 72;
  darkImage.data[offset + 2] = 72;
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

// pow(u, 0.9) for u in 0..1 in 1024 steps: the lamp falloff, without a pow() per pixel.
const LAMP_STEPS = 1024;
const LAMP_FALLOFF = Float32Array.from({ length: LAMP_STEPS + 1 }, (_, step) => Math.pow(step / LAMP_STEPS, 0.9));

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
    // Outside the lamp's circle only the ceiling light counts, which is the same for the whole row.
    const outside = Math.min(255 * Math.min(row, 1), baseAlpha);
    let from = 0;
    let to = -1;
    if (dy * dy < halfSquared) {
      const reach = Math.sqrt(halfSquared - dy * dy);
      from = Math.max(0, Math.floor(cx - reach));
      to = Math.min(DARK_W - 1, Math.ceil(cx + reach));
    }
    let offset = y * DARK_W * 4 + 3;
    for (let x = 0; x < DARK_W; x++, offset += 4) {
      if (x < from || x > to) {
        data[offset] = outside;
        continue;
      }
      const dx = x - cx;
      const distanceSquared = dx * dx + dy * dy;
      const lamp = distanceSquared >= halfSquared ? 1 : LAMP_FALLOFF[Math.trunc((distanceSquared / halfSquared) * LAMP_STEPS)];
      const light = 255 * (row < lamp ? row : lamp);
      data[offset] = light < baseAlpha ? light : baseAlpha;
    }
  }
  darkContext.putImageData(darkImage, 0, 0);
  ctx.drawImage(darkCanvas, 0, 0, WIDTH, HEIGHT);
}

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

// ---- small module icons, shared by pickups, and the HUD

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
    this.infiniteAmpicillin = false;
    this.bubbles = [];
  }

  /** Applies the skin's start perk (the simple edition has no SpyCatcher upgrades). */
  applyPerks() {
    this.shell = Math.min(MAX_SHELL_LAYERS, this.perk.start_shell ?? 0);
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
    const shot = new AmpicillinShot(this.x + this.halfWidth + 6, this.y);
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
    for (const bubble of this.bubbles) drawBubble(Math.trunc(bubble.x), Math.trunc(bubble.y), bubble.radius);

    if (showGlow && this.character !== 'Purified GVs') {
      glow(this.x, this.y, 42 * (1.0 + 0.04 * Math.sin(t * 3)), [138, 212, 220], 55, 1.6);
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

    if (this.character === 'E. coli') drawEcoli(cx, cy, t);
    else if (this.character === 'HEK cell') drawHek(cx, cy, t);

    if (this.character === 'Purified GVs') {
      drawPurified(cx, cy, t, visibleGvs);
    } else {
      // Show the current GV level inside the cell characters.
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

  getRect() {
    return new Rect(
      Math.trunc(this.x - this.halfWidth),
      Math.trunc(this.y - this.halfHeight),
      this.halfWidth * 2,
      this.halfHeight * 2,
    );
  }
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
      ringEllipse(rx, ry, 7, 13, [59, 124, 122, 170], 1);
    }
  });
}

// ---------------------------------------------------------------- obstacles

/** A protein pillar texture, cached on its own canvas. */
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

    // Space-filling protein surface, like the VOYAGE illustrations: flat
    // overlapping atoms, each with a darker rim.
    fillRect(0, 0, width, height, darken(base, 0.3));
    const rng = seededRandom(seed);
    const atoms = Math.max(4, Math.floor((width * height) / 70));
    for (let atom = 0; atom < atoms; atom++) {
      const r = rng.uniform(6, 10);
      const ax = rng.uniform(-2, width + 2);
      const ay = rng.uniform(-2, height + 2);
      fillCircle(ax, ay, r, darken(base, 0.2));
      fillCircle(ax - r * 0.15, ay - r * 0.15, r * 0.8, rng.random() < 0.8 ? base : lighten(base, 0.15));
    }
    // A firm edge on the side facing the gap, so the collision line stays readable.
    fillRect(0, capAtBottom ? height - 3 : 0, width, 3, darken(base, 0.45));
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
      this.color = [243, 125, 70];
    } else {
      this.radius = 14;
      this.extraSpeed = 2.2;
      this.amplitude = rand(24, 46);
      this.color = [229, 91, 0];
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

/** One fired dose: flies straight ahead. */
class AmpicillinShot {
  constructor(x, y) {
    this.radius = 5;
    this.x = x;
    this.y = y;
    this.vx = AMPICILLIN_SHOT_SPEED;
    this.vy = 0.0;
  }

  update(frameScale) {
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
  glow(cx, cy, Math.trunc(BOSS_RADIUS * 1.5), [255, 188, 142], 55);

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
    fillCircle(px, 164, 6, remaining ? BOSS_COLOR : darken(BOSS_COLOR, 0.75));
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
  bacterium.applyPerks();
  const objects = [];
  const bonuses = [];
  const spawnState = {
    normalSinceTransducer: 0,
    collapseCount: 0,
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

// HUD, menus, statistics and the overlays drawn on top of a run.

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
    drawText(SMALL_FONT, menu.notice, TITLE_COLOR, x, y, 'midtop', false, 255 * Math.min(1.0, menu.noticeTimer / 0.4));
  } else if (idleText) {
    drawText(SMALL_FONT, idleText, PANEL, x, y, 'midtop', false);
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
  fillRect(bar.x, bar.y, bar.w, bar.h, darken(PANEL, 0.5), 2);
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
    fillRect(px, 50, 24, 12, filled ? SHELL_COLOR : darken(PANEL, 0.3), 6);
    ringRect(px, 50, 24, 12, filled ? lighten(SHELL_COLOR, 0.4) : lighten(PANEL, 0.2), 1, 6);
  }

  const dividerX = 76 + MAX_SHELL_LAYERS * 28 + 6;
  fillRect(dividerX, 46, 1, 24, lighten(PANEL, 0.2));
  drawModuleStatus(bacterium, new Rect(dividerX + 10, 46, gvPanel.right - 18 - dividerX - 10, 28));

  const bar = new Rect(30, 82, 250, 26);
  fillRect(bar.x, bar.y, bar.w, bar.h, darken(PANEL, 0.5), 13);
  const fillWidth = Math.trunc((bar.w * bacterium.gvLevel) / 100.0);
  if (fillWidth > 0) {
    const color = gvBarColor(bacterium.gvLevel);
    const width = Math.min(Math.max(fillWidth, 14), bar.w);
    fillRect(bar.x, bar.y, width, bar.h, color, 13);
  }
  const neutralX = bar.x + Math.floor(bar.w / 2);
  drawLine(neutralX, bar.y - 4, neutralX, bar.bottom + 4, WHITE, 2);
  ringRect(bar.x, bar.y, bar.w, bar.h, lighten(PANEL, 0.4), 2, 13);
  drawText(SMALL_FONT, 'sink', GRAY, bar.x + 4, bar.bottom + 2, 'topleft', false, 170);
  drawText(SMALL_FONT, 'float', GRAY, bar.right - 4, bar.bottom + 2, 'topright', false, 170);

  drawPanel(new Rect(WIDTH / 2 - 75, 6, 150, 88), 170, PANEL_BORDER, 80, 14);
  drawText(SMALL_FONT, 'SCORE', PANEL_BORDER, WIDTH / 2, 10, 'midtop', false);
  drawText(BIG_FONT, String(score), WHITE, WIDTH / 2, 24, 'midtop');
  drawText(SMALL_FONT, `BEST ${bestScore}`, GRAY, WIDTH / 2, 70, 'midtop', false);

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

    const bar = new Rect(rect.x + 10, Math.trunc(rowY + 16), rect.w - 56, 4);
    fillRect(bar.x, bar.y, bar.w, bar.h, darken(PANEL, 0.5), 2);
    const fillWidth = Math.trunc(bar.w * fraction);
    if (fillWidth > 0) fillRect(bar.x, bar.y, fillWidth, bar.h, done ? GREEN : YELLOW, 2);
    drawText(GAUGE_FONT, `${current}/${mission.target}`, done ? GREEN : GRAY, bar.right + 6, bar.y - 2, 'topleft', false);
  });
}

function drawPauseOverlay() {
  fillRect(0, 0, WIDTH, HEIGHT, [10, 40, 42], 0, 150 / 255);
  const card = new Rect(WIDTH / 2 - 200, 230, 400, 150);
  drawPanel(card, 225, PANEL_BORDER, 200, 18);
  drawText(BIG_FONT, 'PAUSED', WHITE, WIDTH / 2, 252, 'midtop');
  drawText(FONT, 'ESC / P: resume      E: menu', GRAY, WIDTH / 2, 322, 'midtop', false);
}

function drawGameOver(score, newHighscore, missionNotice = '') {
  fillRect(0, 0, WIDTH, HEIGHT, [10, 40, 42], 0, 150 / 255);
  const card = new Rect(WIDTH / 2 - 310, 180, 620, 260);
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
  const text = `Tutorial  ·  ${stage}/${TUTORIAL_FEATURES.length} explained`;
  drawPanel(textRect(SMALL_FONT, text, 'midtop', WIDTH / 2, 130).inflate(22, 6), 150, PANEL_BORDER, 70, 12);
  drawText(SMALL_FONT, text, WHITE, WIDTH / 2, 130, 'midtop', false);
}

function drawTutorialCard(feature, watch, stage) {
  const t = now();
  fillRect(0, 0, WIDTH, HEIGHT, [10, 40, 42], 0, 120 / 255);

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
  else if (price === null) [label, color] = [lockedSkinBadge(), GRAY];
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
  preview.x = rect.x + 28;
  preview.y = rect.centery + (selected ? Math.sin(now() * 3) * 2 : 0);
  preview.gvLevel = 67.0;
  preview.draw({ tilt: false, trail: false });

  drawText(SMALL_FONT, character, selected ? YELLOW : WHITE, rect.x + 56, rect.y + 5, 'topleft', selected);
  drawText(TINY_FONT, skinShortText(character), GVPC_CORE, rect.x + 56, rect.bottom - 6, 'bottomleft', false, selected ? 230 : 190);
  if (selected) {
    drawText(TINY_FONT, 'SELECTED', YELLOW, rect.right - 12, rect.y + 7, 'topright', false);
  }
}

function drawMissionsPanel(rect, missions) {
  drawPanel(rect, 175, PANEL_BORDER, 80, 10);
  drawText(SMALL_FONT, 'MISSIONS', PANEL, rect.centerx, rect.y - 20, 'midtop', false);
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
  preview.gvLevel = 67.0;
  const cx = rect.centerx;
  const cy = rect.y + 102 + Math.sin(t * 2.2) * 5;
  glow(cx, cy, 140, [138, 212, 220], 55, 1.6);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(3.6, 3.6);
  preview.drawSprite(0, 0, t);
  ctx.restore();

  drawText(MEDIUM_FONT, character, YELLOW, rect.centerx, rect.y + 214, 'midtop');
  drawText(SMALL_FONT, skinShortText(character), GVPC_CORE, rect.centerx, rect.y + 254, 'midtop', false);

  const over = mouseOver(changeRect);
  drawPanel(changeRect, over ? 225 : 190, YELLOW, over ? 255 : 170, 10);
  drawText(SMALL_FONT, 'CHANGE CHARACTER', WHITE, changeRect.centerx, changeRect.centery, 'center', false);
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
    difficulty: diffPanel,
    diffPrev: new Rect(diffPanel.x + 14, diffPanel.y + 40, 30, 30),
    diffNext: new Rect(diffPanel.right - 44, diffPanel.y + 40, 30, 30),
    start: new Rect(WIDTH / 2 - 150, 452, 300, 56),
    missions: new Rect(34, 150, 244, 62),
    stats: new Rect(15, 54, 170, 30),
    back: new Rect(WIDTH / 2 - 90, HEIGHT - 70, 180, 44),
  };
  // Character screen: a row of skins.
  rects.characters = CHARACTERS.map(
    (_, index) => new Rect(51 + (index % 3) * 274, 112 + Math.floor(index / 3) * 54, 262, 46),
  );
  return rects;
}

// ------------------------------------------------------------------- screens

function drawMenu(menu, rects) {
  const t = now();
  drawMenuBackdrop();

  const titleY = 10 + Math.sin(t * 1.5) * 4;
  drawTitle(TITLE_FONT, 'GV FLOAT', WIDTH / 2, titleY);

  drawCoinCounter(menu.coins, new Rect(15, 12, 170, 36));

  const statsRect = rects.stats;
  const overStats = mouseOver(statsRect);
  drawPanel(statsRect, overStats ? 200 : 165, PANEL_BORDER, overStats ? 140 : 70, 10);
  drawText(SMALL_FONT, 'STATISTICS', WHITE, statsRect.centerx, statsRect.centery, 'center', false);

  drawMissionsPanel(rects.missions, menu.progress.missions);

  drawCharacterShowcase(rects.showcase, menu.character, menu.progress, rects.change);
  drawDifficultyPanel(rects.difficulty, menu.difficulty, menu.bestScore, rects.diffPrev, rects.diffNext);

  const startRect = rects.start;
  const over = mouseOver(startRect);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  const face = over ? lighten(TITLE_COLOR, 0.15) : lerpColor(TITLE_COLOR, lighten(TITLE_COLOR, 0.08), pulse);
  fillRect(startRect.x + 6, startRect.y + 6, startRect.w, startRect.h, TITLE_SHADOW, 14);
  fillRect(startRect.x, startRect.y, startRect.w, startRect.h, face, 14);
  drawText(MEDIUM_FONT, 'START RUN', WHITE, startRect.centerx, startRect.centery, 'center', false);

  drawMenuNotice(menu, WIDTH / 2, startRect.bottom + 4, 'or press ENTER');
}

function drawCharactersScreen(menu, rects) {
  drawMenuBackdrop();
  drawTitle(BIG_FONT, 'CHARACTERS', WIDTH / 2, 24);
  drawCoinCounter(menu.coins, new Rect(15, 12, 170, 36));

  const ownedCount = CHARACTERS.filter((c) => owns(c, menu.progress)).length;
  drawText(SMALL_FONT, `${ownedCount}/${CHARACTERS.length} unlocked`, PANEL, WIDTH / 2, 84, 'midtop', false);

  CHARACTERS.forEach((character, index) => {
    const rect = rects.characters[index];
    if (owns(character, menu.progress)) {
      drawCharacterButton(rect, character, character === menu.character, menu.progress);
    } else {
      drawLockedCharacterButton(rect, character, menu.progress, menu.pending === character);
    }
  });

  const perk = SKIN_PERKS[menu.character].label;
  drawText(SMALL_FONT, `${menu.character}:  ${perk}`, TITLE_COLOR, WIDTH / 2, 190, 'midtop', false);
  drawText(TINY_FONT, 'Click a locked skin twice to buy it', PANEL, WIDTH / 2, 218, 'midtop', false);
  drawMenuNotice(menu, WIDTH / 2, 252);
  drawBackButton(rects.back);
}

function drawStatsPage(progress, backRect) {
  drawMenuBackdrop();
  drawTitle(TITLE_FONT, 'STATISTICS', WIDTH / 2, 24);

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

// Game state, input handling and the frame loop.

const progress = loadProgress();
const menuRects = menuLayout();

let state = 'menu'; // menu | characters | stats | playing
let selectedCharacter = CHARACTERS[0];
let difficulty = findDifficulty(progress.difficulty);
let bestScore = bestFor(progress, difficulty);

let pendingPurchase = null;
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
  progress.owned.push(item);
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

/** A left click on the menu or the character screen. */
function handleMenuClick(x, y) {
  let clicked = null;
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
    }
  } else if (menuRects.stats.contains(x, y)) {
    state = 'stats';
    return;
  } else if (menuRects.change.contains(x, y)) {
    state = 'characters';
  } else if (menuRects.diffPrev.contains(x, y) || menuRects.diffNext.contains(x, y)) {
    const step = menuRects.diffPrev.contains(x, y) ? -1 : 1;
    const index = DIFFICULTIES.indexOf(difficulty);
    difficulty = DIFFICULTIES[(index + step + DIFFICULTIES.length) % DIFFICULTIES.length];
    progress.difficulty = difficulty.name;
    bestScore = bestFor(progress, difficulty);
    saveProgress(progress);
  }

  if (clicked) {
    const price = SKIN_PRICES[clicked];
    if (price === null) {
      menuNotice = `${clicked} ${lockedSkinReason(clicked, progress)}`;
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
  if (state === 'menu' || state === 'characters') {
    handleMenuClick(x, y);
  } else if (state === 'stats') {
    state = 'menu';
  } else if (state === 'playing' && tutorial && tutorial.card && !gameOver) {
    continueTutorialCard();
  }
}

function handleKeyDown(key) {
  const isEnter = key === 'enter';
  if (state === 'characters' && key === 'escape') {
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
    if (isEnter) startRun();
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
  if (event.repeat) return;
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

// The page decides how big the game may be; the canvas just fills its stage.
// It renders at the screen's pixel density, capped: on a 2x display the full density
// is four times the pixels for little visible gain, and it is what makes weaker GPUs stutter.
const MAX_RENDER_SCALE = 1.5;
const stage = document.getElementById('stage');
function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
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
      shot.update(frameScale);
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
          if (checkHekUnlock(progress, score)) {
            saveProgress(progress);
            bacterium.setNotice('HEK cell unlocked!');
          }
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
      checkHekUnlock(progress);
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

// The drifting bubbles around the game only run in the menus:
// during a run they would compete with the canvas for every frame.
let pageIdle = true;
function syncPageAnimations() {
  const idle = state !== 'playing';
  if (idle === pageIdle) return;
  pageIdle = idle;
  document.body.classList.toggle('in-run', !idle);
}

function frame(dt) {
  syncPageAnimations();
  if (state === 'stats') {
    drawStatsPage(progress, menuRects.back);
  } else if (state === 'menu' || state === 'characters') {
    menuNoticeTimer = Math.max(0.0, menuNoticeTimer - dt);
    const menu = menuState();
    if (state === 'characters') drawCharactersScreen(menu, menuRects);
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

// Page chrome around the game: drifting bubbles and the fullscreen button.

(function decorate() {
  const holder = document.getElementById('bubbles');
  if (holder && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let index = 0; index < 18; index++) {
      const size = 6 + Math.random() * 20;
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.style.width = bubble.style.height = `${size}px`;
      bubble.style.left = `${Math.random() * 100}%`;
      bubble.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
      bubble.style.animationDuration = `${14 + Math.random() * 18}s`;
      bubble.style.animationDelay = `${-Math.random() * 30}s`;
      holder.appendChild(bubble);
    }
  }

  const play = document.getElementById('play');
  const button = document.getElementById('fullscreen');
  if (!button || !play.requestFullscreen) {
    if (button) button.hidden = true;
    return;
  }
  button.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else play.requestFullscreen().catch(() => {});
    button.blur();
  });
})();

// The canvas only picks up Nunito Sans once it has loaded; measured widths were
// taken with the fallback font, so redo them.
if (document.fonts) {
  Promise.all([600, 900].map((weight) => document.fonts.load(`${weight} 16px "Nunito Sans"`)))
    .then(() => {
      textWidthCache.clear();
      fontMetricsCache.clear();
    })
    .catch(() => {});
}
