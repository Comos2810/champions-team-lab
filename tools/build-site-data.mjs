// Builds the team-builder website's data file for one regulation from the app's dex.json.
//   node tools/build-site-data.mjs [path/to/dex.json] [siteDir] [--default]
// (defaults: ../champ-assist/app/src/main/assets/dex.json next to this repo, and this repo)
// Writes <siteDir>/data/<reg>.json (e.g. m-c.json) and adds/updates the entry in <siteDir>/data/regulations.json.
// New regulation (e.g. M-D): update regulation-mc.json -> regulation-md.json + format ids, run build-data.mjs,
// then this script. The site's regulation picker lists every file in regulations.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dexPath = process.argv[2] || path.join(here, '../../champ-assist/app/src/main/assets/dex.json');
const siteDir = process.argv[3] || path.join(here, '..');
const dex = JSON.parse(fs.readFileSync(dexPath, 'utf8'));
const reg = dex.meta.regulation;                     // "M-C"
const slug = reg.toLowerCase();

const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const topN = (obj, n, min = 0) => Object.fromEntries(Object.entries(obj || {}).sort((a, b) => b[1] - a[1])
  .filter(([, v]) => v >= min).slice(0, n).map(([k, v]) => [k, round(v)]));

// species: everything in the Champions dex (legal roster), trimmed
const species = {};
for (const [id, s] of Object.entries(dex.species)) {
  species[id] = { n: s.name, t: s.types, bs: [s.bs.hp, s.bs.atk, s.bs.def, s.bs.spa, s.bs.spd, s.bs.spe],
    ab: s.abilities, w: s.weightkg, base: s.baseSpecies };
  if (s.forme) species[id].f = s.forme;
  if (s.requiredItem) species[id].ri = s.requiredItem;
  if (s.movePool) species[id].mp = s.movePool;
}
// moves: only fields the calculator needs
const moves = {};
for (const [id, m] of Object.entries(dex.moves)) {
  const f = m.flags || {};
  const o = { n: m.name, t: m.type, c: m.category === 'Physical' ? 0 : m.category === 'Special' ? 1 : 2,
    bp: m.basePower || 0, acc: m.accuracy === true ? 0 : m.accuracy, pr: m.priority || 0, tg: m.target };
  const fl = ['contact', 'sound', 'punch', 'bite', 'slicing', 'pulse', 'wind', 'bullet'].filter(k => f[k]);
  if (fl.length) o.fl = fl;
  if (m.multihit) o.mh = Array.isArray(m.multihit) ? m.multihit : [m.multihit, m.multihit];
  if (m.recoil) o.rc = 1;
  if (m.secondary || (m.secondaries && m.secondaries.length)) o.sec = 1;
  if (m.ignoreAbility) o.ia = 1;
  if (m.overrideDefensiveStat === 'def') o.ods = 1;
  if (m.overrideOffensiveStat) o.oos = m.overrideOffensiveStat;
  if (m.overrideOffensivePokemon === 'target') o.oop = 1;
  if (m.willCrit) o.crit = 1;
  moves[id] = o;
}
const items = Object.fromEntries(Object.entries(dex.items).map(([id, i]) => [id, i.name]));
const abilities = Object.fromEntries(Object.entries(dex.abilities).map(([id, a]) => [id, { n: a.name, d: a.desc || '' }]));
// usage: top sets of each Pokémon in the stats
const usage = {};
for (const [id, u] of Object.entries(dex.usage)) {
  if (!species[id] || u.usage < 0.003) continue;
  usage[id] = { u: round(u.usage), ab: topN(u.abilities, 3, 0.02), it: topN(u.items, 5, 0.02), mv: topN(u.moves, 10, 0.04),
    sp: topN(u.spreads, 4, 0.01), tm: topN(u.teammates, 10, 0.02) };
}
const out = { reg, builtAt: new Date().toISOString(), source: dex.meta.usageSource, rules: dex.meta.rules,
  mechanicsNotes: dex.meta.mechanicsNotes, typeChart: dex.typeChart, species, moves, items, abilities, usage };
fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
fs.writeFileSync(path.join(siteDir, 'data', slug + '.json'), JSON.stringify(out));
const regFile = path.join(siteDir, 'data', 'regulations.json');
let regs = fs.existsSync(regFile) ? JSON.parse(fs.readFileSync(regFile, 'utf8')) : { default: slug, list: [] };
regs.list = regs.list.filter(r => r.id !== slug);
regs.list.push({ id: slug, name: 'Regulation ' + reg, usageMonth: (dex.meta.usageSource || '').match(/\d{4}-\d{2}/)?.[0] || '', built: out.builtAt });
regs.list.sort((a, b) => a.id.localeCompare(b.id));
if (process.argv.includes('--default')) regs.default = slug;
fs.writeFileSync(regFile, JSON.stringify(regs, null, 1));
console.log(`wrote data/${slug}.json (${Math.round(JSON.stringify(out).length / 1024)} KB), ${Object.keys(usage).length} Pokémon with usage`);
