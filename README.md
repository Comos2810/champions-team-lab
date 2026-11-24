# Champions Team Lab

A team-building helper for **Pokémon Champions VGC** (doubles). Runs entirely in the browser — open it on
GitHub Pages, no install.

**Features**
* **Defense** — type chart for your six that counts abilities and items (Levitate, Thick Fat, Lightning Rod,
  Water/Volt Absorb, Flash Fire, Sap Sipper, Filter, Air Balloon…), weak/resist/immune totals, types nobody
  resists, stacked weaknesses, and meta Pokémon that would patch the holes.
* **Offense** — best move of each Pokémon into every type, and how much of the real meta (with their abilities
  and items) your team hits super-effectively; who walls you.
* **Meta matchups** — for each of your Pokémon, against the top 60 by usage (most common set each):
  % of the meta you OHKO / 2HKO, % that OHKO / 2HKO you, % you outspeed. Weather/terrain toggles, per-opponent detail.
* **Speed tiers** — the meta's common speeds (and Scarf versions) with your team slotted in, Tailwind toggle.
* **Archetypes** — rain, sun, sand, Trick Room, Tailwind, Sneasler/Kingambit/Basculegion, Perish trap, set-up,
  Fake Out + redirection: a checklist of the tools you have against each, plus damage both ways.
* **Spread finder** — goals like "survive Garchomp's Rock Slide", "outspeed X", "OHKO Y"; finds the cheapest
  Stat Point spread and nature, and can suggest goals from the meta.
* **Bring 4** — enter their six, get a 1-on-1 matrix and a suggested four.
* Showdown/Champions paste import & export, share links, team saved in the browser.

Mechanics: Lv 50, 31 IVs, 66 Stat Points (max 32 per stat, 1 SP = +1 stat), Champions move data.
Damage formula ported from the Champ Assist engine.

## Updating for a new regulation (e.g. M-D)
1. In the Champ Assist project (`champ-assist/data-pipeline`), update the regulation file / format ids and run
   `1-build-game-data.bat` so `app/src/main/assets/dex.json` has the new regulation and usage stats.
2. In this repo: `node tools/build-site-data.mjs ..\champ-assist\app\src\main\assets\dex.json . --default`
   (writes `data/m-d.json` and adds it to `data/regulations.json`; `--default` makes it the one that opens first).
3. Commit and push. Older regulations stay selectable in the picker.
4. New archetypes or members: edit `js/archetypes.js` (members not in the regulation are skipped automatically).

## Run locally
Any static server, e.g. `python -m http.server` in this folder, then open http://localhost:8000
(opening index.html as a file won't load the data).

Usage data: Smogon Champions VGC usage statistics. Not affiliated with Nintendo, The Pokémon Company or Game Freak.
