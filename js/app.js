'use strict';
// Champions Team Lab — UI. Everything runs in the browser from data/<regulation>.json.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toId = Calc.toId;
  const pct = x => (100 * x).toFixed(0) + '%';
  const typeChip = t => `<span class="type t-${t}">${t}</span>`;
  const STAT_LABEL = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
  const MAX_SP = 66, MAX_STAT_SP = 32;
  let D = null, regId = null, regs = null;
  let team = [];          // [{species,item,ability,nature,sp:[6],moves:[4]}], 6 slots (empty species allowed)
  let tab = 'defense';
  let metaCache = null;   // computed meta sets

  // ------------------------------------------------------------------ data loading
  async function loadRegs() {
    regs = await (await fetch('data/regulations.json')).json();
    const sel = $('#reg');
    sel.innerHTML = regs.list.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    const want = new URLSearchParams(location.search).get('reg') || localStorage.getItem('ctl.reg') || regs.default;
    sel.value = regs.list.some(r => r.id === want) ? want : regs.default;
    sel.onchange = () => loadReg(sel.value);
    await loadReg(sel.value);
  }
  async function loadReg(id) {
    regId = id;
    localStorage.setItem('ctl.reg', id);
    D = await (await fetch(`data/${id}.json`)).json();
    Calc.data = D;
    metaCache = null;
    const r = regs.list.find(x => x.id === id);
    $('#regInfo').textContent = `usage ${r?.usageMonth || '?'}`;
    $('#buildInfo').textContent = `Data built ${D.builtAt.slice(0, 10)}.`;
    buildDatalists();
    loadTeam();
    renderSlots();
    render();
  }

  // Suggestion lists. Not <datalist>: on phones it opens a full-screen picker that hides the keyboard.
  const AC = { species: [], items: [] };
  function buildDatalists() {
    AC.species = Object.values(D.species).map(s => s.n).sort();
    AC.items = Object.values(D.items).sort();
  }
  /** Type-to-filter suggestions under an input; picking one sets the value and fires 'change'. */
  function autocomplete(input, options) {
    const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    let box = null, items = [], sel = -1;
    const close = () => { box?.remove(); box = null; sel = -1; };
    const pick = val => { input.value = val; close(); input.dispatchEvent(new Event('change')); };
    const open = () => {
      const q = norm(input.value);
      const opts = typeof options === 'function' ? options() : options;
      items = (q ? [...opts.filter(o => norm(o).startsWith(q)), ...opts.filter(o => !norm(o).startsWith(q) && norm(o).includes(q))] : opts).slice(0, 8);
      close();
      if (!items.length || (items.length === 1 && items[0] === input.value)) return;
      box = document.createElement('div');
      box.className = 'ac';
      items.forEach((o, i) => {
        const d = document.createElement('div');
        d.textContent = o;
        d.onpointerdown = e => { e.preventDefault(); pick(o); };
        box.append(d);
      });
      const r = input.getBoundingClientRect();
      Object.assign(box.style, { left: r.left + scrollX + 'px', top: r.bottom + scrollY + 2 + 'px', minWidth: Math.max(r.width, 160) + 'px' });
      document.body.append(box);
    };
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', open);
    input.addEventListener('focus', () => { if (input.value === '') open(); });
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', e => {
      if (!box) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        [...box.children].forEach((c, i) => c.classList.toggle('on', i === sel));
      } else if (e.key === 'Enter') { e.preventDefault(); pick(items[Math.max(0, sel)]); }
      else if (e.key === 'Escape') close();
    });
  }

  // ------------------------------------------------------------------ team state
  const emptySet = () => ({ species: '', item: '', ability: '', nature: 'Hardy', sp: [0, 0, 0, 0, 0, 0], moves: ['', '', '', ''], boosts: [0, 0, 0, 0, 0, 0] });
  function loadTeam() {
    const fromHash = decodeTeam(location.hash.slice(1));
    let t = fromHash;
    if (!t) try { t = JSON.parse(localStorage.getItem('ctl.team.' + regId) || 'null'); } catch { t = null; }
    team = (t || []).slice(0, 6);
    while (team.length < 6) team.push(emptySet());
  }
  function saveTeam() {
    localStorage.setItem('ctl.team.' + regId, JSON.stringify(team));
    metaMatchCache.clear();
  }
  function encodeTeam() {
    const compact = team.filter(s => s.species).map(s => [s.species, s.item, s.ability, s.nature, s.sp.join('.'), s.moves.join('|'), (s.boosts || []).join('.')]);
    return btoa(unescape(encodeURIComponent(JSON.stringify(compact)))).replace(/=+$/, '');
  }
  function decodeTeam(str) {
    if (!str) return null;
    try {
      const arr = JSON.parse(decodeURIComponent(escape(atob(str))));
      return arr.map(([species, item, ability, nature, sp, moves, boosts]) => ({ species, item, ability, nature, sp: sp.split('.').map(Number), moves: moves.split('|'), boosts: boosts ? boosts.split('.').map(Number) : [0, 0, 0, 0, 0, 0] }));
    } catch { return null; }
  }
  const filled = () => team.filter(s => D.species[toId(s.species)]);
  const mons = () => filled().map(s => Calc.mon(s));

  // ------------------------------------------------------------------ team slots UI
  function renderSlots() {
    const box = $('#slots');
    box.innerHTML = '';
    team.forEach((set, i) => box.append(slotCard(set, i)));
  }
  function slotCard(set, i) {
    const sp = D.species[toId(set.species)];
    const el = h(`<div class="slot">
      <div class="row"><input class="species" placeholder="Pokémon ${i + 1}" value="${esc(set.species)}">
        <span class="types">${sp ? sp.t.map(typeChip).join('') : ''}</span>
        ${sp ? `<button class="small fill" title="Fill item, ability, spread and moves with the most common set">Common set</button>` : ''}</div>
      ${sp ? `
      <div class="row">
        <select class="ability">${sp.ab.map(a => `<option ${toId(a) === toId(set.ability) ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <input class="item" placeholder="Item" value="${esc(set.item)}" style="flex:1;min-width:90px">
        <select class="nature">${Object.keys(Calc.NATURES).map(n => `<option ${n === set.nature ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="sp">${STAT_LABEL.map((l, k) => `<label>${l}<input type="number" min="0" max="32" value="${set.sp[k] || 0}" data-k="${k}"><span class="stat"></span></label>`).join('')}</div>
      <div class="row muted" style="justify-content:space-between"><span class="total"></span><span class="nat"></span></div>
      <div class="stages" title="Stat stages (boosts/drops) used in Meta matchups, Speed tiers, Spread finder and Bring 4">
        <span class="muted">Stages</span>${[1, 2, 3, 4, 5].map(k => `<label>${STAT_LABEL[k]}<select data-b="${k}">${[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map(v => `<option value="${v}" ${(set.boosts?.[k] || 0) === v ? 'selected' : ''}>${v > 0 ? '+' + v : v}</option>`).join('')}</select></label>`).join('')}
        <button class="small ghost reset-b" title="Reset all stages to 0">0</button>
      </div>
      <div class="moves">${[0, 1, 2, 3].map(k => `<input class="move" data-k="${k}" placeholder="Move ${k + 1}" value="${esc(moveName(set.moves[k]))}">`).join('')}</div>` : ''}
    </div>`);
    const upd = () => { saveTeam(); updateStats(el, set); render(); };
    autocomplete($('.species', el), AC.species);
    if (sp) {
      autocomplete($('.item', el), AC.items);
      const pool = (sp.mp || Object.keys(D.moves)).map(m => D.moves[m]).filter(Boolean).map(m => m.n).sort();
      el.querySelectorAll('.move').forEach(inp => autocomplete(inp, pool));
    }
    $('.species', el).onchange = e => {
      const id = toId(e.target.value);
      Object.assign(set, emptySet(), { species: D.species[id] ? D.species[id].n : e.target.value });
      if (D.species[id]) fillCommon(set);
      saveTeam(); renderSlots(); render();
    };
    if (!sp) return el;
    $('.fill', el).onclick = () => { fillCommon(set); saveTeam(); renderSlots(); render(); };
    $('.ability', el).onchange = e => { set.ability = e.target.value; upd(); };
    $('.item', el).onchange = e => {
      const was = set.species; set.item = e.target.value; syncMega(set);
      if (set.species !== was) { saveTeam(); renderSlots(); render(); } else upd();
    };
    $('.nature', el).onchange = e => { set.nature = e.target.value; upd(); };
    el.querySelectorAll('.sp input').forEach(inp => inp.onchange = e => {
      set.sp[+e.target.dataset.k] = Math.max(0, Math.min(MAX_STAT_SP, +e.target.value || 0)); e.target.value = set.sp[+e.target.dataset.k]; upd();
    });
    el.querySelectorAll('[data-b]').forEach(sel => sel.onchange = e => {
      if (!set.boosts) set.boosts = [0, 0, 0, 0, 0, 0];
      set.boosts[+e.target.dataset.b] = +e.target.value; upd();
    });
    $('.reset-b', el).onclick = () => { set.boosts = [0, 0, 0, 0, 0, 0]; saveTeam(); renderSlots(); render(); };
    el.querySelectorAll('.move').forEach(inp => inp.onchange = e => { set.moves[+e.target.dataset.k] = toId(e.target.value); upd(); });
    updateStats(el, set);
    return el;
  }
  function updateStats(el, set) {
    const m = Calc.mon(set);
    if (!m) return;
    el.querySelectorAll('.sp .stat').forEach((s, k) => {
      const b = m.boosts[k];
      s.innerHTML = b ? `<span class="${b > 0 ? 'good' : 'bad'}">${Math.floor(m.stats[k] * Calc.stageMult(b))}</span>` : m.stats[k];
      s.title = b ? `${m.stats[k]} at ${b > 0 ? '+' : ''}${b}` : '';
    });
    el.querySelectorAll('[data-b]').forEach(sel => sel.classList.toggle('on', +sel.value !== 0));
    const tot = set.sp.reduce((a, b) => a + (+b || 0), 0);
    const t = $('.total', el);
    t.textContent = `${tot} / ${MAX_SP} SP`;
    t.classList.toggle('over', tot > MAX_SP);
    const n = Calc.NATURES[set.nature] || [];
    $('.nat', el).textContent = n.length ? `+${STAT_LABEL[n[0]]} −${STAT_LABEL[n[1]]}` : 'neutral';
  }
  const moveName = id => D.moves[toId(id)]?.n || id || '';

  /** Most common set from usage (item, ability, spread, 4 moves). */
  function commonSet(id) {
    const u = D.usage[id], s = D.species[id];
    const set = emptySet();
    set.species = s.n;
    if (!u) { set.ability = s.ab[0]; return set; }
    const top = o => Object.keys(o || {})[0];
    const ab = top(u.ab); set.ability = s.ab.find(a => toId(a) === ab) || s.ab[0];
    const it = top(u.it); set.item = it ? (D.items[it] || it) : '';
    const spr = top(u.sp);
    if (spr) { const [nat, nums] = spr.split(':'); set.nature = nat; set.sp = nums.split('/').map(Number); }
    set.moves = Object.keys(u.mv).slice(0, 4);
    while (set.moves.length < 4) set.moves.push('');
    return set;
  }
  /** Common set, turned into the Mega form when the common item is its Mega Stone (usage files Megas under the base). */
  function metaSet(id) {
    const set = commonSet(id);
    if (D.usage[id]) set.moves = Object.keys(D.usage[id].mv).filter(m => D.moves[m]);
    const megaId = Object.keys(D.species).find(k => D.species[k].ri && toId(D.species[k].ri) === toId(set.item) && toId(D.species[k].base) === id);
    if (megaId) { set.species = D.species[megaId].n; set.ability = D.species[megaId].ab[0]; }
    return { set, megaId };
  }
  function fillCommon(set) {
    const id = toId(set.species);
    if (!D.species[id]) return;
    Object.assign(set, commonSet(id));
    syncMega(set);
  }
  /** Base species id of a form (Charizard-Mega-Y -> charizard). */
  const baseId = id => D.species[id] ? toId(D.species[id].base || D.species[id].n) : id;
  /**
   * Holding its Mega Stone means the Pokémon battles as the Mega: switch the slot to the Mega form (its stats,
   * typing and ability). Taking the stone away switches back to the base form.
   */
  function syncMega(set) {
    const id = toId(set.species);
    if (!D.species[id]) return;
    const base = baseId(id);
    const mega = Object.keys(D.species).find(k => D.species[k].ri && toId(D.species[k].ri) === toId(set.item) && baseId(k) === base);
    if (mega && mega !== id) {
      if (!set.baseAbility && !D.species[id].ri) set.baseAbility = set.ability;
      set.species = D.species[mega].n; set.ability = D.species[mega].ab[0];
    } else if (!mega && D.species[id].ri) {
      set.species = D.species[base].n;
      set.ability = set.baseAbility || D.species[base].ab[0];
    }
  }

  // ------------------------------------------------------------------ paste import / export
  function parsePaste(text) {
    const out = [];
    for (let block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
      // also accept a paste squashed onto one line ("X @ Item Ability: A Level: 50 EVs: ... Modest Nature - Move - Move")
      block = block.replace(/\s+(Ability:|Level:|EVs:|SPs:|IVs:|Shiny:|Tera Type:|Happiness:)/g, '\n$1')
        .replace(/\s+(\w+ Nature)\b/g, '\n$1').replace(/\s+-\s+/g, '\n- ');
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const set = emptySet();
      let [first] = lines;
      const itemM = first.match(/@\s*(.+)$/);
      if (itemM) { set.item = itemM[1].trim(); first = first.replace(/@.+$/, '').trim(); }
      first = first.replace(/\((M|F)\)\s*$/, '').trim();
      const nick = first.match(/\(([^)]+)\)\s*$/);
      set.species = (nick ? nick[1] : first).trim();
      // "Raichu-Mega-Y @ Raichunite Y" style: species ids with a Mega forme keep it
      if (!D.species[toId(set.species)]) {
        const guess = Object.values(D.species).find(s => toId(s.n) === toId(set.species));
        if (guess) set.species = guess.n;
      }
      let mi = 0;
      for (const l of lines.slice(1)) {
        let m;
        if ((m = l.match(/^Ability:\s*(.+)/i))) set.ability = m[1];
        else if ((m = l.match(/^(?:EVs|SPs):\s*(.+)/i))) {
          for (const part of m[1].split('/')) {
            const pm = part.trim().match(/(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe)/i);
            if (pm) set.sp[['hp', 'atk', 'def', 'spa', 'spd', 'spe'].indexOf(pm[2].toLowerCase())] = Math.min(MAX_STAT_SP, +pm[1] > 32 ? Math.round(+pm[1] / 8) : +pm[1]);
          }
        } else if ((m = l.match(/^(\w+)\s+Nature/i))) set.nature = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        else if ((m = l.match(/^[-–]\s*(.+)/)) && mi < 4) set.moves[mi++] = toId(m[1]);
      }
      if (D.species[toId(set.species)]) { syncMega(set); out.push(set); }
    }
    return out;
  }
  function exportPaste() {
    return filled().map(s => {
      const sp = D.species[toId(s.species)];
      const name = sp && sp.ri ? D.species[baseId(toId(s.species))].n : s.species;
      const ability = sp && sp.ri ? (s.baseAbility || (sp.ab.some(a => toId(a) === toId(s.ability)) ? D.species[baseId(toId(s.species))].ab[0] : s.ability)) : s.ability;
      const lines = [`${name}${s.item ? ' @ ' + s.item : ''}`, `Ability: ${ability}`, 'Level: 50'];
      const evs = s.sp.map((v, k) => v ? `${v} ${STAT_LABEL[k]}` : null).filter(Boolean).join(' / ');
      if (evs) lines.push(`EVs: ${evs}`);
      lines.push(`${s.nature} Nature`);
      s.moves.filter(Boolean).forEach(m => lines.push(`- ${moveName(m)}`));
      return lines.join('\n');
    }).join('\n\n');
  }
  function toast(msg) { const t = h(`<div class="toast">${esc(msg)}</div>`); document.body.append(t); setTimeout(() => t.remove(), 1800); }

  $('#btnImport').onclick = () => {
    $('#pasteTitle').textContent = 'Import a Showdown / Champions paste';
    $('#pasteText').value = '';
    $('#pasteOk').style.display = '';
    $('#pasteDlg').showModal();
    $('#pasteDlg').onclose = () => {
      if ($('#pasteDlg').returnValue !== 'ok') return;
      const sets = parsePaste($('#pasteText').value);
      if (!sets.length) return toast('No Pokémon found in that paste');
      team = sets.slice(0, 6); while (team.length < 6) team.push(emptySet());
      saveTeam(); renderSlots(); render(); toast(`Imported ${sets.length} Pokémon`);
    };
  };
  $('#btnExport').onclick = () => {
    $('#pasteTitle').textContent = 'Your team (copy this)';
    $('#pasteText').value = exportPaste();
    $('#pasteOk').style.display = 'none';
    $('#pasteDlg').onclose = null;
    $('#pasteDlg').showModal();
    $('#pasteText').select();
  };
  $('#btnShare').onclick = async () => {
    const url = `${location.origin}${location.pathname}?reg=${regId}#${encodeTeam()}`;
    try { await navigator.clipboard.writeText(url); toast('Share link copied'); } catch { prompt('Share link', url); }
  };
  $('#btnClear').onclick = () => { if (!confirm('Clear all six slots?')) return; team = Array.from({ length: 6 }, emptySet); saveTeam(); renderSlots(); render(); };
  $('#tabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    render();
  };

  // ------------------------------------------------------------------ meta (common sets of the top Pokémon)
  function meta(n = 60) {
    if (metaCache && metaCache.n === n) return metaCache;
    const ids = Object.keys(D.usage).sort((a, b) => D.usage[b].u - D.usage[a].u).slice(0, n);
    const total = ids.reduce((s, id) => s + D.usage[id].u, 0);
    metaCache = ids.map(id => {
      const u = D.usage[id];
      const { set, megaId } = metaSet(id);
      const m = Calc.mon(set);
      return { id, megaId, name: megaId ? D.species[megaId].n : D.species[id].n, set, mon: m, w: u.u / total, usage: u.u,
        scarf: (u.it.choicescarf || 0) >= 0.2, moveUse: u.mv };
    });
    metaCache.n = n;
    return metaCache;
  }
  /** Speed of a meta Pokémon without a Scarf, and with one. Its common set may already hold the Scarf. */
  const plainSpeed = x => Calc.speed({ ...x.mon, item: x.mon.item === 'choicescarf' ? '' : x.mon.item });
  const scarfSpeed = x => Math.floor(plainSpeed(x) * 1.5);
  const isAttack = mid => D.moves[mid] && D.moves[mid].c !== 2 && (D.moves[mid].bp > 0 || ['seismictoss', 'nightshade', 'superfang', 'lowkick', 'grassknot', 'heavyslam', 'heatcrash'].includes(mid));
  /** Best attack of a against d: {mid, r (range), hits} */
  function bestHit(a, d, f, moveFilter) {
    let best = null;
    for (const mid of a.moves) {
      if (!isAttack(mid) || (moveFilter && !moveFilter(mid))) continue;
      const r = Calc.range(a, d, mid, f);
      const avg = (r.lo + r.hi) / 2 * (r.acc ?? 1);
      if (!best || avg > best.avg) best = { mid, r, avg };
    }
    return best;
  }
  /** chance (0..1) that k hits of range r KO from full (rolls treated as uniform) */
  function koChance(r, k) {
    const lo = r.lo * k, hi = r.hi * k;
    if (hi < 1) return 0; if (lo >= 1) return 1;
    return (hi - 1) / (hi - lo);
  }
  /**
   * The opponent as it is after the stat changes you chose for their side: manual stages, plus Intimidate with the
   * abilities/items that block or punish it (Defiant +2 Atk, Competitive +2 SpA, Clear Body, Inner Focus, White Herb...).
   */
  const INTIM_BLOCK = ['clearbody', 'whitesmoke', 'fullmetalbody', 'hypercutter', 'innerfocus', 'oblivious', 'owntempo', 'scrappy', 'mirrorarmor', 'guarddog'];
  function oppStaged(mon, f) {
    const b = (f.oppBoosts || [0, 0, 0, 0, 0, 0]).slice();
    let note = '';
    if (f.intim) {
      if (mon.ability === 'guarddog') { b[1] += 1; note = 'Guard Dog +1'; }
      else if (INTIM_BLOCK.includes(mon.ability)) note = (D.abilities[mon.ability]?.n || mon.ability) + ' blocks';
      else if (mon.item === 'whiteherb') note = 'White Herb';
      else {
        b[1] -= 1;
        if (mon.ability === 'defiant') { b[1] += 2; note = 'Defiant +2'; }
        if (mon.ability === 'competitive') { b[3] += 2; note = 'Competitive +2 SpA'; }
        if (mon.ability === 'rattled') { b[5] += 1; note = 'Rattled +1 Spe'; }
      }
    }
    const clamped = b.map((v, k) => Math.max(-6, Math.min(6, v + (mon.boosts[k] || 0))));
    return { mon: { ...mon, boosts: clamped }, note };
  }
  const metaMatchCache = new Map();
  function matchup(m, f) {
    const key = JSON.stringify([m.id, m.item, m.ability, m.nature, m.sp, m.moves, m.boosts, f]);
    if (metaMatchCache.has(key)) return metaMatchCache.get(key);
    const rows = meta().map(x => {
      const { mon: them, note } = oppStaged(x.mon, f);
      const mine = bestHit(m, them, f);
      // their moves: only ones at least 15% of them run
      const theirs = bestHit(them, m, f, mid => (x.moveUse[mid] || 0) >= 0.15);
      const sMe = Calc.speed(m, f), sThem = Calc.speed(them, {});
      return { x, note, mine, theirs, ohko: mine ? koChance(mine.r, 1) : 0, twohko: mine ? koChance(mine.r, 2) : 0,
        ohkoBack: theirs ? koChance(theirs.r, 1) : 0, twohkoBack: theirs ? koChance(theirs.r, 2) : 0,
        faster: sMe > sThem ? 1 : sMe === sThem ? 0.5 : 0, sMe, sThem: Math.floor(sThem) };
    });
    const sum = k => rows.reduce((s, r) => s + r[k] * r.x.w, 0);
    const res = { rows, ohko: sum('ohko'), twohko: sum('twohko'), ohkoBack: sum('ohkoBack'), twohkoBack: sum('twohkoBack'), faster: sum('faster') };
    metaMatchCache.set(key, res);
    return res;
  }

  // ------------------------------------------------------------------ views
  function render() {
    const v = $('#view');
    if (!D) return;
    const list = mons();
    if (!list.length && tab !== 'speed') { v.innerHTML = `<p class="muted">Add Pokémon above, or use <b>Import paste</b>. Picking a Pokémon fills in its most common set from usage.</p>`; return; }
    ({ defense: viewDefense, offense: viewOffense, meta: viewMeta, speed: viewSpeed, arch: viewArch, spread: viewSpread, bring: viewBring })[tab](v, list);
  }

  const multClass = x => x === 0 ? 'm0' : x >= 4 ? 'm4' : x > 1 ? 'm2' : x <= 0.25 ? 'm025' : x < 1 ? 'm05' : '';
  const multText = x => x === 1 ? '' : x === 0 ? '0' : x === 0.5 ? '½' : x === 0.25 ? '¼' : x === 0.375 ? '⅜' : x === 1.5 ? '1.5' : x === 3 ? '3' : String(+x.toFixed(2));

  function viewDefense(v, list) {
    const T = Calc.TYPES;
    let rows = '';
    const counts = T.map(() => ({ weak: 0, resist: 0, immune: 0 }));
    for (const m of list) {
      rows += `<tr><td class="name">${esc(m.s.n)}<br><span class="muted">${esc(D.abilities[m.ability]?.n || m.ability)}${m.item ? ' · ' + esc(D.items[m.item] || m.item) : ''}</span></td>`;
      T.forEach((t, k) => {
        const x = Calc.defMult(t, m), note = Calc.defNote(t, m);
        if (x > 1) counts[k].weak++; else if (x === 0) counts[k].immune++; else if (x < 1) counts[k].resist++;
        rows += `<td class="${multClass(x)}" title="${esc(note)}">${multText(x)}${note ? `<span class="cellnote">${esc(note)}</span>` : ''}</td>`;
      });
      rows += '</tr>';
    }
    const sumRow = (label, key, cls) => `<tr><td class="name"><b>${label}</b></td>${counts.map(c => `<td class="${c[key] ? cls : ''}">${c[key] || ''}</td>`).join('')}</tr>`;
    const unresisted = T.filter((t, k) => !counts[k].resist && !counts[k].immune);
    const stacked = T.filter((t, k) => counts[k].weak >= 3 || (counts[k].weak >= 2 && counts[k].weak > counts[k].resist + counts[k].immune));
    v.innerHTML = `
      <p class="muted">Each cell = damage multiplier of that attacking type into your Pokémon, <b>including abilities and items</b>
        (Levitate, Thick Fat, Lightning Rod, Water Absorb, Flash Fire, Filter, Air Balloon…). Hover a marked cell to see why.</p>
      <div class="scroll"><table><tr><th class="name">Pokémon</th>${T.map(t => `<th>${typeChip(t)}</th>`).join('')}</tr>
      ${rows}${sumRow('Weak', 'weak', 'm2')}${sumRow('Resist', 'resist', 'm05')}${sumRow('Immune', 'immune', 'm0')}</table></div>
      <div class="summary">
        <div class="card"><h3>Not resisted by anyone</h3><div class="chips">${unresisted.map(typeChip).join('') || '<span class="good">Every type is resisted or blocked by someone.</span>'}</div></div>
        <div class="card"><h3>Stacked weaknesses</h3><div class="chips">${stacked.map(t => typeChip(t) + `<span class="muted">×${counts[T.indexOf(t)].weak}</span>`).join(' ') || '<span class="good">None (no type hits 3+ or more than you cover)</span>'}</div></div>
        <div class="card"><h3>Ideas for a 6th / swap</h3><div>${suggestDefensive(unresisted, stacked)}</div></div>
      </div>`;
  }
  /** Meta Pokémon (by usage) whose own typing+ability resists the uncovered/stacked types. */
  function suggestDefensive(unresisted, stacked) {
    const want = [...new Set([...unresisted, ...stacked])];
    if (!want.length) return '<span class="muted">Nothing needed.</span>';
    const have = new Set(filled().map(s => toId(s.species)));
    const scored = meta().filter(x => !have.has(x.id)).map(x => {
      const covers = want.filter(t => Calc.defMult(t, x.mon) < 1);
      const adds = Calc.TYPES.filter(t => Calc.defMult(t, x.mon) > 1 && stacked.includes(t));
      return { x, covers, bad: adds.length, score: covers.length - adds.length * 1.5 + x.usage };
    }).filter(s => s.covers.length).sort((a, b) => b.score - a.score).slice(0, 6);
    return scored.map(s => `<div><b>${esc(s.x.name)}</b> <span class="muted">covers</span> ${s.covers.map(typeChip).join('')}</div>`).join('');
  }

  function viewOffense(v, list) {
    const T = Calc.TYPES;
    let rows = '';
    const teamBest = T.map(() => 0);
    for (const m of list) {
      rows += `<tr><td class="name">${esc(m.s.n)}</td>`;
      T.forEach((t, k) => {
        let best = 0, by = '';
        for (const mid of m.moves) {
          if (!isAttack(mid)) continue;
          const mv = D.moves[mid];
          const e = Calc.typeEff(mv.t, { types: [t], item: '', ability: '' }, { freezedry: mid === 'freezedry' });
          const ee = e * (m.types.includes(mv.t) ? 1.5 : 1);
          if (ee > best) { best = ee; by = mv.n; }
        }
        teamBest[k] = Math.max(teamBest[k], best);
        const eff = best / 1.5 >= 2 || best >= 2 ? best : best;
        rows += `<td class="${best >= 3 ? 'm05' : best >= 2 ? 'm05' : best === 0 ? 'm0' : best < 1 ? 'm2' : ''}" title="${esc(by)}">${best ? (+best.toFixed(2)) : '—'}</td>`;
      });
      rows += '</tr>';
    }
    // vs the meta, with their abilities (Levitate, Flash Fire...) and items (Air Balloon)
    const ms = meta();
    const vs = ms.map(x => {
      let best = 0, by = '';
      for (const m of list) for (const mid of m.moves) {
        if (!isAttack(mid)) continue;
        const r = Calc.range(m, x.mon, mid, {});
        const mv = D.moves[mid];
        const e = r.hi > 0 ? Calc.typeEff(mv.t, x.mon, { freezedry: mid === 'freezedry' }) : 0;
        const immune = r.hi === 0;
        const val = immune ? 0 : e;
        if (val > best) { best = val; by = `${m.s.n}: ${mv.n}`; }
      }
      return { x, best, by };
    });
    const se = vs.filter(r => r.best >= 2).reduce((s, r) => s + r.x.w, 0);
    const neutralOnly = vs.filter(r => r.best >= 1 && r.best < 2);
    const walls = vs.filter(r => r.best < 1);
    v.innerHTML = `
      <p class="muted">Table: best attack each Pokémon has into a pure-type target (number = type effectiveness × STAB). Hover for the move.</p>
      <div class="scroll"><table><tr><th class="name">Pokémon</th>${T.map(t => `<th>${typeChip(t)}</th>`).join('')}</tr>${rows}
        <tr><td class="name"><b>Team best</b></td>${teamBest.map(b => `<td class="${b >= 2 ? 'm05' : b < 1 ? 'm2' : ''}">${b ? +b.toFixed(2) : '—'}</td>`).join('')}</tr></table></div>
      <div class="summary">
        <div class="card"><h3>Meta hit super-effectively</h3><div class="pct" style="font-size:22px">${pct(se)}</div>
          <div class="muted">of the top ${ms.length} by usage (weighted), using their real typing, ability and item.</div></div>
        <div class="card"><h3>Only neutral damage on</h3>${neutralOnly.slice(0, 14).map(r => `<div>${esc(r.x.name)} <span class="muted">${pct(r.x.usage)} usage</span></div>`).join('') || '<span class="good">nobody</span>'}</div>
        <div class="card"><h3>Walls you (nothing neutral)</h3>${walls.map(r => `<div class="bad">${esc(r.x.name)} <span class="muted">${pct(r.x.usage)}</span></div>`).join('') || '<span class="good">nobody</span>'}</div>
      </div>`;
  }

  function fieldControls(f, onchange) {
    const box = h(`<div class="controls">
      <label>Weather <select data-k="weather"><option value="">none</option><option value="rain">rain</option><option value="sun">sun</option><option value="sand">sand</option><option value="snow">snow</option></select></label>
      <label>Terrain <select data-k="terrain"><option value="">none</option><option value="grassy">grassy</option><option value="electric">electric</option><option value="psychic">psychic</option><option value="misty">misty</option></select></label>
    </div>`);
    box.querySelectorAll('select').forEach(s => { s.value = f[s.dataset.k] || ''; s.onchange = () => { f[s.dataset.k] = s.value || undefined; onchange(); }; });
    return box;
  }
  const field = {};

  function viewMeta(v, list) {
    v.innerHTML = `<p class="muted">Against the top ${meta().length} Pokémon by usage (each with its most common item, ability, spread; their
      moves = everything at least 15% of them run). Stat stages you set on your Pokémon are used. Percentages are usage-weighted shares of the meta. OHKO/2HKO count damage rolls
      (no crits, Sash/Sturdy ignored); "back" = they do it to you with their best common move.</p>`;
    v.append(fieldControls(field, render));
    if (!field.oppBoosts) field.oppBoosts = [0, 0, 0, 0, 0, 0];
    const oc = h(`<div class="controls card"><b>Their side</b>
      <label title="Every opponent takes -1 Atk, except abilities/items that block or punish it"><input type="checkbox" id="oppIntim" ${field.intim ? 'checked' : ''}> Intimidated</label>
      <span class="muted">Stages:</span>${[1, 2, 3, 4, 5].map(k => `<label>${STAT_LABEL[k]} <select data-ob="${k}">${[6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map(n => `<option value="${n}" ${field.oppBoosts[k] === n ? 'selected' : ''}>${n > 0 ? '+' + n : n}</option>`).join('')}</select></label>`).join('')}
      <span class="muted">(Intimidate respects Defiant, Competitive, Clear Body, Inner Focus, Guard Dog, White Herb…)</span></div>`);
    oc.querySelector('#oppIntim').onchange = e => { field.intim = e.target.checked; render(); };
    oc.querySelectorAll('[data-ob]').forEach(sel => sel.onchange = e => { field.oppBoosts = field.oppBoosts.slice(); field.oppBoosts[+e.target.dataset.ob] = +e.target.value; render(); });
    v.append(oc);
    let html = `<div class="scroll"><table><tr><th class="name">Pokémon</th><th>You OHKO</th><th>You 2HKO</th><th>OHKO you</th><th>2HKO you</th><th>You outspeed</th></tr>`;
    const res = list.map(m => ({ m, r: matchup(m, field) }));
    for (const { m, r } of res) {
      const c = (x, good) => `<td class="pct ${good ? (x > 0.5 ? 'good' : '') : (x > 0.35 ? 'bad' : '')}">${pct(x)}</td>`;
      html += `<tr><td class="name">${esc(m.s.n)}</td>${c(r.ohko, 1)}${c(r.twohko, 1)}${c(r.ohkoBack, 0)}${c(r.twohkoBack, 0)}${c(r.faster, 1)}</tr>`;
    }
    html += '</table></div>';
    v.append(h(`<div>${html}</div>`));
    for (const { m, r } of res) {
      const det = h(`<details><summary><b>${esc(m.s.n)}</b> vs each meta Pokémon</summary></details>`);
      let t = `<div class="scroll"><table><tr><th class="name">Opponent</th><th>Usage</th><th>Your best</th><th>Dmg</th><th>Their best</th><th>Dmg</th><th>Speed (you / them)</th></tr>`;
      for (const row of r.rows) {
        const d = x => x ? `${pct(x.r.lo)}–${pct(x.r.hi)}` : '—';
        const cls = x => x ? (x.r.lo >= 1 ? 'bad' : x.r.hi >= 1 ? 'warn' : '') : '';
        t += `<tr><td class="name">${esc(row.x.name)}${row.note ? ` <span class="muted">(${esc(row.note)})</span>` : ''}</td><td>${pct(row.x.usage)}</td>
          <td>${row.mine ? esc(D.moves[row.mine.mid].n) : '—'}</td><td class="${row.mine && row.mine.r.lo >= 1 ? 'good' : ''}">${d(row.mine)}</td>
          <td>${row.theirs ? esc(D.moves[row.theirs.mid].n) : '—'}</td><td class="${cls(row.theirs)}">${d(row.theirs)}</td>
          <td class="${row.faster === 1 ? 'good' : row.faster === 0 ? 'bad' : 'warn'}">${row.sMe} / ${row.sThem}${row.x.mon.item === 'choicescarf' ? ' (Scarf)' : ''}</td></tr>`;
      }
      det.append(h(t + '</table></div>'));
      v.append(det);
    }
  }

  function viewSpeed(v, list) {
    const opts = viewSpeed.opts || (viewSpeed.opts = { tw: false, n: 60, min: 0.08 });
    const ms = meta(opts.n);
    const entries = [];
    for (const x of ms) {
      const u = D.usage[x.id];
      // group its common spreads by the Speed they give (e.g. Jolly 32 and Adamant 32 are two lines)
      const groups = new Map();
      let listed = 0;
      for (const [spr, share] of Object.entries(u.sp || {})) {
        const [nature, nums] = spr.split(':');
        const spe = +nums.split('/')[5];
        const m = Calc.mon({ ...x.set, nature, sp: nums.split('/').map(Number) });
        const s0 = Calc.speed({ ...m, item: '' });
        const g = groups.get(s0) || { s: s0, share: 0, labels: new Map(), fast: false };
        g.share += share; listed += share;
        // Scarf users invest in Speed: only spreads with 20+ Speed SP and no -Spe nature get a Scarf line
        if (spe >= 20 && (Calc.NATURES[nature] || [])[1] !== 5) g.fast = true;
        const lab = `${nature} ${spe} SP`;
        g.labels.set(lab, (g.labels.get(lab) || 0) + share);
        groups.set(s0, g);
      }
      if (!groups.size) groups.set(plainSpeed(x), { s: plainSpeed(x), share: 1, labels: new Map([[`${x.set.nature} ${x.set.sp[5]} SP`, 1]]) });
      const total = listed || 1;
      const scarf = u.it.choicescarf || 0;
      const fastFrac = [...groups.values()].filter(g => g.fast).reduce((a, g) => a + g.share / total, 0);
      for (const g of groups.values()) {
        const frac = g.share / total;
        if (frac < opts.min && g !== [...groups.values()].sort((a, b) => b.share - a.share)[0]) continue;
        const label = [...g.labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l).join(' / ');
        const pctSets = `${Math.round(frac * 100)}% of its spreads`;
        // the Scarf sets are spread over the fast spreads only
        const scarfHere = g.fast && fastFrac > 0 ? Math.min(frac, scarf * frac / fastFrac) : 0;
        if (frac - scarfHere > 0.005 || !g.fast) entries.push({ name: x.name, s: g.s, note: `${label} · ${pctSets}`, usage: x.usage * (frac - scarfHere) });
        if (scarf >= 0.05 && g.fast) entries.push({ name: x.name + ' (Scarf)', s: Math.floor(g.s * 1.5), note: `${label}, Choice Scarf · ${Math.round(scarf * 100)}% of ${x.name} run Scarf`, usage: x.usage * scarfHere });
      }
    }
    for (const m of list) entries.push({ name: m.s.n, s: Calc.speed(m, { tailwind: opts.tw }), note: `${m.nature} ${m.sp[5]} SP${m.boosts[5] ? `, ${m.boosts[5] > 0 ? '+' : ''}${m.boosts[5]} Spe` : ''}${opts.tw ? ', Tailwind' : ''}${m.item === 'choicescarf' ? ', Scarf' : ''}`, you: true });
    entries.sort((a, b) => b.s - a.s || (b.you ? 1 : 0) - (a.you ? 1 : 0));
    const usageCount = Object.keys(D.usage).length;
    v.innerHTML = `<div class="controls"><label><input type="checkbox" id="spTw" ${opts.tw ? 'checked' : ''}> Your side has Tailwind</label>
      <label>Show <select id="spN">${[30, 60, 100, 200].map(n => `<option value="${n}" ${opts.n === n ? 'selected' : ''}>${n >= usageCount ? 'all ' + usageCount : 'top ' + n}</option>`).join('')}</select> by usage</label>
      <label>Hide spreads under <select id="spMin">${[0, 0.05, 0.08, 0.15, 0.3].map(n => `<option value="${n}" ${opts.min === n ? 'selected' : ''}>${n * 100}%</option>`).join('')}</select> of a Pokémon</label></div>
      <p class="muted">Each Pokémon is split by the Speeds its common spreads give (Jolly vs Adamant, 32 vs less), plus a Scarf line when at least 5% run
      Choice Scarf. Usage = share of all teams with that Pokémon at that Speed. Under Trick Room read the list bottom-up.</p>
      <div class="scroll"><table><tr><th>Speed</th><th class="name">Pokémon</th><th class="name">Spread</th><th>Usage</th></tr>
      ${entries.map(e => `<tr class="${e.you ? 'you' : ''}"><td>${e.s}</td><td class="name">${esc(e.name)}</td><td class="name muted">${esc(e.note)}</td><td>${e.usage ? (e.usage >= 0.01 ? pct(e.usage) : '<1%') : ''}</td></tr>`).join('')}</table></div>`;
    $('#spTw').onchange = e => { opts.tw = e.target.checked; render(); };
    $('#spN').onchange = e => { opts.n = +e.target.value; render(); };
    $('#spMin').onchange = e => { opts.min = +e.target.value; render(); };
  }

  // helpers for archetype tool tests
  function archHelpers(list) {
    const names = arr => arr.length ? arr.map(m => m.s.n) : null;
    return {
      whoHasMove: ids => names(list.filter(m => m.moves.some(x => ids.includes(x)))),
      whoHasAbility: ids => names(list.filter(m => ids.includes(m.ability))),
      whoHolds: ids => names(list.filter(m => ids.includes(m.item))),
      whoIsType: t => names(list.filter(m => m.types.includes(t))),
      whoResists: t => list.filter(m => Calc.defMult(t, m) < 1).map(m => m.s.n),
      whoHitsWith: types => names(list.filter(m => m.moves.some(x => isAttack(x) && types.includes(D.moves[x].t)))),
      whoHasPriority: () => names(list.filter(m => m.moves.some(x => isAttack(x) && D.moves[x].pr > 0))),
      whoHasSpread: () => names(list.filter(m => m.moves.some(x => isAttack(x) && Calc.isSpread(D.moves[x])))),
      slowOrPriority: () => names(list.filter(m => m.s.bs[5] <= 60 || m.moves.some(x => isAttack(x) && D.moves[x].pr > 0))),
    };
  }
  function viewArch(v, list) {
    const hp = archHelpers(list);
    const ms = meta();
    let html = `<p class="muted">For each common archetype: do you have the tools, and how do your Pokémon do against its usual members
      (usage-weighted: share of members you can 2HKO, and that can 2HKO you).</p><div class="summary">`;
    for (const a of ARCHETYPES) {
      const members = [...new Set(a.members.map(id => ms.find(x => x.id === id || x.megaId === id)).filter(Boolean))];
      if (!members.length) continue;
      const checks = a.tools.map(t => { const r = t.test(list, hp); return { t, ok: !!(r && (!Array.isArray(r) || r.length)), who: Array.isArray(r) ? r.join(', ') : '' }; });
      const okN = checks.filter(c => c.ok).length;
      // damage: for each member, can any of ours 2HKO it; how many of ours does it 2HKO
      let can = 0, tot = 0, threat = 0;
      for (const x of members) {
        const w = x.usage; tot += w;
        const best = Math.max(0, ...list.map(m => { const b = bestHit(m, x.mon, {}); return b ? koChance(b.r, 2) : 0; }));
        can += w * best;
        const hitsUs = list.filter(m => { const b = bestHit(x.mon, m, {}, mid => (x.moveUse[mid] || 0) >= 0.15); return b && koChance(b.r, 2) > 0.5; }).length;
        threat += w * hitsUs / list.length;
      }
      const grade = okN / checks.length * 0.6 + (can / tot) * 0.25 + (1 - threat / tot) * 0.15;
      const gText = grade >= 0.75 ? '<span class="good">Good</span>' : grade >= 0.5 ? '<span class="warn">OK</span>' : '<span class="bad">Weak</span>';
      html += `<div class="card"><h3>${esc(a.name)} — ${gText}</h3><div class="muted">${esc(a.desc)}</div>
        <div class="muted" style="margin:4px 0">Members in this meta: ${members.map(x => esc(x.name)).join(', ')}</div>
        ${checks.map(c => `<div class="check"><span class="icon">${c.ok ? '✅' : '❌'}</span><span><b>${esc(c.t.label)}</b>${c.who ? ` <span class="muted">(${esc(c.who)})</span>` : ''}<br><span class="muted">${esc(c.t.why)}</span></span></div>`).join('')}
        <div style="margin-top:6px">You can 2HKO <b>${pct(can / tot)}</b> of its members · they 2HKO <b>${pct(threat / tot)}</b> of your team</div></div>`;
    }
    v.innerHTML = html + '</div>';
  }

  // ------------------------------------------------------------------ spread finder
  const spreadState = { slot: 0, goals: [] };
  function viewSpread(v, list) {
    const sets = filled();
    if (spreadState.slot >= sets.length) spreadState.slot = 0;
    const set = sets[spreadState.slot];
    const metaNames = meta().map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    v.innerHTML = `<p class="muted">Pick goals; the finder looks for the spread (and nature) that meets all of them with the fewest Stat Points,
      then puts the rest into its attacking stat and HP/defenses. Attackers use their most common meta set. Suggested goals come in priority
      order: outspeed threats first (unless the team plays it under Trick Room), then OHKOs (up to 6, with the moves in its slot), then bulk.</p>
      <div class="controls"><label>Pokémon <select id="sfSlot">${sets.map((s, i) => `<option value="${i}" ${i === spreadState.slot ? 'selected' : ''}>${esc(s.species)}</option>`).join('')}</select></label>
        <label>Speed plan <select id="sfPlan"><option value="auto">Auto: ${esc(teamPlan().label)}</option><option value="fast">Outspeed (Tailwind / fast)</option><option value="tr">Trick Room (min Speed)</option></select></label>
        <button id="sfSuggest">Suggest goals from the meta</button><button id="sfAdd">+ Add goal</button></div>
      <div id="sfGoals"></div><div id="sfOut"></div>`;
    $('#sfPlan').value = spreadState.plan || 'auto';
    $('#sfPlan').onchange = e => { spreadState.plan = e.target.value; render(); };
    spreadState.tr = isTrickRoomMon(set);
    $('#sfSlot').onchange = e => { spreadState.slot = +e.target.value; spreadState.goals = []; render(); };
    $('#sfAdd').onclick = () => { spreadState.goals.push({ kind: 'survive', who: meta()[0].id, move: '', hits: 1 }); render(); };
    $('#sfSuggest').onclick = () => {
      // keep only goals this Pokémon can meet, adding them while all of them together still fit in 66 SP
      const cands = suggestGoals(set).filter(g => findSpread(set, [g]).length);
      const keep = [];
      for (const g of cands) if (findSpread(set, [...keep, g]).length) keep.push(g);
      spreadState.goals = keep;
      if (!keep.length) toast('No useful goals found for this Pokémon');
      render();
    };
    const gBox = $('#sfGoals');
    spreadState.goals.forEach((g, i) => {
      const x = meta().find(m => m.id === g.who);
      const moveOpts = g.kind === 'survive' ? (x ? x.mon.moves.filter(isAttack) : []) : (Calc.mon(set).moves.filter(isAttack));
      const row = h(`<div class="goal card">
        <select data-k="kind"><option value="survive">Survive</option><option value="outspeed">Outspeed</option><option value="ko">KO</option></select>
        <select data-k="who">${metaNames}</select>
        ${g.kind !== 'outspeed' ? `<select data-k="move"><option value="">best move</option>${moveOpts.map(m => `<option value="${m}">${esc(D.moves[m].n)}</option>`).join('')}</select>
        <select data-k="hits"><option value="1">${g.kind === 'ko' ? 'OHKO' : '1 hit'}</option><option value="2">${g.kind === 'ko' ? '2HKO' : '2 hits'}</option></select>` : `<label><input type="checkbox" data-k="scarf" ${g.scarf ? 'checked' : ''}> their Scarf</label>`}
        <button class="ghost small" data-del>✕</button></div>`);
      row.querySelectorAll('select').forEach(s => { s.value = g[s.dataset.k] ?? ''; s.onchange = () => { g[s.dataset.k] = s.dataset.k === 'hits' ? +s.value : s.value; if (s.dataset.k !== 'move') g.move = g.move; render(); }; });
      const sc = row.querySelector('[data-k=scarf]'); if (sc) sc.onchange = () => { g.scarf = sc.checked; render(); };
      row.querySelector('[data-del]').onclick = () => { spreadState.goals.splice(i, 1); render(); };
      gBox.append(row);
    });
    if (spreadState.goals.length) $('#sfOut').innerHTML = renderSpreadResult(set, spreadState.goals);
  }
  function goalOk(set, g, sp, nature) {
    const me = Calc.mon({ ...set, sp, nature });
    const x = meta().find(m => m.id === g.who);
    if (!x) return true;
    if (g.kind === 'outspeed') return Calc.speed(me) > (g.scarf ? scarfSpeed(x) : plainSpeed(x));
    if (g.kind === 'survive') {
      const them = oppStaged(x.mon, field).mon;   // same "their side" stages / Intimidate as Meta matchups
      const b = g.move ? { r: Calc.range(them, me, g.move, field) } : bestHit(them, me, field, mid => (x.moveUse[mid] || 0) >= 0.15);
      return !b || b.r.hi * g.hits < 1;
    }
    const b = g.move ? { r: Calc.range(me, x.mon, g.move, field) } : bestHit(me, x.mon, field);
    return !!b && b.r.lo * g.hits >= 1;
  }
  /** Fewest-SP spread meeting all goals, per nature; leftover → HP, then the defense that matters. */
  function findSpread(set, goals) {
    const natures = ['Hardy', 'Adamant', 'Jolly', 'Modest', 'Timid', 'Bold', 'Impish', 'Calm', 'Careful', 'Brave', 'Quiet', 'Relaxed', 'Sassy'];
    const results = [];
    for (const nature of natures) {
      const sp = [0, 0, 0, 0, 0, 0];
      // offense & speed: minimal single-stat requirements
      const need = (k, test) => { for (let v = 0; v <= 32; v++) { sp[k] = v; if (test()) return true; } sp[k] = 0; return false; };
      let ok = true;
      for (const g of goals.filter(g => g.kind === 'outspeed')) ok = ok && need(5, () => goalOk(set, g, sp, nature));
      const physical = goals.filter(g => g.kind === 'ko').some(g => { const me = Calc.mon(set); const b = g.move || (bestHit(me, meta().find(m => m.id === g.who).mon, field) || {}).mid; return b && D.moves[b].c === 0; });
      for (const g of goals.filter(g => g.kind === 'ko')) ok = ok && need(physical ? 1 : 3, () => goalOk(set, g, sp, nature));
      if (!ok) continue;
      // bulk: smallest HP + Def + SpD total that survives everything
      const surv = goals.filter(g => g.kind === 'survive');
      let bestBulk = null;
      const used = sp.reduce((a, b) => a + b, 0);
      for (let hp = 0; hp <= 32; hp++) for (let df = 0; df <= 32; df++) {
        if (used + hp + df > MAX_SP) break;
        // smallest SpD for this hp/def
        let sd = -1;
        for (let s = 0; s <= 32 && used + hp + df + s <= MAX_SP; s++) {
          const t = sp.slice(); t[0] = hp; t[2] = df; t[4] = s;
          if (surv.every(g => goalOk(set, g, t, nature))) { sd = s; break; }
        }
        if (sd < 0) continue;
        const tot = hp + df + sd;
        if (!bestBulk || tot < bestBulk.tot) bestBulk = { hp, df, sd, tot };
      }
      if (!bestBulk) continue;
      sp[0] = bestBulk.hp; sp[2] = bestBulk.df; sp[4] = bestBulk.sd;
      let left = MAX_SP - sp.reduce((a, b) => a + b, 0);
      if (left < 0) continue;
      // leftovers: the stat it attacks with first (attackers), then HP, then the defenses
      const me0 = Calc.mon(set);
      const atks = me0.moves.filter(isAttack).map(m => D.moves[m].c);
      const mainAtk = !atks.length ? -1 : (atks.filter(c => c === 0).length > atks.filter(c => c === 1).length ? 1 : 3);
      const order = mainAtk > 0 ? [mainAtk, 0, 2, 4] : [0, 2, 4];
      for (const k of order) { const add = Math.min(32 - sp[k], left); sp[k] += add; left -= add; }
      const minTotal = used + bestBulk.tot;
      const n = Calc.NATURES[nature] || [];
      const penalty = (n[1] === mainAtk ? 3 : 0) + (n[1] === 5 && goals.some(g => g.kind === 'outspeed') ? 3 : 0) - (n[0] === mainAtk ? 0.5 : 0)
        + (spreadState.tr ? (n[1] === 5 ? -1 : 1) : (n[1] === 5 && me0.s.bs[5] >= 80 ? 2 : 0));
      results.push({ nature, sp, minTotal, rank: minTotal + penalty });
    }
    // don't offer natures that lower the stat it attacks with (Jolly on a special attacker) if anything else works
    const atkStat = (() => { const a = Calc.mon(set).moves.filter(isAttack).map(m => D.moves[m].c); return !a.length ? -1 : a.filter(c => c === 0).length >= a.filter(c => c === 1).length ? 1 : 3; })();
    const ok = results.filter(r => (Calc.NATURES[r.nature] || [])[1] !== atkStat);
    return (ok.length ? ok : results).sort((a, b) => a.rank - b.rank).slice(0, 4);
  }
  function renderSpreadResult(set, goals) {
    const res = findSpread(set, goals);
    if (!res.length) return `<div class="card bad">No spread meets all of these goals. Remove one or try another item.</div>`;
    return `<div class="summary">${res.map((r, i) => {
      const m = Calc.mon({ ...set, sp: r.sp, nature: r.nature });
      return `<div class="card"><h3>${i === 0 ? 'Best: ' : ''}${r.nature}</h3>
        <div>${r.sp.map((v, k) => `${v} ${STAT_LABEL[k]}`).join(' / ')}</div>
        <div class="muted">Stats ${m.stats.join(' / ')} · goals need ${r.minTotal} of 66 SP</div>
        <button class="small" data-apply="${i}">Use this spread</button></div>`;
    }).join('')}</div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-apply]'); if (!b) return;
    const set = filled()[spreadState.slot];
    const r = findSpread(set, spreadState.goals)[+b.dataset.apply];
    set.sp = r.sp.slice(); set.nature = r.nature;
    saveTeam(); renderSlots(); render(); toast('Spread applied');
  });
  /** Goals worth having: survive the most common hits that nearly KO you, outspeed the common Pokémon just above you, KO the common ones you nearly KO. */
  /**
   * Goals in priority order (the finder keeps them in this order while they still fit in 66 SP):
   *  1. outspeed the fastest common threat it can reach with max Speed (skipped on a Trick Room team),
   *  2. OHKO the (up to 6) most-used Pokémon it can OHKO with full investment, using only the moves in its slot,
   *  3. survive the common hits that nearly KO it.
   */
  /**
   * Is the TEAM built around Trick Room? Judged from the team, not from base Speed alone (a base-100 Gardevoir or a
   * base-80 attacker can be a Trick Room attacker): a member "plays under Trick Room" when its spread says so
   * (-Spe nature, or 0 Speed SP without a +Spe nature) or it is very slow (base Spe <= 60). With a Trick Room setter and
   * at least two such members besides the setter it's a TR team; if the team also has Tailwind it's Tailroom, where
   * only those members play under Trick Room. A lone Trick Room user on a fast team (reverse TR) isn't a TR team.
   */
  function trMember(m) {
    const n = Calc.NATURES[m.nature] || [];
    return n[1] === 5 || (m.sp[5] === 0 && n[0] !== 5 && m.item !== 'choicescarf') || m.s.bs[5] <= 60;
  }
  function teamPlan() {
    const ms = mons();
    const setters = ms.filter(m => m.moves.includes('trickroom'));
    const tw = ms.some(m => m.moves.includes('tailwind'));
    const slow = ms.filter(m => trMember(m) && !(setters.length === 1 && setters[0] === m));
    if (setters.length && slow.length >= 2) {
      const who = slow.map(m => m.s.n).join(', ');
      return tw ? { mode: 'tailroom', label: `Tailroom: ${who} play Trick Room, the rest outspeed`, slow }
                : { mode: 'tr', label: `Trick Room team (${setters.map(m => m.s.n).join(', ')} sets it; ${who} built for it)`, slow };
    }
    return { mode: 'fast', label: setters.length ? 'speed team (Trick Room here is a counter, not the plan)' : 'speed team', slow };
  }
  function isTrickRoomMon(set) {
    const plan = spreadState.plan || 'auto';
    if (plan !== 'auto') return plan === 'tr';
    const t = teamPlan();
    if (t.mode === 'tr') return true;
    if (t.mode === 'tailroom') { const m = Calc.mon(set); return t.slow.some(x => x.id === m.id); }
    return false;
  }
  function suggestGoals(set) {
    const m = Calc.mon(set);
    const self = [m.id, toId(m.s.base)];
    const ms = meta().filter(x => !self.includes(x.id) && !self.includes(x.megaId) && x.usage >= 0.02).sort((a, b) => b.usage - a.usage);
    const atks = m.moves.filter(isAttack).map(mid => D.moves[mid].c);
    const mainAtk = !atks.length ? -1 : (atks.filter(c => c === 0).length >= atks.filter(c => c === 1).length ? 1 : 3);
    const goals = [];
    // 1. speed
    let nature = mainAtk === 1 ? 'Adamant' : mainAtk === 3 ? 'Modest' : set.nature;
    if (!spreadState.tr) {
      const fastNature = mainAtk === 3 ? 'Timid' : 'Jolly';
      const sp = set.sp.slice(); sp[5] = 32;
      const myMax = Calc.speed(Calc.mon({ ...set, nature: fastNature, sp }));
      const reach = ms.map(x => ({ x, s: plainSpeed(x) })).filter(c => c.s < myMax).sort((a, b) => b.s - a.s || b.x.usage - a.x.usage);
      if (reach.length) { goals.push({ kind: 'outspeed', who: reach[0].x.id }); nature = fastNature; }
    }
    // 2. OHKOs it can get with full attack investment (with the nature the speed goal leaves it)
    if (mainAtk > 0) {
      const sp = set.sp.slice(); sp[mainAtk] = 32;
      const strong = Calc.mon({ ...set, nature, sp });
      for (const x of ms) {
        if (goals.filter(g => g.kind === 'ko').length >= 6) break;
        const b = bestHit(strong, x.mon, field);
        if (b && b.r.lo >= 1) goals.push({ kind: 'ko', who: x.id, move: b.mid, hits: 1 });
      }
    }
    // 3. bulk: common hits that come close to KOing it
    for (const row of matchup(m, field).rows.filter(r => !self.includes(r.x.id)).sort((a, b) => b.x.usage - a.x.usage)) {
      if (goals.filter(g => g.kind === 'survive').length >= 3) break;
      if (row.theirs && row.theirs.r.hi >= 0.85 && row.theirs.r.lo < 1.3) goals.push({ kind: 'survive', who: row.x.id, move: row.theirs.mid, hits: 1 });
    }
    return goals;
  }

  // ------------------------------------------------------------------ bring 4
  const bringState = { opp: ['', '', '', '', '', ''] };
  function viewBring(v, list) {
    v.innerHTML = `<p class="muted">Enter their six (as seen at team preview). Each opponent uses its most common set. The score of your Pokémon
      against theirs compares how fast each side KOs the other and who moves first. The suggested four cover their six best.</p>
      <div class="controls">${bringState.opp.map((o, i) => `<input data-i="${i}" placeholder="Their #${i + 1}" value="${esc(o)}" style="width:140px">`).join('')}</div><div id="bringOut"></div>`;
    v.querySelectorAll('[data-i]').forEach(inp => autocomplete(inp, AC.species));
    v.querySelectorAll('[data-i]').forEach(inp => inp.onchange = e => { bringState.opp[+e.target.dataset.i] = e.target.value; render(); });
    const opp = bringState.opp.map(n => toId(n)).filter(id => D.species[id]).map(id => {
      const { set, megaId } = metaSet(id);
      return { id, name: D.species[megaId || id].n, mon: Calc.mon(set), moveUse: D.usage[id]?.mv || {}, scarf: (D.usage[id]?.it.choicescarf || 0) >= 0.2 };
    });
    if (!opp.length) return;
    // score[i][j] in -1..1: my i vs their j
    const score = list.map(m => opp.map(x => {
      const mine = bestHit(m, x.mon, {}), theirs = bestHit(x.mon, m, {}, mid => (x.moveUse[mid] || 0) >= 0.15 || !D.usage[x.id]);
      const hMe = mine ? Calc.hitsToKo(mine.r) : 9, hThem = theirs ? Calc.hitsToKo(theirs.r) : 9;
      const faster = Calc.speed(m) > Calc.speed(x.mon);
      const myTurns = hMe - (faster ? 0.5 : 0), theirTurns = hThem - (faster ? 0 : 0.5);
      return Math.max(-1, Math.min(1, (theirTurns - myTurns) / 2));
    }));
    // best 4 of the team: maximise sum over their mons of the best answer + small average term
    let best = null;
    const idx = list.map((_, i) => i);
    const combos = k => { const out = []; const rec = (s, a) => { if (a.length === k) { out.push(a); return; } for (let i = s; i < idx.length; i++) rec(i + 1, [...a, i]); }; rec(0, []); return out; };
    for (const c of combos(Math.min(4, list.length))) {
      const val = opp.reduce((s, _, j) => s + Math.max(...c.map(i => score[i][j])), 0) + 0.25 * c.reduce((s, i) => s + score[i].reduce((a, b) => a + b, 0) / opp.length, 0);
      if (!best || val > best.val) best = { c, val };
    }
    const cell = x => `<td class="${x > 0.25 ? 'm05' : x < -0.25 ? 'm2' : ''}">${x > 0 ? '+' : ''}${x.toFixed(1)}</td>`;
    $('#bringOut').innerHTML = `<div class="card"><h3>Suggested four: ${best.c.map(i => esc(list[i].s.n)).join(', ')}</h3>
      <div class="muted">Positive = your Pokémon wins that 1-on-1 (KOs first / in fewer hits). A quick guide, not a full game plan.</div></div>
      <div class="scroll"><table><tr><th class="name">You \\ Them</th>${opp.map(x => `<th>${esc(x.name)}</th>`).join('')}</tr>
      ${list.map((m, i) => `<tr class="${best.c.includes(i) ? 'you' : ''}"><td class="name">${esc(m.s.n)}</td>${score[i].map(cell).join('')}</tr>`).join('')}</table></div>`;
  }

  loadRegs().catch(e => { $('#view').innerHTML = `<p class="bad">Could not load data: ${esc(e.message)}. Open the site through a web server (GitHub Pages), not as a file.</p>`; });
})();
