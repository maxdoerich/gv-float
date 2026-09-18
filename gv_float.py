import json
import math
import random
from pathlib import Path

import pygame

pygame.init()

WIDTH = 900
HEIGHT = 600
FPS = 60

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("GV Float")
clock = pygame.time.Clock()

FONT_NAMES = "avenirnext,helveticaneue,arial"
FONT = pygame.font.SysFont(FONT_NAMES, 22)
SMALL_FONT = pygame.font.SysFont(FONT_NAMES, 16)
MEDIUM_FONT = pygame.font.SysFont(FONT_NAMES, 30, bold=True)
BIG_FONT = pygame.font.SysFont(FONT_NAMES, 48, bold=True)
TITLE_FONT = pygame.font.SysFont(FONT_NAMES, 72, bold=True)
GAUGE_FONT = pygame.font.SysFont(FONT_NAMES, 11, bold=True)
TINY_FONT = pygame.font.SysFont(FONT_NAMES, 13)


# Physics
BACTERIUM_X = 180
GRAVITY = 0.10
MAX_BUOYANCY = 0.20
DRAG = 0.985
MAX_VERTICAL_SPEED = 6

# The base rates preserve the earlier ratio: collapse is faster than production.
GV_PRODUCTION_RATE = 0.40
GV_COLLAPSE_RATE = 1.20
GV_HOLD_ACCELERATION = 1.35
MAX_GV_PRODUCTION_MULTIPLIER = 5.0
MAX_GV_COLLAPSE_MULTIPLIER = 5.0

# Difficulty
BASE_SCROLL_SPEED = 3.0
MAX_SCROLL_SPEED = 6.0
BASE_OBSTACLE_GAP = 190
MIN_OBSTACLE_GAP = 125
BASE_OBSTACLE_SPACING = 320
MIN_OBSTACLE_SPACING = 235
DIFFICULTY_STEP_SCORE = 5
# Both systems are always on, but they only join in once the run is going.
LEVEL_START_SCORE = 20
TRANSDUCER_START_SCORE = 12

# Transducers
TRANSDUCER_SPAWN_CHANCE = 0.35
MIN_NORMALS_BETWEEN_TRANSDUCERS = 1
MAX_NORMALS_BETWEEN_TRANSDUCERS = 4
TRANSDUCER_WIDTH = 54
TRANSDUCER_START_COLLAPSE = 0.30
TRANSDUCER_COLLAPSE_STEP = 0.05
TRANSDUCER_MAX_COLLAPSE = 0.80
TRANSDUCER_GV_FLOOR = 20.0
TRANSDUCER_PUSH_IMPULSE = 2.6
TRANSDUCER_KINDS = ("collapse", "top", "bottom")

# A single GvpC helix can be bound: it reinforces the shell and absorbs one hit.
MAX_SHELL_LAYERS = 1
GVPC_RADIUS = 15
SHELL_HIT_INVULNERABILITY = 1.0
SHELL_BOUNCE_SPEED = 2.5

# SpyCatcher fusions clip onto the SpyTag of the bound GvpC.
MODULE_KINDS = ("gfp", "antibody", "granzyme", "ampicillin")
MODULE_LABELS = {
    "gfp": "SpyCatcher-GFP",
    "antibody": "SpyCatcher-Antibody",
    "granzyme": "SpyCatcher-Granzyme",
    "ampicillin": "SpyCatcher-Ampicillin",
}
MODULE_SHORT = {
    "gfp": "GFP",
    "antibody": "Antibody",
    "granzyme": "Granzyme",
    "ampicillin": "Amp",
}
# Weak out of the box, strong once upgraded.
MODULE_BASE_DURATION = {
    "gfp": 6.0,
    "antibody": 10.0,
    "granzyme": 5.0,
}
GFP_BONUS_SECONDS = 3.0
GRANZYME_BONUS_SECONDS = 2.0
COIN_MAGNET_RADIUS = 90
ANTIBODY_BONUS_RADIUS = 40
MAGNET_SPEED = 4.5

# Ampicillin doesn't expire: it's a magazine, not a timer. Upgrades add more
# shots; the last upgrade level additionally makes every shot home in.
AMPICILLIN_BASE_SHOTS = 5
AMPICILLIN_BONUS_SHOTS_PER_LEVEL = 2
AMPICILLIN_SHOT_SPEED = 8.5
AMPICILLIN_HOMING_TURN_RATE = 0.16

# Bonus spawning: one bonus per obstacle gap keeps the water readable.
BONUS_SPAWN_CHANCE = 0.85
COIN_WEIGHT = 6
GVPC_WEIGHT = 2
MODULE_WEIGHT = 2
COIN_RADIUS = 11

# Your own lamp only reaches so far; the light from above comes and goes.
LIGHT_BASE_RADIUS = 235
LIGHT_GFP_RADIUS = 440
DARKNESS_ALPHA = 220
DARKNESS_GFP_ALPHA = 70
CEILING_ON_SECONDS = (4.0, 7.5)
CEILING_OFF_SECONDS = (3.0, 6.0)
CEILING_LIGHT_DEPTH = 1.35

# Characters only change the drawing. Physics and collision size stay identical.
FINAL_SKIN = "iGEM Legacy"

CHARACTERS = (
    "E. coli",
    "HEK cell",
    "Yeast",
    "Anabaena",
    "Halobacterium",
    "Salmonella",
    "Purified GVs",
    "BioBrick",
    "Zeppelin",
    FINAL_SKIN,
)
# Collision box per skin: half width and half height around the centre.
HITBOXES = {
    "E. coli": (19, 13),
    "HEK cell": (18, 18),
    "Yeast": (19, 17),
    "Anabaena": (23, 11),
    "Halobacterium": (19, 11),
    "Salmonella": (18, 12),
    "Purified GVs": (14, 12),
    "BioBrick": (20, 14),
    "Zeppelin": (20, 11),
    FINAL_SKIN: (19, 14),
}

# Skins are bought with coins, except where a promo code or a special
# unlock condition is the only way in.
SKIN_PRICES = {
    "E. coli": 0,
    "HEK cell": 20,
    "Yeast": 30,
    "Anabaena": 35,
    "Halobacterium": 55,
    "Salmonella": 65,
    "Purified GVs": 80,
    "BioBrick": None,  # unlocked with iGEM special prizes, see BIOBRICK_TIER_THRESHOLDS
    "Zeppelin": None,  # grand prize: promo code only
    FINAL_SKIN: None,  # every other skin owned, every SpyCatcher maxed
}

# Every skin carries one small trait, so buying one changes how a run feels.
SKIN_PERKS = {
    "E. coli": {"label": "Fast producer: +15% GV production", "short": "+15% GV production", "production": 1.15},
    "HEK cell": {"label": "Reserve: starts the run at 65% GVs", "short": "Starts with 65% GVs", "start_gv": 65.0},
    "Yeast": {"label": "Budding: +10% coins", "short": "+10% coins", "coins": 1.10},
    "Anabaena": {"label": "Gas store: GVs collapse 15% slower", "short": "GVs collapse 15% slower", "collapse": 0.85},
    "Halobacterium": {"label": "Halotolerant: -25% transducer collapse", "short": "-25% transducer collapse", "transducer": 0.75},
    "Salmonella": {"label": "Motile: +15% top speed", "short": "+15% top speed", "speed": 1.15},
    "Purified GVs": {"label": "Bare vesicles: +10% buoyancy", "short": "+10% buoyancy", "buoyancy": 1.10},
    "BioBrick": {"label": "Standardised: SpyCatchers last longer", "short": "SpyCatchers last longer", "module": 1.15},
    "Zeppelin": {"label": "Voyager: +25% coins", "short": "+25% coins", "coins": 1.25},
    FINAL_SKIN: {
        "label": "iGEM Legacy: +10% GV production, +10% coins",
        "short": "+10% production, +10% coins",
        "production": 1.10,
        "coins": 1.10,
    },
}

# BioBrick starts locked; iGEM special prizes found during a run unlock it,
# medal by medal. The module perk above scales with the tier reached.
BIOBRICK_TIER_THRESHOLDS = {1: 1, 2: 3, 3: 6}
BIOBRICK_TIER_NAMES = {0: "Locked", 1: "Bronze", 2: "Silver", 3: "Gold"}
BIOBRICK_TIER_MODULE_BONUS = {0: 1.15, 1: 1.15, 2: 1.25, 3: 1.40}
BIOBRICK_TIER_COLORS = {
    0: (245, 135, 55),
    1: (176, 116, 68),
    2: (198, 202, 208),
    3: (232, 181, 61),
}

# The water changes as you get deeper into a run.
BIOMES = (
    {"name": "Sunlit shallows", "score": 0, "top": (38, 132, 170), "bottom": (6, 28, 52), "pillar": (58, 128, 100)},
    {"name": "Kelp forest", "score": 15, "top": (32, 122, 112), "bottom": (4, 30, 34), "pillar": (104, 126, 52)},
    {"name": "Midnight zone", "score": 35, "top": (18, 58, 100), "bottom": (2, 10, 26), "pillar": (62, 88, 112)},
    {"name": "Hydrothermal vents", "score": 60, "top": (58, 42, 62), "bottom": (20, 6, 12), "pillar": (116, 74, 66)},
)
BIOME_FADE_SECONDS = 2.0

# Missions are checked once a run ends and pay out in coins.
MISSION_TEMPLATES = (
    ("coins", "{target} coins in a run", (15, 25, 40)),
    ("score", "Reach score {target}", (10, 20, 30)),
    ("kills", "{target} Granzyme kills", (2, 4, 6)),
    ("modules", "Bind {target} SpyCatchers", (2, 3, 5)),
    ("gvpc", "Collect {target} GvpC", (2, 3, 4)),
)
MISSION_REWARDS = (20, 35, 55)
ACTIVE_MISSIONS = 3

TUTORIAL_SECONDS = 9.0
TUTORIAL_STEPS = (
    (9.0, "Hold W or UP: build gas vesicles and rise"),
    (6.0, "Hold S or DOWN: collapse them and sink"),
    (3.0, "Keep an eye on the gauge and aim for the gaps"),
)
# After the controls, every new thing gets its own stop the first time it shows up.
# The score is when it is sent in; it reaches the player a few gaps later.
TUTORIAL_FEATURES = (
    ("gvpc", 1),
    ("module", 4),
    ("hazards", 7),
    ("transducer", 10),
)
TUTORIAL_CARDS = {
    "gvpc": (
        "GvpC",
        (
            "GvpC is a protein that wraps around your gas vesicles.",
            "Pick it up to reinforce the shell: it absorbs one hit",
            "from a pillar, a cell or the edge of the water.",
            "The GvpC pip in the top-left shows whether it is bound.",
        ),
    ),
    "module": (
        "SpyCatcher modules",
        (
            "SpyCatcher fusions clip onto your vesicles for a few seconds.",
            "GFP lights up the dark  ·  Antibody pulls in coins and GvpC",
            "Granzyme kills cells on contact for a few seconds.",
            "Ampicillin loads 5 shots: SPACE fires one straight ahead.",
            "The timer (or shot count) next to GvpC shows what's left.",
        ),
    ),
    "hazards": (
        "Drifting cells",
        (
            "Macrophages and ciliates swim straight at you.",
            "Touching one costs your GvpC shell, or the run.",
            "Dodge them, or bind Granzyme and kill them.",
        ),
    ),
    "transducer": (
        "Transducers",
        (
            "Ultrasound fields cover the whole water column.",
            "Blue collapses part of your GVs; no production inside.",
            "Purple presses you up or down: follow the arrows.",
            "Get your GV level ready before you enter.",
        ),
    ),
}

PROMO_CODES = {
    "zeppelin": ("skin", "Zeppelin"),
    "money": ("coins", 20),
    "money50": ("coins", 50),
    "heidelberg": ("special_prize", 1),
}
# These never get used up; everything else in PROMO_CODES is one-shot.
REPEATABLE_CODES = {"money50"}
MAX_CODE_LENGTH = 14

# iGEM special prizes: a rare, hard-to-reach pickup tucked against a gap's
# edge. Finding enough of them unlocks BioBrick's medal tiers.
SPECIAL_PRIZE_CHANCE = 0.07
MIN_OBSTACLES_BETWEEN_SPECIAL_PRIZES = 9
SPECIAL_PRIZE_EDGE_MARGIN = 15
SPECIAL_PRIZE_COINS = 10
SPECIAL_PRIZE_MIN_SCORE = 8

# The grant-application minigame in the menu: stake coins, maybe get funded.
GRANT_STAKES = (5, 10, 20, 50)
GRANT_SUCCESS_CHANCE = 0.4
GRANT_PAYOUT_MULTIPLIER = 2.0

# SpyCatcher upgrades, also bought with coins.
UPGRADE_PRICES = (15, 25, 40, 60, 85, 120)
UPGRADE_MAX_LEVEL = len(UPGRADE_PRICES)
UPGRADE_KEYS = tuple(f"{kind}_level" for kind in MODULE_KINDS)

# Drifting cells swim toward the player and have to be dodged.
HAZARD_KINDS = ("macrophage", "ciliate")
HAZARD_INTERVAL = (2.6, 5.2)

# Macrophage boss: a giant macrophage docks at the right edge every
# BOSS_SCORE_INTERVAL points. The player always has Ampicillin (it refills
# during the fight); the only way to hurt the boss is to shoot the weak spots
# it exposes now and then. It lashes out with telegraphed tentacles and spits
# out smaller cells. Every repeat ramps up.
BOSS_SCORE_INTERVAL = 50
BOSS_X = WIDTH - 60
BOSS_RADIUS = 125
BOSS_ENTER_SECONDS = 2.0
BOSS_DEFEATED_SECONDS = 1.6
BOSS_BASE_HITS = 4
BOSS_MAX_HITS = 8
BOSS_WEAKPOINT_SECONDS = 3.2
BOSS_WEAKPOINT_HIDDEN_SECONDS = (2.5, 4.0)
BOSS_AMMO_REGEN_SECONDS = 0.7
BOSS_ATTACK_INTERVAL = (2.4, 4.0)
BOSS_TENTACLE_WARN_SECONDS = 1.1
BOSS_TENTACLE_MIN_WARN_SECONDS = 0.65
BOSS_TENTACLE_LOCK_FRACTION = 0.4
BOSS_TENTACLE_STRIKE_SECONDS = 0.22
BOSS_TENTACLE_HOLD_SECONDS = 0.35
BOSS_TENTACLE_RETRACT_SECONDS = 0.25
BOSS_TENTACLE_LENGTH = 1100
BOSS_TENTACLE_HIT_WIDTH = 14
BOSS_REWARD_COINS = 40
BOSS_REWARD_PER_STAGE = 10
BOSS_COLOR = (212, 118, 162)
BOSS_WEAK_COLOR = (255, 205, 90)

# Highscores
PROGRESS_FILE = Path(__file__).with_name("gv_float_progress.json")


# Colors
WATER_TOP = (38, 132, 170)
WATER_BOTTOM = (6, 28, 52)
PANEL = (8, 32, 52)
PANEL_BORDER = (117, 201, 225)
BACTERIUM_COLOR = (240, 200, 80)
BACTERIUM_OUTLINE = (60, 50, 30)
GV_COLOR = (235, 245, 250)
GV_OUTLINE = (150, 185, 200)
OBSTACLE_COLOR = (58, 128, 100)
SAND_COLOR = (150, 132, 92)
TRANSDUCER_COLOR = (47, 185, 225)
TRANSDUCER_CORE = (190, 244, 255)
TRANSDUCER_PUSH_COLOR = (160, 105, 230)
TRANSDUCER_PUSH_CORE = (224, 202, 255)
GVPC_COLOR = (255, 178, 96)
GVPC_CORE = (255, 228, 185)
SHELL_COLOR = (150, 225, 255)
GFP_COLOR = (120, 240, 120)
ANTIBODY_COLOR = (235, 225, 130)
GRANZYME_COLOR = (255, 115, 95)
AMPICILLIN_COLOR = (140, 195, 250)
COIN_COLOR = (250, 200, 70)
COIN_EDGE = (185, 130, 30)
ECOLI_COLOR = (105, 205, 100)
HEK_COLOR = (235, 135, 185)
HEK_NUCLEUS = (130, 70, 145)
ANABAENA_COLOR = (95, 195, 165)
YEAST_COLOR = (235, 200, 130)
YEAST_VACUOLE = (170, 130, 75)
SALMONELLA_COLOR = (130, 150, 235)
HALO_COLOR = (225, 85, 120)
BIOBRICK_COLOR = (245, 135, 55)
WHITE = (255, 255, 255)
GRAY = (160, 180, 190)
RED = (235, 80, 80)
YELLOW = (250, 210, 65)
GREEN = (80, 220, 120)
ORANGE = (245, 155, 55)
BLACK = (20, 20, 20)
MEDAL_COLORS = ((250, 210, 65), (205, 215, 225), (215, 150, 95))


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def now():
    return pygame.time.get_ticks() / 1000.0


def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def lighten(color, amount):
    return lerp_color(color, WHITE, amount)


def darken(color, amount):
    return lerp_color(color, (0, 0, 0), amount)


def make_vertical_gradient(width, height, top, bottom):
    surface = pygame.Surface((width, height))
    for y in range(height):
        color = lerp_color(top, bottom, (y / (height - 1)) ** 1.2)
        pygame.draw.line(surface, color, (0, y), (width, y))
    return surface


def make_vignette():
    small = pygame.Surface((90, 60), pygame.SRCALPHA)
    for y in range(60):
        for x in range(90):
            dx = (x - 44.5) / 45
            dy = (y - 29.5) / 30
            distance = min(1.0, math.hypot(dx, dy))
            alpha = int(150 * (max(0.0, distance - 0.45) / 0.55) ** 2)
            small.set_at((x, y), (0, 8, 20, alpha))
    return pygame.transform.smoothscale(small, (WIDTH, HEIGHT))


def make_light_rays():
    rays = pygame.Surface((WIDTH + 240, HEIGHT), pygame.SRCALPHA)
    rng = random.Random(4)
    for _ in range(7):
        top_x = rng.randint(0, WIDTH + 240)
        top_w = rng.randint(30, 80)
        slant = rng.randint(120, 260)
        spread = rng.randint(60, 160)
        pygame.draw.polygon(
            rays,
            (200, 240, 255, rng.randint(10, 22)),
            [
                (top_x, 0),
                (top_x + top_w, 0),
                (top_x + top_w + slant + spread, HEIGHT),
                (top_x + slant, HEIGHT),
            ],
        )
    # Downscale/upscale acts as a cheap blur for soft ray edges.
    blurred = pygame.transform.smoothscale(rays, (rays.get_width() // 10, HEIGHT // 10))
    return pygame.transform.smoothscale(blurred, rays.get_size())


def make_radial_glow(radius, color, max_alpha):
    glow = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
    for r in range(radius, 0, -1):
        alpha = int(max_alpha * (1 - r / radius) ** 1.6)
        pygame.draw.circle(glow, (*color, alpha), (radius, radius), r)
    return glow


def make_particle(radius, alpha):
    size = radius * 2 + 2
    particle = pygame.Surface((size, size), pygame.SRCALPHA)
    pygame.draw.circle(particle, (210, 240, 255, alpha), (size // 2, size // 2), radius)
    return particle


def make_banner():
    text = GAUGE_FONT.render("VOYAGE", True, (10, 40, 58))
    banner = pygame.Surface((text.get_width() + 12, text.get_height() + 6), pygame.SRCALPHA)
    pygame.draw.rect(banner, PANEL_BORDER, banner.get_rect(), border_radius=2)
    pygame.draw.rect(banner, lighten(PANEL_BORDER, 0.5), banner.get_rect(), 1, border_radius=2)
    banner.blit(text, text.get_rect(center=banner.get_rect().center))
    return banner


def make_bubble(radius):
    size = radius * 2 + 2
    bubble = pygame.Surface((size, size), pygame.SRCALPHA)
    center = (size // 2, size // 2)
    pygame.draw.circle(bubble, (200, 240, 255, 50), center, radius)
    pygame.draw.circle(bubble, (230, 250, 255, 190), center, radius, 1)
    if radius >= 3:
        pygame.draw.circle(bubble, (255, 255, 255, 220), (center[0] - radius // 3, center[1] - radius // 3), 1)
    return bubble


BACKGROUND_SURFACE = make_vertical_gradient(WIDTH, HEIGHT, WATER_TOP, WATER_BOTTOM)
BIOME_SURFACES = [
    make_vertical_gradient(WIDTH, HEIGHT, biome["top"], biome["bottom"]) for biome in BIOMES
]
VIGNETTE = make_vignette()
LIGHT_RAYS = make_light_rays()
CHARACTER_GLOW = make_radial_glow(42, (170, 230, 255), 55)
PARTICLE_SURFACES = {r: make_particle(r, 40 + r * 25) for r in (1, 2, 3)}
BUBBLE_SURFACES = {r: make_bubble(r) for r in range(1, 6)}
ZEPPELIN_BANNER = make_banner()
_particle_rng = random.Random(11)
PARTICLES = [
    (
        _particle_rng.uniform(0, WIDTH),
        _particle_rng.uniform(0, HEIGHT),
        _particle_rng.choice((1, 1, 1, 2, 2, 3)),
        _particle_rng.uniform(0, math.tau),
    )
    for _ in range(80)
]
DEPTH_LABELS = {}
for _depth in range(100, HEIGHT, 100):
    _label = SMALL_FONT.render(f"{_depth} m", True, (170, 220, 235))
    _label.set_alpha(90)
    DEPTH_LABELS[_depth] = _label

_panel_cache = {}


def draw_panel(rect, alpha=185, border=PANEL_BORDER, border_alpha=120, radius=12):
    key = (rect.size, alpha, border, border_alpha, radius)
    panel = _panel_cache.get(key)
    if panel is None:
        panel = pygame.Surface(rect.size, pygame.SRCALPHA)
        local = panel.get_rect()
        pygame.draw.rect(panel, (*PANEL, alpha), local, border_radius=radius)
        pygame.draw.line(
            panel,
            (255, 255, 255, 30),
            (radius, 2),
            (local.width - radius, 2),
        )
        pygame.draw.rect(panel, (*border, border_alpha), local, 2, border_radius=radius)
        _panel_cache[key] = panel
    screen.blit(panel, rect.topleft)


def blit_text(font, text, color, pos, anchor="topleft", shadow=True, alpha=255):
    surface = font.render(text, True, color)
    rect = surface.get_rect(**{anchor: pos})
    if shadow:
        shadow_surface = font.render(text, True, (0, 12, 25))
        shadow_surface.set_alpha(int(150 * alpha / 255))
        screen.blit(shadow_surface, rect.move(2, 2))
    if alpha < 255:
        surface.set_alpha(alpha)
    screen.blit(surface, rect)
    return rect


def load_progress():
    """Coins, bought skins and upgrade levels. The personal best lives in stats["best_score"]."""
    progress = {
        "coins": 0,
        "owned": [],
        "codes_used": [],
        "missions": [],
        "stats": dict(EMPTY_STATS),
        "tutorial_done": False,
        "tutorial_stage": 0,
        "special_prizes": 0,
        "biobrick_tier": 0,
    }
    progress.update({key: 0 for key in UPGRADE_KEYS})
    try:
        with PROGRESS_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        progress["coins"] = max(0, int(data.get("coins", 0)))
        progress["owned"] = [
            name for name in data.get("owned", []) if name in SKIN_PRICES
        ]
        progress["tutorial_done"] = bool(data.get("tutorial_done", False))
        progress["tutorial_stage"] = clamp(
            int(data.get("tutorial_stage", 0)), 0, len(TUTORIAL_FEATURES)
        )
        progress["special_prizes"] = max(0, int(data.get("special_prizes", 0)))
        progress["biobrick_tier"] = clamp(int(data.get("biobrick_tier", 0)), 0, 3)
        progress["missions"] = [
            mission
            for mission in data.get("missions", [])
            if isinstance(mission, dict) and mission.get("kind") in MISSION_KINDS
        ]
        stats = data.get("stats", {})
        for key in EMPTY_STATS:
            if key == "skin_runs":
                runs = stats.get(key, {})
                progress["stats"][key] = {
                    name: int(count) for name, count in runs.items() if name in SKIN_PRICES
                } if isinstance(runs, dict) else {}
            else:
                progress["stats"][key] = max(0, int(stats.get(key, 0)))
        progress["codes_used"] = [
            str(code).lower() for code in data.get("codes_used", []) if code in PROMO_CODES
        ]
        for key in UPGRADE_KEYS:
            progress[key] = clamp(int(data.get(key, 0)), 0, UPGRADE_MAX_LEVEL)
    except (OSError, ValueError, TypeError, AttributeError, json.JSONDecodeError):
        pass
    return progress


def save_progress(progress):
    try:
        with PROGRESS_FILE.open("w", encoding="utf-8") as file:
            json.dump(progress, file, indent=2)
    except OSError:
        pass


def owns(character, progress):
    return SKIN_PRICES[character] == 0 or character in progress["owned"]


def update_biobrick_tier(progress):
    """Re-checks BioBrick's medal tier against the special prizes found so far.

    Returns the newly reached tier (1/2/3) if this call crossed a threshold,
    otherwise None.
    """
    count = progress.get("special_prizes", 0)
    tier = 0
    for candidate, threshold in sorted(BIOBRICK_TIER_THRESHOLDS.items()):
        if count >= threshold:
            tier = candidate
    previous = progress.get("biobrick_tier", 0)
    if tier <= previous:
        return None
    progress["biobrick_tier"] = tier
    if "BioBrick" not in progress["owned"]:
        progress["owned"].append("BioBrick")
    return tier


def check_final_skin_unlock(progress):
    """Every other skin owned, every SpyCatcher maxed: unlocks the iGEM Legacy skin."""
    if FINAL_SKIN in progress["owned"]:
        return False
    required = [c for c in CHARACTERS if c not in (FINAL_SKIN, "Zeppelin")]
    if not all(owns(c, progress) for c in required):
        return False
    if any(progress.get(f"{kind}_level", 0) < UPGRADE_MAX_LEVEL for kind in MODULE_KINDS):
        return False
    progress["owned"].append(FINAL_SKIN)
    return True


EMPTY_STATS = {
    "runs": 0,
    "best_score": 0,
    "total_score": 0,
    "coins_earned": 0,
    "cells_killed": 0,
    "gvpc": 0,
    "modules": 0,
    "missions_done": 0,
    "bosses_defeated": 0,
    "skin_runs": {},
}
MISSION_KINDS = tuple(template[0] for template in MISSION_TEMPLATES)
EMPTY_RUN_STATS = {"coins": 0, "score": 0, "kills": 0, "modules": 0, "gvpc": 0}


def make_mission(taken_kinds):
    choices = [t for t in MISSION_TEMPLATES if t[0] not in taken_kinds] or list(MISSION_TEMPLATES)
    kind, text, targets = random.choice(choices)
    tier = random.randrange(len(targets))
    return {
        "kind": kind,
        "target": targets[tier],
        "reward": MISSION_REWARDS[tier],
        "text": text.format(target=targets[tier]),
    }


def ensure_missions(progress):
    while len(progress["missions"]) < ACTIVE_MISSIONS:
        taken = {mission["kind"] for mission in progress["missions"]}
        progress["missions"].append(make_mission(taken))


def check_missions(progress, run_stats):
    """Pay out finished missions and roll fresh ones in their place."""
    done = []
    kept = []
    for mission in progress["missions"]:
        if run_stats[mission["kind"]] >= mission["target"]:
            progress["coins"] += mission["reward"]
            progress["stats"]["missions_done"] += 1
            done.append(mission)
        else:
            kept.append(mission)
    progress["missions"] = kept
    ensure_missions(progress)
    return done


def record_run(progress, character, score, run_stats):
    stats = progress["stats"]
    stats["runs"] += 1
    stats["total_score"] += score
    stats["best_score"] = max(stats["best_score"], score)
    stats["coins_earned"] += run_stats["coins"]
    stats["cells_killed"] += run_stats["kills"]
    stats["gvpc"] += run_stats["gvpc"]
    stats["modules"] += run_stats["modules"]
    stats["skin_runs"][character] = stats["skin_runs"].get(character, 0) + 1


def redeem_code(progress, typed):
    code = typed.strip().lower()
    if code not in PROMO_CODES:
        return "Unknown code"
    if code not in REPEATABLE_CODES and code in progress["codes_used"]:
        return "Code already used"

    kind, value = PROMO_CODES[code]
    if kind == "skin":
        if value not in progress["owned"]:
            progress["owned"].append(value)
        message = f"{value} unlocked!"
    elif kind == "special_prize":
        progress["special_prizes"] = progress.get("special_prizes", 0) + value
        new_tier = update_biobrick_tier(progress)
        message = f"iGEM special prize! ({progress['special_prizes']} found)"
        if new_tier:
            message = f"BioBrick unlocked: {BIOBRICK_TIER_NAMES[new_tier]}!"
    else:
        progress["coins"] += value
        message = f"+{value} coins"

    if code not in REPEATABLE_CODES:
        progress["codes_used"].append(code)
    check_final_skin_unlock(progress)
    save_progress(progress)
    return message


def upgrade_price(level):
    return UPGRADE_PRICES[level] if level < UPGRADE_MAX_LEVEL else None


def skin_short_text(character, progress):
    """BioBrick's perk text scales with its unlocked medal tier; everyone else is static."""
    if character == "BioBrick":
        tier = progress.get("biobrick_tier", 0)
        bonus_pct = round((BIOBRICK_TIER_MODULE_BONUS[tier] - 1.0) * 100)
        return f"SpyCatchers +{bonus_pct}% longer"
    return SKIN_PERKS[character]["short"]


def locked_skin_reason(character, progress):
    if character == "BioBrick":
        have = progress.get("special_prizes", 0)
        need = BIOBRICK_TIER_THRESHOLDS[1]
        return f"{have}/{need} special prizes"
    if character == FINAL_SKIN:
        return "every skin + max SpyCatchers"
    return "promo code only"


def locked_skin_badge(character, progress):
    """Short enough to sit on the button itself without crowding the name."""
    if character == "BioBrick":
        have = progress.get("special_prizes", 0)
        need = BIOBRICK_TIER_THRESHOLDS[1]
        return f"{have}/{need} prizes"
    if character == FINAL_SKIN:
        return "special"
    return "promo only"


def difficulty_for_score(score):
    if score < LEVEL_START_SCORE:
        return 1, BASE_SCROLL_SPEED, BASE_OBSTACLE_GAP, BASE_OBSTACLE_SPACING

    steps = (score - LEVEL_START_SCORE) // DIFFICULTY_STEP_SCORE + 1
    level = steps + 1
    speed = min(MAX_SCROLL_SPEED, BASE_SCROLL_SPEED + steps * 0.18)
    gap = max(MIN_OBSTACLE_GAP, BASE_OBSTACLE_GAP - steps * 5)
    spacing = max(MIN_OBSTACLE_SPACING, BASE_OBSTACLE_SPACING - steps * 6)
    return level, speed, gap, spacing


def transducer_strength(transducer_number):
    """First transducer: 30%, then +10 percentage points, capped at 80%."""
    return min(
        TRANSDUCER_MAX_COLLAPSE,
        TRANSDUCER_START_COLLAPSE
        + (transducer_number - 1) * TRANSDUCER_COLLAPSE_STEP,
    )


GV_POSITIONS = [
    (-9, -7), (0, -9), (9, -6), (-11, 2),
    (0, 0), (11, 3), (-6, 9), (6, 9),
]
SPRITE_SIZE = (84, 64)


class Bacterium:
    def __init__(self, character):
        self.character = character
        self.half_width, self.half_height = HITBOXES[character]
        self.perk = SKIN_PERKS[character]
        self.reset()

    def reset(self):
        self.x = float(BACTERIUM_X)
        self.y = HEIGHT / 2
        self.velocity_y = 0.0
        self.gv_level = self.perk.get("start_gv", 50.0)
        self.production_hold_seconds = 0.0
        self.collapse_hold_seconds = 0.0
        self.notice = ""
        self.notice_timer = 0.0
        self.shell = 0
        self.invulnerable_timer = 0.0
        self.module = None
        self.module_timer = 0.0
        self.module_duration = MODULE_BASE_DURATION["gfp"]
        self.durations = dict(MODULE_BASE_DURATION)
        self.magnet_radius = COIN_MAGNET_RADIUS
        self.ammo = 0
        self.ampicillin_capacity = AMPICILLIN_BASE_SHOTS
        self.ampicillin_homing = False
        self.infinite_ampicillin = False
        self.biobrick_tier = 0
        self.bubbles = []

    def apply_upgrades(self, progress):
        self.durations = {
            "gfp": MODULE_BASE_DURATION["gfp"] + progress["gfp_level"] * GFP_BONUS_SECONDS,
            "antibody": MODULE_BASE_DURATION["antibody"],
            "granzyme": MODULE_BASE_DURATION["granzyme"]
            + progress["granzyme_level"] * GRANZYME_BONUS_SECONDS,
        }
        self.magnet_radius = (
            COIN_MAGNET_RADIUS + progress["antibody_level"] * ANTIBODY_BONUS_RADIUS
        )
        ampicillin_level = progress["ampicillin_level"]
        self.ampicillin_capacity = (
            AMPICILLIN_BASE_SHOTS + ampicillin_level * AMPICILLIN_BONUS_SHOTS_PER_LEVEL
        )
        self.ampicillin_homing = ampicillin_level >= UPGRADE_MAX_LEVEL
        if self.character == "BioBrick":
            self.biobrick_tier = progress.get("biobrick_tier", 0)
            self.perk = dict(self.perk)
            self.perk["module"] = BIOBRICK_TIER_MODULE_BONUS[self.biobrick_tier]

    def update(self, keys, dt, production_locked=False):
        frame_scale = dt * FPS
        producing = (keys[pygame.K_UP] or keys[pygame.K_w]) and not production_locked
        collapsing = keys[pygame.K_DOWN] or keys[pygame.K_s]

        if producing:
            self.production_hold_seconds += dt
            multiplier = min(
                MAX_GV_PRODUCTION_MULTIPLIER,
                GV_HOLD_ACCELERATION ** self.production_hold_seconds,
            )
            self.gv_level += (
                GV_PRODUCTION_RATE * multiplier * frame_scale * self.perk.get("production", 1.0)
            )
        else:
            self.production_hold_seconds = 0.0

        if collapsing:
            self.collapse_hold_seconds += dt
            multiplier = min(
                MAX_GV_COLLAPSE_MULTIPLIER,
                GV_HOLD_ACCELERATION ** self.collapse_hold_seconds,
            )
            self.gv_level -= (
                GV_COLLAPSE_RATE * multiplier * frame_scale * self.perk.get("collapse", 1.0)
            )
        else:
            self.collapse_hold_seconds = 0.0

        self.gv_level = clamp(self.gv_level, 0.0, 100.0)

        gv_fraction = self.gv_level / 100.0
        acceleration = GRAVITY - MAX_BUOYANCY * gv_fraction * self.perk.get("buoyancy", 1.0)
        self.velocity_y += acceleration * frame_scale
        self.velocity_y *= DRAG ** frame_scale
        top_speed = MAX_VERTICAL_SPEED * self.perk.get("speed", 1.0)
        self.velocity_y = clamp(self.velocity_y, -top_speed, top_speed)
        self.y += self.velocity_y * frame_scale

        # Mild passive pressure loss at the bottom of the water column.
        depth_fraction = self.y / HEIGHT
        if depth_fraction > 0.80:
            self.gv_level -= (depth_fraction - 0.80) * 0.15 * frame_scale
            self.gv_level = max(0.0, self.gv_level)

        self.notice_timer = max(0.0, self.notice_timer - dt)
        self.invulnerable_timer = max(0.0, self.invulnerable_timer - dt)
        if self.module == "ampicillin":
            # No expiry timer: the magazine runs out on its own once it's empty.
            if self.ammo <= 0 and not self.infinite_ampicillin:
                self.module = None
        elif self.module:
            self.module_timer = max(0.0, self.module_timer - dt)
            if self.module_timer == 0.0:
                self.module = None
        self.update_bubbles(dt, producing, collapsing)

    def set_notice(self, text):
        self.notice = text
        self.notice_timer = 1.5

    def reinforce(self):
        self.shell = min(MAX_SHELL_LAYERS, self.shell + 1)
        for _ in range(10):
            self.spawn_bubble(rising=True)
        self.set_notice("GvpC bound: shell reinforced")

    def bind_module(self, kind):
        self.module = kind
        if kind == "ampicillin":
            self.ammo = self.ampicillin_capacity
            self.module_duration = 0.0
            self.module_timer = 0.0
        else:
            self.module_duration = self.durations[kind] * self.perk.get("module", 1.0)
            self.module_timer = self.module_duration
        for _ in range(8):
            self.spawn_bubble(rising=True)
        suffix = " · SPACE to fire" if kind == "ampicillin" else ""
        self.set_notice(f"{MODULE_LABELS[kind]} bound{suffix}")

    def fire_ampicillin(self):
        """Spends one dose and returns the projectile to spawn, or None if empty."""
        if self.module != "ampicillin" or self.ammo <= 0:
            return None
        self.ammo -= 1
        for _ in range(4):
            self.spawn_bubble(rising=True)
        shot = AmpicillinShot(self.x + self.half_width + 6, self.y, self.ampicillin_homing)
        if self.ammo <= 0 and not self.infinite_ampicillin:
            self.module = None
            self.set_notice("Ampicillin spent")
        return shot

    def absorb_hit(self):
        """Spend one reinforced shell layer instead of dying."""
        self.shell -= 1
        self.invulnerable_timer = SHELL_HIT_INVULNERABILITY
        for _ in range(20):
            self.spawn_bubble(rising=False)
        self.set_notice("Shell cracked! GvpC lost")

    def update_bubbles(self, dt, producing, collapsing):
        frame_scale = dt * FPS
        if producing and random.random() < 0.35 * frame_scale:
            self.spawn_bubble(rising=True)
        if collapsing and random.random() < 0.5 * frame_scale:
            self.spawn_bubble(rising=False)

        for bubble in self.bubbles:
            bubble["x"] += bubble["vx"] * frame_scale
            bubble["y"] += bubble["vy"] * frame_scale
            bubble["x"] += math.sin(bubble["life"] * 9) * 0.3 * frame_scale
            bubble["life"] -= dt
        self.bubbles = [bubble for bubble in self.bubbles if bubble["life"] > 0]

    def spawn_bubble(self, rising):
        if rising:
            self.bubbles.append({
                "x": self.x + random.uniform(-12, 8),
                "y": self.y + random.uniform(-10, 6),
                "vx": random.uniform(-2.2, -1.2),
                "vy": random.uniform(-1.6, -0.8),
                "life": random.uniform(0.7, 1.2),
                "radius": random.randint(2, 5),
            })
        else:
            angle = random.uniform(0, math.tau)
            speed = random.uniform(1.0, 2.4)
            self.bubbles.append({
                "x": self.x + math.cos(angle) * 14,
                "y": self.y + math.sin(angle) * 14,
                "vx": math.cos(angle) * speed - 1.0,
                "vy": math.sin(angle) * speed,
                "life": random.uniform(0.25, 0.45),
                "radius": random.randint(1, 2),
            })

    def apply_transducer(self, collapse_fraction):
        before = self.gv_level
        collapse_fraction *= self.perk.get("transducer", 1.0)

        # Only collapse GVs. If the player is already below the 20% floor,
        # the transducer must not create new GVs by raising the level to 20%.
        if before > TRANSDUCER_GV_FLOOR:
            self.gv_level = max(
                TRANSDUCER_GV_FLOOR,
                before * (1.0 - collapse_fraction),
            )

        for _ in range(18):
            self.spawn_bubble(rising=False)

        self.set_notice(f"Transducer: {collapse_fraction * 100:.0f}% collapsed")

    def apply_transducer_push(self, direction):
        """Apply one speed-independent impulse away from a top/bottom emitter."""
        self.velocity_y = clamp(
            self.velocity_y + direction * TRANSDUCER_PUSH_IMPULSE,
            -MAX_VERTICAL_SPEED,
            MAX_VERTICAL_SPEED,
        )
        direction_text = "down" if direction > 0 else "up"
        self.set_notice(f"Transducer presses {direction_text}")

    def draw(self, surface, tilt=True, glow=True, trail=True):
        t = now()
        if trail and self.character == "Zeppelin":
            self.draw_banner(surface, t)

        for bubble in self.bubbles:
            radius = bubble["radius"]
            image = BUBBLE_SURFACES[radius]
            surface.blit(image, image.get_rect(center=(int(bubble["x"]), int(bubble["y"]))))

        if glow and self.character != "Purified GVs":
            size = int(CHARACTER_GLOW.get_width() * (1.0 + 0.04 * math.sin(t * 3)))
            halo = pygame.transform.smoothscale(CHARACTER_GLOW, (size, size))
            surface.blit(halo, halo.get_rect(center=(int(self.x), int(self.y))))

        sprite = pygame.Surface(SPRITE_SIZE, pygame.SRCALPHA)
        cx, cy = SPRITE_SIZE[0] // 2, SPRITE_SIZE[1] // 2
        visible_gvs = int(self.gv_level / 100.0 * len(GV_POSITIONS))

        if self.character == "Zeppelin":
            self.draw_zeppelin(sprite, cx, cy)
        elif self.character == "E. coli":
            self.draw_ecoli(sprite, cx, cy, t)
        elif self.character == "HEK cell":
            self.draw_hek(sprite, cx, cy, t)
        elif self.character == "Anabaena":
            self.draw_anabaena(sprite, cx, cy, t)
        elif self.character == "Yeast":
            self.draw_yeast(sprite, cx, cy, t)
        elif self.character == "Salmonella":
            self.draw_salmonella(sprite, cx, cy, t)
        elif self.character == "Halobacterium":
            self.draw_halobacterium(sprite, cx, cy, t)
        elif self.character == "BioBrick":
            self.draw_biobrick(sprite, cx, cy, BIOBRICK_TIER_COLORS[self.biobrick_tier])
        elif self.character == FINAL_SKIN:
            self.draw_igem_legacy(sprite, cx, cy, t)

        if self.character == "Purified GVs":
            self.draw_purified(sprite, cx, cy, t, visible_gvs)
        elif self.character == "Zeppelin":
            self.draw_zeppelin_gauge(sprite, cx, cy)
        elif self.character == "BioBrick":
            # A standardised chassis: it hides its gas vesicles behind the casing.
            pass
        else:
            # Show the current GV level inside all cell/zeppelin characters.
            for dx, dy in GV_POSITIONS[:visible_gvs]:
                gv_rect = pygame.Rect(cx + dx - 2, cy + dy - 4, 5, 9)
                pygame.draw.ellipse(sprite, GV_COLOR, gv_rect)
                pygame.draw.ellipse(sprite, GV_OUTLINE, gv_rect, 1)

        if tilt:
            angle = clamp(-self.velocity_y * 3.5, -18, 18)
            if abs(angle) > 0.5:
                sprite = pygame.transform.rotate(sprite, angle)
        surface.blit(sprite, sprite.get_rect(center=(int(self.x), int(self.y))))
        self.draw_shell(surface, t)
        if trail:
            self.draw_module(surface, t)

    def draw_module(self, surface, t):
        if not self.module:
            return
        center = (int(self.x), int(self.y))
        if self.module == "ampicillin":
            fading = self.ammo <= 1 and int(t * 6) % 2 == 0
        else:
            fading = self.module_timer < 3.0 and int(self.module_timer * 6) % 2 == 0
        if self.module == "gfp":
            glow = make_radial_glow(34, GFP_COLOR, 40 if fading else 90)
            surface.blit(glow, glow.get_rect(center=center))
            angle = t * 2.2
            spot = (int(self.x + math.cos(angle) * 26), int(self.y + math.sin(angle) * 20))
            draw_gfp_barrel(surface, spot, 7, t)
        elif self.module == "granzyme":
            glow = make_radial_glow(36, GRANZYME_COLOR, 35 if fading else 75)
            surface.blit(glow, glow.get_rect(center=center))
            for index in range(3):
                spin = t * 3.0 + index * math.tau / 3
                spot = (
                    int(self.x + math.cos(spin) * 30),
                    int(self.y + math.sin(spin) * 24),
                )
                draw_granzyme(surface, spot, 7, spin)
        elif self.module == "ampicillin":
            glow = make_radial_glow(34, AMPICILLIN_COLOR, 40 if fading else 85)
            surface.blit(glow, glow.get_rect(center=center))
            for index in range(min(3, self.ammo)):
                spin = t * 2.0 + index * math.tau / 3
                spot = (
                    int(self.x + math.cos(spin) * 28),
                    int(self.y + math.sin(spin) * 22),
                )
                draw_ampicillin(surface, spot, 7, spin)
        else:
            angle = t * 2.2
            for index in range(2):
                spin = angle + index * math.pi
                spot = (int(self.x + math.cos(spin) * 27), int(self.y + math.sin(spin) * 21))
                draw_antibody(surface, spot, 8, spin)
            radius = int(self.magnet_radius)
            ring = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
            alpha = 25 if fading else 45
            pygame.draw.circle(ring, (*ANTIBODY_COLOR, alpha), (radius, radius), radius, 2)
            surface.blit(ring, ring.get_rect(center=center))

    def draw_banner(self, surface, t):
        width = ZEPPELIN_BANNER.get_width()
        height = ZEPPELIN_BANNER.get_height()
        right_edge = self.x - 32
        pygame.draw.line(
            surface,
            (215, 225, 235),
            (self.x - 22, self.y + 1),
            (right_edge, self.y + math.sin(t * 5) * 2),
            1,
        )
        for column in range(width):
            # Columns further from the tow line swing wider, like cloth in the water.
            sway = math.sin(t * 5 - column * 0.22) * (2.0 + (width - column) * 0.07)
            surface.blit(
                ZEPPELIN_BANNER,
                (right_edge - width + column, self.y - height / 2 + sway),
                (column, 0, 1, height),
            )

    def draw_shell(self, surface, t):
        if self.shell <= 0:
            return
        flashing = self.invulnerable_timer > 0 and int(self.invulnerable_timer * 12) % 2 == 0
        for layer in range(self.shell):
            grow = 16 + layer * 10
            alpha = 255 if flashing else int(185 + 55 * math.sin(t * 3 + layer))
            ring = pygame.Surface(self.get_rect().inflate(grow, grow).size, pygame.SRCALPHA)
            box = ring.get_rect()
            pygame.draw.ellipse(ring, (*SHELL_COLOR, alpha // 2), box, 2)
            for segment in range(7):
                start = segment / 7 * math.tau + t * (0.6 + layer * 0.3)
                pygame.draw.arc(ring, (*SHELL_COLOR, alpha), box, start, start + 0.62, 3)
            surface.blit(ring, ring.get_rect(center=(int(self.x), int(self.y))))

    @staticmethod
    def draw_zeppelin(s, cx, cy):
        base = BACTERIUM_COLOR
        fin = darken(base, 0.3)
        for sign in (-1, 1):
            points = [
                (cx - 13, cy + sign * 4),
                (cx - 24, cy + sign * 13),
                (cx - 20, cy + sign * 2),
            ]
            pygame.draw.polygon(s, fin, points)
            pygame.draw.polygon(s, BACTERIUM_OUTLINE, points, 1)

        gondola = pygame.Rect(cx - 7, cy + 9, 14, 6)
        pygame.draw.rect(s, darken(base, 0.55), gondola, border_radius=3)
        pygame.draw.rect(s, (160, 220, 240), (cx - 4, cy + 11, 3, 2))
        pygame.draw.rect(s, (160, 220, 240), (cx + 1, cy + 11, 3, 2))

        body = pygame.Rect(cx - 20, cy - 11, 40, 22)
        pygame.draw.ellipse(s, darken(base, 0.22), body)
        pygame.draw.ellipse(s, base, (cx - 19, cy - 11, 38, 17))
        pygame.draw.ellipse(s, lighten(base, 0.5), (cx - 12, cy - 9, 20, 5))
        pygame.draw.ellipse(s, darken(base, 0.18), (cx - 8, cy - 11, 16, 22), 1)
        pygame.draw.ellipse(s, BACTERIUM_OUTLINE, body, 2)

    def draw_zeppelin_gauge(self, s, cx, cy):
        display = pygame.Rect(cx - 16, cy - 7, 33, 13)
        pygame.draw.rect(s, (18, 30, 36), display, border_radius=3)
        pygame.draw.rect(s, BACTERIUM_OUTLINE, display, 1, border_radius=3)
        color = gv_bar_color(self.gv_level)
        fill_width = int((display.width - 4) * self.gv_level / 100.0)
        if fill_width > 0:
            pygame.draw.rect(s, darken(color, 0.55), (display.x + 2, display.y + 2, fill_width, display.height - 4))
        text = GAUGE_FONT.render(f"{self.gv_level:.0f}%", True, lighten(color, 0.5))
        s.blit(text, text.get_rect(center=(display.centerx, display.centery)))

    @staticmethod
    def draw_ecoli(s, cx, cy, t):
        color = ECOLI_COLOR
        flagellum = darken(color, 0.35)
        for index, offset in enumerate((-7, 0, 7)):
            points = []
            for step in range(9):
                px = cx - 17 - step * 1.4
                py = cy + offset + step * 0.45 + math.sin(t * 14 - step * 0.9 + index) * 2.0
                points.append((px, py))
            pygame.draw.lines(s, flagellum, False, points, 2)

        body = pygame.Rect(cx - 20, cy - 13, 40, 26)
        pygame.draw.rect(s, darken(color, 0.3), body, border_radius=13)
        pygame.draw.rect(s, color, (cx - 18, cy - 12, 36, 20), border_radius=10)
        pygame.draw.rect(s, lighten(color, 0.45), (cx - 12, cy - 9, 22, 4), border_radius=2)
        pygame.draw.rect(s, BACTERIUM_OUTLINE, body, 2, border_radius=13)

    @staticmethod
    def draw_hek(s, cx, cy, t):
        points = []
        for step in range(28):
            angle = step / 28 * math.tau
            radius = 19 + math.sin(angle * 5 + t * 3) * 1.2
            points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
        pygame.draw.polygon(s, darken(HEK_COLOR, 0.25), points)
        pygame.draw.circle(s, HEK_COLOR, (cx - 2, cy - 2), 16)
        pygame.draw.circle(s, lighten(HEK_COLOR, 0.35), (cx - 8, cy - 8), 5)
        pygame.draw.circle(s, darken(HEK_NUCLEUS, 0.2), (cx + 4, cy + 2), 8)
        pygame.draw.circle(s, HEK_NUCLEUS, (cx + 3, cy + 1), 7)
        pygame.draw.circle(s, darken(HEK_NUCLEUS, 0.45), (cx + 5, cy + 3), 2)
        pygame.draw.polygon(s, BACTERIUM_OUTLINE, points, 2)

    @staticmethod
    def draw_anabaena(s, cx, cy, t):
        color = ANABAENA_COLOR
        for index, dx in enumerate((-14, 0, 14)):
            bend = math.sin(t * 2 + index) * 1.5
            center = (cx + dx, int(cy + bend))
            pygame.draw.circle(s, darken(color, 0.3), center, 11)
            pygame.draw.circle(s, color, (center[0] - 1, center[1] - 1), 9)
            pygame.draw.circle(s, lighten(color, 0.4), (center[0] - 4, center[1] - 4), 3)
        # Thicker heterocyst at the end of the filament.
        heterocyst = (cx + 14, int(cy + math.sin(t * 2 + 2) * 1.5))
        pygame.draw.circle(s, lighten(color, 0.45), heterocyst, 7)
        pygame.draw.circle(s, darken(color, 0.45), heterocyst, 7, 2)
        for index, dx in enumerate((-14, 0, 14)):
            pygame.draw.circle(
                s, darken(color, 0.5), (cx + dx, int(cy + math.sin(t * 2 + index) * 1.5)), 11, 2
            )

    @staticmethod
    def draw_yeast(s, cx, cy, t):
        color = YEAST_COLOR
        # A daughter bud pinching off the mother cell.
        bud_center = (cx + 13, cy - 11 + int(math.sin(t * 2) * 1.5))
        pygame.draw.circle(s, darken(color, 0.3), bud_center, 9)
        pygame.draw.circle(s, color, (bud_center[0] - 1, bud_center[1] - 1), 7)

        pygame.draw.circle(s, darken(color, 0.3), (cx - 3, cy + 2), 18)
        pygame.draw.circle(s, color, (cx - 4, cy), 15)
        pygame.draw.circle(s, lighten(color, 0.45), (cx - 10, cy - 7), 5)
        pygame.draw.circle(s, YEAST_VACUOLE, (cx + 1, cy + 5), 6)
        pygame.draw.circle(s, darken(YEAST_VACUOLE, 0.3), (cx + 1, cy + 5), 6, 1)
        # Bud scars left over from earlier divisions.
        for dx, dy in ((-14, 8), (-9, -13)):
            pygame.draw.circle(s, darken(color, 0.4), (cx + dx, cy + dy), 3, 1)
        pygame.draw.circle(s, darken(color, 0.55), (cx - 3, cy + 2), 18, 2)
        pygame.draw.circle(s, darken(color, 0.55), bud_center, 9, 2)

    @staticmethod
    def draw_salmonella(s, cx, cy, t):
        color = SALMONELLA_COLOR
        flagellum = darken(color, 0.3)
        # Peritrichous flagella: they sit all around the rod, not just at the back.
        anchors = ((-16, -9, -1), (-17, 8, 1), (2, -12, -1), (6, 12, 1), (-19, 0, 0))
        for index, (ax, ay, direction) in enumerate(anchors):
            points = []
            for step in range(8):
                px = cx + ax - step * 1.9
                py = cy + ay + direction * step * 0.9 + math.sin(t * 12 - step * 0.8 + index) * 2.2
                points.append((px, py))
            pygame.draw.lines(s, flagellum, False, points, 2)

        body = pygame.Rect(cx - 19, cy - 12, 38, 24)
        pygame.draw.rect(s, darken(color, 0.32), body, border_radius=12)
        pygame.draw.rect(s, color, (cx - 17, cy - 11, 34, 18), border_radius=9)
        pygame.draw.rect(s, lighten(color, 0.5), (cx - 11, cy - 8, 20, 4), border_radius=2)
        pygame.draw.rect(s, BACTERIUM_OUTLINE, body, 2, border_radius=12)

    @staticmethod
    def draw_halobacterium(s, cx, cy, t):
        color = HALO_COLOR
        # Slightly curved rod, the way halophilic archaea look under the scope.
        for step in range(9):
            fraction = step / 8
            px = cx - 18 + fraction * 36
            py = cy + math.sin(fraction * math.pi) * -3 + math.sin(t * 2) * 1.0
            pygame.draw.circle(s, darken(color, 0.32), (int(px), int(py)), 12)
        for step in range(9):
            fraction = step / 8
            px = cx - 17 + fraction * 34
            py = cy - 1 + math.sin(fraction * math.pi) * -3 + math.sin(t * 2) * 1.0
            pygame.draw.circle(s, color, (int(px), int(py)), 9)
            if step % 2 == 0:
                pygame.draw.circle(s, lighten(color, 0.4), (int(px), int(py - 4)), 2)

    @staticmethod
    def draw_biobrick(s, cx, cy, color=BIOBRICK_COLOR):
        # Studs on top, then the brick wall below, like a plastic building block.
        # A sealed, opaque casing: no gas vesicles are ever shown through it.
        for dx in (-13, 0, 13):
            stud = pygame.Rect(cx + dx - 6, cy - 17, 12, 8)
            pygame.draw.ellipse(s, darken(color, 0.4), (stud.x, stud.y + 2, stud.width, 7))
            pygame.draw.ellipse(s, color, (stud.x, stud.y, stud.width, 7))
            pygame.draw.ellipse(s, lighten(color, 0.4), (stud.x + 2, stud.y + 1, 8, 3))

        body = pygame.Rect(cx - 20, cy - 12, 40, 24)
        pygame.draw.rect(s, darken(color, 0.35), body, border_radius=2)
        pygame.draw.rect(s, color, (body.x, body.y, body.width, body.height - 5), border_radius=2)
        pygame.draw.rect(s, lighten(color, 0.45), (body.x + 3, body.y + 2, body.width - 6, 3))
        pygame.draw.rect(s, darken(color, 0.55), body, 2, border_radius=2)

    @staticmethod
    def draw_igem_legacy(s, cx, cy, t):
        """An original ring-of-bricks design in the iGEM palette; not the iGEM logo itself."""
        palette = (
            (232, 181, 61), (235, 80, 80), (95, 215, 205),
            (120, 240, 120), (150, 205, 235), (235, 225, 130),
        )
        pygame.draw.circle(s, darken((232, 181, 61), 0.55), (cx, cy), 21, 2)
        for index, color in enumerate(palette):
            angle = t * 0.6 + index / len(palette) * math.tau
            px = cx + math.cos(angle) * 15
            py = cy + math.sin(angle) * 15
            brick = pygame.Rect(0, 0, 11, 9)
            brick.center = (int(px), int(py))
            pygame.draw.rect(s, darken(color, 0.4), brick, border_radius=2)
            pygame.draw.rect(s, color, brick.inflate(-3, -3), border_radius=1)
        core_pulse = 0.5 + 0.5 * math.sin(t * 3)
        pygame.draw.circle(s, lerp_color((232, 181, 61), WHITE, core_pulse * 0.4), (cx, cy), 6)
        pygame.draw.circle(s, darken((232, 181, 61), 0.4), (cx, cy), 6, 1)

    @staticmethod
    def draw_purified(s, cx, cy, t, visible_gvs):
        for index, (dx, dy) in enumerate(GV_POSITIONS):
            bob = math.sin(t * 2.5 + index * 1.3) * 1.2
            rect = pygame.Rect(cx + dx - 3, cy + dy - 6 + bob, 7, 13)
            if index < visible_gvs:
                pygame.draw.ellipse(s, GV_COLOR, rect)
                pygame.draw.ellipse(s, GV_OUTLINE, rect, 1)
                pygame.draw.line(s, WHITE, (rect.x + 2, rect.y + 3), (rect.x + 2, rect.y + 6))
            else:
                pygame.draw.ellipse(s, (110, 165, 185, 170), rect, 1)

    def get_rect(self):
        return pygame.Rect(
            int(self.x - self.half_width),
            int(self.y - self.half_height),
            self.half_width * 2,
            self.half_height * 2,
        )


def make_stone_pillar(width, height, cap_at_bottom, seed, base):
    surface = pygame.Surface((width, height), pygame.SRCALPHA)
    for x in range(width):
        shade = clamp(1.0 - abs(x / (width - 1) - 0.35) * 1.6, 0.0, 1.0)
        color = lerp_color(darken(base, 0.6), lighten(base, 0.18), shade)
        pygame.draw.line(surface, color, (x, 0), (x, height))

    rng = random.Random(seed)
    for _ in range(max(2, height // 16)):
        spot_x = rng.randint(6, width - 7)
        spot_y = rng.randint(0, height - 1)
        column = surface.get_at((spot_x, spot_y))
        if rng.random() < 0.7:
            color = darken(column, 0.28)
        else:
            color = lerp_color(column, (120, 190, 110), 0.35)
        pygame.draw.circle(surface, color, (spot_x, spot_y), rng.randint(2, 6))

    cap_height = min(16, height)
    cap_y = height - cap_height if cap_at_bottom else 0
    for x in range(width):
        column = surface.get_at((x, cap_y + cap_height // 2))
        pygame.draw.line(
            surface,
            lerp_color(column, (150, 205, 150), 0.35),
            (x, cap_y),
            (x, cap_y + cap_height),
        )
    edge_y = cap_y - 1 if cap_at_bottom else cap_y + cap_height
    pygame.draw.line(surface, darken(base, 0.55), (0, edge_y), (width, edge_y), 2)

    mask = pygame.Surface((width, height), pygame.SRCALPHA)
    radius = min(16, height // 2)
    corners = (
        {"border_bottom_left_radius": radius, "border_bottom_right_radius": radius}
        if cap_at_bottom
        else {"border_top_left_radius": radius, "border_top_right_radius": radius}
    )
    pygame.draw.rect(mask, (255, 255, 255, 255), mask.get_rect(), **corners)
    surface.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MIN)
    return surface


class Obstacle:
    def __init__(self, x, gap_size, pillar_color=OBSTACLE_COLOR):
        self.x = float(x)
        self.width = 70
        margin = 100
        self.gap_size = gap_size
        self.gap_y = random.randint(
            margin + gap_size // 2,
            HEIGHT - margin - gap_size // 2,
        )
        self.passed = False
        gap_top = self.gap_y - self.gap_size // 2
        gap_bottom = self.gap_y + self.gap_size // 2
        seed = random.random()
        self.top_surface = make_stone_pillar(self.width, gap_top, True, seed, pillar_color)
        self.bottom_surface = make_stone_pillar(
            self.width, HEIGHT - gap_bottom, False, seed + 1, pillar_color
        )

    def update(self, speed, frame_scale):
        self.x -= speed * frame_scale

    def draw(self, surface):
        gap_bottom = self.gap_y + self.gap_size // 2
        surface.blit(self.top_surface, (int(self.x), 0))
        surface.blit(self.bottom_surface, (int(self.x), gap_bottom))

    def collides_with(self, bacterium):
        gap_top = self.gap_y - self.gap_size // 2
        gap_bottom = self.gap_y + self.gap_size // 2
        top_rect = pygame.Rect(int(self.x), 0, self.width, gap_top)
        bottom_rect = pygame.Rect(
            int(self.x), gap_bottom, self.width, HEIGHT - gap_bottom
        )
        rect = bacterium.get_rect()
        return rect.colliderect(top_rect) or rect.colliderect(bottom_rect)

    def overlaps(self, bacterium):
        return False

    def off_screen(self):
        return self.x + self.width < 0


def circle_hits_rect(cx, cy, radius, rect):
    nearest_x = clamp(cx, rect.left, rect.right)
    nearest_y = clamp(cy, rect.top, rect.bottom)
    return math.hypot(cx - nearest_x, cy - nearest_y) < radius


def module_color(kind):
    return {
        "gfp": GFP_COLOR,
        "antibody": ANTIBODY_COLOR,
        "granzyme": GRANZYME_COLOR,
        "ampicillin": AMPICILLIN_COLOR,
    }[kind]


def draw_glow_blob(surface, center, radius, color, max_alpha):
    glow = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
    for r in range(radius, 0, -1):
        alpha = int(max_alpha * (1 - r / radius) ** 1.5)
        pygame.draw.circle(glow, (*color, alpha), (radius, radius), r)
    surface.blit(glow, glow.get_rect(center=center))


def draw_helix(surface, center, height, turns, color, core, phase):
    """GvpC is an alpha helix that clamps along the ribs of the vesicle shell."""
    cx, cy = center
    steps = 26
    for step in range(steps):
        fraction = step / (steps - 1)
        angle = phase + fraction * turns * math.tau
        x = cx + math.sin(angle) * 8
        y = cy - height / 2 + fraction * height
        depth = (math.cos(angle) + 1) / 2
        pygame.draw.circle(
            surface,
            lerp_color(darken(color, 0.45), core, depth),
            (int(x), int(y)),
            2 + int(depth * 2),
        )
        if step % 4 == 0:
            back_x = cx - math.sin(angle) * 8
            pygame.draw.line(
                surface, darken(color, 0.3), (int(x), int(y)), (int(back_x), int(y)), 1
            )


def draw_gfp_barrel(surface, center, radius, t):
    """GFP's beta barrel: a stubby cylinder with a bright chromophore."""
    cx, cy = center
    body = pygame.Rect(cx - radius, cy - radius - 1, radius * 2, radius * 2 + 2)
    pygame.draw.rect(surface, darken(GFP_COLOR, 0.45), body, border_radius=radius // 2)
    pygame.draw.rect(surface, GFP_COLOR, body.inflate(-3, -3), border_radius=radius // 2)
    for offset in range(-radius + 3, radius - 1, 3):
        pygame.draw.line(
            surface,
            darken(GFP_COLOR, 0.25),
            (cx + offset, body.top + 2),
            (cx + offset, body.bottom - 3),
            1,
        )
    pulse = 0.5 + 0.5 * math.sin(t * 5)
    pygame.draw.circle(surface, lerp_color(GFP_COLOR, WHITE, pulse), (cx, cy), 2)


def draw_granzyme(surface, center, size, angle):
    """Granzyme: a serrated protease that cuts approaching cells open."""
    cx, cy = center
    points = []
    for step in range(10):
        spin = angle + step / 10 * math.tau
        reach = size if step % 2 == 0 else size * 0.5
        points.append((cx + math.cos(spin) * reach, cy + math.sin(spin) * reach))
    pygame.draw.polygon(surface, darken(GRANZYME_COLOR, 0.4), points)
    pygame.draw.polygon(surface, GRANZYME_COLOR, points, 2)
    pygame.draw.circle(surface, lighten(GRANZYME_COLOR, 0.6), (cx, cy), max(2, size // 3))


def draw_antibody(surface, center, size, angle):
    """Y-shaped antibody: the SpyCatcher fusion that grabs nearby targets."""
    cx, cy = center
    stem = (cx - math.cos(angle) * size, cy - math.sin(angle) * size)
    for arm in (-0.7, 0.7):
        tip = (
            cx + math.cos(angle + arm) * size,
            cy + math.sin(angle + arm) * size,
        )
        pygame.draw.line(surface, darken(ANTIBODY_COLOR, 0.4), (cx, cy), tip, 4)
        pygame.draw.line(surface, ANTIBODY_COLOR, (cx, cy), tip, 2)
        pygame.draw.circle(surface, WHITE, (int(tip[0]), int(tip[1])), 2)
    pygame.draw.line(surface, darken(ANTIBODY_COLOR, 0.4), (cx, cy), stem, 4)
    pygame.draw.line(surface, ANTIBODY_COLOR, (cx, cy), stem, 2)


def draw_ampicillin(surface, center, size, angle):
    """Ampicillin: a two-tone capsule with its beta-lactam ring."""
    cx, cy = center
    ux, uy = math.cos(angle), math.sin(angle)
    half = size * 1.15
    tail = (cx - ux * half, cy - uy * half)
    tip = (cx + ux * half, cy + uy * half)
    pygame.draw.line(surface, darken(AMPICILLIN_COLOR, 0.4), tail, center, max(3, int(size * 0.9)))
    pygame.draw.line(surface, lighten(AMPICILLIN_COLOR, 0.35), center, tip, max(3, int(size * 0.9)))
    pygame.draw.circle(surface, darken(AMPICILLIN_COLOR, 0.5), (int(tail[0]), int(tail[1])), max(2, size // 2))
    pygame.draw.circle(surface, lighten(AMPICILLIN_COLOR, 0.55), (int(tip[0]), int(tip[1])), max(2, size // 2))
    ring = max(3, size // 2)
    ring_rect = pygame.Rect(0, 0, ring, ring)
    ring_rect.center = (int(cx), int(cy))
    pygame.draw.rect(surface, WHITE, ring_rect, 1)


class Bonus:
    """Anything floating in the water that the player can pick up."""

    radius = 14
    label = ""
    label_color = WHITE

    def __init__(self, x, y):
        self.x = float(x)
        self.y = float(y)
        self.phase = random.uniform(0, math.tau)
        self.draw_y = self.y

    def update(self, speed, frame_scale, bacterium):
        self.x -= speed * frame_scale
        self.draw_y = self.y + math.sin(now() * 2 + self.phase) * 5

    def apply_magnet(self, bacterium, frame_scale):
        """Antibody pulls anything magnetic in: coins and GvpC alike."""
        if bacterium.module != "antibody":
            return
        dx = bacterium.x - self.x
        dy = bacterium.y - self.draw_y
        distance = math.hypot(dx, dy)
        radius = bacterium.magnet_radius
        if 0 < distance < radius:
            pull = MAGNET_SPEED * frame_scale * (1 - distance / radius)
            self.x += dx / distance * pull
            self.y += dy / distance * pull
            self.draw_y += dy / distance * pull

    def draw_label(self, surface, center):
        if not self.label:
            return
        text = GAUGE_FONT.render(self.label, True, self.label_color)
        surface.blit(text, text.get_rect(midtop=(center[0], center[1] + self.radius + 4)))

    def collected_by(self, bacterium):
        return circle_hits_rect(
            self.x, self.draw_y, self.radius + 6, bacterium.get_rect()
        )

    def off_screen(self):
        return self.x + self.radius < 0


class GvpC(Bonus):
    """Collectible GvpC helix: binding it reinforces the shell for one hit."""

    radius = GVPC_RADIUS
    label = "GvpC"
    label_color = GVPC_CORE

    def update(self, speed, frame_scale, bacterium):
        super().update(speed, frame_scale, bacterium)
        self.apply_magnet(bacterium, frame_scale)

    def draw(self, surface):
        t = now()
        center = (int(self.x), int(self.draw_y))
        pulse = 0.5 + 0.5 * math.sin(t * 3 + self.phase)
        draw_glow_blob(surface, center, self.radius * 2, GVPC_COLOR, 70 + 45 * pulse)
        draw_helix(surface, center, 26, 2.2, GVPC_COLOR, GVPC_CORE, t * 2 + self.phase)
        self.draw_label(surface, center)

    def apply(self, bacterium):
        bacterium.reinforce()


class SpyCatcherModule(Bonus):
    """SpyCatcher fusion that clips onto the SpyTag of the shell."""

    radius = 15

    def __init__(self, x, y, kind):
        super().__init__(x, y)
        self.kind = kind
        self.label = MODULE_SHORT[kind]
        self.label_color = module_color(kind)

    def draw(self, surface):
        t = now()
        center = (int(self.x), int(self.draw_y))
        pulse = 0.5 + 0.5 * math.sin(t * 3 + self.phase)
        color = module_color(self.kind)
        draw_glow_blob(surface, center, self.radius * 2, color, 70 + 50 * pulse)
        if self.kind == "gfp":
            draw_gfp_barrel(surface, center, 9, t)
        elif self.kind == "granzyme":
            draw_granzyme(surface, center, 11, t * 1.5)
        elif self.kind == "ampicillin":
            draw_ampicillin(surface, center, 10, t * 1.2)
        else:
            draw_antibody(surface, center, 11, -math.pi / 2 + math.sin(t * 2) * 0.3)
        # The SpyTag hook that snaps onto the vesicle shell.
        pygame.draw.arc(
            surface,
            lighten(color, 0.4),
            pygame.Rect(center[0] - 15, center[1] - 15, 30, 30),
            t * 1.5,
            t * 1.5 + 1.1,
            2,
        )
        self.draw_label(surface, center)

    def apply(self, bacterium):
        bacterium.bind_module(self.kind)


class Coin(Bonus):
    """A small golden protein: the run's currency pickup."""

    radius = COIN_RADIUS

    def update(self, speed, frame_scale, bacterium):
        super().update(speed, frame_scale, bacterium)
        self.apply_magnet(bacterium, frame_scale)

    def draw(self, surface):
        t = now()
        center = (int(self.x), int(self.draw_y))
        draw_glow_blob(surface, center, self.radius * 2, COIN_COLOR, 55)
        # Three fused lobes, like a small folded protein catching the light.
        wobble = math.sin(t * 3 + self.phase) * 1.2
        lobes = (
            (-self.radius * 0.38, -self.radius * 0.28 + wobble, self.radius * 0.62),
            (self.radius * 0.36, -self.radius * 0.32 + wobble, self.radius * 0.56),
            (0, self.radius * 0.4 + wobble, self.radius * 0.62),
        )
        for dx, dy, r in lobes:
            spot = (int(center[0] + dx), int(center[1] + dy))
            pygame.draw.circle(surface, COIN_EDGE, spot, int(r) + 1)
            pygame.draw.circle(surface, COIN_COLOR, spot, int(r))
        shine = (int(center[0] - self.radius * 0.25), int(center[1] - self.radius * 0.45 + wobble))
        pygame.draw.circle(surface, lighten(COIN_COLOR, 0.65), shine, 2)

    def apply(self, bacterium):
        return "coin"


class SpecialPrize(Bonus):
    """A rare iGEM special prize, tucked hard against a gap's edge."""

    radius = 13
    label = "iGEM Prize"
    label_color = (232, 181, 61)

    def update(self, speed, frame_scale, bacterium):
        # Barely any bob: it has to stay exactly where the tight spot put it.
        self.x -= speed * frame_scale
        self.draw_y = self.y + math.sin(now() * 2 + self.phase) * 2

    def draw(self, surface):
        t = now()
        center = (int(self.x), int(self.draw_y))
        pulse = 0.5 + 0.5 * math.sin(t * 4 + self.phase)
        gold = (232, 181, 61)
        draw_glow_blob(surface, center, self.radius * 3, (255, 225, 140), 90 + 60 * pulse)

        for side in (-1, 1):
            tip = (center[0] + side * 6, center[1] + self.radius + 11)
            pygame.draw.polygon(
                surface,
                (200, 60, 70),
                [
                    (center[0] + side * 2, center[1] + 3),
                    (center[0] + side * 9, center[1] + 3),
                    tip,
                ],
            )

        pygame.draw.circle(surface, darken(gold, 0.45), center, self.radius + 2)
        pygame.draw.circle(surface, lerp_color(gold, WHITE, pulse * 0.3), center, self.radius)

        points = []
        for step in range(10):
            angle = -math.pi / 2 + step * math.pi / 5
            reach = self.radius * (0.78 if step % 2 == 0 else 0.34)
            points.append((center[0] + math.cos(angle) * reach, center[1] + math.sin(angle) * reach))
        pygame.draw.polygon(surface, darken(gold, 0.55), points)
        self.draw_label(surface, center)

    def apply(self, bacterium):
        return "special_prize"


class DriftingCell:
    """A foreign cell swimming against the current, straight at the player."""

    def __init__(self, x, y, kind):
        self.kind = kind
        self.x = float(x)
        self.base_y = float(y)
        self.y = float(y)
        self.phase = random.uniform(0, math.tau)
        if kind == "macrophage":
            self.radius = 20
            self.extra_speed = 1.1
            self.amplitude = random.uniform(10, 26)
            self.color = (212, 118, 162)
        else:
            self.radius = 14
            self.extra_speed = 2.2
            self.amplitude = random.uniform(24, 46)
            self.color = (150, 205, 185)
        self.wobble_speed = random.uniform(1.1, 1.9)
        self.killed = False
        self.dead_timer = 0.0

    def kill(self):
        self.killed = True
        self.dead_timer = 0.35

    def alive(self):
        return not self.killed

    def finished(self):
        return self.killed and self.dead_timer <= 0

    def update(self, speed, frame_scale):
        if self.killed:
            self.dead_timer -= frame_scale / FPS
            return
        self.x -= (speed + self.extra_speed) * frame_scale
        self.y = clamp(
            self.base_y + math.sin(now() * self.wobble_speed + self.phase) * self.amplitude,
            self.radius + 30,
            HEIGHT - self.radius - 30,
        )

    def draw(self, surface):
        t = now()
        center = (int(self.x), int(self.y))
        if self.killed:
            self.draw_lysis(surface, center)
            return
        # A warning halo keeps them readable while the lamp flickers.
        draw_glow_blob(surface, center, self.radius * 2, (255, 120, 90), 55)

        if self.kind == "macrophage":
            points = []
            for step in range(20):
                angle = step / 20 * math.tau
                reach = self.radius + math.sin(angle * 3 + t * 2 + self.phase) * 4
                points.append((center[0] + math.cos(angle) * reach, center[1] + math.sin(angle) * reach))
            pygame.draw.polygon(surface, darken(self.color, 0.35), points)
            pygame.draw.circle(surface, self.color, (center[0] - 2, center[1] - 2), self.radius - 5)
            pygame.draw.polygon(surface, darken(self.color, 0.6), points, 2)
            for dx, dy in ((-6, 2), (4, -5), (6, 6)):
                pygame.draw.circle(surface, darken(self.color, 0.5), (center[0] + dx, center[1] + dy), 3)
        else:
            for step in range(16):
                angle = step / 16 * math.tau
                beat = math.sin(t * 9 + step) * 2
                start = (
                    center[0] + math.cos(angle) * (self.radius - 1),
                    center[1] + math.sin(angle) * (self.radius + 3),
                )
                end = (
                    center[0] + math.cos(angle) * (self.radius + 6 + beat),
                    center[1] + math.sin(angle) * (self.radius + 9 + beat),
                )
                pygame.draw.line(surface, darken(self.color, 0.2), start, end, 2)
            body = pygame.Rect(0, 0, self.radius * 2, self.radius * 2 + 6)
            body.center = center
            pygame.draw.ellipse(surface, darken(self.color, 0.3), body)
            pygame.draw.ellipse(surface, self.color, body.inflate(-5, -6))
            pygame.draw.ellipse(surface, lighten(self.color, 0.45), (center[0] - 6, center[1] - 7, 6, 5))
            pygame.draw.circle(surface, darken(self.color, 0.6), (center[0] + 3, center[1] + 2), 4)

    def draw_lysis(self, surface, center):
        progress = 1 - max(0.0, self.dead_timer) / 0.35
        alpha = int(220 * (1 - progress))
        burst = pygame.Surface((self.radius * 6, self.radius * 6), pygame.SRCALPHA)
        middle = burst.get_rect().center
        pygame.draw.circle(
            burst, (*GRANZYME_COLOR, alpha // 2), middle, int(self.radius * (1 + progress)), 3
        )
        for step in range(9):
            angle = step / 9 * math.tau + self.phase
            reach = self.radius * (0.5 + progress * 2)
            spot = (
                int(middle[0] + math.cos(angle) * reach),
                int(middle[1] + math.sin(angle) * reach),
            )
            pygame.draw.circle(burst, (*self.color, alpha), spot, max(1, int(5 * (1 - progress))))
        surface.blit(burst, burst.get_rect(center=center))

    def collides_with(self, bacterium):
        return self.alive() and circle_hits_rect(
            self.x, self.y, self.radius, bacterium.get_rect()
        )

    def off_screen(self):
        return self.x + self.radius < 0 or self.finished()


def nearest_alive_hazard(x, y, hazards):
    alive = [hazard for hazard in hazards if hazard.alive()]
    if not alive:
        return None
    return min(alive, key=lambda hazard: (hazard.x - x) ** 2 + (hazard.y - y) ** 2)


class AmpicillinShot:
    """One fired dose: flies straight ahead, or homes in once upgraded."""

    radius = 5

    def __init__(self, x, y, homing):
        self.x = float(x)
        self.y = float(y)
        self.homing = homing
        self.vx = AMPICILLIN_SHOT_SPEED
        self.vy = 0.0

    def update(self, frame_scale, hazards):
        if self.homing:
            target = nearest_alive_hazard(self.x, self.y, hazards)
            if target is not None:
                dx, dy = target.x - self.x, target.y - self.y
                distance = math.hypot(dx, dy) or 1.0
                desired_vx = dx / distance * AMPICILLIN_SHOT_SPEED
                desired_vy = dy / distance * AMPICILLIN_SHOT_SPEED
                turn = min(1.0, AMPICILLIN_HOMING_TURN_RATE * frame_scale)
                self.vx += (desired_vx - self.vx) * turn
                self.vy += (desired_vy - self.vy) * turn
                speed = math.hypot(self.vx, self.vy) or 1.0
                self.vx = self.vx / speed * AMPICILLIN_SHOT_SPEED
                self.vy = self.vy / speed * AMPICILLIN_SHOT_SPEED
        self.x += self.vx * frame_scale
        self.y += self.vy * frame_scale

    def draw(self, surface):
        angle = math.atan2(self.vy, self.vx)
        trail = (int(self.x - math.cos(angle) * 14), int(self.y - math.sin(angle) * 14))
        pygame.draw.line(surface, darken(AMPICILLIN_COLOR, 0.3), trail, (int(self.x), int(self.y)), 2)
        draw_ampicillin(surface, (int(self.x), int(self.y)), self.radius, angle)

    def collides_with(self, hazard):
        return math.hypot(self.x - hazard.x, self.y - hazard.y) < self.radius + hazard.radius

    def off_screen(self):
        return (
            self.x - self.radius > WIDTH
            or self.x + self.radius < 0
            or self.y + self.radius < 0
            or self.y - self.radius > HEIGHT
        )


class BossWeakpoint:
    """The soft spot on the macrophage. Shoot it while it is exposed."""

    radius = 17

    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.exposed = False
        self.hit = False

    def alive(self):
        return self.exposed and not self.hit

    def kill(self):
        self.hit = True


class Transducer:
    def __init__(self, x, kind, collapse_number=1):
        self.x = float(x)
        self.width = TRANSDUCER_WIDTH
        self.kind = kind
        self.collapse_fraction = transducer_strength(collapse_number)
        self.triggered = False
        self.passed = False

    def update(self, speed, frame_scale):
        self.x -= speed * frame_scale

    def draw(self, surface):
        t = now()
        x = int(self.x)
        field_color = (
            TRANSDUCER_COLOR if self.kind == "collapse" else TRANSDUCER_PUSH_COLOR
        )
        core_color = (
            TRANSDUCER_CORE if self.kind == "collapse" else TRANSDUCER_PUSH_CORE
        )
        strength = 0.5 if self.triggered else 1.0
        pulse = 0.5 + 0.5 * math.sin(t * 4)

        # The field always covers the complete screen height.
        field = pygame.Surface((self.width, HEIGHT), pygame.SRCALPHA)
        field.fill((*field_color, int((30 + 25 * pulse) * strength)))
        for i in range(7):
            alpha = int((110 - i * 15) * strength)
            pygame.draw.line(field, (*core_color, alpha), (i, 0), (i, HEIGHT))
            pygame.draw.line(
                field,
                (*core_color, alpha),
                (self.width - 1 - i, 0),
                (self.width - 1 - i, HEIGHT),
            )

        spacing = 34
        travel = (t * 70) % spacing
        wave_alpha = int(150 * strength)
        for base_y in range(-spacing, HEIGHT + spacing, spacing):
            if self.kind == "top":
                y, bend = base_y + travel, 1
            elif self.kind == "bottom":
                y, bend = base_y - travel + spacing, -1
            elif base_y < HEIGHT // 2:
                y, bend = base_y + travel, 1
            else:
                y, bend = base_y - travel + spacing, -1
            if self.kind == "collapse" and (
                (bend == 1 and y > HEIGHT // 2) or (bend == -1 and y < HEIGHT // 2)
            ):
                continue
            points = [
                (px, y + math.sin(px / (self.width - 1) * math.pi) * 7 * bend)
                for px in range(6, self.width - 5, 4)
            ]
            pygame.draw.lines(field, (*core_color, wave_alpha), False, points, 2)
        surface.blit(field, (x, 0))

        if self.kind in ("collapse", "top"):
            self.draw_emitter(surface, top=True, color=field_color, core=core_color, pulse=pulse)
        if self.kind in ("collapse", "bottom"):
            self.draw_emitter(surface, top=False, color=field_color, core=core_color, pulse=pulse)

        arrow_shift = (t * 45) % 92
        if self.kind == "top":
            for y in range(0, HEIGHT, 92):
                arrow_y = y + arrow_shift
                if 60 < arrow_y < HEIGHT - 30:
                    self.draw_arrow(surface, x + self.width // 2, arrow_y, 1, core_color)
            label_text = "PRESSURE DOWN"
        elif self.kind == "bottom":
            for y in range(0, HEIGHT, 92):
                arrow_y = HEIGHT - y - arrow_shift
                if 30 < arrow_y < HEIGHT - 60:
                    self.draw_arrow(surface, x + self.width // 2, arrow_y, -1, core_color)
            label_text = "PRESSURE UP"
        else:
            label_text = f"GV -{self.collapse_fraction * 100:.0f}%"

        label = SMALL_FONT.render(label_text, True, WHITE)
        rotated = pygame.transform.rotate(label, 90)
        label_rect = rotated.get_rect(center=(int(self.x + self.width / 2), HEIGHT // 2))
        pill = pygame.Surface(label_rect.inflate(10, 16).size, pygame.SRCALPHA)
        pygame.draw.rect(pill, (*PANEL, 190), pill.get_rect(), border_radius=12)
        pygame.draw.rect(pill, (*core_color, 150), pill.get_rect(), 1, border_radius=12)
        surface.blit(pill, pill.get_rect(center=label_rect.center))
        surface.blit(rotated, label_rect)

    def draw_emitter(self, surface, top, color, core, pulse):
        x = int(self.x)
        emitter_height = 28
        y = 0 if top else HEIGHT - emitter_height
        body = pygame.Rect(x - 6, y, self.width + 12, emitter_height)
        pygame.draw.rect(surface, darken(color, 0.55), body, border_radius=6)
        inner = body.inflate(-4, -4)
        pygame.draw.rect(surface, darken(color, 0.15), inner, border_radius=5)
        pygame.draw.rect(
            surface,
            lighten(color, 0.3),
            (inner.x + 3, inner.y + 2, inner.width - 6, 5),
            border_radius=3,
        )

        lens_y = body.bottom - 9 if top else body.top + 3
        lens = pygame.Rect(x + 8, lens_y, self.width - 16, 6)
        glow = pygame.Surface((lens.width + 30, 40), pygame.SRCALPHA)
        pygame.draw.ellipse(glow, (*core, int(60 + 60 * pulse)), glow.get_rect())
        surface.blit(glow, glow.get_rect(center=lens.center))
        pygame.draw.rect(surface, lerp_color(core, WHITE, pulse), lens, border_radius=3)

    @staticmethod
    def draw_arrow(surface, x, y, direction, color):
        tip_y = y + direction * 13
        points = [
            (x, tip_y + direction * 2),
            (x - 9, tip_y - direction * 8),
            (x - 3, tip_y - direction * 8),
            (x - 3, y - direction * 12),
            (x + 3, y - direction * 12),
            (x + 3, tip_y - direction * 8),
            (x + 9, tip_y - direction * 8),
        ]
        pygame.draw.polygon(surface, color, points)
        pygame.draw.polygon(surface, darken(color, 0.5), points, 1)

    def collides_with(self, bacterium):
        return False

    def overlaps(self, bacterium):
        field = pygame.Rect(int(self.x), 0, self.width, HEIGHT)
        return bacterium.get_rect().colliderect(field)

    def off_screen(self):
        return self.x + self.width < 0


def biome_for_score(score):
    index = 0
    for number, biome in enumerate(BIOMES):
        if score >= biome["score"]:
            index = number
    return index


def draw_water_background(ceiling_intensity=1.0, biome=0, previous=None, blend=1.0):
    t = now()
    water = BIOME_SURFACES[biome]
    if previous is not None and blend < 1.0:
        screen.blit(BIOME_SURFACES[previous], (0, 0))
        water = water.copy()
        water.set_alpha(int(255 * blend))
    screen.blit(water, (0, 0))
    LIGHT_RAYS.set_alpha(int(40 + 215 * ceiling_intensity))
    screen.blit(LIGHT_RAYS, (-120 + math.sin(t * 0.25) * 90, 0))

    for y, label in DEPTH_LABELS.items():
        line_color = lighten(BIOME_SURFACES[biome].get_at((0, y)), 0.08)
        for dash_x in range(0, WIDTH, 24):
            pygame.draw.line(screen, line_color, (dash_x, y), (dash_x + 12, y))
        screen.blit(label, (10, y + 4))

    for base_x, base_y, radius, phase in PARTICLES:
        speed = 6 + radius * 9
        px = (base_x - t * speed * 2.2) % (WIDTH + 20) - 10
        py = (base_y - t * speed * 0.35) % (HEIGHT + 20) - 10
        px += math.sin(t * 0.8 + phase) * 6
        screen.blit(PARTICLE_SURFACES[radius], (px, py))

    top_color = BIOMES[biome]["top"]
    surface_points = [
        (x, 4 + math.sin(x * 0.03 + t * 2.0) * 2.5) for x in range(0, WIDTH + 20, 20)
    ]
    pygame.draw.polygon(screen, lighten(top_color, 0.35), [(0, 0), *surface_points, (WIDTH, 0)])
    pygame.draw.lines(screen, lighten(top_color, 0.65), False, surface_points, 2)

    sand_points = [
        (x, HEIGHT - 10 + math.sin(x * 0.021) * 4 + math.sin(x * 0.057 + 1) * 2)
        for x in range(0, WIDTH + 20, 15)
    ]
    pygame.draw.polygon(screen, darken(SAND_COLOR, 0.35), [(0, HEIGHT), *sand_points, (WIDTH, HEIGHT)])
    pygame.draw.lines(screen, darken(SAND_COLOR, 0.1), False, sand_points, 2)


def draw_vignette():
    screen.blit(VIGNETTE, (0, 0))


def make_light_mask(size=192):
    mask = pygame.Surface((size, size), pygame.SRCALPHA)
    # Corners stay opaque so the square mask never punches a hole outside its circle.
    mask.fill((255, 255, 255, 255))
    half = size // 2
    for r in range(half, 0, -1):
        alpha = int(255 * min(1.0, (r / half) ** 1.8))
        pygame.draw.circle(mask, (255, 255, 255, alpha), (half, half), r)
    return mask


LIGHT_MASK = make_light_mask()
DARK_SCALE = 4
_light_cache = {}


def scaled_light_mask(diameter):
    key = max(8, int(round(diameter / 4)) * 4)
    mask = _light_cache.get(key)
    if mask is None:
        mask = pygame.transform.smoothscale(LIGHT_MASK, (key, key))
        _light_cache[key] = mask
    return mask


class CeilingLight:
    """The lamp above the water switches on and off during a run."""

    def __init__(self):
        self.on = True
        self.timer = random.uniform(*CEILING_ON_SECONDS)
        self.intensity = 1.0

    def update(self, dt):
        self.timer -= dt
        if self.timer <= 0:
            self.on = not self.on
            span = CEILING_ON_SECONDS if self.on else CEILING_OFF_SECONDS
            self.timer = random.uniform(*span)

        target = 1.0 if self.on else 0.0
        speed = 3.5 if self.on else 2.5
        self.intensity += clamp(target - self.intensity, -speed * dt, speed * dt)
        if self.on and self.intensity > 0.25 and random.random() < 0.05:
            self.intensity *= 0.6
        return self.intensity


_ceiling_cache = {}


def ceiling_mask(intensity, size):
    key = (round(intensity * 20), size)
    mask = _ceiling_cache.get(key)
    if mask is None:
        mask = pygame.Surface(size, pygame.SRCALPHA)
        for y in range(size[1]):
            lit = max(0.0, 1.0 - (y / size[1]) * CEILING_LIGHT_DEPTH)
            alpha = int(255 * (1 - lit * intensity))
            pygame.draw.line(mask, (255, 255, 255, alpha), (0, y), (size[0], y))
        _ceiling_cache[key] = mask
    return mask


def lamp_radius(bacterium):
    """Your own lamp flickers; a bound SpyCatcher-GFP keeps it steady and wide."""
    if bacterium.module == "gfp":
        return LIGHT_GFP_RADIUS, DARKNESS_GFP_ALPHA
    t = now()
    flicker = (
        0.78
        + 0.13 * math.sin(t * 11.3)
        + 0.07 * math.sin(t * 19.7)
        + 0.05 * math.sin(t * 3.1)
    )
    if math.sin(t * 0.83) > 0.985:
        flicker *= 0.55
    return LIGHT_BASE_RADIUS * flicker, DARKNESS_ALPHA


def draw_darkness(bacterium, ceiling_intensity):
    radius, alpha = lamp_radius(bacterium)
    size = (WIDTH // DARK_SCALE, HEIGHT // DARK_SCALE)
    small = pygame.Surface(size, pygame.SRCALPHA)
    small.fill((0, 6, 18, alpha))

    # Whichever light reaches a spot wins: the lamp above or your own.
    if ceiling_intensity > 0.01:
        small.blit(ceiling_mask(ceiling_intensity, size), (0, 0), special_flags=pygame.BLEND_RGBA_MIN)
    mask = scaled_light_mask(radius * 2 / DARK_SCALE)
    center = (int(bacterium.x / DARK_SCALE), int(bacterium.y / DARK_SCALE))
    small.blit(mask, mask.get_rect(center=center), special_flags=pygame.BLEND_RGBA_MIN)
    screen.blit(pygame.transform.smoothscale(small, (WIDTH, HEIGHT)), (0, 0))


def gv_bar_color(gv_level):
    if gv_level < 25:
        return RED
    if gv_level < 50:
        return ORANGE
    return GREEN


def draw_coin_icon(center, radius):
    """Small icon version of the golden-protein pickup, for panels and counters."""
    lobes = (
        (-radius * 0.4, -radius * 0.3, radius * 0.62),
        (radius * 0.38, -radius * 0.34, radius * 0.56),
        (0, radius * 0.42, radius * 0.62),
    )
    for dx, dy, r in lobes:
        spot = (int(center[0] + dx), int(center[1] + dy))
        pygame.draw.circle(screen, COIN_EDGE, spot, max(1, int(r) + 1))
        pygame.draw.circle(screen, COIN_COLOR, spot, max(1, int(r)))
    shine = (int(center[0] - radius * 0.25), int(center[1] - radius * 0.45))
    pygame.draw.circle(screen, lighten(COIN_COLOR, 0.65), shine, 1)


def draw_coin_counter(coins, rect):
    draw_panel(rect, alpha=170, border_alpha=80, radius=13)
    draw_coin_icon((rect.x + 22, rect.centery), 9)
    blit_text(FONT, str(coins), WHITE, (rect.x + 40, rect.centery), anchor="midleft")


def draw_module_icon(kind, center, size):
    if kind == "gfp":
        draw_gfp_barrel(screen, center, size - 1, now())
    elif kind == "granzyme":
        draw_granzyme(screen, center, size, now() * 1.5)
    elif kind == "ampicillin":
        draw_ampicillin(screen, center, size, -math.pi / 2)
    else:
        draw_antibody(screen, center, size, -math.pi / 2)


def draw_module_status(bacterium, area):
    """SpyCatcher slot, drawn in the GV panel right next to the GvpC pip."""
    if not bacterium.module:
        blit_text(SMALL_FONT, "SpyCatcher", PANEL_BORDER, (area.x, area.y + 2), shadow=False)
        blit_text(
            SMALL_FONT, "none", GRAY, (area.right, area.y + 2), anchor="topright", shadow=False, alpha=150
        )
        return

    color = module_color(bacterium.module)
    draw_module_icon(bacterium.module, (area.x + 9, area.centery), 9)
    blit_text(SMALL_FONT, MODULE_SHORT[bacterium.module], color, (area.x + 24, area.y), shadow=False)
    is_ampicillin = bacterium.module == "ampicillin"
    label = f"x{bacterium.ammo}" if is_ampicillin else f"{bacterium.module_timer:.0f}s"
    blit_text(
        SMALL_FONT,
        label,
        WHITE,
        (area.right, area.y),
        anchor="topright",
        shadow=False,
    )
    bar = pygame.Rect(area.x + 24, area.bottom - 3, area.right - area.x - 24, 4)
    pygame.draw.rect(screen, (4, 16, 28), bar, border_radius=2)
    fraction = (
        bacterium.ammo / bacterium.ampicillin_capacity
        if is_ampicillin and bacterium.ampicillin_capacity
        else (bacterium.module_timer / bacterium.module_duration if bacterium.module_duration else 0)
    )
    left = int(bar.width * fraction)
    if left > 0:
        pygame.draw.rect(screen, color, (bar.x, bar.y, left, bar.height), border_radius=2)


def draw_hud(bacterium, score, level, biome_name, best_score, coins):
    gv_panel = pygame.Rect(15, 12, 285, 128)
    draw_panel(gv_panel)

    blit_text(SMALL_FONT, "GAS VESICLES", PANEL_BORDER, (30, 20), shadow=False)
    blit_text(
        MEDIUM_FONT,
        f"{bacterium.gv_level:5.1f}%",
        WHITE,
        (gv_panel.right - 18, 16),
        anchor="topright",
    )

    blit_text(SMALL_FONT, "GvpC", PANEL_BORDER, (30, 46), shadow=False)
    for layer in range(MAX_SHELL_LAYERS):
        pip = pygame.Rect(76 + layer * 28, 50, 24, 12)
        filled = layer < bacterium.shell
        pygame.draw.rect(screen, SHELL_COLOR if filled else (26, 52, 68), pip, border_radius=6)
        pygame.draw.rect(
            screen,
            lighten(SHELL_COLOR, 0.4) if filled else (58, 88, 104),
            pip,
            1,
            border_radius=6,
        )

    divider_x = 76 + MAX_SHELL_LAYERS * 28 + 6
    pygame.draw.line(screen, (58, 88, 104), (divider_x, 46), (divider_x, 70), 1)
    draw_module_status(bacterium, pygame.Rect(divider_x + 10, 46, gv_panel.right - 18 - divider_x - 10, 28))

    bar_rect = pygame.Rect(30, 82, 250, 26)
    pygame.draw.rect(screen, (4, 16, 28), bar_rect, border_radius=13)
    fill_width = int(bar_rect.width * bacterium.gv_level / 100.0)
    if fill_width > 0:
        color = gv_bar_color(bacterium.gv_level)
        fill = pygame.Rect(bar_rect.x, bar_rect.y, max(fill_width, 14), bar_rect.height)
        fill.width = min(fill.width, bar_rect.width)
        pygame.draw.rect(screen, darken(color, 0.2), fill, border_radius=13)
        pygame.draw.rect(
            screen,
            color,
            (fill.x, fill.y, fill.width, fill.height - 8),
            border_radius=13,
        )
        pygame.draw.rect(
            screen,
            lighten(color, 0.45),
            (fill.x + 8, fill.y + 4, max(0, fill.width - 16), 4),
            border_radius=2,
        )
    neutral_x = bar_rect.x + bar_rect.width // 2
    pygame.draw.line(
        screen,
        WHITE,
        (neutral_x, bar_rect.y - 4),
        (neutral_x, bar_rect.bottom + 4),
        2,
    )
    pygame.draw.rect(screen, lighten(PANEL, 0.4), bar_rect, 2, border_radius=13)
    blit_text(SMALL_FONT, "sink", GRAY, (bar_rect.x + 4, bar_rect.bottom + 2), shadow=False, alpha=170)
    blit_text(SMALL_FONT, "float", GRAY, (bar_rect.right - 4, bar_rect.bottom + 2), anchor="topright", shadow=False, alpha=170)

    blit_text(SMALL_FONT, "SCORE", PANEL_BORDER, (WIDTH // 2, 12), anchor="midtop")
    blit_text(BIG_FONT, str(score), WHITE, (WIDTH // 2, 28), anchor="midtop")
    blit_text(SMALL_FONT, f"BEST {best_score}", GRAY, (WIDTH // 2, 74), anchor="midtop", shadow=False)

    level_text = f"Level {level}" if score >= LEVEL_START_SCORE else "Warm-up"
    info = SMALL_FONT.render(f"{level_text}   ·   {biome_name}", True, WHITE)
    info_rect = info.get_rect(midtop=(WIDTH // 2, 100))
    draw_panel(info_rect.inflate(26, 8), alpha=150, border_alpha=70, radius=13)
    screen.blit(info, info_rect)

    draw_coin_counter(coins, pygame.Rect(WIDTH - 230, 112, 215, 34))

    controls = SMALL_FONT.render(
        "W / UP:  produce GVs      S / DOWN:  collapse GVs",
        True,
        WHITE,
    )
    controls_rect = controls.get_rect(midbottom=(WIDTH // 2, HEIGHT - 16))
    draw_panel(controls_rect.inflate(28, 8), alpha=140, border_alpha=60, radius=13)
    screen.blit(controls, controls_rect)

    if bacterium.notice_timer > 0:
        alpha = int(255 * min(1.0, bacterium.notice_timer / 0.4))
        rise = (1.5 - bacterium.notice_timer) * 12
        blit_text(
            MEDIUM_FONT,
            bacterium.notice,
            YELLOW,
            (WIDTH // 2, HEIGHT - 60 - rise),
            anchor="midbottom",
            alpha=alpha,
        )


def draw_padlock(center):
    x, y = center
    pygame.draw.arc(screen, GRAY, (x - 6, y - 12, 12, 14), 0, math.pi, 2)
    pygame.draw.line(screen, GRAY, (x - 6, y - 5), (x - 6, y - 2), 2)
    pygame.draw.line(screen, GRAY, (x + 5, y - 5), (x + 5, y - 2), 2)
    body = pygame.Rect(x - 9, y - 3, 18, 14)
    pygame.draw.rect(screen, GRAY, body, border_radius=3)
    pygame.draw.circle(screen, PANEL, (x, y + 3), 2)


def draw_locked_character_button(rect, character, progress, pending):
    price = SKIN_PRICES[character]
    coins = progress["coins"]
    affordable = price is not None and coins >= price
    mouse_over = rect.collidepoint(pygame.mouse.get_pos())
    border = YELLOW if pending else (GRAY if not affordable else PANEL_BORDER)
    draw_panel(
        rect,
        alpha=190 if mouse_over else 150,
        border=border,
        border_alpha=220 if pending else 70,
        radius=10,
    )

    preview = Bacterium(character)
    preview.gv_level = 65.0
    silhouette = pygame.Surface((70, 60), pygame.SRCALPHA)
    preview.x, preview.y = 35, 30
    preview.draw(silhouette, tilt=False, glow=False, trail=False)
    silhouette.fill((10, 30, 45, 255), special_flags=pygame.BLEND_RGBA_MULT)
    screen.blit(silhouette, silhouette.get_rect(center=(rect.x + 28, rect.centery)))

    blit_text(SMALL_FONT, character, GRAY, (rect.x + 56, rect.y + 5), shadow=False, alpha=190)
    blit_text(
        TINY_FONT,
        SKIN_PERKS[character]["short"],
        GVPC_CORE,
        (rect.x + 56, rect.bottom - 6),
        anchor="bottomleft",
        shadow=False,
        alpha=150,
    )

    if pending:
        label, color = f"buy? {price}", YELLOW
    elif price is None:
        label, color = locked_skin_badge(character, progress), GRAY
    else:
        label, color = str(price), YELLOW if affordable else GRAY
    icon_center = (rect.right - 16, rect.y + 14)
    if affordable:
        draw_coin_icon(icon_center, 8)
    else:
        draw_padlock((icon_center[0], icon_center[1] + 1))
    blit_text(
        SMALL_FONT,
        label,
        color,
        (rect.right - 30, rect.y + 5),
        anchor="topright",
        shadow=False,
        alpha=255 if (affordable or pending) else 150,
    )


def draw_character_button(rect, character, selected, progress):
    mouse_over = rect.collidepoint(pygame.mouse.get_pos())
    if selected:
        draw_panel(rect, alpha=215, border=YELLOW, border_alpha=255, radius=10)
    else:
        draw_panel(rect, alpha=200 if mouse_over else 170, border_alpha=180 if mouse_over else 90, radius=10)

    preview = Bacterium(character)
    if character == "BioBrick":
        preview.biobrick_tier = progress.get("biobrick_tier", 0)
    preview.x = rect.x + 28
    preview.y = rect.centery + (math.sin(now() * 3) * 2 if selected else 0)
    preview.gv_level = 65.0
    preview.draw(screen, tilt=False, trail=False)

    blit_text(
        SMALL_FONT,
        character,
        YELLOW if selected else WHITE,
        (rect.x + 56, rect.y + 5),
        shadow=selected,
    )
    blit_text(
        TINY_FONT,
        skin_short_text(character, progress),
        GVPC_CORE,
        (rect.x + 56, rect.bottom - 6),
        anchor="bottomleft",
        shadow=False,
        alpha=230 if selected else 190,
    )
    if character == "BioBrick":
        tier = progress.get("biobrick_tier", 0)
        blit_text(
            TINY_FONT,
            BIOBRICK_TIER_NAMES[tier].upper(),
            BIOBRICK_TIER_COLORS[tier],
            (rect.right - 12, rect.y + 7),
            anchor="topright",
            shadow=True,
        )
    elif selected:
        blit_text(TINY_FONT, "SELECTED", YELLOW, (rect.right - 12, rect.y + 7), anchor="topright", shadow=False)


def draw_section_header(rect, title, detail, is_open):
    mouse_over = rect.collidepoint(pygame.mouse.get_pos())
    draw_panel(
        rect,
        alpha=210 if mouse_over else 175,
        border=YELLOW if is_open else PANEL_BORDER,
        border_alpha=200 if (mouse_over or is_open) else 90,
        radius=10,
    )
    cx, cy = rect.x + 20, rect.centery
    if is_open:
        arrow = [(cx - 6, cy - 3), (cx + 6, cy - 3), (cx, cy + 4)]
    else:
        arrow = [(cx - 3, cy - 6), (cx - 3, cy + 6), (cx + 4, cy)]
    pygame.draw.polygon(screen, YELLOW if is_open else PANEL_BORDER, arrow)
    blit_text(SMALL_FONT, title, WHITE, (rect.x + 36, cy), anchor="midleft", shadow=False)
    blit_text(SMALL_FONT, detail, GVPC_CORE, (rect.right - 14, cy), anchor="midright", shadow=False, alpha=220)


def draw_upgrade_button(rect, kind, level, coins, pending):
    price = upgrade_price(level)
    affordable = price is not None and coins >= price
    mouse_over = rect.collidepoint(pygame.mouse.get_pos())
    color = module_color(kind)
    draw_panel(
        rect,
        alpha=205 if mouse_over else 175,
        border=YELLOW if pending else color,
        border_alpha=220 if pending else 90,
        radius=10,
    )

    icon = (rect.x + 20, rect.centery)
    if kind == "gfp":
        draw_gfp_barrel(screen, icon, 9, now())
        effect = f"lamp {MODULE_BASE_DURATION['gfp'] + level * GFP_BONUS_SECONDS:.0f}s"
    elif kind == "granzyme":
        draw_granzyme(screen, icon, 10, now() * 1.5)
        effect = f"kills {MODULE_BASE_DURATION['granzyme'] + level * GRANZYME_BONUS_SECONDS:.0f}s"
    elif kind == "ampicillin":
        draw_ampicillin(screen, icon, 9, -math.pi / 2)
        shots = AMPICILLIN_BASE_SHOTS + level * AMPICILLIN_BONUS_SHOTS_PER_LEVEL
        effect = f"{shots} shots" + (" · homing" if level >= UPGRADE_MAX_LEVEL else "")
    else:
        draw_antibody(screen, icon, 10, -math.pi / 2)
        effect = f"pull {int(COIN_MAGNET_RADIUS + level * ANTIBODY_BONUS_RADIUS)}px"

    blit_text(SMALL_FONT, MODULE_SHORT[kind], color, (rect.x + 38, rect.y + 3), shadow=False)
    blit_text(SMALL_FONT, effect, WHITE, (rect.x + 38, rect.bottom - 4), anchor="bottomleft", shadow=False, alpha=200)

    for step in range(UPGRADE_MAX_LEVEL):
        pip = pygame.Rect(rect.right - 8 - (UPGRADE_MAX_LEVEL - step) * 9, rect.y + 8, 6, 8)
        pygame.draw.rect(screen, color if step < level else (30, 58, 74), pip, border_radius=1)

    if price is None:
        label, label_color = "MAX", color
    elif pending:
        label, label_color = f"buy? {price}", YELLOW
    else:
        label, label_color = f"{price} coins", YELLOW if affordable else GRAY
    blit_text(
        SMALL_FONT,
        label,
        label_color,
        (rect.right - 12, rect.bottom - 4),
        anchor="bottomright",
        shadow=False,
        alpha=255 if (affordable or price is None or pending) else 140,
    )


def draw_promo_field(rect, text, focused, blink):
    draw_panel(
        rect,
        alpha=215 if focused else 175,
        border=YELLOW if focused else PANEL_BORDER,
        border_alpha=230 if focused else 80,
        radius=10,
    )
    blit_text(SMALL_FONT, "PROMO CODE", PANEL_BORDER, (rect.centerx, rect.y - 20), anchor="midtop", shadow=False)
    if text:
        shown = text + ("_" if focused and blink else "")
        blit_text(FONT, shown, WHITE, (rect.x + 14, rect.centery), anchor="midleft", shadow=False)
    else:
        blit_text(
            SMALL_FONT,
            "click, type, ENTER" if not focused else "type a code" + ("_" if blink else ""),
            GRAY,
            (rect.x + 14, rect.centery),
            anchor="midleft",
            shadow=False,
            alpha=150,
        )


def draw_banner_text(text, color, y=138, alpha=255):
    surface = FONT.render(text, True, color)
    rect = surface.get_rect(midtop=(WIDTH // 2, y))
    banner = pygame.Surface(rect.inflate(36, 16).size, pygame.SRCALPHA)
    pygame.draw.rect(banner, (*PANEL, 215), banner.get_rect(), border_radius=14)
    pygame.draw.rect(banner, (*color, 220), banner.get_rect(), 2, border_radius=14)
    banner.set_alpha(alpha)
    screen.blit(banner, banner.get_rect(center=rect.center))
    surface.set_alpha(alpha)
    screen.blit(surface, rect)


def draw_missions_panel(rect, missions):
    draw_panel(rect, alpha=175, border_alpha=80, radius=10)
    blit_text(SMALL_FONT, "MISSIONS", PANEL_BORDER, (rect.centerx, rect.y - 20), anchor="midtop", shadow=False)
    for index, mission in enumerate(missions[:ACTIVE_MISSIONS]):
        row_y = rect.y + 6 + index * 18
        blit_text(SMALL_FONT, mission["text"], WHITE, (rect.x + 10, row_y), shadow=False, alpha=215)
        blit_text(
            SMALL_FONT,
            f"+{mission['reward']}",
            YELLOW,
            (rect.right - 10, row_y),
            anchor="topright",
            shadow=False,
        )


def draw_run_missions_panel(rect, missions, run_stats, score):
    """Same three missions as the menu, now with a live progress bar each. Compact HUD version."""
    draw_panel(rect, alpha=160, border_alpha=70, radius=10)
    blit_text(TINY_FONT, "MISSIONS", PANEL_BORDER, (rect.x + 10, rect.y + 7), shadow=False)

    active = missions[:ACTIVE_MISSIONS]
    row_h = (rect.height - 22) / max(1, len(active))
    for index, mission in enumerate(active):
        row_y = rect.y + 22 + index * row_h
        # The run's live score isn't in run_stats until the run ends.
        raw_progress = score if mission["kind"] == "score" else run_stats.get(mission["kind"], 0)
        current = min(raw_progress, mission["target"])
        fraction = current / mission["target"] if mission["target"] else 1.0
        done = fraction >= 1.0

        blit_text(
            TINY_FONT, mission["text"], GREEN if done else WHITE, (rect.x + 10, row_y), shadow=False, alpha=225
        )
        blit_text(
            TINY_FONT,
            f"+{mission['reward']}",
            GREEN if done else YELLOW,
            (rect.right - 10, row_y),
            anchor="topright",
            shadow=False,
        )

        bar = pygame.Rect(rect.x + 10, int(row_y + 13), rect.width - 56, 4)
        pygame.draw.rect(screen, (4, 16, 28), bar, border_radius=2)
        fill_width = int(bar.width * fraction)
        if fill_width > 0:
            pygame.draw.rect(
                screen, GREEN if done else YELLOW, (bar.x, bar.y, fill_width, bar.height), border_radius=2
            )
        blit_text(
            GAUGE_FONT,
            f"{current}/{mission['target']}",
            GREEN if done else GRAY,
            (bar.right + 6, bar.y - 2),
            shadow=False,
        )


def draw_pause_overlay():
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 10, 20, 150))
    screen.blit(overlay, (0, 0))
    card = pygame.Rect(WIDTH // 2 - 200, 230, 400, 150)
    draw_panel(card, alpha=225, border=PANEL_BORDER, border_alpha=200, radius=18)
    blit_text(BIG_FONT, "PAUSED", WHITE, (WIDTH // 2, 252), anchor="midtop")
    blit_text(FONT, "ESC / P: resume      E: menu", GRAY, (WIDTH // 2, 322), anchor="midtop", shadow=False)


def draw_tutorial_hint(remaining):
    text = TUTORIAL_STEPS[-1][1]
    for threshold, step_text in TUTORIAL_STEPS:
        if remaining <= threshold:
            text = step_text
    blit_text(MEDIUM_FONT, text, WHITE, (WIDTH // 2, 430), anchor="midtop")
    blit_text(
        SMALL_FONT,
        f"Tutorial — obstacles start in {remaining:.0f}s",
        PANEL_BORDER,
        (WIDTH // 2, 470),
        anchor="midtop",
        shadow=False,
    )


def draw_tutorial_progress(stage):
    blit_text(
        SMALL_FONT,
        f"Tutorial  ·  {stage}/{len(TUTORIAL_FEATURES)} explained",
        PANEL_BORDER,
        (WIDTH // 2, 128),
        anchor="midtop",
        shadow=False,
        alpha=200,
    )


def draw_tutorial_card(feature, watch, stage):
    t = now()
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 10, 20, 120))
    screen.blit(overlay, (0, 0))

    # Spotlight the thing that is being explained.
    watch.draw(screen)
    pulse = 0.5 + 0.5 * math.sin(t * 5)
    if isinstance(watch, Transducer):
        pygame.draw.rect(
            screen, YELLOW, (int(watch.x) - 10, 4, watch.width + 20, HEIGHT - 8), 3, border_radius=12
        )
    else:
        center = (int(watch.x), int(getattr(watch, "draw_y", watch.y)))
        pygame.draw.circle(screen, YELLOW, center, int(watch.radius + 14 + pulse * 5), 3)

    title, lines = TUTORIAL_CARDS[feature]
    card = pygame.Rect(WIDTH // 2 - 300, 170, 540, 128 + len(lines) * 24)
    draw_panel(card, alpha=235, border=YELLOW, border_alpha=220, radius=18)
    blit_text(
        SMALL_FONT, f"NEW  ·  {stage + 1}/{len(TUTORIAL_FEATURES)}", YELLOW, (card.x + 28, card.y + 16), shadow=False
    )
    blit_text(MEDIUM_FONT, title, WHITE, (card.x + 28, card.y + 36))

    icon_y = card.y + 50
    if feature == "gvpc":
        center = (card.right - 60, icon_y)
        draw_glow_blob(screen, center, 30, GVPC_COLOR, 90)
        draw_helix(screen, center, 34, 2.2, GVPC_COLOR, GVPC_CORE, t * 2)
    elif feature == "module":
        for index, kind in enumerate(MODULE_KINDS):
            draw_module_icon(kind, (card.right - 170 + index * 32, icon_y), 10)
    elif feature == "hazards":
        for x, kind in ((card.right - 90, "macrophage"), (card.right - 44, "ciliate")):
            cell = DriftingCell(x, icon_y, kind)
            cell.phase = 0.0
            cell.draw(screen)
    else:
        for index, (color, core) in enumerate(
            ((TRANSDUCER_COLOR, TRANSDUCER_CORE), (TRANSDUCER_PUSH_COLOR, TRANSDUCER_PUSH_CORE))
        ):
            beam = pygame.Rect(card.right - 96 + index * 40, icon_y - 26, 20, 52)
            pygame.draw.rect(screen, darken(color, 0.3), beam, border_radius=5)
            pygame.draw.rect(screen, lerp_color(color, core, pulse), beam.inflate(-8, -8), border_radius=3)

    for index, line in enumerate(lines):
        blit_text(SMALL_FONT, line, WHITE, (card.x + 28, card.y + 84 + index * 24), shadow=False, alpha=230)
    blit_text(
        SMALL_FONT,
        "SPACE / ENTER: continue",
        YELLOW,
        (card.centerx, card.bottom - 12),
        anchor="midbottom",
        shadow=False,
        alpha=int(160 + 95 * pulse),
    )


def draw_stats_page(progress, best_score, back_rect):
    draw_water_background()
    draw_vignette()
    blit_text(TITLE_FONT, "STATISTICS", WHITE, (WIDTH // 2, 24), anchor="midtop")

    stats = progress["stats"]
    favourite = max(stats["skin_runs"].items(), key=lambda item: item[1])[0] if stats["skin_runs"] else "—"
    average = stats["total_score"] / stats["runs"] if stats["runs"] else 0
    rows = [
        ("Runs played", str(stats["runs"])),
        ("Best score", str(max(best_score, stats["best_score"]))),
        ("Average score", f"{average:.1f}"),
        ("Coins collected", str(stats["coins_earned"])),
        ("Coins in the bank", str(progress["coins"])),
        ("Cells killed with Granzyme", str(stats["cells_killed"])),
        ("GvpC bound", str(stats["gvpc"])),
        ("SpyCatchers bound", str(stats["modules"])),
        ("Missions completed", str(stats["missions_done"])),
        ("Bosses defeated", str(stats.get("bosses_defeated", 0))),
        ("Skins owned", f"{sum(owns(c, progress) for c in CHARACTERS)}/{len(CHARACTERS)}"),
        ("Favourite skin", favourite),
    ]
    card = pygame.Rect(WIDTH // 2 - 290, 120, 580, len(rows) * 28 + 24)
    draw_panel(card, alpha=215, border_alpha=140, radius=16)
    for index, (label, value) in enumerate(rows):
        row_y = card.y + 14 + index * 28
        blit_text(FONT, label, WHITE, (card.x + 24, row_y), shadow=False, alpha=210)
        blit_text(FONT, value, YELLOW, (card.right - 24, row_y), anchor="topright", shadow=False)

    mouse_over = back_rect.collidepoint(pygame.mouse.get_pos())
    draw_panel(back_rect, alpha=210 if mouse_over else 180, border=PANEL_BORDER, border_alpha=180, radius=12)
    blit_text(FONT, "BACK", WHITE, back_rect.center, anchor="center", shadow=False)


def menu_layout(open_section):
    """Only one of the two foldable sections is open at a time, so both fit."""
    grant_rect = pygame.Rect(WIDTH // 2 - 280, 558, 560, 38)
    rects = {
        "skins_header": pygame.Rect(WIDTH // 2 - 240, 96, 480, 32),
        "characters": [],
        "upgrades": {},
        "start": pygame.Rect(WIDTH // 2 - 150, 452, 300, 56),
        "promo": pygame.Rect(618, 460, 232, 40),
        "missions": pygame.Rect(50, 460, 232, 62),
        "stats": pygame.Rect(15, 54, 170, 30),
        "grant": grant_rect,
        "grant_prev": pygame.Rect(grant_rect.x + 196, grant_rect.centery - 13, 26, 26),
        "grant_next": pygame.Rect(grant_rect.x + 276, grant_rect.centery - 13, 26, 26),
        "grant_apply": pygame.Rect(grant_rect.right - 96, grant_rect.y + 2, 86, grant_rect.height - 4),
    }
    y = 134
    if open_section == "skins":
        rows = math.ceil(len(CHARACTERS) / 3)
        rects["characters"] = [
            pygame.Rect(51 + (index % 3) * 274, y + (index // 3) * 48, 262, 44)
            for index in range(len(CHARACTERS))
        ]
        y += rows * 48 + 4
    rects["upgrades_header"] = pygame.Rect(WIDTH // 2 - 240, y, 480, 34)
    y += 42
    if open_section == "upgrades":
        # A 2-column grid scales cleanly whether there are 3 modules or more.
        columns = 2
        col_gap, row_gap, button_width = 266, 54, 250
        start_x = (WIDTH - (col_gap * (columns - 1) + button_width)) // 2
        rects["upgrades"] = {
            kind: pygame.Rect(
                start_x + (index % columns) * col_gap,
                y + (index // columns) * row_gap,
                button_width,
                46,
            )
            for index, kind in enumerate(MODULE_KINDS)
        }
    return rects


def draw_grant_panel(rect, coins, stake, left_arrow_rect, right_arrow_rect, apply_rect):
    """The grant-application minigame: stake coins, maybe get funded."""
    mouse_over = rect.collidepoint(pygame.mouse.get_pos())
    draw_panel(rect, alpha=190 if mouse_over else 160, border_alpha=140 if mouse_over else 80, radius=12)

    blit_text(SMALL_FONT, "Grant application", WHITE, (rect.x + 14, rect.centery), anchor="midleft", shadow=False)

    blit_text(
        FONT,
        str(stake),
        YELLOW,
        ((left_arrow_rect.right + right_arrow_rect.x) // 2, rect.centery),
        anchor="center",
    )
    for arrow_rect, direction in ((left_arrow_rect, -1), (right_arrow_rect, 1)):
        hovered = arrow_rect.collidepoint(pygame.mouse.get_pos())
        color = YELLOW if hovered else PANEL_BORDER
        cx, cy = arrow_rect.center
        if direction < 0:
            points = [(cx + 5, cy - 8), (cx + 5, cy + 8), (cx - 6, cy)]
        else:
            points = [(cx - 5, cy - 8), (cx - 5, cy + 8), (cx + 6, cy)]
        pygame.draw.polygon(screen, color, points)

    blit_text(
        TINY_FONT,
        f"{int(GRANT_SUCCESS_CHANCE * 100)}% chance · {GRANT_PAYOUT_MULTIPLIER:.0f}x payout",
        GVPC_CORE,
        (right_arrow_rect.right + 10, rect.centery),
        anchor="midleft",
        shadow=False,
    )

    affordable = coins >= stake
    apply_hover = apply_rect.collidepoint(pygame.mouse.get_pos())
    pygame.draw.rect(screen, darken(ORANGE, 0.4), apply_rect.move(0, 2), border_radius=8)
    pygame.draw.rect(
        screen,
        lighten(ORANGE, 0.15) if (apply_hover and affordable) else ORANGE if affordable else (90, 90, 90),
        apply_rect,
        border_radius=8,
    )
    blit_text(
        SMALL_FONT,
        "APPLY",
        (60, 35, 5) if affordable else (140, 140, 140),
        apply_rect.center,
        anchor="center",
        shadow=False,
    )


def draw_menu(menu, rects):
    t = now()
    draw_water_background()
    draw_vignette()

    title_y = 10 + math.sin(t * 1.5) * 4
    blit_text(TITLE_FONT, "GV FLOAT", (140, 220, 245), (WIDTH // 2 + 3, title_y + 3), anchor="midtop", shadow=False, alpha=90)
    blit_text(TITLE_FONT, "GV FLOAT", WHITE, (WIDTH // 2, title_y), anchor="midtop")

    coin_panel = pygame.Rect(15, 12, 170, 36)
    draw_coin_counter(menu["coins"], coin_panel)

    stats_rect = rects["stats"]
    mouse_over_stats = stats_rect.collidepoint(pygame.mouse.get_pos())
    draw_panel(stats_rect, alpha=200 if mouse_over_stats else 165, border_alpha=140 if mouse_over_stats else 70, radius=10)
    blit_text(SMALL_FONT, "STATISTICS", WHITE, stats_rect.center, anchor="center", shadow=False)

    draw_missions_panel(rects["missions"], menu["progress"]["missions"])

    owned_count = sum(owns(c, menu["progress"]) for c in CHARACTERS)
    draw_section_header(
        rects["skins_header"],
        f"SKINS   {owned_count}/{len(CHARACTERS)}",
        f"{menu['character']}  ·  {skin_short_text(menu['character'], menu['progress'])}",
        menu["section"] == "skins",
    )
    for character, rect in zip(CHARACTERS, rects["characters"]):
        if owns(character, menu["progress"]):
            draw_character_button(rect, character, character == menu["character"], menu["progress"])
        else:
            draw_locked_character_button(
                rect, character, menu["progress"], menu["pending"] == character
            )

    upgrade_levels = sum(menu["progress"][key] for key in UPGRADE_KEYS)
    draw_section_header(
        rects["upgrades_header"],
        "SPYCATCHER UPGRADES",
        f"{upgrade_levels}/{len(UPGRADE_KEYS) * UPGRADE_MAX_LEVEL} levels",
        menu["section"] == "upgrades",
    )
    for kind in rects["upgrades"]:
        draw_upgrade_button(
            rects["upgrades"][kind],
            kind,
            menu["progress"][f"{kind}_level"],
            menu["coins"],
            menu["pending"] == f"upgrade:{kind}",
        )

    draw_promo_field(
        rects["promo"], menu["code_input"], menu["code_focus"], int(now() * 2) % 2 == 0
    )

    start_rect = rects["start"]
    mouse_over = start_rect.collidepoint(pygame.mouse.get_pos())
    pulse = 0.5 + 0.5 * math.sin(t * 3)
    base_yellow = lerp_color(YELLOW, lighten(YELLOW, 0.2), pulse)
    top_color = lighten(YELLOW, 0.35) if mouse_over else base_yellow
    pygame.draw.rect(screen, darken(ORANGE, 0.35), start_rect.move(0, 5), border_radius=14)
    pygame.draw.rect(screen, ORANGE, start_rect, border_radius=14)
    pygame.draw.rect(
        screen,
        top_color,
        (start_rect.x, start_rect.y, start_rect.width, start_rect.height - 10),
        border_radius=14,
    )
    pygame.draw.rect(
        screen,
        lighten(top_color, 0.5),
        (start_rect.x + 16, start_rect.y + 6, start_rect.width - 32, 5),
        border_radius=3,
    )
    start_text = MEDIUM_FONT.render("START RUN", True, (60, 35, 5))
    screen.blit(start_text, start_text.get_rect(center=(start_rect.centerx, start_rect.centery - 3)))

    if menu["notice_timer"] > 0:
        blit_text(
            SMALL_FONT,
            menu["notice"],
            YELLOW,
            (WIDTH // 2, start_rect.bottom + 4),
            anchor="midtop",
            shadow=False,
            alpha=int(255 * min(1.0, menu["notice_timer"] / 0.4)),
        )
    else:
        blit_text(SMALL_FONT, "or press ENTER", GRAY, (WIDTH // 2, start_rect.bottom + 4), anchor="midtop", shadow=False)

    draw_grant_panel(
        rects["grant"],
        menu["progress"]["coins"],
        menu["grant_stake"],
        rects["grant_prev"],
        rects["grant_next"],
        rects["grant_apply"],
    )


def make_next_object(
    x, gap_size, transducers_active, spawn_state, biome=0, force_transducer=False
):
    normals = spawn_state["normal_since_transducer"]
    transducer_allowed = (
        transducers_active
        and normals >= MIN_NORMALS_BETWEEN_TRANSDUCERS
    )
    transducer_due = normals >= MAX_NORMALS_BETWEEN_TRANSDUCERS
    spawn_transducer = force_transducer or (
        transducer_allowed
        and (transducer_due or random.random() < TRANSDUCER_SPAWN_CHANCE)
    )

    if spawn_transducer:
        # The tutorial shows the classic collapse field first.
        kind = "collapse" if force_transducer else random.choice(TRANSDUCER_KINDS)
        collapse_number = max(1, spawn_state["collapse_count"])
        if kind == "collapse":
            spawn_state["collapse_count"] += 1
            collapse_number = spawn_state["collapse_count"]
        spawn_state["normal_since_transducer"] = 0
        return Transducer(x, kind, collapse_number)

    spawn_state["normal_since_transducer"] += 1
    return Obstacle(x, gap_size, BIOMES[biome]["pillar"])


def spawn_bonus(bonuses, x, bacterium, allowed=("coins", "module", "gvpc"), force=None):
    """One bonus per gap: a coin arc, a GvpC helix or a SpyCatcher module.

    Returns the bonus that was added last, so the tutorial can keep an eye on it.
    """
    kinds = []
    weights = []
    for kind, weight in (("coins", COIN_WEIGHT), ("module", MODULE_WEIGHT), ("gvpc", GVPC_WEIGHT)):
        if kind in allowed and (kind != "gvpc" or bacterium.shell < MAX_SHELL_LAYERS):
            kinds.append(kind)
            weights.append(weight)

    kind = force or random.choices(kinds, weights)[0]
    if kind == "coins":
        count = random.randint(3, 6)
        base_y = random.randint(150, HEIGHT - 150)
        curve = random.choice((-1, 1))
        for index in range(count):
            offset = index - (count - 1) / 2
            y = clamp(base_y + curve * offset * offset * 7, 100, HEIGHT - 100)
            bonuses.append(Coin(x + index * 30, y))
    elif kind == "gvpc":
        bonuses.append(GvpC(x, random.randint(110, HEIGHT - 110)))
    else:
        bonuses.append(
            SpyCatcherModule(x, random.randint(110, HEIGHT - 110), random.choice(MODULE_KINDS))
        )
    return bonuses[-1]


def new_tutorial(progress):
    if progress["tutorial_done"]:
        return None
    return {"stage": progress["tutorial_stage"], "forcing": None, "watch": None, "card": None}


def tutorial_allows(tutorial, feature):
    """Outside the tutorial everything is allowed; inside, only what was explained."""
    if tutorial is None:
        return True
    names = [name for name, _ in TUTORIAL_FEATURES]
    return names.index(feature) < tutorial["stage"]


def allowed_bonus_kinds(tutorial):
    return ("coins",) + tuple(kind for kind in ("module", "gvpc") if tutorial_allows(tutorial, kind))


def tutorial_watch_visible(watch):
    if isinstance(watch, Transducer):
        return watch.x + watch.width < WIDTH - 10
    return watch.x + watch.radius < WIDTH - 40


def boss_hits_needed(stage):
    return min(BOSS_MAX_HITS, BOSS_BASE_HITS + stage - 1)


def start_boss(next_score):
    """Spins up a fresh macrophage encounter. `next_score` is the milestone that triggered it."""
    stage = max(1, next_score // BOSS_SCORE_INTERVAL)
    return {
        "stage": stage,
        "phase": "enter",
        "timer": BOSS_ENTER_SECONDS,
        "clock": 0.0,
        "x": WIDTH + BOSS_RADIUS * 2,
        "y": HEIGHT / 2,
        "hits": 0,
        "hits_needed": boss_hits_needed(stage),
        "weakpoint": BossWeakpoint(),
        "weak_timer": 1.5,
        "weak_angle": 0.0,
        "ammo_timer": BOSS_AMMO_REGEN_SECONDS,
        "attack_timer": 2.0,
        "tentacles": [],
        "queued_tentacles": [],
        "spit_flash": 0.0,
        "hurt_flash": 0.0,
    }


def boss_targets(boss):
    """Things a shot may hit besides cells: the weak spot, while it is exposed."""
    if boss is not None and boss["weakpoint"].alive():
        return [boss["weakpoint"]]
    return []


def boss_absorbs(boss, shot):
    """The body soaks up any shot that isn't a weak-spot hit."""
    if boss is None or boss["phase"] == "defeated":
        return False
    return math.hypot(shot.x - boss["x"], shot.y - boss["y"]) < BOSS_RADIUS + shot.radius


def tentacle_segment(tentacle, length):
    dx, dy = tentacle["dir"]
    root = tentacle["root"]
    return root, (root[0] + dx * length, root[1] + dy * length)


def tentacle_length(tentacle):
    """Current reach of a striking tentacle (0 while warning)."""
    if tentacle["state"] == "strike":
        return BOSS_TENTACLE_LENGTH * clamp(tentacle["t"] / BOSS_TENTACLE_STRIKE_SECONDS, 0.0, 1.0)
    if tentacle["state"] == "hold":
        return BOSS_TENTACLE_LENGTH
    if tentacle["state"] == "retract":
        return BOSS_TENTACLE_LENGTH * (1 - clamp(tentacle["t"] / BOSS_TENTACLE_RETRACT_SECONDS, 0.0, 1.0))
    return 0.0


def boss_hits_player(boss, bacterium):
    """True while any tentacle is out and touching the bacterium."""
    if boss is None:
        return False
    rect = bacterium.get_rect().inflate(BOSS_TENTACLE_HIT_WIDTH, BOSS_TENTACLE_HIT_WIDTH)
    for tentacle in boss["tentacles"]:
        length = tentacle_length(tentacle)
        if length <= 0:
            continue
        (rx, ry), (ex, ey) = tentacle_segment(tentacle, length)
        steps = max(2, int(length // 10))
        for step in range(steps + 1):
            fraction = step / steps
            if rect.collidepoint(rx + (ex - rx) * fraction, ry + (ey - ry) * fraction):
                return True
    return False


def boss_launch_tentacle(boss, bacterium):
    stage = boss["stage"]
    warn = max(BOSS_TENTACLE_MIN_WARN_SECONDS, BOSS_TENTACLE_WARN_SECONDS - (stage - 1) * 0.1)
    root = (boss["x"] - BOSS_RADIUS * 0.55, boss["y"] + random.uniform(-45, 45))
    boss["tentacles"].append({
        "state": "warn",
        "t": 0.0,
        "warn": warn,
        "root": root,
        "target": (bacterium.x, bacterium.y),
        "dir": (-1.0, 0.0),
    })


def boss_spit_cells(boss, hazards):
    count = 2 + (1 if boss["stage"] >= 3 else 0)
    for _ in range(count):
        hazards.append(
            DriftingCell(
                boss["x"] - BOSS_RADIUS + random.uniform(-10, 20),
                clamp(boss["y"] + random.uniform(-90, 90), 110, HEIGHT - 110),
                random.choice(HAZARD_KINDS),
            )
        )
    boss["spit_flash"] = 0.45


def update_boss(boss, dt, hazards, bacterium):
    """Advances the macrophage fight by one frame; may add cells to `hazards`.

    Returns "defeated" the one frame the fight is won, else None.
    """
    boss["clock"] += dt
    boss["timer"] -= dt
    boss["spit_flash"] = max(0.0, boss["spit_flash"] - dt)
    boss["hurt_flash"] = max(0.0, boss["hurt_flash"] - dt)
    boss["y"] = HEIGHT / 2 + math.sin(boss["clock"] * 0.8) * 35

    # Ampicillin is part of the fight: it can't run dry for good.
    bacterium.infinite_ampicillin = True
    if bacterium.module != "ampicillin":
        bacterium.module = "ampicillin"
        bacterium.ammo = 0
    boss["ammo_timer"] -= dt
    if boss["ammo_timer"] <= 0:
        boss["ammo_timer"] = BOSS_AMMO_REGEN_SECONDS
        bacterium.ammo = min(bacterium.ampicillin_capacity, bacterium.ammo + 1)

    weakpoint = boss["weakpoint"]
    angle = boss["weak_angle"] + math.sin(boss["clock"] * 1.7) * 0.08
    weakpoint.x = boss["x"] - math.cos(angle) * BOSS_RADIUS * 1.0
    weakpoint.y = boss["y"] + math.sin(angle) * BOSS_RADIUS * 1.0

    if boss["phase"] == "enter":
        progress = 1 - clamp(boss["timer"] / BOSS_ENTER_SECONDS, 0.0, 1.0)
        start_x = WIDTH + BOSS_RADIUS * 2
        boss["x"] = start_x + (BOSS_X - start_x) * progress
        if boss["timer"] <= 0:
            boss["phase"] = "fight"

    elif boss["phase"] == "fight":
        boss["x"] = BOSS_X

        if weakpoint.hit:
            boss["hits"] += 1
            boss["hurt_flash"] = 0.35
            weakpoint.exposed = False
            weakpoint.hit = False
            boss["weak_timer"] = random.uniform(*BOSS_WEAKPOINT_HIDDEN_SECONDS) * 0.6
            bacterium.set_notice("Direct hit!")
            if boss["hits"] >= boss["hits_needed"]:
                boss["phase"] = "defeated"
                boss["timer"] = BOSS_DEFEATED_SECONDS
                boss["tentacles"] = []
                boss["queued_tentacles"] = []
                for hazard in hazards:
                    hazard.kill()
                return None
        else:
            boss["weak_timer"] -= dt
            if boss["weak_timer"] <= 0:
                if weakpoint.exposed:
                    weakpoint.exposed = False
                    boss["weak_timer"] = random.uniform(*BOSS_WEAKPOINT_HIDDEN_SECONDS)
                else:
                    weakpoint.exposed = True
                    boss["weak_angle"] = random.uniform(-0.85, 0.85)
                    boss["weak_timer"] = BOSS_WEAKPOINT_SECONDS

        boss["attack_timer"] -= dt
        if boss["attack_timer"] <= 0:
            low, high = BOSS_ATTACK_INTERVAL
            boss["attack_timer"] = random.uniform(low, high) * max(0.65, 1.0 - (boss["stage"] - 1) * 0.06)
            if random.random() < 0.6:
                volleys = 1 + (1 if boss["stage"] >= 3 else 0) + (1 if boss["stage"] >= 5 else 0)
                for index in range(volleys):
                    boss["queued_tentacles"].append(index * 0.45)
            else:
                boss_spit_cells(boss, hazards)

        remaining = []
        for delay in boss["queued_tentacles"]:
            delay -= dt
            if delay <= 0:
                boss_launch_tentacle(boss, bacterium)
            else:
                remaining.append(delay)
        boss["queued_tentacles"] = remaining

    elif boss["phase"] == "defeated":
        weakpoint.exposed = False
        if boss["timer"] <= 0:
            return "defeated"

    live = []
    for tentacle in boss["tentacles"]:
        tentacle["t"] += dt
        if tentacle["state"] == "warn":
            lock_at = tentacle["warn"] * (1 - BOSS_TENTACLE_LOCK_FRACTION)
            if tentacle["t"] < lock_at:
                tentacle["target"] = (bacterium.x, bacterium.y)
            if tentacle["t"] >= tentacle["warn"]:
                tx, ty = tentacle["target"]
                dx, dy = tx - tentacle["root"][0], ty - tentacle["root"][1]
                norm = math.hypot(dx, dy) or 1.0
                tentacle["dir"] = (dx / norm, dy / norm)
                tentacle["state"], tentacle["t"] = "strike", 0.0
        elif tentacle["state"] == "strike" and tentacle["t"] >= BOSS_TENTACLE_STRIKE_SECONDS:
            tentacle["state"], tentacle["t"] = "hold", 0.0
        elif tentacle["state"] == "hold" and tentacle["t"] >= BOSS_TENTACLE_HOLD_SECONDS:
            tentacle["state"], tentacle["t"] = "retract", 0.0
        elif tentacle["state"] == "retract" and tentacle["t"] >= BOSS_TENTACLE_RETRACT_SECONDS:
            continue
        live.append(tentacle)
    boss["tentacles"] = live
    return None


def draw_boss_body(surface, boss, t):
    x, y = boss["x"], boss["y"]
    center = (int(x), int(y))
    defeated = boss["phase"] == "defeated"
    if defeated:
        progress = 1 - clamp(boss["timer"] / BOSS_DEFEATED_SECONDS, 0.0, 1.0)
        center = (int(x + math.sin(t * 45) * 7 * (1 - progress)), center[1])
    draw_glow_blob(surface, center, int(BOSS_RADIUS * 1.5), (255, 120, 90), 55)

    color = BOSS_COLOR
    if boss["hurt_flash"] > 0:
        color = lerp_color(BOSS_COLOR, WHITE, boss["hurt_flash"] / 0.35)
    points = []
    for step in range(48):
        angle = step / 48 * math.tau
        reach = BOSS_RADIUS + math.sin(angle * 5 + t * 1.8) * 6 + math.sin(angle * 3 - t * 1.1) * 5
        if boss["spit_flash"] > 0 and math.cos(angle) < -0.6:
            reach += 10 * (boss["spit_flash"] / 0.45)
        points.append((center[0] + math.cos(angle) * reach, center[1] + math.sin(angle) * reach))
    pygame.draw.polygon(surface, darken(color, 0.35), points)
    pygame.draw.circle(surface, color, (center[0] - 10, center[1] - 8), int(BOSS_RADIUS * 0.82))
    pygame.draw.polygon(surface, darken(color, 0.6), points, 3)
    for dx, dy, radius in ((-38, 18, 16), (14, -34, 13), (36, 30, 18), (-8, -6, 10), (60, -10, 12)):
        pygame.draw.circle(surface, darken(color, 0.5), (center[0] + dx, center[1] + dy), radius)
        pygame.draw.circle(surface, darken(color, 0.3), (center[0] + dx, center[1] + dy), radius, 2)
    pygame.draw.circle(surface, darken(color, 0.55), (center[0] - 20, center[1] + 4), 26)
    pygame.draw.circle(surface, darken(color, 0.25), (center[0] - 20, center[1] + 4), 26, 3)


def draw_tentacle(surface, tentacle, t):
    root = tentacle["root"]
    if tentacle["state"] == "warn":
        lock_at = tentacle["warn"] * (1 - BOSS_TENTACLE_LOCK_FRACTION)
        locked = tentacle["t"] >= lock_at
        tx, ty = tentacle["target"]
        dx, dy = tx - root[0], ty - root[1]
        norm = math.hypot(dx, dy) or 1.0
        ux, uy = dx / norm, dy / norm
        color = RED if locked else (255, 170, 130)
        if not locked or int(t * 14) % 2 == 0:
            for dash in range(0, int(norm) + 200, 26):
                a = (root[0] + ux * dash, root[1] + uy * dash)
                b = (root[0] + ux * (dash + 14), root[1] + uy * (dash + 14))
                pygame.draw.line(surface, color, a, b, 3 if locked else 2)
        pygame.draw.circle(surface, color, (int(tx), int(ty)), 26 if locked else 20, 2)
        return
    length = tentacle_length(tentacle)
    if length <= 0:
        return
    (rx, ry), (ex, ey) = tentacle_segment(tentacle, length)
    dx, dy = ex - rx, ey - ry
    norm = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / norm, dx / norm
    count = max(4, int(length // 22))
    previous = None
    for index in range(count + 1):
        fraction = index / count
        wobble = math.sin(fraction * 9 - t * 12) * 7 * (1 - fraction * 0.5)
        px = rx + dx * fraction + nx * wobble
        py = ry + dy * fraction + ny * wobble
        if previous is not None:
            width = int(22 - 12 * fraction)
            pygame.draw.line(surface, darken(BOSS_COLOR, 0.5), previous, (px, py), width + 4)
            pygame.draw.line(surface, BOSS_COLOR, previous, (px, py), width)
        previous = (px, py)
    pygame.draw.circle(surface, lighten(BOSS_COLOR, 0.3), (int(previous[0]), int(previous[1])), 8)


def draw_boss(boss, bacterium):
    """Giant macrophage, its weak spot and tentacles, plus the HP pips above the fight."""
    t = now()
    draw_boss_body(screen, boss, t)

    weakpoint = boss["weakpoint"]
    if weakpoint.alive():
        pulse = 0.5 + 0.5 * math.sin(t * 8)
        center = (int(weakpoint.x), int(weakpoint.y))
        draw_glow_blob(screen, center, weakpoint.radius * 3, BOSS_WEAK_COLOR, 110)
        pygame.draw.circle(screen, darken(BOSS_WEAK_COLOR, 0.45), center, weakpoint.radius)
        pygame.draw.circle(screen, lerp_color(BOSS_WEAK_COLOR, WHITE, pulse), center, weakpoint.radius - 5)
        pygame.draw.circle(screen, WHITE, center, weakpoint.radius, 2)
        blit_text(TINY_FONT, "SHOOT", WHITE, (center[0] - weakpoint.radius - 8, center[1]), anchor="midright")

    for tentacle in boss["tentacles"]:
        draw_tentacle(screen, tentacle, t)

    label = "GIANT MACROPHAGE" if boss["phase"] != "defeated" else "DEFEATED"
    blit_text(SMALL_FONT, label, RED, (WIDTH // 2, 134), anchor="midtop")

    pip_gap = 16
    start_x = WIDTH // 2 - (boss["hits_needed"] - 1) * pip_gap / 2
    for index in range(boss["hits_needed"]):
        remaining = index >= boss["hits"]
        spot = (int(start_x + index * pip_gap), 164)
        pygame.draw.circle(screen, BOSS_COLOR if remaining else (40, 24, 34), spot, 6)
        pygame.draw.circle(screen, WHITE, spot, 6, 1)


def reset_run(character, progress, tutorial=None, calm_start=False):
    bacterium = Bacterium(character)
    bacterium.apply_upgrades(progress)
    objects = []
    bonuses = []
    spawn_state = {
        "normal_since_transducer": 0,
        "collapse_count": 0,
        "since_special_prize": MIN_OBSTACLES_BETWEEN_SPECIAL_PRIZES,
    }
    # The tutorial pushes the first pillar far enough out for a calm start.
    x = WIDTH + (1100 if calm_start else 180)
    _, _, gap_size, spacing = difficulty_for_score(0)

    for _ in range(4):
        objects.append(
            make_next_object(
                x,
                gap_size,
                False,
                spawn_state,
            )
        )
        if random.random() < BONUS_SPAWN_CHANCE:
            spawn_bonus(bonuses, x + spacing // 2, bacterium, allowed_bonus_kinds(tutorial))
        x += spacing

    return bacterium, objects, bonuses, [], 0, spawn_state


def draw_game_over(score, new_highscore, mission_notice=""):
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 10, 20, 150))
    screen.blit(overlay, (0, 0))

    card = pygame.Rect(WIDTH // 2 - 270, 180, 540, 260)
    draw_panel(card, alpha=225, border=YELLOW if new_highscore else RED, border_alpha=200, radius=18)

    if new_highscore:
        blit_text(BIG_FONT, "NEW PERSONAL BEST!", YELLOW, (WIDTH // 2, 210), anchor="midtop")
    else:
        blit_text(BIG_FONT, "GV COLLAPSE!", RED, (WIDTH // 2, 210), anchor="midtop")
    blit_text(SMALL_FONT, "SCORE", PANEL_BORDER, (WIDTH // 2, 280), anchor="midtop", shadow=False)
    blit_text(BIG_FONT, str(score), WHITE, (WIDTH // 2, 296), anchor="midtop")
    blit_text(FONT, "R / ENTER: Retry      E: Menu", WHITE, (WIDTH // 2, 380), anchor="midtop", shadow=False)
    if mission_notice:
        blit_text(SMALL_FONT, mission_notice, YELLOW, (WIDTH // 2, 412), anchor="midtop", shadow=False)


def try_purchase(progress, item, price):
    if progress["coins"] < price:
        return f"Not enough coins: {price} needed"
    progress["coins"] -= price
    if item.startswith("upgrade:"):
        key = f"{item.split(':')[1]}_level"
        progress[key] += 1
        check_final_skin_unlock(progress)
        save_progress(progress)
        return f"{MODULE_LABELS[item.split(':')[1]]} upgraded"
    progress["owned"].append(item)
    check_final_skin_unlock(progress)
    save_progress(progress)
    return f"{item} bought"


def main():
    progress = load_progress()
    best_score = progress["stats"]["best_score"]
    pending_purchase = None
    code_input = ""
    code_focus = False
    menu_notice = ""
    menu_notice_timer = 0.0
    grant_stake_index = 0
    ensure_missions(progress)
    save_progress(progress)
    run_stats = dict(EMPTY_RUN_STATS)
    mission_notice = ""
    paused = False
    tutorial_timer = 0.0
    tutorial = None
    run_banner = ""
    run_banner_color = PANEL_BORDER
    run_banner_timer = 0.0
    biome_index = 0
    previous_biome = None
    biome_blend = 1.0
    biome_notice_timer = 0.0
    hazard_timer = random.uniform(*HAZARD_INTERVAL)
    ceiling_light = CeilingLight()
    ceiling_intensity = 1.0
    state = "menu"
    running = True
    selected_character = CHARACTERS[0]
    game_over = False
    new_highscore = False

    menu_section = None
    menu_rects = menu_layout(menu_section)
    stats_back_rect = pygame.Rect(WIDTH // 2 - 90, HEIGHT - 70, 180, 44)
    start_rect = menu_rects["start"]

    bacterium = None
    objects = []
    bonuses = []
    hazards = []
    projectiles = []
    score = 0
    spawn_state = None
    boss = None
    next_boss_score = BOSS_SCORE_INTERVAL

    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)
        frame_scale = dt * FPS

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif state == "menu" and event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:
                    clicked = None
                    code_focus = menu_rects["promo"].collidepoint(event.pos)
                    if menu_rects["stats"].collidepoint(event.pos):
                        state = "stats"
                        continue
                    if menu_rects["grant_prev"].collidepoint(event.pos):
                        grant_stake_index = (grant_stake_index - 1) % len(GRANT_STAKES)
                    elif menu_rects["grant_next"].collidepoint(event.pos):
                        grant_stake_index = (grant_stake_index + 1) % len(GRANT_STAKES)
                    elif menu_rects["grant_apply"].collidepoint(event.pos):
                        stake = GRANT_STAKES[grant_stake_index]
                        if progress["coins"] < stake:
                            menu_notice = f"Not enough coins: {stake} needed"
                            menu_notice_timer = 1.6
                        else:
                            progress["coins"] -= stake
                            if random.random() < GRANT_SUCCESS_CHANCE:
                                winnings = int(stake * GRANT_PAYOUT_MULTIPLIER)
                                progress["coins"] += winnings
                                menu_notice = f"Grant approved! +{winnings} coins"
                            else:
                                menu_notice = f"Application rejected. -{stake} coins"
                            menu_notice_timer = 2.2
                            save_progress(progress)
                    elif menu_rects["skins_header"].collidepoint(event.pos):
                        menu_section = None if menu_section == "skins" else "skins"
                        menu_rects = menu_layout(menu_section)
                    elif menu_rects["upgrades_header"].collidepoint(event.pos):
                        menu_section = None if menu_section == "upgrades" else "upgrades"
                        menu_rects = menu_layout(menu_section)
                    else:
                        for character, rect in zip(CHARACTERS, menu_rects["characters"]):
                            if rect.collidepoint(event.pos):
                                if owns(character, progress):
                                    selected_character = character
                                else:
                                    clicked = character
                                break
                        for kind, rect in menu_rects["upgrades"].items():
                            if rect.collidepoint(event.pos):
                                clicked = f"upgrade:{kind}"
                                break

                    if clicked:
                        if clicked.startswith("upgrade:"):
                            kind = clicked.split(":")[1]
                            price = upgrade_price(progress[f"{kind}_level"])
                        else:
                            price = SKIN_PRICES[clicked]
                        if price is None:
                            menu_notice = (
                                "Already fully upgraded"
                                if clicked.startswith("upgrade:")
                                else f"{clicked} {locked_skin_reason(clicked, progress)}"
                            )
                            menu_notice_timer = 1.6
                        elif pending_purchase == clicked:
                            menu_notice = try_purchase(progress, clicked, price)
                            menu_notice_timer = 1.8
                            pending_purchase = None
                        elif progress["coins"] < price:
                            menu_notice = f"Not enough coins: {price} needed"
                            menu_notice_timer = 1.6
                        else:
                            pending_purchase = clicked
                    else:
                        pending_purchase = None

                    if start_rect.collidepoint(event.pos):
                        tutorial = new_tutorial(progress)
                        tutorial_timer = TUTORIAL_SECONDS if tutorial and tutorial["stage"] == 0 else 0.0
                        bacterium, objects, bonuses, hazards, score, spawn_state = reset_run(
                            selected_character, progress, tutorial, tutorial_timer > 0
                        )
                        run_banner_timer = 0.0
                        run_stats = dict(EMPTY_RUN_STATS)
                        boss = None
                        next_boss_score = BOSS_SCORE_INTERVAL
                        projectiles = []
                        mission_notice = ""
                        paused = False
                        biome_index = 0
                        previous_biome = None
                        biome_blend = 1.0
                        game_over = False
                        new_highscore = False
                        state = "playing"

            elif state == "stats" and event.type in (pygame.MOUSEBUTTONDOWN, pygame.KEYDOWN):
                state = "menu"

            elif state == "playing" and tutorial and tutorial["card"] and not game_over:
                if (
                    event.type == pygame.KEYDOWN
                    and event.key in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_KP_ENTER)
                ) or (event.type == pygame.MOUSEBUTTONDOWN and event.button == 1):
                    tutorial["card"] = None
                    tutorial["watch"] = None
                    tutorial["stage"] += 1
                    progress["tutorial_stage"] = tutorial["stage"]
                    if tutorial["stage"] >= len(TUTORIAL_FEATURES):
                        progress["tutorial_done"] = True
                        tutorial = None
                        run_banner = "Tutorial complete. Good luck!"
                        run_banner_color = YELLOW
                        run_banner_timer = 3.5
                    save_progress(progress)

            elif (
                state == "playing"
                and not game_over
                and event.type == pygame.KEYDOWN
                and event.key in (pygame.K_ESCAPE, pygame.K_p)
            ):
                paused = not paused

            elif (
                state == "playing"
                and not game_over
                and not paused
                and event.type == pygame.KEYDOWN
                and event.key == pygame.K_SPACE
            ):
                shot = bacterium.fire_ampicillin()
                if shot is not None:
                    projectiles.append(shot)

            elif state == "playing" and paused and event.type == pygame.KEYDOWN:
                if event.key == pygame.K_e:
                    paused = False
                    state = "menu"

            elif state == "menu" and event.type == pygame.KEYDOWN:
                if code_focus:
                    if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                        menu_notice = redeem_code(progress, code_input)
                        menu_notice_timer = 2.2
                        code_input = ""
                    elif event.key == pygame.K_BACKSPACE:
                        code_input = code_input[:-1]
                    elif event.key == pygame.K_ESCAPE:
                        code_focus = False
                    elif len(code_input) < MAX_CODE_LENGTH and event.unicode.isalnum():
                        code_input += event.unicode
                elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    tutorial = new_tutorial(progress)
                    tutorial_timer = TUTORIAL_SECONDS if tutorial and tutorial["stage"] == 0 else 0.0
                    bacterium, objects, bonuses, hazards, score, spawn_state = reset_run(
                        selected_character, progress, tutorial, tutorial_timer > 0
                    )
                    run_banner_timer = 0.0
                    run_stats = dict(EMPTY_RUN_STATS)
                    boss = None
                    next_boss_score = BOSS_SCORE_INTERVAL
                    projectiles = []
                    mission_notice = ""
                    paused = False
                    biome_index = 0
                    previous_biome = None
                    biome_blend = 1.0
                    game_over = False
                    new_highscore = False
                    state = "playing"

            elif state == "playing" and game_over and event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_r, pygame.K_RETURN, pygame.K_KP_ENTER):
                    tutorial = new_tutorial(progress)
                    tutorial_timer = TUTORIAL_SECONDS if tutorial and tutorial["stage"] == 0 else 0.0
                    bacterium, objects, bonuses, hazards, score, spawn_state = reset_run(
                        selected_character, progress, tutorial, tutorial_timer > 0
                    )
                    run_banner_timer = 0.0
                    run_stats = dict(EMPTY_RUN_STATS)
                    boss = None
                    next_boss_score = BOSS_SCORE_INTERVAL
                    projectiles = []
                    mission_notice = ""
                    paused = False
                    biome_index = 0
                    previous_biome = None
                    biome_blend = 1.0
                    game_over = False
                    new_highscore = False
                elif event.key == pygame.K_e:
                    state = "menu"

        if state == "stats":
            draw_stats_page(progress, best_score, stats_back_rect)
            pygame.display.flip()
            continue

        if state == "menu":
            menu_notice_timer = max(0.0, menu_notice_timer - dt)
            draw_menu(
                {
                    "character": selected_character,
                    "progress": progress,
                    "coins": progress["coins"],
                    "best_score": best_score,
                    "pending": pending_purchase,
                    "code_input": code_input,
                    "code_focus": code_focus,
                    "notice": menu_notice,
                    "notice_timer": menu_notice_timer,
                    "section": menu_section,
                    "grant_stake": GRANT_STAKES[grant_stake_index],
                },
                menu_rects,
            )
            pygame.display.flip()
            continue

        level, speed, gap_size, spacing = difficulty_for_score(score)
        if tutorial:
            transducers_active = tutorial_allows(tutorial, "transducer")
        else:
            transducers_active = score >= TRANSDUCER_START_SCORE
        card_open = bool(tutorial and tutorial["card"])

        new_biome = biome_for_score(score)
        if new_biome != biome_index:
            previous_biome = biome_index
            biome_index = new_biome
            biome_blend = 0.0
            biome_notice_timer = 3.0
        if biome_blend < 1.0:
            biome_blend = min(1.0, biome_blend + dt / BIOME_FADE_SECONDS)
        if not card_open:
            biome_notice_timer = max(0.0, biome_notice_timer - dt)
            run_banner_timer = max(0.0, run_banner_timer - dt)

        if not game_over and not paused and not card_open:
            ceiling_intensity = ceiling_light.update(dt)

            if boss is None and not tutorial and score >= next_boss_score:
                boss = start_boss(next_boss_score)
                objects = []
                bonuses = []
                hazards = []
                bacterium.bind_module("ampicillin")
                bacterium.infinite_ampicillin = True
                run_banner = "GIANT MACROPHAGE! SPACE shoots Amp at its weak spots"
                run_banner_color = RED
                run_banner_timer = 3.5

            for obj in objects:
                obj.update(speed, frame_scale)
            for bonus in bonuses:
                bonus.update(speed, frame_scale, bacterium)

            if tutorial_timer > 0:
                tutorial_timer = max(0.0, tutorial_timer - dt)

            # Send in the next new thing once the previous one has been explained.
            if (
                tutorial
                and tutorial_timer == 0
                and tutorial["watch"] is None
                and tutorial["forcing"] is None
                and tutorial["stage"] < len(TUTORIAL_FEATURES)
            ):
                feature, threshold = TUTORIAL_FEATURES[tutorial["stage"]]
                if score >= threshold:
                    if feature == "hazards":
                        cell = DriftingCell(
                            WIDTH + 60,
                            clamp(bacterium.y, 160, HEIGHT - 160),
                            "macrophage",
                        )
                        cell.amplitude = 12
                        hazards.append(cell)
                        tutorial["watch"] = cell
                    else:
                        tutorial["forcing"] = feature

            if boss is None:
                hazard_timer -= dt
                if tutorial_timer > 0 or not tutorial_allows(tutorial, "hazards"):
                    hazard_timer = max(hazard_timer, 1.0)
                if hazard_timer <= 0:
                    hazards.append(
                        DriftingCell(
                            WIDTH + 60,
                            random.randint(110, HEIGHT - 110),
                            random.choice(HAZARD_KINDS),
                        )
                    )
                    interval = random.uniform(*HAZARD_INTERVAL)
                    hazard_timer = interval * max(0.6, 1.0 - (level - 1) * 0.04)
            for hazard in hazards:
                hazard.update(speed, frame_scale)
            hazards = [hazard for hazard in hazards if not hazard.off_screen()]

            production_locked = any(
                isinstance(obj, Transducer)
                and obj.kind == "collapse"
                and obj.overlaps(bacterium)
                for obj in objects
            )

            for obj in objects:
                if (
                    isinstance(obj, Transducer)
                    and obj.overlaps(bacterium)
                    and not obj.triggered
                ):
                    if obj.kind == "collapse":
                        bacterium.apply_transducer(obj.collapse_fraction)
                    elif obj.kind == "top":
                        bacterium.apply_transducer_push(1)
                    else:
                        bacterium.apply_transducer_push(-1)
                    obj.triggered = True

            keys = pygame.key.get_pressed()
            bacterium.update(keys, dt, production_locked=production_locked)

            remaining_bonuses = []
            for bonus in bonuses:
                if bonus.collected_by(bacterium):
                    result = bonus.apply(bacterium)
                    if result == "coin":
                        gained = 1
                        extra = bacterium.perk.get("coins", 1.0) - 1.0
                        if extra > 0 and random.random() < extra:
                            gained += 1
                        progress["coins"] += gained
                        run_stats["coins"] += gained
                    elif result == "special_prize":
                        progress["special_prizes"] = progress.get("special_prizes", 0) + 1
                        progress["coins"] += SPECIAL_PRIZE_COINS
                        run_stats["coins"] += SPECIAL_PRIZE_COINS
                        new_tier = update_biobrick_tier(progress)
                        check_final_skin_unlock(progress)
                        if new_tier:
                            bacterium.set_notice(f"BioBrick unlocked: {BIOBRICK_TIER_NAMES[new_tier]}!")
                        else:
                            bacterium.set_notice(f"iGEM Special Prize! ({progress['special_prizes']} found)")
                    elif isinstance(bonus, GvpC):
                        run_stats["gvpc"] += 1
                    else:
                        run_stats["modules"] += 1
                elif not bonus.off_screen():
                    remaining_bonuses.append(bonus)
            bonuses = remaining_bonuses

            if bacterium.module == "granzyme":
                for hazard in hazards:
                    if hazard.collides_with(bacterium):
                        hazard.kill()
                        run_stats["kills"] += 1

            shot_targets = hazards + boss_targets(boss)
            remaining_projectiles = []
            for shot in projectiles:
                shot.update(frame_scale, shot_targets)
                target = next(
                    (t for t in shot_targets if t.alive() and shot.collides_with(t)),
                    None,
                )
                if target is not None:
                    target.kill()
                    if isinstance(target, DriftingCell):
                        run_stats["kills"] += 1
                elif boss_absorbs(boss, shot):
                    pass
                elif not shot.off_screen():
                    remaining_projectiles.append(shot)
            projectiles = remaining_projectiles

            hit = (
                any(obj.collides_with(bacterium) for obj in objects)
                or any(hazard.collides_with(bacterium) for hazard in hazards)
                or boss_hits_player(boss, bacterium)
            )

            if boss is None:
                for obj in objects:
                    if not obj.passed and obj.x + obj.width < bacterium.x:
                        obj.passed = True
                        score += 1
                        best_score = max(best_score, score)
                        if score == TRANSDUCER_START_SCORE and not tutorial:
                            run_banner = "Transducers ahead: ultrasound fields join the run"
                            run_banner_color = TRANSDUCER_CORE
                            run_banner_timer = 3.0
                        elif score == LEVEL_START_SCORE:
                            run_banner = "Level system on: the current speeds up from here"
                            run_banner_color = YELLOW
                            run_banner_timer = 3.0

            objects = [obj for obj in objects if not obj.off_screen()]

            if boss is not None:
                boss_result = update_boss(boss, dt, hazards, bacterium)
                if boss_result == "defeated":
                    reward = BOSS_REWARD_COINS + boss["stage"] * BOSS_REWARD_PER_STAGE
                    progress["coins"] += reward
                    run_stats["coins"] += reward
                    progress["stats"]["bosses_defeated"] = progress["stats"].get("bosses_defeated", 0) + 1
                    save_progress(progress)
                    run_banner = f"Macrophage defeated! +{reward} coins"
                    run_banner_color = GREEN
                    run_banner_timer = 3.0
                    next_boss_score += BOSS_SCORE_INTERVAL
                    bacterium.infinite_ampicillin = False
                    boss = None
            elif not objects or objects[-1].x < WIDTH - spacing:
                spawn_x = objects[-1].x + spacing if objects else WIDTH
                forcing = tutorial["forcing"] if tutorial else None
                new_object = make_next_object(
                    spawn_x,
                    gap_size,
                    transducers_active,
                    spawn_state,
                    biome_index,
                    force_transducer=forcing == "transducer",
                )
                objects.append(new_object)
                if isinstance(new_object, Obstacle):
                    spawn_state["since_special_prize"] += 1
                    prize_ready = (
                        not tutorial
                        and score >= SPECIAL_PRIZE_MIN_SCORE
                        and spawn_state["since_special_prize"] >= MIN_OBSTACLES_BETWEEN_SPECIAL_PRIZES
                    )
                    if prize_ready and random.random() < SPECIAL_PRIZE_CHANCE:
                        gap_top = new_object.gap_y - new_object.gap_size // 2
                        gap_bottom = new_object.gap_y + new_object.gap_size // 2
                        edge_y = random.choice((
                            gap_top + SPECIAL_PRIZE_EDGE_MARGIN,
                            gap_bottom - SPECIAL_PRIZE_EDGE_MARGIN,
                        ))
                        bonuses.append(
                            SpecialPrize(new_object.x + new_object.width / 2, edge_y)
                        )
                        spawn_state["since_special_prize"] = 0
                if forcing == "transducer":
                    tutorial["watch"] = new_object
                    tutorial["forcing"] = None
                elif forcing in ("gvpc", "module"):
                    tutorial["watch"] = spawn_bonus(
                        bonuses, spawn_x + spacing // 2, bacterium, force=forcing
                    )
                    tutorial["forcing"] = None
                elif random.random() < BONUS_SPAWN_CHANCE:
                    spawn_bonus(
                        bonuses, spawn_x + spacing // 2, bacterium, allowed_bonus_kinds(tutorial)
                    )

            if tutorial and tutorial["watch"] and tutorial_watch_visible(tutorial["watch"]):
                tutorial["card"] = TUTORIAL_FEATURES[tutorial["stage"]][0]

            out_of_bounds = (
                bacterium.y < bacterium.half_height
                or bacterium.y > HEIGHT - bacterium.half_height
            )

            if bacterium.invulnerable_timer <= 0 and (hit or out_of_bounds):
                if bacterium.shell > 0:
                    bacterium.absorb_hit()
                    if out_of_bounds:
                        # Push back into the water column so the wall is survivable.
                        top = bacterium.y < HEIGHT / 2
                        bacterium.y = (
                            bacterium.half_height + 2
                            if top
                            else HEIGHT - bacterium.half_height - 2
                        )
                        bacterium.velocity_y = (
                            SHELL_BOUNCE_SPEED if top else -SHELL_BOUNCE_SPEED
                        )
                else:
                    game_over = True

            if game_over:
                new_highscore = score > progress["stats"]["best_score"]
                run_stats["score"] = score
                record_run(progress, selected_character, score, run_stats)
                completed = check_missions(progress, run_stats)
                if completed:
                    reward = sum(mission["reward"] for mission in completed)
                    mission_notice = f"{len(completed)} mission(s) done: +{reward} coins"
                save_progress(progress)

        draw_water_background(ceiling_intensity, biome_index, previous_biome, biome_blend)
        for obj in objects:
            obj.draw(screen)
        for bonus in bonuses:
            bonus.draw(screen)
        for hazard in hazards:
            hazard.draw(screen)
        for shot in projectiles:
            shot.draw(screen)
        if boss is not None:
            draw_boss(boss, bacterium)
        bacterium.draw(screen)
        draw_darkness(bacterium, ceiling_intensity)
        draw_vignette()
        draw_hud(
            bacterium,
            score,
            level,
            BIOMES[biome_index]["name"],
            best_score,
            progress["coins"],
        )
        draw_run_missions_panel(
            pygame.Rect(WIDTH - 230, 12, 215, 93), progress["missions"], run_stats, score
        )

        if tutorial_timer > 0:
            draw_tutorial_hint(tutorial_timer)
        elif tutorial and not tutorial["card"]:
            draw_tutorial_progress(tutorial["stage"])
        if run_banner_timer > 0:
            draw_banner_text(
                run_banner,
                run_banner_color,
                y=178,
                alpha=int(255 * min(1.0, run_banner_timer / 0.5)),
            )
        if biome_notice_timer > 0:
            draw_banner_text(
                f"Entering: {BIOMES[biome_index]['name']}",
                PANEL_BORDER,
                alpha=int(255 * min(1.0, biome_notice_timer / 0.5)),
            )

        if game_over:
            draw_game_over(score, new_highscore, mission_notice)
        elif paused:
            draw_pause_overlay()
        elif tutorial and tutorial["card"]:
            draw_tutorial_card(tutorial["card"], tutorial["watch"], tutorial["stage"])

        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
