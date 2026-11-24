// Archetypes and the "tools" a team needs against each. Members not in the current regulation's data are skipped,
// so this file keeps working for new regulations; add new archetypes or members here when the meta changes.
// Each tool: { label, why, test(team, helpers) -> true/false or a short string of who provides it }.
'use strict';
const ARCHETYPES = (() => {
  const anyMove = (...ids) => (team, h) => h.whoHasMove(ids);
  const anyAbility = (...ids) => (team, h) => h.whoHasAbility(ids);
  const resists = (type, n) => (team, h) => { const w = h.whoResists(type); return w.length >= n ? w : null; };
  const hits = (...types) => (team, h) => h.whoHitsWith(types);

  return [
    { id: 'rain', name: 'Rain', members: ['pelipper', 'politoed', 'basculegion', 'archaludon', 'kingdra', 'golisopod', 'ludicolo', 'barraskewda'],
      desc: 'Drizzle + Swift Swim / boosted Water moves, Electro Shot Archaludon, Hurricane/Thunder that never miss.',
      tools: [
        { label: 'Your own weather setter', why: 'Take the weather back (sun/sand/snow), or Cloud Nine/Air Lock', test: anyAbility('drought', 'sandstream', 'snowwarning', 'cloudnine', 'airlock', 'megasol', 'megasun') },
        { label: '2+ Water resists', why: 'Somewhere to switch boosted Water moves', test: resists('Water', 2) },
        { label: 'Electric or Grass attacks', why: 'Hit Pelipper/Basculegion/Politoed super-effectively', test: hits('Electric', 'Grass') },
        { label: 'Wide Guard', why: 'Blocks rain spread moves (Muddy Water, Surf, Hurricane is single but Heat Wave/Eruption...)', test: anyMove('wideguard') },
        { label: 'Speed control', why: 'Swift Swim doubles their Speed: Trick Room or your own Tailwind/Icy Wind', test: anyMove('trickroom', 'tailwind', 'icywind', 'electroweb', 'thunderwave') },
      ] },
    { id: 'sun', name: 'Sun', members: ['charizardmegay', 'charizard', 'torkoal', 'venusaur', 'lilligant', 'lilliganthisui', 'heatran', 'walkingwake', 'ninetales', 'groudon'],
      desc: 'Drought / Mega Charizard-Y, Chlorophyll sweepers, boosted Fire spread moves.',
      tools: [
        { label: 'Your own weather setter', why: 'Rain especially halves their Fire moves', test: anyAbility('drizzle', 'sandstream', 'snowwarning', 'cloudnine', 'airlock') },
        { label: '2+ Fire resists', why: 'Heat Wave / Eruption in sun hurts everything else', test: resists('Fire', 2) },
        { label: 'Rock or Water attacks', why: 'Rock Slide / Water hits Charizard and Torkoal hard', test: hits('Rock', 'Water') },
        { label: 'Wide Guard', why: 'Blocks Heat Wave / Eruption', test: anyMove('wideguard') },
        { label: 'Fire immunity', why: 'Flash Fire / Well-Baked Body', test: anyAbility('flashfire', 'wellbakedbody') },
      ] },
    { id: 'sand', name: 'Sand', members: ['tyranitar', 'tyranitarmega', 'hippowdon', 'excadrill', 'glimmora', 'glimmoramega', 'garchomp', 'lycanroc'],
      desc: 'Sand Stream setters, Sand Rush Excadrill, Mega Glimmora, Rock types get 1.5× SpD.',
      tools: [
        { label: 'Your own weather setter', why: 'Turn off Sand Rush', test: anyAbility('drizzle', 'drought', 'snowwarning', 'cloudnine', 'airlock') },
        { label: 'Water / Grass / Fighting attacks', why: 'Tyranitar, Hippowdon, Excadrill weaknesses', test: hits('Water', 'Grass', 'Fighting') },
        { label: 'Ground resist or immunity', why: 'Earthquake / High Horsepower from Excadrill & Garchomp', test: (t, h) => { const w = h.whoResists('Ground'); return w.length ? w : null; } },
        { label: 'Speed control', why: 'Sand Rush doubles Excadrill', test: anyMove('trickroom', 'tailwind', 'icywind', 'electroweb', 'thunderwave') },
      ] },
    { id: 'tr', name: 'Trick Room', members: ['farigiraf', 'hatterene', 'indeedeef', 'indeedee', 'porygon2', 'cameruptmega', 'camerupt', 'torkoal', 'ursaluna', 'amoonguss', 'dusclops', 'kingambit'],
      desc: 'Set Trick Room behind Armor Tail / Follow Me / Fake Out, then slow attackers move first for 4 turns.',
      tools: [
        { label: 'Stop the setter', why: 'Imprison, Taunt, Fake Out or a fast KO on the setter', test: anyMove('imprison', 'taunt', 'fakeout', 'encore') },
        { label: 'Your own Trick Room', why: 'Reverse their Trick Room or play it yourself', test: anyMove('trickroom') },
        { label: 'Slow or priority attackers', why: 'Something that still moves first under Trick Room', test: (t, h) => h.slowOrPriority() },
        { label: 'Psychic / Dark-proof', why: 'Most setters are Psychic/Fairy: Dark, Steel, Ghost attacks', test: hits('Dark', 'Ghost', 'Steel') },
        { label: 'Protect on most', why: 'Stall out the 4 turns', test: (t, h) => { const w = h.whoHasMove(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark']); return w && w.length >= 3 ? w : null; } },
      ] },
    { id: 'tailwind', name: 'Tailwind offense', members: ['whimsicott', 'talonflame', 'pelipper', 'dragonite', 'dragonitemega', 'corviknight', 'murkrow', 'tornadus', 'kilowattrel', 'aerodactyl'],
      desc: 'Prankster / fast Tailwind, then two strong attackers outspeed for 3 turns.',
      tools: [
        { label: 'Your own Tailwind or Trick Room', why: 'Match their speed or flip it', test: anyMove('tailwind', 'trickroom') },
        { label: 'Fake Out / Taunt on the setter', why: 'Stop Tailwind going up', test: anyMove('fakeout', 'taunt') },
        { label: 'Spread speed drops', why: 'Icy Wind / Electroweb undo part of it', test: anyMove('icywind', 'electroweb') },
        { label: 'Priority', why: 'Moves first anyway', test: (t, h) => h.whoHasPriority() },
        { label: 'Rock / Electric / Ice attacks', why: 'Most Tailwind setters are Flying', test: hits('Rock', 'Electric', 'Ice') },
      ] },
    { id: 'ho', name: 'Sneasler / Kingambit / Basculegion', members: ['sneasler', 'kingambit', 'basculegion', 'garchomp', 'garchompmegaz', 'charizardmegay', 'incineroar'],
      desc: 'The most common core: Unburden Sneasler, Supreme Overlord/Defiant Kingambit, Last Respects Basculegion.',
      tools: [
        { label: 'Fighting resist', why: 'Close Combat from Sneasler', test: resists('Fighting', 1) },
        { label: 'Answer to Kingambit', why: 'Fighting / Fire / Ground attacks (not Intimidate: Defiant!)', test: hits('Fighting', 'Fire', 'Ground') },
        { label: 'Priority blocker', why: 'Sucker Punch / Aqua Jet: Armor Tail, Psychic Terrain, Quick Guard, Dazzling', test: (t, h) => h.whoHasMove(['quickguard']) || h.whoHasAbility(['armortail', 'psychicsurge', 'dazzling', 'queenlymajesty']) },
        { label: 'Ghost / Dark resist', why: 'Last Respects Basculegion', test: (t, h) => { const w = h.whoResists('Ghost'); return w.length ? w : null; } },
        { label: 'Fake Out', why: 'Sneasler has Fake Out too; trade or block it', test: anyMove('fakeout') },
      ] },
    { id: 'perish', name: 'Perish trap', members: ['gengar', 'gengarmega', 'politoed', 'whimsicott', 'murkrow'],
      desc: 'Shadow Tag (Mega Gengar) + Perish Song: you must switch or lose both.',
      tools: [
        { label: 'Ghost / Dark attacks', why: 'KO Gengar before Perish Song ends', test: hits('Ghost', 'Dark') },
        { label: 'Fake Out / Taunt', why: 'Stop Perish Song turn 1', test: anyMove('fakeout', 'taunt') },
        { label: 'Pivot or immunity', why: 'U-turn/Parting Shot/Flip Turn escape; Ghosts aren\'t trapped', test: (t, h) => h.whoHasMove(['uturn', 'partingshot', 'flipturn', 'voltswitch', 'teleport']) || h.whoIsType('Ghost') },
      ] },
    { id: 'setup', name: 'Set-up', members: ['volcarona', 'dragonite', 'dragonitemega', 'kingambit', 'gyarados', 'gyaradosmega', 'tyranitar', 'annihilape', 'baxcalibur'],
      desc: 'Quiver Dance / Dragon Dance / Swords Dance behind Fake Out and redirection.',
      tools: [
        { label: 'Reset boosts', why: 'Haze, Clear Smog, Roar/Whirlwind, Encore, Spicy Spray...', test: anyMove('haze', 'clearsmog', 'roar', 'whirlwind', 'encore', 'dragontail', 'circlethrow', 'spectralthief') },
        { label: 'Unaware / Intimidate', why: 'Ignore or cut their boosts', test: anyAbility('unaware', 'intimidate') },
        { label: 'Taunt / Fake Out', why: 'Stop the set-up turn', test: anyMove('taunt', 'fakeout') },
        { label: 'Priority or sure KO', why: 'Finish a boosted threat before it moves', test: (t, h) => h.whoHasPriority() },
      ] },
    { id: 'redirect', name: 'Fake Out + redirection', members: ['incineroar', 'rillaboom', 'amoonguss', 'indeedeef', 'clefairy', 'togekiss', 'sneasler', 'maushold'],
      desc: 'Fake Out and Follow Me / Rage Powder to protect a set-up or Trick Room partner.',
      tools: [
        { label: 'Spread moves', why: 'Redirection can\'t stop spread moves', test: (t, h) => h.whoHasSpread() },
        { label: 'Ignore redirection', why: 'Stalwart, Propeller Tail, Snipe Shot; Grass/Overcoat/Goggles ignore Rage Powder', test: (t, h) => h.whoHasAbility(['stalwart', 'propellertail']) || h.whoHasMove(['snipeshot']) || h.whoIsType('Grass') },
        { label: 'Fake Out immunity', why: 'Inner Focus, Ghost type, Covert Cloak, Armor Tail', test: (t, h) => h.whoHasAbility(['innerfocus', 'armortail', 'psychicsurge']) || h.whoIsType('Ghost') || h.whoHolds(['covertcloak']) },
      ] },
  ];
})();
