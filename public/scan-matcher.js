// Name matching is deliberately conservative. It proposes candidates; it never adds cards.
export function normalizeScanName(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const TYPE_LINES = /^(legendary |basic |snow |world |tribal |kindred )*(artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle)(\s|$)/i;
export function scanNameQueries(text) {
  const queries = [];
  for (const raw of String(text).split(/[\r\n]+/).slice(0, 12)) {
    const line = raw.replace(/\{[0-9WUBRGCXYZSP/]+\}/gi, '').replace(/[|©®™]/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/\s+/g, ' ').trim();
    const minimum = /[가-힣\u3040-\u30ff\u3400-\u9fff]/.test(line) ? 2 : 3;
    const enoughLetters = minimum === 2 ? (line.match(/\p{L}/gu) || []).length >= 2 : /\p{L}{2}/u.test(line);
    if (line.length < minimum || line.length > 100 || !enoughLetters || TYPE_LINES.test(line)) continue;
    const trimmed = line.replace(/\s+[\]}〉」』]\s+.+$/u, '').replace(/[^\p{L}\p{N}]+$/u, '').replace(/\s+(?:[^\p{L}]*\d[^\p{L}]*|[\d(){}\[\]◆◇○●◎WUBRGC/]+)$/iu, '').trim();
    if (trimmed !== line && trimmed.length >= minimum) queries.push(trimmed);
    queries.push(line);
    if (queries.length >= 8) break;
  }
  return [...new Set(queries)].slice(0, 8);
}

export function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

export function createScanIndex(cards) {
  const index = [];
  for (const card of cards) {
    if (['art_series', 'token', 'double_faced_token', 'emblem'].includes(card.layout) || /^(Card|Emblem)\b/.test(card.type_line || '')) continue;
    const names = [card.name, card.printed_name, ...(card.card_faces || []).flatMap(face => [face.name, face.printed_name])];
    for (const name of new Set(names.filter(Boolean))) index.push({ card, name, key: normalizeScanName(name), alias: name !== card.name && name !== card.printed_name });
  }
  const exact = new Map();
  for (const item of index) { if (!exact.has(item.key)) exact.set(item.key, []); exact.get(item.key).push(item); }
  Object.defineProperty(index, 'exact', { value: exact });
  return index;
}

export function matchScanNames(text, index, limit = 5) {
  const queries = scanNameQueries(text).map(normalizeScanName).filter(q => q.length >= (/[가-힣\u3040-\u30ff\u3400-\u9fff]/.test(q) ? 2 : 3));
  const hits = new Map();
  // Most clear card titles match exactly. Avoid full-catalog edit-distance work for these.
  if (index.exact) {
    for (const [i, q] of queries.entries()) for (const item of index.exact.get(q) || []) {
      const id = item.card.oracle_id || item.card.id || item.card.name;
      const score = 1 - Math.min(i, 5) * .004 - (item.alias ? .02 : 0);
      if (!hits.has(id) || hits.get(id).score < score) hits.set(id, { card:item.card, matchedName:item.name, score, exactName:true });
    }
    if (hits.size) return [...hits.values()].sort((a,b)=>b.score-a.score || a.card.name.localeCompare(b.card.name)).slice(0,limit);
  }
  for (const item of index) {
    let score = 0, exactName = false;
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i], longest = Math.max(q.length, item.key.length);
      if (Math.abs(q.length - item.key.length) / longest > .3) continue;
      const similarity = 1 - editDistance(q, item.key) / longest;
      // Short names are easy to hallucinate from noise; require a near-exact match.
      const threshold = longest <= 5 ? 1 : longest <= 8 ? .85 : .72;
      if (similarity < threshold) continue;
      const weighted = similarity - Math.min(i, 5) * .004 - (item.alias ? .02 : 0);
      if (weighted > score) { score = weighted; exactName = similarity === 1; }
    }
    if (!score) continue;
    const id = item.card.oracle_id || item.card.id || item.card.name;
    if (!hits.has(id) || hits.get(id).score < score) hits.set(id, { card: item.card, matchedName: item.name, score, exactName });
  }
  const sorted = [...hits.values()].sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
  return sorted.filter(hit => hit.score >= sorted[0].score - .08).slice(0, limit);
}

export function clampCrop(crop, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y)));
  return { x, y, width: Math.max(1, Math.min(width - x, Math.round(crop.width))), height: Math.max(1, Math.min(height - y, Math.round(crop.height))) };
}
