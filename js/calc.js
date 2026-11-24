// Champions damage / stat calculator (port of Champ Assist's Damage.java). Level 50, 31 IVs, Stat Points (SP).
'use strict';
const Calc = (() => {
  const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying',
    'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const NATURES = {
    Hardy: [], Docile: [], Serious: [], Bashful: [], Quirky: [],
    Lonely: [1, 2], Brave: [1, 5], Adamant: [1, 3], Naughty: [1, 4],
    Bold: [2, 1], Relaxed: [2, 5], Impish: [2, 3], Lax: [2, 4],
    Timid: [5, 1], Hasty: [5, 2], Jolly: [5, 3], Naive: [5, 4],
    Modest: [3, 1], Mild: [3, 2], Quiet: [3, 5], Rash: [3, 4],
    Calm: [4, 1], Gentle: [4, 2], Sassy: [4, 5], Careful: [4, 3],
  };
  let D = null; // regulation data
  const toId = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function stat(i, base, sp, nature) {
    const core = Math.floor((2 * base + 31) / 2);
    if (i === 0) return base === 1 ? 1 : core + 60 + sp;
    let v = core + 5 + sp;
    const n = NATURES[nature] || [];
    if (n[0] === i) v = Math.floor(v * 110 / 100); else if (n[1] === i) v = Math.floor(v * 90 / 100);
    return v;
  }

  /** A battle-ready Pokémon from a set {species, item, ability, nature, sp:[6], moves:[ids]} */
  function mon(set) {
    const s = D.species[toId(set.species)];
    if (!s) return null;
    const sp = set.sp || [0, 0, 0, 0, 0, 0];
    const stats = s.bs.map((b, i) => stat(i, b, sp[i] || 0, set.nature));
    // a Mega always has its Mega ability; otherwise keep the chosen one if this species can have it
    const ab = s.ri || !s.ab.some(a => toId(a) === toId(set.ability)) ? toId(s.ab[0]) : toId(set.ability);
    return { id: toId(set.species), s, types: s.t, stats, maxHp: stats[0], hp: stats[0], item: toId(set.item),
      ability: ab, nature: set.nature, sp, moves: (set.moves || []).map(toId).filter(m => D.moves[m]),
      boosts: [0, 0, 0, 0, 0, 0], status: null };
  }

  const pokeRound = x => Math.ceil(x - 0.5);
  const applyMod = (v, m) => pokeRound(v * m / 4096);
  const chain = (a, b) => Math.floor((a * b + 2048) / 4096);
  const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  const has = (m, a) => m.ability === a;
  const hasType = (m, t) => m.types.includes(t);
  const flag = (mv, f) => !!(mv.fl && mv.fl.includes(f));

  function grounded(m) {
    if (m.item === 'ironball') return true;
    if (hasType(m, 'Flying')) return false;
    if (['levitate', 'levitationboost', 'eelevate'].includes(m.ability)) return false;
    return m.item !== 'airballoon';
  }

  function moveType(mv, mid, a, f) {
    let t = mv.t;
    if (mid === 'weatherball') t = { sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice' }[f.weather] || t;
    if (mid === 'terrainpulse' && f.terrain && grounded(a)) t = { electric: 'Electric', grassy: 'Grass', psychic: 'Psychic', misty: 'Fairy' }[f.terrain];
    if (t === 'Normal' && mv.c !== 2) {
      t = { pixilate: 'Fairy', aerilate: 'Flying', refrigerate: 'Ice', galvanize: 'Electric', dragonize: 'Dragon', dragonsskin: 'Dragon' }[a.ability] || t;
    }
    return t;
  }

  /** Type effectiveness of an attacking type into a defender, with immunity abilities when `abilities` is true. */
  function typeEff(type, d, opts = {}) {
    let e = 1;
    for (const dt of d.types) {
      let x = D.typeChart[type]?.[dt] ?? 1; // typeChart[attacking][defending]
      if (x === 0 && dt === 'Ghost' && (type === 'Normal' || type === 'Fighting') && opts.scrappy) x = 1;
      if (x === 0 && dt === 'Flying' && type === 'Ground' && d.item === 'ironball') x = 1;
      if (opts.freezedry && dt === 'Water') x = 2;
      e *= x;
    }
    if (type === 'Ground' && !grounded(d) && !opts.thousandarrows) e = 0;
    return e;
  }

  // abilities / items that change what a type does to the holder (for the type chart; damage() handles them too)
  const ABILITY_TYPE = {
    levitate: { Ground: 0 }, eelevate: { Ground: 0 }, levitationboost: { Ground: 0 }, earthEater: { Ground: 0 }, eartheater: { Ground: 0 },
    flashfire: { Fire: 0 }, wellbakedbody: { Fire: 0 }, waterabsorb: { Water: 0 }, stormdrain: { Water: 0 }, dryskin: { Water: 0, Fire: 1.25 },
    voltabsorb: { Electric: 0 }, lightningrod: { Electric: 0 }, motordrive: { Electric: 0 }, sapsipper: { Grass: 0 },
    thickfat: { Fire: 0.5, Ice: 0.5 }, heatproof: { Fire: 0.5 }, waterbubble: { Fire: 0.5 }, purifyingsalt: { Ghost: 0.5 },
    fluffy: { Fire: 2 }, windrider: {}, // wind moves only
  };
  const FILTER = ['filter', 'solidrock', 'prismarmor'];

  /** Multiplier a type does to this Pokémon including ability/item (used by the defensive chart). */
  function defMult(type, m) {
    let e = typeEff(type, m);
    const ab = ABILITY_TYPE[m.ability];
    if (ab && type in ab) e = ab[type] === 0 ? 0 : e * ab[type];
    if (e > 1 && FILTER.includes(m.ability)) e *= 0.75;
    if (e === 0) return 0;
    if ((m.ability === 'wonderguard') && e <= 1) return 0;
    if (m.item === 'airballoon' && type === 'Ground') return 0;
    return e;
  }
  function defNote(type, m) {
    const plain = typeEff(type, { ...m, ability: '', item: m.item === 'ironball' ? 'ironball' : '' });
    const now = defMult(type, m);
    if (plain === now) return '';
    if (m.item === 'airballoon' && type === 'Ground') return D.items.airballoon;
    return D.abilities[m.ability]?.n || m.ability;
  }

  const TYPE_ITEMS = { silkscarf: 'Normal', charcoal: 'Fire', mysticwater: 'Water', magnet: 'Electric', miracleseed: 'Grass',
    nevermeltice: 'Ice', blackbelt: 'Fighting', poisonbarb: 'Poison', softsand: 'Ground', sharpbeak: 'Flying', twistedspoon: 'Psychic',
    silverpowder: 'Bug', hardstone: 'Rock', spelltag: 'Ghost', dragonfang: 'Dragon', blackglasses: 'Dark', metalcoat: 'Steel', fairyfeather: 'Fairy' };
  const BERRIES = { occaberry: 'Fire', passhoberry: 'Water', wacanberry: 'Electric', rindoberry: 'Grass', yacheberry: 'Ice', chopleberry: 'Fighting',
    kebiaberry: 'Poison', shucaberry: 'Ground', cobaberry: 'Flying', payapaberry: 'Psychic', tangaberry: 'Bug', chartiberry: 'Rock',
    kasibberry: 'Ghost', habanberry: 'Dragon', colburberry: 'Dark', babiriberry: 'Steel', roseliberry: 'Fairy' };

  function basePower(mv, mid, a, d, f) {
    const bp = mv.bp;
    switch (mid) {
      case 'eruption': case 'waterspout': case 'dragonenergy': return Math.max(1, Math.floor(150 * a.hp / a.maxHp));
      case 'lowkick': case 'grassknot': { const w = d.s.w; return w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20; }
      case 'heavyslam': case 'heatcrash': { const r = a.s.w / Math.max(0.1, d.s.w); return r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; }
      case 'weatherball': return f.weather ? 100 : 50;
      case 'knockoff': return d.item && !d.item.endsWith('ite') ? Math.floor(bp * 3 / 2) : bp;
      case 'acrobatics': return a.item ? bp : bp * 2;
      case 'lastrespects': return 50 + 50 * (f.fainted || 0);
      case 'ragefist': return 50;
      default: return bp;
    }
  }

  /**
   * Damage of one hit. f = field {weather, terrain, spread, crit, helped, screen, roll(0..15)}.
   * Returns integer HP damage (0 = immune / no effect).
   */
  function damage(a, d, mid, f = {}) {
    const mv = D.moves[mid];
    if (!mv || mv.c === 2) return 0;
    const type = moveType(mv, mid, a, f);
    const ignoreAb = ['moldbreaker', 'teravolt', 'turboblaze'].includes(a.ability) || mv.ia;
    const dAb = ignoreAb ? '' : d.ability;
    let eff = typeEff(type, d, { scrappy: ['scrappy', 'mindseye'].includes(a.ability), freezedry: mid === 'freezedry', thousandarrows: mid === 'thousandarrows' });
    // immunity abilities
    const imm = ABILITY_TYPE[dAb];
    if (imm && imm[type] === 0) return 0;
    if (dAb === 'windrider' && flag(mv, 'wind')) return 0;
    if (dAb === 'bulletproof' && flag(mv, 'bullet')) return 0;
    if (dAb === 'soundproof' && flag(mv, 'sound')) return 0;
    if (dAb === 'wonderguard' && eff <= 1) return 0;
    if (type === 'Ground' && d.item === 'airballoon' && mid !== 'thousandarrows') return 0;
    if (eff === 0) return 0;
    if (mid === 'seismictoss' || mid === 'nightshade') return 50;
    if (mid === 'superfang' || mid === 'ruination') return Math.max(1, Math.floor(d.hp / 2));

    let bp = basePower(mv, mid, a, d, f);
    if (bp <= 0) return 0;
    let bpMod = 4096;
    if (f.helped) bpMod = chain(bpMod, 6144);
    if (has(a, 'technician') && bp <= 60) bpMod = chain(bpMod, 6144);
    if (has(a, 'toughclaws') && flag(mv, 'contact')) bpMod = chain(bpMod, 5325);
    if (has(a, 'sheerforce') && mv.sec) bpMod = chain(bpMod, 5325);
    if (has(a, 'ironfist') && flag(mv, 'punch')) bpMod = chain(bpMod, 4915);
    if (has(a, 'strongjaw') && flag(mv, 'bite')) bpMod = chain(bpMod, 6144);
    if (has(a, 'sharpness') && flag(mv, 'slicing')) bpMod = chain(bpMod, 6144);
    if (has(a, 'megalauncher') && flag(mv, 'pulse')) bpMod = chain(bpMod, 6144);
    if (has(a, 'punkrock') && flag(mv, 'sound')) bpMod = chain(bpMod, 5325);
    if (has(a, 'reckless') && mv.rc) bpMod = chain(bpMod, 4915);
    if (mv.t === 'Normal' && type !== 'Normal' && ['pixilate', 'aerilate', 'refrigerate', 'galvanize', 'dragonize', 'dragonsskin'].includes(a.ability)) bpMod = chain(bpMod, 4915);
    if (has(a, 'sandforce') && f.weather === 'sand' && ['Rock', 'Ground', 'Steel'].includes(type)) bpMod = chain(bpMod, 5325);
    if (dAb === 'dryskin' && type === 'Fire') bpMod = chain(bpMod, 5120);
    if (TYPE_ITEMS[a.item] === type) bpMod = chain(bpMod, 4915);
    if (a.item === 'muscleband' && mv.c === 0) bpMod = chain(bpMod, 4505);
    if (a.item === 'wiseglasses' && mv.c === 1) bpMod = chain(bpMod, 4505);
    if (f.terrain) {
      const ag = grounded(a), dg = grounded(d);
      if (f.terrain === 'electric' && type === 'Electric' && ag) bpMod = chain(bpMod, 5325);
      if (f.terrain === 'grassy' && type === 'Grass' && ag) bpMod = chain(bpMod, 5325);
      if (f.terrain === 'psychic' && type === 'Psychic' && ag) bpMod = chain(bpMod, 5325);
      if (f.terrain === 'misty' && type === 'Dragon' && dg) bpMod = chain(bpMod, 2048);
      if (f.terrain === 'grassy' && dg && (mid === 'earthquake' || mid === 'bulldoze')) bpMod = chain(bpMod, 2048);
    }
    bp = Math.max(1, applyMod(bp, bpMod));

    const physical = mv.c === 0;
    const src = mv.oop ? d : a;
    const atkI = mv.oos === 'def' ? 2 : physical ? 1 : 3;
    let aStage = src.boosts[atkI];
    if (dAb === 'unaware') aStage = 0;
    if (f.crit && aStage < 0) aStage = 0;
    let A = Math.floor(src.stats[atkI] * stageMult(aStage));
    const defI = (physical || mv.ods) ? 2 : 4;
    let dStage = d.boosts[defI];
    if (has(a, 'unaware')) dStage = 0;
    if (f.crit && dStage > 0) dStage = 0;
    let Df = Math.floor(d.stats[defI] * stageMult(dStage));

    let aMod = 4096;
    if (physical && (has(a, 'hugepower') || has(a, 'purepower'))) aMod = chain(aMod, 8192);
    if (physical && has(a, 'hustle')) aMod = chain(aMod, 6144);
    if (!physical && has(a, 'solarpower') && f.weather === 'sun') aMod = chain(aMod, 6144);
    if (['thickfat'].includes(dAb) && (type === 'Fire' || type === 'Ice')) aMod = chain(aMod, 2048);
    if (['waterbubble', 'heatproof'].includes(dAb) && type === 'Fire') aMod = chain(aMod, 2048);
    if (dAb === 'purifyingsalt' && type === 'Ghost') aMod = chain(aMod, 2048);
    if (has(a, 'waterbubble') && type === 'Water') aMod = chain(aMod, 8192);
    if (has(a, 'transistor') && type === 'Electric') aMod = chain(aMod, 5325);
    if (has(a, 'dragonsmaw') && type === 'Dragon') aMod = chain(aMod, 6144);
    if (has(a, 'steelworker') && type === 'Steel') aMod = chain(aMod, 6144);
    if (a.item === 'choiceband' && physical) aMod = chain(aMod, 6144);
    if (a.item === 'choicespecs' && !physical) aMod = chain(aMod, 6144);
    A = Math.max(1, applyMod(A, aMod));
    let dMod = 4096;
    if (f.weather === 'sand' && hasType(d, 'Rock') && defI === 4) dMod = chain(dMod, 6144);
    if (f.weather === 'snow' && hasType(d, 'Ice') && defI === 2) dMod = chain(dMod, 6144);
    if (dAb === 'furcoat' && defI === 2) dMod = chain(dMod, 8192);
    if (d.item === 'assaultvest' && defI === 4) dMod = chain(dMod, 6144);
    if (d.item === 'eviolite') dMod = chain(dMod, 6144);
    Df = Math.max(1, applyMod(Df, dMod));

    let base = Math.floor(Math.floor(22 * bp * A / Df) / 50) + 2;
    if (f.spread) base = applyMod(base, 3072);
    const sunLike = f.weather === 'sun' || ['megasun', 'megasol'].includes(a.ability);
    if (sunLike && type === 'Fire') base = applyMod(base, 6144);
    else if (sunLike && type === 'Water' && mid !== 'hydrosteam') base = applyMod(base, 2048);
    else if (f.weather === 'rain' && type === 'Water') base = applyMod(base, 6144);
    else if (f.weather === 'rain' && type === 'Fire') base = applyMod(base, 2048);
    if (f.crit) base = Math.floor(base * (has(a, 'sniper') ? 2.25 : 1.5));
    base = Math.floor(base * (85 + (f.roll ?? 15)) / 100);
    if (hasType(a, type)) base = applyMod(base, has(a, 'adaptability') ? 8192 : 6144);
    base = Math.floor(base * eff);
    if (a.status === 'brn' && physical && !has(a, 'guts')) base = applyMod(base, 2048);
    let fMod = 4096;
    if (!f.crit && f.screen) fMod = chain(fMod, 2732);
    if (['multiscale', 'shadowshield'].includes(dAb) && d.hp === d.maxHp) fMod = chain(fMod, 2048);
    if (FILTER.includes(dAb) && eff > 1) fMod = chain(fMod, 3072);
    if (dAb === 'fluffy' && flag(mv, 'contact')) fMod = chain(fMod, 2048);
    if (dAb === 'fluffy' && type === 'Fire') fMod = chain(fMod, 8192);
    if (dAb === 'icescales' && !physical) fMod = chain(fMod, 2048);
    if (has(a, 'tintedlens') && eff < 1) fMod = chain(fMod, 8192);
    if (a.item === 'expertbelt' && eff > 1) fMod = chain(fMod, 4915);
    if (a.item === 'lifeorb') fMod = chain(fMod, 5324);
    if (eff > 1 && BERRIES[d.item] === type) fMod = chain(fMod, 2048);
    base = applyMod(base, fMod);
    return Math.max(1, base);
  }

  const isSpread = mv => mv.tg === 'allAdjacentFoes' || mv.tg === 'allAdjacent';

  /** {lo, hi} as fraction of the defender's max HP, all hits of multi-hit moves. Spread moves get the doubles 0.75. */
  function range(a, d, mid, f = {}) {
    const mv = D.moves[mid];
    if (!mv) return { lo: 0, hi: 0 };
    const ff = { ...f, spread: f.spread ?? isSpread(mv) };
    const lo = damage(a, d, mid, { ...ff, roll: 0 }), hi = damage(a, d, mid, { ...ff, roll: 15 });
    const nLo = mv.mh ? (has(a, 'skilllink') ? mv.mh[1] : mv.mh[0]) : 1, nHi = mv.mh ? mv.mh[1] : 1;
    const acc = mv.acc === 0 || has(a, 'noguard') ? 1 : mv.acc / 100;
    return { lo: lo * nLo / d.maxHp, hi: hi * nHi / d.maxHp, acc };
  }

  /** Hits to KO from full HP (using average of the roll range, Sash/Sturdy not counted). */
  function hitsToKo(r) {
    if (r.hi <= 0) return Infinity;
    const avg = (r.lo + r.hi) / 2;
    if (r.lo >= 1) return 1;
    if (r.hi >= 1) return 1.5; // possible OHKO
    return Math.ceil(1 / avg - 1e-9);
  }

  function speed(m, f = {}) {
    let s = Math.floor(m.stats[5] * stageMult(m.boosts[5]));
    if (f.tailwind) s *= 2;
    if (m.item === 'choicescarf') s = Math.floor(s * 1.5);
    if (m.item === 'ironball') s = Math.floor(s / 2);
    const w = f.weather;
    if ((has(m, 'chlorophyll') && w === 'sun') || (has(m, 'swiftswim') && w === 'rain') || (has(m, 'sandrush') && w === 'sand') || (has(m, 'slushrush') && w === 'snow')) s *= 2;
    if (f.par) s = Math.floor(s / 2);
    return s;
  }

  return { TYPES, STATS, NATURES, toId, stat, mon, damage, range, hitsToKo, typeEff, defMult, defNote, speed, grounded, isSpread,
    set data(d) { D = d; }, get data() { return D; } };
})();
