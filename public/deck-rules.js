export const FORMAT_DEFS = Object.freeze({
  commander: {
    key: 'commander', label: 'Commander', labelKo: '커맨더', mode: 'commander', legality: 'commander',
    exactTotal: 100, mainTarget: 99, sideboardMax: 0, defaultCopyLimit: 1,
    hint: '커맨더 포함 정확히 100장 · 싱글턴 · 색 정체성 적용'
  },
  standard: {
    key: 'standard', label: 'Standard', labelKo: '스탠다드', mode: 'constructed', legality: 'standard',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: '메인 덱 최소 60장 · 사이드보드 최대 15장'
  },
  pioneer: {
    key: 'pioneer', label: 'Pioneer', labelKo: '파이오니어', mode: 'constructed', legality: 'pioneer',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: '메인 덱 최소 60장 · 사이드보드 최대 15장'
  },
  modern: {
    key: 'modern', label: 'Modern', labelKo: '모던', mode: 'constructed', legality: 'modern',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: '메인 덱 최소 60장 · 사이드보드 최대 15장'
  },
  legacy: {
    key: 'legacy', label: 'Legacy', labelKo: '레거시', mode: 'constructed', legality: 'legacy',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: '메인 덱 최소 60장 · 사이드보드 최대 15장'
  },
  vintage: {
    key: 'vintage', label: 'Vintage', labelKo: '빈티지', mode: 'constructed', legality: 'vintage',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4, supportsRestricted: true,
    hint: '메인 덱 최소 60장 · 사이드보드 최대 15장 · 제한 카드는 합계 1장'
  },
  pauper: {
    key: 'pauper', label: 'Pauper', labelKo: '파우퍼', mode: 'constructed', legality: 'pauper',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: '메인 덱 최소 60장 · 사이드보드 최대 15장 · Pauper 합법성 적용'
  },
  explorer: {
    key: 'explorer', label: 'Explorer', labelKo: '익스플로러', mode: 'constructed', legality: 'explorer',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: 'Arena 익스플로러 · 메인 덱 최소 60장 · 사이드보드 최대 15장'
  },
  historic: {
    key: 'historic', label: 'Historic', labelKo: '히스토릭', mode: 'constructed', legality: 'historic',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: 'Arena 히스토릭 BO3 기준 · 메인 덱 최소 60장 · 사이드보드 최대 15장'
  },
  timeless: {
    key: 'timeless', label: 'Timeless', labelKo: '타임리스', mode: 'constructed', legality: 'timeless',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4, supportsRestricted: true,
    hint: 'Arena 타임리스 BO3 기준 · 제한 카드는 합계 1장'
  },
  alchemy: {
    key: 'alchemy', label: 'Alchemy', labelKo: '알케미', mode: 'constructed', legality: 'alchemy',
    mainMin: 60, sideboardMax: 15, defaultCopyLimit: 4,
    hint: 'Arena 알케미 BO3 기준 · 메인 덱 최소 60장 · 사이드보드 최대 15장'
  }
});

export const FORMAT_ORDER = Object.freeze([
  'commander', 'standard', 'pioneer', 'modern', 'legacy', 'vintage',
  'pauper', 'explorer', 'historic', 'timeless', 'alchemy'
]);

const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
});

export function formatConfig(formatKey) {
  return FORMAT_DEFS[formatKey] || FORMAT_DEFS.commander;
}

export function cardOracleText(card = {}) {
  return card.oracle_text || card.card_faces?.map(face => face.oracle_text).filter(Boolean).join('\n//\n') || '';
}

export function isBasicLandCard(card = {}) {
  return /\bBasic Land\b/i.test(card.type_line || '');
}

export function specialCopyLimit(card = {}) {
  if (isBasicLandCard(card)) return Infinity;
  const text = cardOracleText(card);
  if (/\bA deck can have any number of cards named\b/i.test(text)) return Infinity;
  const match = text.match(/\bA deck can have up to ([a-z]+|\d+) cards named\b/i);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const parsed = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function legalityStatus(card = {}, formatKey = 'commander') {
  const config = formatConfig(formatKey);
  return card.legalities?.[config.legality] || 'unknown';
}

export function isFormatPlayableStatus(status) {
  return status === 'legal' || status === 'restricted';
}

export function cardCopyLimit(card = {}, formatKey = 'commander') {
  const special = specialCopyLimit(card);
  if (special !== null) return special;
  const status = legalityStatus(card, formatKey);
  if (status === 'restricted') return 1;
  return formatConfig(formatKey).defaultCopyLimit;
}

export function countEntries(entries = []) {
  return entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.qty || 0)), 0);
}

export function canonicalCardName(card = {}) {
  return card.name || card.card_faces?.map(face => face.name).filter(Boolean).join(' // ') || '이름 없음';
}

export function groupedNameCounts(entryGroups = []) {
  const byName = new Map();
  for (const entries of entryGroups) {
    for (const entry of entries || []) {
      const name = canonicalCardName(entry.card);
      const previous = byName.get(name) || { card: entry.card, qty: 0 };
      previous.qty += Math.max(0, Number(entry.qty || 0));
      byName.set(name, previous);
    }
  }
  return byName;
}
