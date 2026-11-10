import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public', 'data');
const cacheDir = path.resolve(process.env.SCRYFALL_CACHE_DIR || path.join(root, '.cache', 'scryfall'));
const bulkInfoUrl = process.env.SCRYFALL_BULK_INFO_URL || 'https://api.scryfall.com/bulk-data/oracle_cards';
const userAgent = process.env.SCRYFALL_USER_AGENT || 'DeckCanvasGithubPages/4.0.1 (GitHub Pages deck builder)';
const minCards = Number(process.env.SCRYFALL_MIN_CARDS || 1000);

const outputCards = path.join(outputDir, 'cards.json.gz');
const outputMeta = path.join(outputDir, 'meta.json');
const cacheCards = path.join(cacheDir, 'cards.json.gz');
const cacheMeta = path.join(cacheDir, 'meta.json');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, { timeoutMs = 60_000, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json;q=0.9,*/*;q=0.8'
        }
      });
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await sleep(750 * (2 ** attempt));
      continue;
    }
    if (response.ok) return response;
    const body = await response.text();
    let detail = body;
    try {
      const error = JSON.parse(body);
      detail = error.details || error.message || body;
    } catch { /* Non-JSON error pages still provide a useful diagnostic. */ }
    lastError = new Error(`HTTP ${response.status} ${response.statusText} from ${url}: ${detail.slice(0, 500)}`);
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const retryAfter = response.headers.get('retry-after');
      const seconds = Number(retryAfter);
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
      await sleep(Number.isFinite(delay) && delay > 0 ? delay : 750 * (2 ** attempt));
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

function compactImageUris(value = {}) {
  const output = {};
  for (const key of ['small', 'normal', 'large', 'png', 'art_crop']) {
    if (value[key]) output[key] = value[key];
  }
  return Object.keys(output).length ? output : undefined;
}

function compactFace(face = {}) {
  return {
    object: face.object,
    name: face.name,
    mana_cost: face.mana_cost,
    type_line: face.type_line,
    oracle_text: face.oracle_text,
    colors: face.colors,
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    defense: face.defense,
    image_uris: compactImageUris(face.image_uris),
    artist: face.artist
  };
}

function compactCard(card = {}) {
  return {
    object: 'card',
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    lang: card.lang,
    released_at: card.released_at,
    scryfall_uri: card.scryfall_uri,
    layout: card.layout,
    image_uris: compactImageUris(card.image_uris),
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    defense: card.defense,
    colors: card.colors,
    color_identity: card.color_identity,
    keywords: card.keywords,
    legalities: card.legalities,
    set: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    rarity: card.rarity,
    artist: card.artist,
    edhrec_rank: card.edhrec_rank,
    prices: card.prices,
    card_faces: Array.isArray(card.card_faces) ? card.card_faces.map(compactFace) : undefined
  };
}

function selectBulkInfo(payload) {
  if (payload?.object === 'error') {
    throw new Error(`Scryfall bulk metadata error: ${payload.details || payload.code || 'unknown error'}`);
  }
  // Both /bulk-data/:type and the /bulk-data list endpoint are supported.
  const info = Array.isArray(payload?.data)
    ? payload.data.find(item => item?.type === 'oracle_cards')
    : payload;
  if (!info || info.type !== 'oracle_cards') {
    throw new Error('Scryfall bulk metadata does not contain an oracle_cards entry.');
  }
  if (!(typeof info.jsonl_download_uri === 'string' && info.jsonl_download_uri.trim()) &&
      !(typeof info.download_uri === 'string' && info.download_uri.trim())) {
    throw new Error('Scryfall Oracle Cards metadata does not contain jsonl_download_uri or download_uri.');
  }
  return info;
}

async function downloadCompactCards(info) {
  // Current Scryfall exports use gzip-compressed JSON Lines. Older exports
  // used a JSON array, so retain support for download_uri as well.
  const url = info.jsonl_download_uri?.trim() || info.download_uri.trim();
  const jsonl = Boolean(info.jsonl_download_uri?.trim()) || /\.jsonl(?:\.gz)?(?:[?#]|$)/i.test(url);
  console.log(`Downloading ${jsonl ? 'JSONL' : 'JSON'} bulk file: ${url}`);
  const response = await fetchWithRetry(url, { timeoutMs: 600_000, retries: 2 });
  let bytes = Buffer.from(await response.arrayBuffer());
  // fetch already decodes HTTP Content-Encoding. Inspect the actual bytes
  // instead of the .gz suffix to avoid decompressing the same payload twice.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = await gunzipAsync(bytes);
  }
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const compactCards = [];
  const appendCard = (card, location) => {
    if (!card || card.object !== 'card') {
      throw new Error(`Invalid card object in Scryfall bulk data (${location}).`);
    }
    compactCards.push(compactCard(card));
  };
  if (jsonl) {
    // Compact one record at a time; do not retain a second full raw-card array.
    let start = 0;
    let lineNumber = 0;
    while (start < text.length) {
      let end = text.indexOf('\n', start);
      if (end === -1) end = text.length;
      const line = text.slice(start, end).trim();
      start = end + 1;
      lineNumber += 1;
      if (!line) continue;
      let card;
      try { card = JSON.parse(line); }
      catch (error) { throw new Error(`Invalid Scryfall JSONL at line ${lineNumber}: ${error.message}`); }
      appendCard(card, `line ${lineNumber}`);
    }
  } else {
    const rawCards = JSON.parse(text);
    if (!Array.isArray(rawCards)) throw new Error('Unexpected bulk card data: not an array.');
    rawCards.forEach((card, index) => appendCard(card, `index ${index}`));
  }
  if (compactCards.length < minCards) {
    throw new Error(`Unexpected bulk card count: ${compactCards.length} (minimum ${minCards})`);
  }
  return compactCards;
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return null; }
}

async function fileExists(file) {
  try { return (await stat(file)).isFile(); }
  catch { return false; }
}

await mkdir(outputDir, { recursive: true });
await mkdir(cacheDir, { recursive: true });

console.log(`Reading bulk metadata: ${bulkInfoUrl}`);
const info = selectBulkInfo(await (await fetchWithRetry(bulkInfoUrl, { timeoutMs: 30_000 })).json());

const previous = await readJson(cacheMeta);
if (previous?.ready && previous.cardCount >= minCards && previous.version === info.updated_at && await fileExists(cacheCards)) {
  console.log(`Bulk data is unchanged (${info.updated_at}). Reusing cached compressed DB.`);
  const cachedBytes = (await stat(cacheCards)).size;
  const meta = {
    ...previous,
    checkedAt: new Date().toISOString(),
    compressedBytes: cachedBytes,
    downloadPath: './data/cards.json.gz'
  };
  await copyFile(cacheCards, outputCards);
  await writeFile(outputMeta, JSON.stringify(meta, null, 2));
  process.exit(0);
}

console.log(`Downloading Oracle Cards bulk data updated at ${info.updated_at}...`);
const compactCards = await downloadCompactCards(info);
console.log(`Compacted ${compactCards.length.toLocaleString()} cards.`);
const json = JSON.stringify(compactCards);
console.log(`Compressing ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MiB JSON...`);
const compressed = await gzipAsync(Buffer.from(json), { level: 9 });
const now = new Date().toISOString();
const meta = {
  object: 'deck_canvas_card_database',
  ready: true,
  version: info.updated_at || now,
  sourceType: info.type || 'oracle_cards',
  sourceUpdatedAt: info.updated_at || null,
  builtAt: now,
  checkedAt: now,
  cardCount: compactCards.length,
  compressedBytes: compressed.length,
  downloadPath: './data/cards.json.gz'
};

await writeFile(outputCards, compressed);
await writeFile(outputMeta, JSON.stringify(meta, null, 2));
await writeFile(cacheCards, compressed);
await writeFile(cacheMeta, JSON.stringify(meta, null, 2));
console.log(`Wrote ${outputCards} (${(compressed.length / 1024 / 1024).toFixed(1)} MiB).`);
