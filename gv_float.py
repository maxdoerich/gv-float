import json
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

FONT = pygame.font.SysFont("arial", 22)
SMALL_FONT = pygame.font.SysFont("arial", 16)
MEDIUM_FONT = pygame.font.SysFont("arial", 30, bold=True)
BIG_FONT = pygame.font.SysFont("arial", 48, bold=True)


# Physics
BACTERIUM_X = 180
BACTERIUM_RADIUS = 20
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
DIFFICULTY_STEP_SCORE = 3

# Transducers
TRANSDUCER_SPAWN_CHANCE = 0.35
MIN_NORMALS_BETWEEN_TRANSDUCERS = 1
MAX_NORMALS_BETWEEN_TRANSDUCERS = 4
TRANSDUCER_WIDTH = 54
TRANSDUCER_START_COLLAPSE = 0.30
TRANSDUCER_COLLAPSE_STEP = 0.10
TRANSDUCER_MAX_COLLAPSE = 0.80
TRANSDUCER_GV_FLOOR = 20.0
TRANSDUCER_PUSH_IMPULSE = 2.6
TRANSDUCER_KINDS = ("collapse", "top", "bottom")

# Characters only change the drawing. Physics and collision size stay identical.
CHARACTERS = ("Zeppelin", "E. coli", "HEK cell", "Purified GVs")

# Highscores
HIGHSCORE_FILE = Path(__file__).with_name("gv_float_highscores.json")
MAX_HIGHSCORES = 5
MAX_NAME_LENGTH = 6


# Colors
BACKGROUND = (20, 80, 115)
WATER_LINE = (40, 110, 145)
PANEL = (11, 45, 67)
PANEL_BORDER = (117, 201, 225)
BACTERIUM_COLOR = (240, 200, 80)
BACTERIUM_OUTLINE = (60, 50, 30)
GV_COLOR = (235, 245, 250)
OBSTACLE_COLOR = (45, 130, 90)
TRANSDUCER_COLOR = (47, 185, 225)
TRANSDUCER_CORE = (190, 244, 255)
TRANSDUCER_PUSH_COLOR = (160, 105, 230)
TRANSDUCER_PUSH_CORE = (224, 202, 255)
ECOLI_COLOR = (105, 205, 100)
HEK_COLOR = (235, 135, 185)
HEK_NUCLEUS = (130, 70, 145)
WHITE = (255, 255, 255)
GRAY = (160, 180, 190)
RED = (235, 80, 80)
YELLOW = (250, 210, 65)
GREEN = (80, 220, 120)
ORANGE = (245, 155, 55)
BLACK = (20, 20, 20)


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def load_highscores():
    try:
        with HIGHSCORE_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        cleaned = []
        for entry in data:
            name = str(entry.get("name", "ANONYM"))[:MAX_NAME_LENGTH].upper()
            score = int(entry.get("score", 0))
            cleaned.append({"name": name, "score": score})
        return sorted(cleaned, key=lambda item: item["score"], reverse=True)[:MAX_HIGHSCORES]
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return []


def save_highscores(highscores):
    try:
        with HIGHSCORE_FILE.open("w", encoding="utf-8") as file:
            json.dump(highscores[:MAX_HIGHSCORES], file, indent=2)
    except OSError:
        # The game remains playable if the folder is read-only.
        pass


def qualifies_for_highscore(score, highscores):
    return score > 0 and (
        len(highscores) < MAX_HIGHSCORES
        or score > highscores[-1]["score"]
    )


def difficulty_for_score(score, level_system_enabled):
    if not level_system_enabled:
        return 1, BASE_SCROLL_SPEED, BASE_OBSTACLE_GAP, BASE_OBSTACLE_SPACING

    level = score // DIFFICULTY_STEP_SCORE + 1
    steps = level - 1
    speed = min(MAX_SCROLL_SPEED, BASE_SCROLL_SPEED + steps * 0.35)
    gap = max(MIN_OBSTACLE_GAP, BASE_OBSTACLE_GAP - steps * 8)
    spacing = max(MIN_OBSTACLE_SPACING, BASE_OBSTACLE_SPACING - steps * 10)
    return level, speed, gap, spacing


def transducer_strength(transducer_number):
    """First transducer: 30%, then +10 percentage points, capped at 80%."""
    return min(
        TRANSDUCER_MAX_COLLAPSE,
        TRANSDUCER_START_COLLAPSE
        + (transducer_number - 1) * TRANSDUCER_COLLAPSE_STEP,
    )


class Bacterium:
    def __init__(self, character):
        self.character = character
        self.reset()

    def reset(self):
        self.x = float(BACTERIUM_X)
        self.y = HEIGHT / 2
        self.velocity_y = 0.0
        self.gv_level = 50.0
        self.production_hold_seconds = 0.0
        self.collapse_hold_seconds = 0.0
        self.transducer_notice = ""
        self.transducer_notice_timer = 0.0

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
            self.gv_level += GV_PRODUCTION_RATE * multiplier * frame_scale
        else:
            self.production_hold_seconds = 0.0

        if collapsing:
            self.collapse_hold_seconds += dt
            multiplier = min(
                MAX_GV_COLLAPSE_MULTIPLIER,
                GV_HOLD_ACCELERATION ** self.collapse_hold_seconds,
            )
            self.gv_level -= GV_COLLAPSE_RATE * multiplier * frame_scale
        else:
            self.collapse_hold_seconds = 0.0

        self.gv_level = clamp(self.gv_level, 0.0, 100.0)

        gv_fraction = self.gv_level / 100.0
        acceleration = GRAVITY - MAX_BUOYANCY * gv_fraction
        self.velocity_y += acceleration * frame_scale
        self.velocity_y *= DRAG ** frame_scale
        self.velocity_y = clamp(
            self.velocity_y,
            -MAX_VERTICAL_SPEED,
            MAX_VERTICAL_SPEED,
        )
        self.y += self.velocity_y * frame_scale

        # Mild passive pressure loss at the bottom of the water column.
        depth_fraction = self.y / HEIGHT
        if depth_fraction > 0.80:
            self.gv_level -= (depth_fraction - 0.80) * 0.15 * frame_scale
            self.gv_level = max(0.0, self.gv_level)

        self.transducer_notice_timer = max(0.0, self.transducer_notice_timer - dt)

    def apply_transducer(self, collapse_fraction):
        before = self.gv_level

        # Only collapse GVs. If the player is already below the 20% floor,
        # the transducer must not create new GVs by raising the level to 20%.
        if before > TRANSDUCER_GV_FLOOR:
            self.gv_level = max(
                TRANSDUCER_GV_FLOOR,
                before * (1.0 - collapse_fraction),
            )

        self.transducer_notice = (
            f"Transducer: {collapse_fraction * 100:.0f}% collapsed"
        )
        self.transducer_notice_timer = 1.5

    def apply_transducer_push(self, direction):
        """Apply one speed-independent impulse away from a top/bottom emitter."""
        self.velocity_y = clamp(
            self.velocity_y + direction * TRANSDUCER_PUSH_IMPULSE,
            -MAX_VERTICAL_SPEED,
            MAX_VERTICAL_SPEED,
        )
        direction_text = "down" if direction > 0 else "up"
        self.transducer_notice = f"Transducer presses {direction_text}"
        self.transducer_notice_timer = 1.5

    def draw(self, surface):
        center = (int(self.x), int(self.y))
        positions = [
            (-9, -7), (0, -9), (9, -6), (-11, 2),
            (0, 0), (11, 3), (-6, 9), (6, 9),
        ]
        visible_gvs = int(self.gv_level / 100.0 * len(positions))

        if self.character == "Zeppelin":
            body = pygame.Rect(int(self.x - 20), int(self.y - 11), 40, 22)
            pygame.draw.ellipse(surface, BACTERIUM_COLOR, body)
            pygame.draw.ellipse(surface, BACTERIUM_OUTLINE, body, 2)
            pygame.draw.polygon(
                surface,
                BACTERIUM_COLOR,
                [(int(self.x - 17), int(self.y)),
                 (int(self.x - 23), int(self.y - 8)),
                 (int(self.x - 21), int(self.y))],
            )
            pygame.draw.rect(
                surface,
                BACTERIUM_OUTLINE,
                (int(self.x - 5), int(self.y + 10), 10, 4),
                border_radius=2,
            )

        elif self.character == "E. coli":
            body = pygame.Rect(int(self.x - 20), int(self.y - 13), 40, 26)
            pygame.draw.ellipse(surface, ECOLI_COLOR, body)
            pygame.draw.ellipse(surface, BACTERIUM_OUTLINE, body, 2)
            for offset in (-7, 0, 7):
                pygame.draw.line(
                    surface,
                    ECOLI_COLOR,
                    (int(self.x - 18), int(self.y + offset)),
                    (int(self.x - 27), int(self.y + offset + 4)),
                    2,
                )

        elif self.character == "HEK cell":
            pygame.draw.circle(surface, HEK_COLOR, center, BACTERIUM_RADIUS)
            pygame.draw.circle(surface, BACTERIUM_OUTLINE, center, BACTERIUM_RADIUS, 2)
            pygame.draw.circle(
                surface,
                HEK_NUCLEUS,
                (int(self.x + 4), int(self.y + 2)),
                7,
            )

        else:  # Purified GVs
            pygame.draw.circle(surface, (35, 100, 130), center, BACTERIUM_RADIUS, 1)
            for index, (dx, dy) in enumerate(positions):
                color = GV_COLOR if index < visible_gvs else (80, 135, 155)
                width = 0 if index < visible_gvs else 1
                pygame.draw.ellipse(
                    surface,
                    color,
                    (self.x + dx - 3, self.y + dy - 6, 6, 12),
                    width,
                )
            return

        # Show the current GV level inside all cell/zeppelin characters.
        for dx, dy in positions[:visible_gvs]:
            pygame.draw.ellipse(
                surface,
                GV_COLOR,
                (self.x + dx - 2, self.y + dy - 4, 4, 8),
            )

    def get_rect(self):
        return pygame.Rect(
            int(self.x - BACTERIUM_RADIUS),
            int(self.y - BACTERIUM_RADIUS),
            BACTERIUM_RADIUS * 2,
            BACTERIUM_RADIUS * 2,
        )


class Obstacle:
    def __init__(self, x, gap_size):
        self.x = float(x)
        self.width = 70
        margin = 100
        self.gap_size = gap_size
        self.gap_y = random.randint(
            margin + gap_size // 2,
            HEIGHT - margin - gap_size // 2,
        )
        self.passed = False

    def update(self, speed, frame_scale):
        self.x -= speed * frame_scale

    def draw(self, surface):
        gap_top = self.gap_y - self.gap_size // 2
        gap_bottom = self.gap_y + self.gap_size // 2
        pygame.draw.rect(
            surface,
            OBSTACLE_COLOR,
            (int(self.x), 0, self.width, gap_top),
        )
        pygame.draw.rect(
            surface,
            OBSTACLE_COLOR,
            (int(self.x), gap_bottom, self.width, HEIGHT - gap_bottom),
        )

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
        x = int(self.x)
        field_color = (
            TRANSDUCER_COLOR if self.kind == "collapse" else TRANSDUCER_PUSH_COLOR
        )
        core_color = (
            TRANSDUCER_CORE if self.kind == "collapse" else TRANSDUCER_PUSH_CORE
        )

        # The outlined field always covers the complete screen height.
        pygame.draw.rect(surface, field_color, (x, 0, self.width, HEIGHT), 2)
        for y in range(12, HEIGHT, 36):
            pygame.draw.line(
                surface,
                core_color,
                (x + 8, y),
                (x + self.width - 8, y),
                2,
            )

        if self.kind in ("collapse", "top"):
            self.draw_emitter(surface, top=True, color=field_color)
        if self.kind in ("collapse", "bottom"):
            self.draw_emitter(surface, top=False, color=field_color)

        if self.kind == "top":
            for y in range(90, HEIGHT - 25, 92):
                self.draw_arrow(surface, x + self.width // 2, y, 1, core_color)
            label_text = "PRESSURE DOWN"
        elif self.kind == "bottom":
            for y in range(45, HEIGHT - 70, 92):
                self.draw_arrow(surface, x + self.width // 2, y, -1, core_color)
            label_text = "PRESSURE UP"
        else:
            label_text = f"GV -{self.collapse_fraction * 100:.0f}%"

        label = SMALL_FONT.render(label_text, True, WHITE)
        rotated = pygame.transform.rotate(label, 90)
        surface.blit(
            rotated,
            (
                int(self.x + self.width / 2 - rotated.get_width() / 2),
                HEIGHT // 2 - rotated.get_height() // 2,
            ),
        )

    def draw_emitter(self, surface, top, color):
        x = int(self.x)
        emitter_height = 28
        y = 0 if top else HEIGHT - emitter_height
        pygame.draw.rect(
            surface,
            color,
            (x - 6, y, self.width + 12, emitter_height),
            border_radius=6,
        )
        pygame.draw.rect(
            surface,
            WHITE,
            (x + 8, y + 8, self.width - 16, emitter_height - 16),
            border_radius=3,
        )

    @staticmethod
    def draw_arrow(surface, x, y, direction, color):
        tip_y = y + direction * 13
        pygame.draw.line(surface, color, (x, y - direction * 12), (x, tip_y), 3)
        pygame.draw.line(surface, color, (x, tip_y), (x - 7, tip_y - direction * 7), 3)
        pygame.draw.line(surface, color, (x, tip_y), (x + 7, tip_y - direction * 7), 3)

    def collides_with(self, bacterium):
        return False

    def overlaps(self, bacterium):
        field = pygame.Rect(int(self.x), 0, self.width, HEIGHT)
        return bacterium.get_rect().colliderect(field)

    def off_screen(self):
        return self.x + self.width < 0


def draw_water_background():
    screen.fill(BACKGROUND)
    for y in range(100, HEIGHT, 100):
        pygame.draw.line(screen, WATER_LINE, (0, y), (WIDTH, y), 1)
        label = SMALL_FONT.render(f"Depth {y}", True, (120, 180, 200))
        screen.blit(label, (10, y + 5))


def gv_bar_color(gv_level):
    if gv_level < 25:
        return RED
    if gv_level < 50:
        return ORANGE
    return GREEN


def draw_highscores(highscores):
    panel = pygame.Rect(WIDTH - 205, 12, 190, 170)
    pygame.draw.rect(screen, PANEL, panel, border_radius=10)
    pygame.draw.rect(screen, PANEL_BORDER, panel, 2, border_radius=10)
    title = FONT.render("TOP 5", True, YELLOW)
    screen.blit(title, (panel.centerx - title.get_width() // 2, 20))

    for index in range(MAX_HIGHSCORES):
        if index < len(highscores):
            entry = highscores[index]
            line = f"{index + 1}. {entry['name']:<6} {entry['score']:>3}"
        else:
            line = f"{index + 1}. ------   -"
        text_surface = SMALL_FONT.render(line, True, WHITE)
        screen.blit(text_surface, (WIDTH - 188, 57 + index * 22))


def draw_hud(bacterium, score, level, speed, highscores, level_enabled):
    gv_panel = pygame.Rect(15, 12, 285, 112)
    pygame.draw.rect(screen, PANEL, gv_panel, border_radius=10)
    pygame.draw.rect(screen, PANEL_BORDER, gv_panel, 2, border_radius=10)

    gv_text = MEDIUM_FONT.render(f"GVs: {bacterium.gv_level:5.1f}%", True, WHITE)
    screen.blit(gv_text, (30, 21))

    bar_rect = pygame.Rect(30, 69, 250, 28)
    pygame.draw.rect(screen, BLACK, bar_rect)
    fill_width = int(bar_rect.width * bacterium.gv_level / 100.0)
    pygame.draw.rect(
        screen,
        gv_bar_color(bacterium.gv_level),
        (bar_rect.x, bar_rect.y, fill_width, bar_rect.height),
    )
    neutral_x = bar_rect.x + bar_rect.width // 2
    pygame.draw.line(
        screen,
        WHITE,
        (neutral_x, bar_rect.y - 3),
        (neutral_x, bar_rect.bottom + 3),
        2,
    )
    pygame.draw.rect(screen, WHITE, bar_rect, 2)

    score_text = BIG_FONT.render(str(score), True, WHITE)
    score_label = SMALL_FONT.render("SCORE", True, PANEL_BORDER)
    screen.blit(score_label, (WIDTH // 2 - score_label.get_width() // 2, 15))
    screen.blit(score_text, (WIDTH // 2 - score_text.get_width() // 2, 34))

    if level_enabled:
        info = SMALL_FONT.render(
            f"Level {level}  |  Speed {speed:.2f}", True, WHITE
        )
    else:
        info = SMALL_FONT.render("Level-System AUS", True, GRAY)
    screen.blit(info, (WIDTH // 2 - info.get_width() // 2, 92))

    draw_highscores(highscores)

    controls = SMALL_FONT.render(
        "W/UP: Produce GVs    S/DOWN: Collapse GVs",
        True,
        WHITE,
    )
    screen.blit(controls, (WIDTH // 2 - controls.get_width() // 2, HEIGHT - 28))

    if bacterium.transducer_notice_timer > 0:
        notice = MEDIUM_FONT.render(bacterium.transducer_notice, True, YELLOW)
        screen.blit(
            notice,
            (WIDTH // 2 - notice.get_width() // 2, HEIGHT - 76),
        )


def draw_toggle(rect, label, enabled):
    mouse_over = rect.collidepoint(pygame.mouse.get_pos())
    color = GREEN if enabled else RED
    if mouse_over:
        color = tuple(min(255, channel + 20) for channel in color)
    pygame.draw.rect(screen, PANEL, rect, border_radius=10)
    pygame.draw.rect(screen, color, rect, 3, border_radius=10)
    status = "ON" if enabled else "OFF"
    text_surface = FONT.render(f"{label}: {status}", True, WHITE)
    screen.blit(
        text_surface,
        (
            rect.centerx - text_surface.get_width() // 2,
            rect.centery - text_surface.get_height() // 2,
        ),
    )


def draw_character_button(rect, character, selected):
    border_color = YELLOW if selected else PANEL_BORDER
    pygame.draw.rect(screen, PANEL, rect, border_radius=8)
    pygame.draw.rect(screen, border_color, rect, 3 if selected else 1, border_radius=8)

    preview = Bacterium(character)
    preview.x = rect.x + 31
    preview.y = rect.centery
    preview.gv_level = 65.0
    preview.draw(screen)

    label = SMALL_FONT.render(character, True, WHITE)
    screen.blit(
        label,
        (
            rect.x + 58,
            rect.centery - label.get_height() // 2,
        ),
    )


def draw_menu(
    level_enabled,
    transducers_enabled,
    selected_character,
    level_rect,
    transducer_rect,
    character_rects,
    start_rect,
):
    draw_water_background()
    title = BIG_FONT.render("GV FLOAT", True, WHITE)
    subtitle = FONT.render("Choose your options for this run", True, PANEL_BORDER)
    screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 48))
    screen.blit(subtitle, (WIDTH // 2 - subtitle.get_width() // 2, 108))

    draw_toggle(level_rect, "Level-System", level_enabled)
    draw_toggle(transducer_rect, "Transducer", transducers_enabled)

    character_title = FONT.render("CHARACTER", True, WHITE)
    screen.blit(
        character_title,
        (WIDTH // 2 - character_title.get_width() // 2, 278),
    )
    for character, rect in zip(CHARACTERS, character_rects):
        draw_character_button(rect, character, character == selected_character)

    pygame.draw.rect(screen, YELLOW, start_rect, border_radius=12)
    start_text = MEDIUM_FONT.render("START RUN", True, BLACK)
    screen.blit(
        start_text,
        (
            start_rect.centerx - start_text.get_width() // 2,
            start_rect.centery - start_text.get_height() // 2,
        ),
    )

    hint = SMALL_FONT.render(
        "Transducer: GV collapse or pressure away from top/bottom transducer.",
        True,
        WHITE,
    )
    screen.blit(hint, (WIDTH // 2 - hint.get_width() // 2, 565))


def make_next_object(x, gap_size, transducers_enabled, spawn_state):
    normals = spawn_state["normal_since_transducer"]
    transducer_allowed = (
        transducers_enabled
        and normals >= MIN_NORMALS_BETWEEN_TRANSDUCERS
    )
    transducer_due = normals >= MAX_NORMALS_BETWEEN_TRANSDUCERS
    spawn_transducer = transducer_allowed and (
        transducer_due or random.random() < TRANSDUCER_SPAWN_CHANCE
    )

    if spawn_transducer:
        kind = random.choice(TRANSDUCER_KINDS)
        collapse_number = max(1, spawn_state["collapse_count"])
        if kind == "collapse":
            spawn_state["collapse_count"] += 1
            collapse_number = spawn_state["collapse_count"]
        spawn_state["normal_since_transducer"] = 0
        return Transducer(x, kind, collapse_number)

    spawn_state["normal_since_transducer"] += 1
    return Obstacle(x, gap_size)


def reset_run(level_enabled, transducers_enabled, character):
    bacterium = Bacterium(character)
    objects = []
    spawn_state = {
        "normal_since_transducer": 0,
        "collapse_count": 0,
    }
    x = WIDTH + 180
    _, _, gap_size, spacing = difficulty_for_score(0, level_enabled)

    for _ in range(4):
        objects.append(
            make_next_object(
                x,
                gap_size,
                transducers_enabled,
                spawn_state,
            )
        )
        x += spacing

    return bacterium, objects, 0, spawn_state


def draw_game_over(score, new_highscore, awaiting_name, name_input):
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 155))
    screen.blit(overlay, (0, 0))

    if awaiting_name:
        title = BIG_FONT.render("NEW HIGHSCORE!", True, YELLOW)
        prompt = FONT.render("Type in name (max. 6 characters):", True, WHITE)
        shown_name = name_input + ("_" if len(name_input) < MAX_NAME_LENGTH else "")
        name_surface = BIG_FONT.render(shown_name, True, WHITE)
        hint = SMALL_FONT.render(
            "ENTER: save & new run   BACKSPACE: delete",
            True,
            GRAY,
        )
        items = [(title, 205), (prompt, 280), (name_surface, 322), (hint, 395)]
    else:
        title = BIG_FONT.render("GV COLLAPSE!", True, RED)
        result = MEDIUM_FONT.render(f"Score: {score}", True, WHITE)
        hint = FONT.render(
            "R/ENTER: Retry    E: Menu",
            True,
            WHITE,
        )
        items = [(title, 220), (result, 292), (hint, 355)]

    for surface, y in items:
        screen.blit(surface, (WIDTH // 2 - surface.get_width() // 2, y))


def main():
    highscores = load_highscores()
    state = "menu"
    running = True
    level_enabled = True
    transducers_enabled = True
    selected_character = CHARACTERS[0]
    game_over = False
    awaiting_name = False
    name_input = ""
    new_highscore = False

    level_rect = pygame.Rect(WIDTH // 2 - 180, 150, 360, 48)
    transducer_rect = pygame.Rect(WIDTH // 2 - 180, 210, 360, 48)
    character_rects = [
        pygame.Rect(205, 312, 235, 48),
        pygame.Rect(460, 312, 235, 48),
        pygame.Rect(205, 372, 235, 48),
        pygame.Rect(460, 372, 235, 48),
    ]
    start_rect = pygame.Rect(WIDTH // 2 - 150, 465, 300, 58)

    bacterium = None
    objects = []
    score = 0
    spawn_state = None

    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)
        frame_scale = dt * FPS

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif state == "menu" and event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:
                    if level_rect.collidepoint(event.pos):
                        level_enabled = not level_enabled
                    elif transducer_rect.collidepoint(event.pos):
                        transducers_enabled = not transducers_enabled
                    else:
                        for character, rect in zip(CHARACTERS, character_rects):
                            if rect.collidepoint(event.pos):
                                selected_character = character
                                break

                    if start_rect.collidepoint(event.pos):
                        bacterium, objects, score, spawn_state = reset_run(
                            level_enabled,
                            transducers_enabled,
                            selected_character,
                        )
                        game_over = False
                        awaiting_name = False
                        new_highscore = False
                        name_input = ""
                        state = "playing"

            elif (
                state == "menu"
                and event.type == pygame.KEYDOWN
                and event.key in (pygame.K_RETURN, pygame.K_KP_ENTER)
            ):
                bacterium, objects, score, spawn_state = reset_run(
                    level_enabled,
                    transducers_enabled,
                    selected_character,
                )
                game_over = False
                awaiting_name = False
                new_highscore = False
                name_input = ""
                state = "playing"

            elif state == "playing" and game_over and event.type == pygame.KEYDOWN:
                if awaiting_name:
                    if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                        safe_name = name_input or "ANONYM"
                        highscores.append({"name": safe_name, "score": score})
                        highscores.sort(key=lambda item: item["score"], reverse=True)
                        highscores = highscores[:MAX_HIGHSCORES]
                        save_highscores(highscores)
                        bacterium, objects, score, spawn_state = reset_run(
                            level_enabled,
                            transducers_enabled,
                            selected_character,
                        )
                        game_over = False
                        awaiting_name = False
                        new_highscore = False
                        name_input = ""
                    elif event.key == pygame.K_BACKSPACE:
                        name_input = name_input[:-1]
                    elif len(name_input) < MAX_NAME_LENGTH:
                        character = event.unicode.upper()
                        if character.isalnum():
                            name_input += character
                elif event.key in (pygame.K_r, pygame.K_RETURN, pygame.K_KP_ENTER):
                    bacterium, objects, score, spawn_state = reset_run(
                        level_enabled,
                        transducers_enabled,
                        selected_character,
                    )
                    game_over = False
                    awaiting_name = False
                    new_highscore = False
                    name_input = ""
                elif event.key == pygame.K_e:
                    state = "menu"

        if state == "menu":
            draw_menu(
                level_enabled,
                transducers_enabled,
                selected_character,
                level_rect,
                transducer_rect,
                character_rects,
                start_rect,
            )
            draw_highscores(highscores)
            pygame.display.flip()
            continue

        level, speed, gap_size, spacing = difficulty_for_score(
            score, level_enabled
        )

        if not game_over:
            for obj in objects:
                obj.update(speed, frame_scale)

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

            for obj in objects:
                if obj.collides_with(bacterium):
                    game_over = True

                if not obj.passed and obj.x + obj.width < bacterium.x:
                    obj.passed = True
                    score += 1

            objects = [obj for obj in objects if not obj.off_screen()]

            if not objects or objects[-1].x < WIDTH - spacing:
                spawn_x = objects[-1].x + spacing if objects else WIDTH
                objects.append(
                    make_next_object(
                        spawn_x,
                        gap_size,
                        transducers_enabled,
                        spawn_state,
                    )
                )

            if (
                bacterium.y < BACTERIUM_RADIUS
                or bacterium.y > HEIGHT - BACTERIUM_RADIUS
            ):
                game_over = True

            if game_over:
                new_highscore = qualifies_for_highscore(score, highscores)
                awaiting_name = new_highscore

        draw_water_background()
        for obj in objects:
            obj.draw(screen)
        bacterium.draw(screen)
        draw_hud(
            bacterium,
            score,
            level,
            speed,
            highscores,
            level_enabled,
        )

        if game_over:
            draw_game_over(score, new_highscore, awaiting_name, name_input)

        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
