import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public', 'data');
const cacheDir = path.resolve(process.env.SCRYFALL_CACHE_DIR || path.join(root, '.cache', 'scryfall'));
const bulkInfoUrl = process.env.SCRYFALL_BULK_INFO_URL || 'https://api.scryfall.com/bulk-data/oracle-cards';
const userAgent = process.env.SCRYFALL_USER_AGENT || 'DeckCanvasGithubPages/2.0 (GitHub Pages deck builder)';
const minCards = Number(process.env.SCRYFALL_MIN_CARDS || 1000);

const outputCards = path.join(outputDir, 'cards.json.gz');
const outputMeta = path.join(outputDir, 'meta.json');
const cacheCards = path.join(cacheDir, 'cards.json.gz');
const cacheMeta = path.join(cacheDir, 'meta.json');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, { timeoutMs = 60_000, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json;q=0.9,*/*;q=0.8'
        }
      });
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 750 * (2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await sleep(750 * (2 ** attempt));
    }
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
const info = await (await fetchWithRetry(bulkInfoUrl, { timeoutMs: 30_000 })).json();
if (!info.download_uri) throw new Error('Scryfall bulk metadata does not contain download_uri.');

const previous = await readJson(cacheMeta);
if (previous?.version === info.updated_at && await fileExists(cacheCards)) {
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
const rawCards = await (await fetchWithRetry(info.download_uri, { timeoutMs: 600_000, retries: 2 })).json();
if (!Array.isArray(rawCards) || rawCards.length < minCards) {
  throw new Error(`Unexpected bulk card count: ${Array.isArray(rawCards) ? rawCards.length : 'not an array'}`);
}

console.log(`Compacting ${rawCards.length.toLocaleString()} cards...`);
const compactCards = rawCards.map(compactCard);
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
