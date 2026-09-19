'use strict';

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
// Weak out of the box, strong once upgraded.
const MODULE_BASE_DURATION = { gfp: 6.0, antibody: 10.0, granzyme: 5.0 };
const GFP_BONUS_SECONDS = 3.0;
const GRANZYME_BONUS_SECONDS = 2.0;
const COIN_MAGNET_RADIUS = 90;
const ANTIBODY_BONUS_RADIUS = 40;
const MAGNET_SPEED = 4.5;

// Ampicillin doesn't expire: it's a magazine, not a timer. Upgrades add more
// shots; the last upgrade level additionally makes every shot home in.
const AMPICILLIN_BASE_SHOTS = 5;
const AMPICILLIN_BONUS_SHOTS_PER_LEVEL = 2;
const AMPICILLIN_SHOT_SPEED = 8.5;
const AMPICILLIN_HOMING_TURN_RATE = 0.16;

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
const FINAL_SKIN = 'iGEM Legacy';

const CHARACTERS = [
  'E. coli', 'HEK cell', 'Yeast', 'Anabaena', 'Serratia', 'Halobacterium',
  'Salmonella', 'Purified GVs', 'BioBrick', 'Zeppelin', FINAL_SKIN,
];
// Collision box per skin: half width and half height around the centre.
// Measured from the drawn sprites and pulled in a pixel or two on round shapes,
// so thin flagella and rounded corners never cost a life.
const HITBOXES = {
  'E. coli': [19, 12],
  'HEK cell': [17, 17],
  'Yeast': [19, 17],
  'Anabaena': [24, 10],
  'Serratia': [19, 12],
  'Halobacterium': [27, 11],
  'Salmonella': [18, 12],
  'Purified GVs': [13, 13],
  'BioBrick': [20, 14],
  'Zeppelin': [21, 12],
  [FINAL_SKIN]: [19, 19],
};

// Difficulty presets, picked in the start menu.
//   levels:     the level system (the current speeds up from score 20 on)
//   transducer: multiplier on how much GV a collapse field destroys
//   hazards:    multiplier on how often macrophages and ciliates swim in
//   powerups:   multiplier on how often SpyCatchers and GvpC show up
const DIFFICULTIES = [
  { name: 'Relaxed', levels: false, transducer: 0.5, hazards: 0.5, powerups: 2.0, color: [120, 240, 120] },
  { name: 'Easy', levels: true, transducer: 0.75, hazards: 0.75, powerups: 1.5, color: [150, 225, 255] },
  { name: 'Normal', levels: true, transducer: 1.0, hazards: 1.0, powerups: 1.0, color: [250, 210, 65] },
  { name: 'Hard', levels: true, transducer: 1.25, hazards: 1.4, powerups: 0.7, color: [235, 80, 80] },
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
    `Upgrades & GvpC: ${percent(difficulty.powerups)}`,
  ];
}

// Skins are bought with coins, except where a special unlock condition is
// the only way in.
const SKIN_PRICES = {
  'E. coli': 0,
  'HEK cell': 20,
  'Yeast': 30,
  'Anabaena': 35,
  'Serratia': 45,
  'Halobacterium': 55,
  'Salmonella': 65,
  'Purified GVs': 80,
  'BioBrick': null, // unlocked with iGEM special prizes, see BIOBRICK_TIER_THRESHOLDS
  'Zeppelin': null, // grand prize: defeat the giant dendritic cell once, see checkBossSkinUnlock
  [FINAL_SKIN]: null, // every other skin owned, every SpyCatcher maxed
};

// Every skin carries one small trait, so buying one changes how a run feels.
const SKIN_PERKS = {
  'E. coli': { label: 'Fast producer: +15% GV production', short: '+15% GV production', production: 1.15 },
  'HEK cell': {
    label: 'Sturdy: starts every run with a GvpC shell',
    short: 'Starts with a GvpC shell',
    start_shell: 1,
  },
  'Yeast': { label: 'Budding: +10% coins', short: '+10% coins', coins: 1.10 },
  'Anabaena': { label: 'Gas store: GVs collapse 15% slower', short: 'GVs collapse 15% slower', collapse: 0.85 },
  'Serratia': { label: 'Prodigious producer: +30% GV production', short: '+30% GV production', production: 1.30 },
  'Halobacterium': { label: 'Halotolerant: -25% transducer collapse', short: '-25% transducer collapse', transducer: 0.75 },
  'Salmonella': { label: 'Motile: +15% top speed', short: '+15% top speed', speed: 1.15 },
  'Purified GVs': { label: 'Bare vesicles: +10% buoyancy', short: '+10% buoyancy', buoyancy: 1.10 },
  'BioBrick': { label: 'Standardised: SpyCatchers last longer', short: 'SpyCatchers last longer', module: 1.15 },
  'Zeppelin': { label: 'Voyager: +25% coins', short: '+25% coins', coins: 1.25 },
  [FINAL_SKIN]: {
    label: 'iGEM Legacy: +10% GV production, +10% coins',
    short: '+10% production, +10% coins',
    production: 1.10,
    coins: 1.10,
  },
};

// BioBrick starts locked; iGEM special prizes found during a run unlock it,
// medal by medal. The module perk above scales with the tier reached.
const BIOBRICK_TIER_THRESHOLDS = { 1: 1, 2: 3, 3: 6 };
const BIOBRICK_TIER_NAMES = { 0: 'Locked', 1: 'Bronze', 2: 'Silver', 3: 'Gold' };
const BIOBRICK_TIER_MODULE_BONUS = { 0: 1.15, 1: 1.15, 2: 1.25, 3: 1.40 };
const BIOBRICK_TIER_COLORS = {
  0: [245, 135, 55],
  1: [176, 116, 68],
  2: [198, 202, 208],
  3: [232, 181, 61],
};

// The water changes as you get deeper into a run.
const BIOMES = [
  { name: 'Sunlit shallows', score: 0, top: [38, 132, 170], bottom: [6, 28, 52], pillar: [58, 128, 100] },
  { name: 'Kelp forest', score: 15, top: [32, 122, 112], bottom: [4, 30, 34], pillar: [104, 126, 52] },
  { name: 'Midnight zone', score: 35, top: [18, 58, 100], bottom: [2, 10, 26], pillar: [62, 88, 112] },
  { name: 'Hydrothermal vents', score: 60, top: [58, 42, 62], bottom: [20, 6, 12], pillar: [116, 74, 66] },
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

// iGEM special prizes: a rare, hard-to-reach pickup tucked against a gap's
// edge. Finding enough of them unlocks BioBrick's medal tiers.
const SPECIAL_PRIZE_CHANCE = 0.07;
const MIN_OBSTACLES_BETWEEN_SPECIAL_PRIZES = 9;
const SPECIAL_PRIZE_EDGE_MARGIN = 15;
const SPECIAL_PRIZE_COINS = 10;
const SPECIAL_PRIZE_MIN_SCORE = 8;

// SpyCatcher upgrades, also bought with coins.
const UPGRADE_PRICES = [15, 25, 40, 60, 85, 120];
const UPGRADE_MAX_LEVEL = UPGRADE_PRICES.length;
const UPGRADE_KEYS = MODULE_KINDS.map((kind) => `${kind}_level`);

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
const BOSS_COLOR = [150, 112, 215];
const BOSS_WEAK_COLOR = [255, 205, 90];

// Where the browser keeps coins, skins and upgrades.
const PROGRESS_KEY = 'gv_float_progress';

// ------------------------------------------------------------------- colours

const WATER_TOP = [38, 132, 170];
const WATER_BOTTOM = [6, 28, 52];
const PANEL = [8, 32, 52];
const PANEL_BORDER = [117, 201, 225];
const BACTERIUM_COLOR = [240, 200, 80];
const BACTERIUM_OUTLINE = [60, 50, 30];
const GV_COLOR = [235, 245, 250];
const GV_OUTLINE = [150, 185, 200];
const OBSTACLE_COLOR = [58, 128, 100];
const SAND_COLOR = [150, 132, 92];
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
const COIN_COLOR = [250, 200, 70];
const COIN_EDGE = [185, 130, 30];
const ECOLI_COLOR = [105, 205, 100];
const HEK_COLOR = [235, 135, 185];
const HEK_NUCLEUS = [130, 70, 145];
const ANABAENA_COLOR = [95, 195, 165];
const YEAST_COLOR = [235, 200, 130];
const YEAST_VACUOLE = [170, 130, 75];
const SALMONELLA_COLOR = [130, 150, 235];
const SERRATIA_COLOR = [205, 45, 75];
const HALO_COLOR = [225, 85, 120];
const BIOBRICK_COLOR = [245, 135, 55];
const WHITE = [255, 255, 255];
const GRAY = [160, 180, 190];
const RED = [235, 80, 80];
const YELLOW = [250, 210, 65];
const GREEN = [80, 220, 120];
const ORANGE = [245, 155, 55];
const BLACK = [20, 20, 20];

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

/** Coins, bought skins and upgrade levels. Personal bests live in stats.best_by_difficulty. */
function loadProgress() {
  const progress = {
    coins: 0,
    owned: [],
    missions: [],
    stats: emptyStats(),
    tutorial_done: false,
    tutorial_stage: 0,
    special_prizes: 0,
    biobrick_tier: 0,
    difficulty: DEFAULT_DIFFICULTY,
  };
  for (const key of UPGRADE_KEYS) progress[key] = 0;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return progress;
    const data = JSON.parse(raw);
    progress.coins = Math.max(0, toInt(data.coins));
    progress.owned = (data.owned || []).filter((name) => name in SKIN_PRICES);
    progress.tutorial_done = Boolean(data.tutorial_done);
    progress.tutorial_stage = clamp(toInt(data.tutorial_stage), 0, TUTORIAL_FEATURES.length);
    progress.special_prizes = Math.max(0, toInt(data.special_prizes));
    progress.biobrick_tier = clamp(toInt(data.biobrick_tier), 0, 3);
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
    for (const key of UPGRADE_KEYS) progress[key] = clamp(toInt(data[key]), 0, UPGRADE_MAX_LEVEL);
  } catch (error) {
    // Unreadable or missing save: start fresh with whatever was parsed so far.
  }
  checkBossSkinUnlock(progress); // saves from before the unlock existed
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

/**
 * Re-checks BioBrick's medal tier against the special prizes found so far.
 * Returns the newly reached tier (1/2/3) if this call crossed a threshold, else null.
 */
function updateBiobrickTier(progress) {
  const count = progress.special_prizes || 0;
  let tier = 0;
  for (const [candidate, threshold] of Object.entries(BIOBRICK_TIER_THRESHOLDS)) {
    if (count >= threshold) tier = Number(candidate);
  }
  const previous = progress.biobrick_tier || 0;
  if (tier <= previous) return null;
  progress.biobrick_tier = tier;
  if (!progress.owned.includes('BioBrick')) progress.owned.push('BioBrick');
  return tier;
}

/** Defeating the giant dendritic cell once unlocks the Zeppelin. Returns true if this call granted it. */
function checkBossSkinUnlock(progress) {
  if (progress.owned.includes('Zeppelin') || !(progress.stats.bosses_defeated > 0)) return false;
  progress.owned.push('Zeppelin');
  return true;
}

/** Every other skin owned, every SpyCatcher maxed: unlocks the iGEM Legacy skin. */
function checkFinalSkinUnlock(progress) {
  if (progress.owned.includes(FINAL_SKIN)) return false;
  const required = CHARACTERS.filter((c) => c !== FINAL_SKIN && c !== 'Zeppelin');
  if (!required.every((c) => owns(c, progress))) return false;
  if (MODULE_KINDS.some((kind) => (progress[`${kind}_level`] || 0) < UPGRADE_MAX_LEVEL)) return false;
  progress.owned.push(FINAL_SKIN);
  return true;
}

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

const upgradePrice = (level) => (level < UPGRADE_MAX_LEVEL ? UPGRADE_PRICES[level] : null);

/** BioBrick's perk text scales with its unlocked medal tier; everyone else is static. */
function skinShortText(character, progress) {
  if (character === 'BioBrick') {
    const tier = progress.biobrick_tier || 0;
    const bonusPct = Math.round((BIOBRICK_TIER_MODULE_BONUS[tier] - 1.0) * 100);
    return `SpyCatchers +${bonusPct}% longer`;
  }
  return SKIN_PERKS[character].short;
}

function lockedSkinReason(character, progress) {
  if (character === 'BioBrick') {
    return `${progress.special_prizes || 0}/${BIOBRICK_TIER_THRESHOLDS[1]} special prizes`;
  }
  if (character === FINAL_SKIN) return 'every skin + max SpyCatchers';
  return 'defeat the boss once';
}

/** Short enough to sit on the button itself without crowding the name. */
function lockedSkinBadge(character, progress) {
  if (character === 'BioBrick') {
    return `${progress.special_prizes || 0}/${BIOBRICK_TIER_THRESHOLDS[1]} prizes`;
  }
  if (character === FINAL_SKIN) return 'special';
  return 'boss reward';
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
