# GV Float

A browser game about gas vesicles (GVs), the gas-filled protein bubbles some microbes use to float. Build them to rise, collapse them to sink, and thread the gaps between the pillars. Around 50% you hover.

The game is based on VOYAGE, the iGEM project of Team Heidelberg 2026. [iGEM](igem.org) is the biggest international competition in synthetic biology, where student teams build their own research project. For more details, feel free to visit the [iGEM Heidelberg Wiki Page](2026.igem.wiki/heidelberg).

## Run the game

```bash
python3 gv_float.py                # http://127.0.0.1:8000/
python3 gv_float.py --port 9000
python3 gv_float.py --no-browser
```

The game is plain HTML, CSS and JavaScript, so there is no build step and no dependencies. You can also serve `docs/` or `simple/` with any static file server. Progress (coins, skins, upgrades) is saved in the browser's localStorage, which belongs to the address, so keep using the same port to keep your progress.

## Controls

| Key | Action |
|---|---|
| `W` / `↑` | Produce GVs, rise |
| `S` / `↓` | Collapse GVs, sink |
| `Space` | Fire Ampicillin |
| `P` / `Esc` | Pause |

The game needs a keyboard.

## Gameplay

- **Pickups:** coins, GvpC (shields one hit), and SpyCatcher modules: GFP lights the dark, Antibody pulls in pickups, Granzyme kills cells, Ampicillin fires.
- **Hazards:** macrophages and ciliates swim at you, and ultrasound transducers collapse or push you around.
- **Bosses:** every 50 points a giant dendritic cell docks. Shoot its weak spots.
- **Skins:** unlock or buy new characters with coins, such as the HEK cell and Purified GVs.

## Versions

| Folder | What it is |
|---|---|
| `docs/` | The full game: more skins plus SpyCatcher upgrades. Also the GitHub Pages site. |
| `simple/` | A lighter edition with three skins (E. coli, HEK cell, Purified GVs) and no upgrades. Its save is stored separately. |

## Layout

```
gv_float.py      local web server for docs/
docs/            full game (index.html, style.css, js/)
simple/          simple edition (index.html, style.css, game.js)
```

In `docs/js/`: `config.js` has the constants and game data, `entities.js` the sprites and entities, `gfx.js` the drawing helpers, `screens.js` the menus, and `main.js` the game loop.
