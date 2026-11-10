import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';

const execFileAsync = promisify(execFile);
const builder = new URL('../scripts/build-card-db.mjs', import.meta.url);
const version = '2026-11-09T22:02:04.400+00:00';
const cards = [
  {
    object: 'card', id: 'island', oracle_id: 'island-oracle', name: 'Island',
    type_line: 'Basic Land — Island', legalities: { commander: 'legal' },
    image_uris: { normal: 'https://example.com/island.jpg' },
    unused_field: 'This must not appear in the compact database.'
  },
  {
    object: 'card', id: 'delver', name: 'Delver of Secrets // Insectile Aberration',
    card_faces: [{ name: 'Delver of Secrets', oracle_text: '변신 — test text',
      image_uris: { normal: 'https://example.com/delver.jpg' } }]
  }
];
// Include a BOM, blank lines, CRLF and a final line without a newline.
const jsonl = '\uFEFF' + JSON.stringify(cards[0]) + '\r\n\r\n' + JSON.stringify(cards[1]);

async function fixture(t, { format = 'jsonl', compressed = true, httpGzip = false,
  list = false, metadata, body, status = 200, failFirst = 0 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deck-canvas-db-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'));
  await copyFile(builder, path.join(root, 'scripts', 'build-card-db.mjs'));
  const requests = [];
  let base;
  let metadataRequests = 0;
  const bulkPath = `/cards.${format}${compressed ? '.gz' : ''}`;
  const server = createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    if (req.url === '/info') {
      metadataRequests += 1;
      res.setHeader('Content-Type', 'application/json');
      if (metadataRequests === 1 && failFirst) {
        res.writeHead(failFirst, { 'Retry-After': '0' });
        res.end(JSON.stringify({ object: 'error', details: 'Please retry later.' }));
        return;
      }
      res.statusCode = status;
      const info = metadata ?? {
        object: 'bulk_data', type: 'oracle_cards', updated_at: version,
        [format === 'jsonl' ? 'jsonl_download_uri' : 'download_uri']: base + bulkPath
      };
      res.end(JSON.stringify(list ? { object: 'list', data: [
        { type: 'rulings', jsonl_download_uri: base + '/wrong-export' }, info
      ] } : info));
    } else if (req.url === bulkPath) {
      const content = body ?? (format === 'jsonl' ? jsonl : JSON.stringify(cards));
      const bytes = compressed ? gzipSync(content) : Buffer.from(content);
      res.setHeader('Content-Type', compressed ? 'application/gzip' : 'application/json');
      if (httpGzip) res.setHeader('Content-Encoding', 'gzip');
      res.end(bytes);
    } else {
      res.writeHead(404);
      res.end('Unexpected URL');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    root, requests, bulkPath,
    run: (env = {}) => execFileAsync(process.execPath, ['scripts/build-card-db.mjs'], {
      cwd: root,
      env: { ...process.env, SCRYFALL_BULK_INFO_URL: base + '/info',
        SCRYFALL_CACHE_DIR: path.join(root, '.cache', 'scryfall'),
        SCRYFALL_MIN_CARDS: '2', ...env },
      timeout: 20_000
    }),
    readCards: async () => JSON.parse(gunzipSync(await readFile(path.join(root, 'public/data/cards.json.gz')))),
    readMeta: async () => JSON.parse(await readFile(path.join(root, 'public/data/meta.json'), 'utf8'))
  };
}

test('builds current gzip JSONL metadata and reuses the completed cache', async t => {
  const f = await fixture(t);
  await f.run();
  const built = await f.readCards();
  assert.deepEqual(built.map(card => card.name), cards.map(card => card.name));
  assert.equal(built[0].unused_field, undefined);
  assert.equal(built[0].legalities.commander, 'legal');
  assert.equal(built[1].card_faces[0].oracle_text, cards[1].card_faces[0].oracle_text);
  const meta = await f.readMeta();
  assert.equal(meta.ready, true);
  assert.equal(meta.cardCount, 2);
  assert.equal(meta.version, version);
  assert.equal(meta.downloadPath, './data/cards.json.gz');
  assert.ok(meta.compressedBytes > 0);
  assert.match(f.requests[0].headers.accept, /application\/json/);
  assert.ok(f.requests[0].headers['user-agent']);
  await rm(path.join(f.root, 'public/data'), { recursive: true });
  const second = await f.run();
  assert.match(second.stdout, /Reusing cached compressed DB/);
  assert.deepEqual(await f.readCards(), built);
  assert.equal(f.requests.filter(req => req.url === f.bulkPath).length, 1);
});

test('reads uncompressed JSONL', async t => {
  const f = await fixture(t, { compressed: false });
  await f.run();
  assert.equal((await f.readCards()).length, 2);
});

test('does not gunzip twice when fetch has decoded Content-Encoding', async t => {
  const f = await fixture(t, { httpGzip: true });
  await f.run();
  assert.equal((await f.readCards())[0].name, 'Island');
});

for (const compressed of [false, true]) {
  test(`supports the legacy download_uri JSON array (gzip=${compressed})`, async t => {
    const f = await fixture(t, { format: 'json', compressed });
    await f.run();
    assert.equal((await f.readCards()).length, 2);
  });
}

test('selects Oracle Cards from a bulk metadata list', async t => {
  const f = await fixture(t, { list: true });
  await f.run();
  assert.equal((await f.readMeta()).sourceType, 'oracle_cards');
  assert.ok(f.requests.every(req => req.url !== '/wrong-export'));
});

test('malformed JSONL fails without replacing the existing output or cache', async t => {
  const f = await fixture(t, { body: JSON.stringify(cards[0]) + '\n{broken' });
  const files = ['public/data/cards.json.gz', 'public/data/meta.json',
    '.cache/scryfall/cards.json.gz', '.cache/scryfall/meta.json'];
  for (const file of files) {
    await mkdir(path.dirname(path.join(f.root, file)), { recursive: true });
    await writeFile(path.join(f.root, file), 'previous file');
  }
  await assert.rejects(f.run(), error => {
    assert.match(error.stderr, /Invalid Scryfall JSONL at line 2/);
    return true;
  });
  for (const file of files) assert.equal(await readFile(path.join(f.root, file), 'utf8'), 'previous file');
});

test('refuses an incomplete export below the minimum card count', async t => {
  const f = await fixture(t, { body: JSON.stringify(cards[0]) });
  await assert.rejects(f.run(), error => {
    assert.match(error.stderr, /Unexpected bulk card count: 1/);
    return true;
  });
  await assert.rejects(f.readMeta(), { code: 'ENOENT' });
});

test('explains missing download fields in metadata', async t => {
  const f = await fixture(t, { metadata: { object: 'bulk_data', type: 'oracle_cards' } });
  await assert.rejects(f.run(), error => {
    assert.match(error.stderr, /does not contain jsonl_download_uri or download_uri/);
    return true;
  });
});

test('reports a Scryfall error payload instead of a missing download field', async t => {
  const f = await fixture(t, { metadata: { object: 'error', details: 'Metadata unavailable.' } });
  await assert.rejects(f.run(), error => {
    assert.match(error.stderr, /Scryfall bulk metadata error: Metadata unavailable/);
    return true;
  });
});

test('reports HTTP error details without retrying permanent errors', async t => {
  const f = await fixture(t, { status: 404,
    metadata: { object: 'error', details: 'Unknown bulk data type.' } });
  await assert.rejects(f.run(), error => {
    assert.match(error.stderr, /HTTP 404.*Unknown bulk data type/);
    return true;
  });
  assert.equal(f.requests.length, 1);
});

for (const status of [429, 503]) {
  test(`retries a temporary HTTP ${status} error and completes the build`, async t => {
    const f = await fixture(t, { failFirst: status });
    await f.run();
    assert.equal((await f.readMeta()).ready, true);
    assert.equal(f.requests.filter(req => req.url === '/info').length, 2);
  });
}
