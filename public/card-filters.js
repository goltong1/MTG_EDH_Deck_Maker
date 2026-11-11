export const FILTER_OPTIONS = Object.freeze({
  colors: [['W', '백색', '☀'], ['U', '청색', '◆'], ['B', '흑색', '☠'], ['R', '적색', 'ϟ'], ['G', '녹색', '♣'], ['C', '무색', '◇']],
  types: [['creature', '생물', '♞'], ['instant', '순간마법', 'ϟ'], ['sorcery', '집중마법', '✦'], ['artifact', '마법물체', '⬡'], ['enchantment', '부여마법', '◈'], ['planeswalker', '플레인즈워커', '✧'], ['battle', '전투', '⚑'], ['land', '대지', '⌂']],
  mana: ['0', '1', '2', '3', '4', '5', '6', '7+'].map(value => [value, value, value]),
  rarities: [['common', '커먼', 'C'], ['uncommon', '언커먼', 'U'], ['rare', '레어', 'R'], ['mythic', '미식레어', 'M']],
  keywords: [['flying', '비행', ''], ['vigilance', '경계', ''], ['deathtouch', '치명타', ''], ['lifelink', '생명연결', ''], ['haste', '신속', ''], ['trample', '돌진', ''], ['flash', '섬광', ''], ['reach', '대공', '']]
});

export function emptyFilters() {
  return { colors: [], types: [], mana: [], rarities: [], keywords: [], commander: false };
}

// A single type per main-deck card. Use the front face for MDFCs / adventures;
// artifact creatures are creatures, and artifact lands are lands.
export function sectionForCard(card = {}) {
  const type = (card.card_faces?.[0]?.type_line || card.type_line || '').split(' // ')[0].split(' — ')[0];
  for (const id of ['land', 'creature', 'instant', 'sorcery', 'planeswalker', 'battle', 'artifact', 'enchantment']) {
    if (new RegExp(`\\b${id}\\b`, 'i').test(type)) return id;
  }
  return 'other';
}

export function mainDropTarget(card, requested = 'main') {
  return ['commander', 'sideboard', 'trash'].includes(requested) ? requested : sectionForCard(card);
}

export function matchesVisualFilters(card, filters = emptyFilters()) {
  const any = (group, predicate) => !filters[group]?.length || filters[group].some(predicate);
  const colors = card.colors || [...new Set((card.card_faces || []).flatMap(face => face.colors || []))];
  const type = card.type_line || (card.card_faces || []).map(face => face.type_line || '').join(' // ');
  const keywords = (card.keywords || []).map(value => value.toLowerCase());
  const oracle = card.oracle_text || (card.card_faces || []).map(face => face.oracle_text || '').join('\n');
  return any('colors', color => color === 'C' ? colors.length === 0 : colors.includes(color))
    && any('types', value => type.split(' // ').some(face => new RegExp(`\\b${value}\\b`, 'i').test(face.split(' — ')[0])))
    && any('mana', value => value === '7+' ? Number(card.cmc || 0) >= 7 : Number(card.cmc || 0) === Number(value))
    && any('rarities', value => card.rarity === value)
    && any('keywords', value => keywords.includes(value))
    && (!filters.commander || (/\bLegendary\b/i.test(type) && /\bCreature\b/i.test(type)) || /can be your commander/i.test(oracle));
}

export function visualFilterQuery(filters = emptyFilters()) {
  const parts = [];
  const add = (values, token) => {
    if (values?.length) parts.push(values.length === 1 ? token(values[0]) : `(${values.map(token).join(' or ')})`);
  };
  add(filters.colors, value => value === 'C' ? 'c:c' : `c:${value.toLowerCase()}`);
  add(filters.types, value => `t:${value}`);
  add(filters.mana, value => value === '7+' ? 'mv>=7' : `mv=${value}`);
  add(filters.rarities, value => `r:${value}`);
  add(filters.keywords, value => `keyword:${value}`);
  if (filters.commander) parts.push('(t:legendary t:creature or o:"can be your commander")');
  return parts.join(' ');
}
