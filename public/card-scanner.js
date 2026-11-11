import { t } from './i18n.js';
import { createScanIndex, matchScanNames, scanNameQueries, clampCrop } from './scan-matcher.js';

const $ = id => document.getElementById(id);
const OCR_ROOT = new URL('./vendor/tesseract/', import.meta.url);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function setupCardScanner({ getCatalog, searchNames, addCard, getFormat, cardImage, onAdded }) {
  const dialog = $('scanDialog');
  const canvas = $('scanCanvas');
  const video = $('scanVideo');
  let source = null, crop = null, dragStart = null, stream = null, worker = null;
  let job = 0, busy = false, cameraStarting = false, candidates = [], selected = null;
  let indexedCards = null, index = [], lastStatus = '', statusArgs = {};

  function status(key, args = {}, progress = null) {
    lastStatus = key; statusArgs = args;
    $('scanStatus').textContent = t(key, args);
    $('scanProgress').classList.toggle('hidden', progress === null);
    if (progress !== null) $('scanProgress').value = Math.max(0, Math.min(100, progress));
  }

  function setBusy(value) {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    for (const id of ['scanUploadBtn', 'scanCameraBtn', 'scanLanguage', 'scanRotateBtn', 'scanResetCropBtn', 'scanNameBtn', 'scanNameInput']) $(id).disabled = value;
    $('scanRecognizeBtn').disabled = value || !source;
    $('scanCancelBtn').classList.toggle('hidden', !value);
    $('scanAddBtn').disabled = value || !selected;
    canvas.style.pointerEvents = value ? 'none' : '';
  }

  function stopCamera() {
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    video.srcObject = null; cameraStarting = false;
    $('scanLive').classList.add('hidden');
  }

  function cancel(showStatus = true) {
    job++;
    if (worker) { worker.terminate().catch(() => {}); worker = null; }
    setBusy(false);
    if (showStatus) status('인식을 취소했습니다.');
  }

  function resetResults() {
    candidates = []; selected = null;
    renderResults();
  }

  function syncTargets() {
    const current = $('scanTarget').value;
    const commander = getFormat().mode === 'commander';
    $('scanTarget').innerHTML = `<option value="main">${escape(t('메인 덱'))}</option>` + (commander
      ? `<option value="commander">${escape(t('커맨더'))}</option>`
      : `<option value="sideboard">${escape(t('사이드보드'))}</option>`);
    if ([...$('scanTarget').options].some(option => option.value === current)) $('scanTarget').value = current;
    $('scanQuantity').max = $('scanTarget').value === 'commander' ? '1' : '99';
    if ($('scanTarget').value === 'commander') $('scanQuantity').value = '1';
  }

  function renderResults() {
    $('scanCandidates').innerHTML = '';
    $('scanResultsEmpty').classList.toggle('hidden', candidates.length > 0);
    for (const [i, hit] of candidates.entries()) {
      const label = document.createElement('label');
      label.className = `scan-candidate${selected === hit ? ' selected' : ''}`;
      const image = cardImage(hit.card, 'small');
      label.innerHTML = `<input type="radio" name="scan-card" value="${i}" ${selected === hit ? 'checked' : ''}>
        ${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : '<span class="scan-card-back">◇</span>'}
        <span><strong>${escape(hit.card.printed_name || hit.card.name)}</strong>
        ${hit.card.printed_name ? `<small>${escape(hit.card.name)}</small>` : ''}
        <small>${escape(hit.card.type_line || '')}</small><em>${escape(t(hit.exactName ? '이름 일치 · 이미지 확인 필요' : '유사한 이름 · 이미지 확인 필요'))}</em></span>`;
      label.querySelector('input').addEventListener('change', () => {
        selected = hit;
        for (const row of $('scanCandidates').children) row.classList.toggle('selected', row === label);
        $('scanAddBtn').disabled = busy;
      });
      $('scanCandidates').append(label);
    }
    $('scanAddBtn').disabled = busy || !selected;
  }

  function draw() {
    if (!source) return;
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);
    if (!crop) return;
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, source.width, source.height);
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, crop.x, crop.y, crop.width, crop.height);
    ctx.strokeStyle = '#e3b972'; ctx.lineWidth = Math.max(2, source.width / 250);
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
  }

  function useImage(image, initialCrop = null) {
    // Cap decoded working pixels before OCR, including high-resolution phone photos.
    const ratio = Math.min(1, 2200 / Math.max(image.width, image.height));
    source = document.createElement('canvas');
    source.width = Math.round(image.width * ratio); source.height = Math.round(image.height * ratio);
    source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
    crop = initialCrop ? clampCrop({ x: initialCrop.x * ratio, y: initialCrop.y * ratio, width: initialCrop.width * ratio, height: initialCrop.height * ratio }, source.width, source.height) : null;
    $('scanEmpty').classList.add('hidden'); $('scanPreview').classList.remove('hidden');
    resetResults(); $('scanNameInput').value = '';
    $('scanReadText').textContent = ''; $('scanOcrDetails').classList.add('hidden'); $('scanOcrDetails').open = false;
    draw(); setBusy(false); status('카드 한 장을 드래그로 지정한 뒤 인식하세요. 이름 부분만 지정해도 됩니다.');
  }

  async function loadFile(file) {
    if (!file || busy) return;
    cancel(false); stopCamera();
    const ticket = job;
    if (!/^image\/(jpeg|png|webp|avif|heic|heif|bmp)$/i.test(file.type) && !/\.(jpe?g|png|webp|avif|heic|heif|bmp)$/i.test(file.name)) {
      status('JPG, PNG, WebP 등 이미지 파일을 선택하세요.'); return;
    }
    if (file.size > 25 * 1024 * 1024) { status('25MB 이하의 이미지를 선택하세요.'); return; }
    setBusy(true); status('이미지 불러오는 중…');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      await image.decode();
      if (ticket !== job || !dialog.open) return;
      if (image.naturalWidth < 40 || image.naturalHeight < 20) throw new Error('small-image');
      useImage(image);
    } catch {
      if (ticket === job) status('이미지를 읽지 못했습니다. HEIC 사진은 JPG 또는 PNG로 변환해주세요.');
    } finally {
      URL.revokeObjectURL(url);
      if (ticket === job) setBusy(false);
    }
  }

  function position(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(source.width, (event.clientX - rect.left) * source.width / rect.width)), y: Math.max(0, Math.min(source.height, (event.clientY - rect.top) * source.height / rect.height)) };
  }
  canvas.addEventListener('pointerdown', event => {
    if (!source || busy || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId); dragStart = position(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragStart) return;
    const point = position(event);
    crop = clampCrop({ x: Math.min(point.x, dragStart.x), y: Math.min(point.y, dragStart.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) }, source.width, source.height);
    draw();
  });
  const endCrop = () => {
    if (!dragStart) return;
    dragStart = null;
    if (crop && (crop.width < 35 || crop.height < 15)) crop = null;
    draw(); resetResults();
  };
  canvas.addEventListener('pointerup', endCrop); canvas.addEventListener('pointercancel', endCrop);
  $('scanRotateBtn').addEventListener('click', () => {
    if (!source) return;
    const rotated = document.createElement('canvas'); rotated.width = source.height; rotated.height = source.width;
    const ctx = rotated.getContext('2d'); ctx.translate(rotated.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(source, 0, 0);
    source = rotated; crop = null; resetResults(); draw();
  });
  $('scanResetCropBtn').addEventListener('click', () => { crop = null; resetResults(); draw(); });

  async function startCamera() {
    if (busy || cameraStarting) return;
    cancel(false); stopCamera();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status('카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다. 이미지 불러오기도 이용할 수 있습니다.'); return;
    }
    const ticket = job;
    cameraStarting = true; $('scanCameraBtn').disabled = true;
    $('scanRecognizeBtn').disabled = true;
    status('카메라 권한을 허용해주세요.');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (ticket !== job || !dialog.open) { media.getTracks().forEach(track => track.stop()); return; }
      stream = media; video.srcObject = media;
      $('scanLive').classList.remove('hidden'); $('scanPreview').classList.add('hidden'); $('scanEmpty').classList.add('hidden');
      await video.play();
      if (ticket !== job) return;
      const region = cameraCrop();
      Object.assign($('scanCameraGuide').style, { left: `${region.x / video.videoWidth * 100}%`, top: `${region.y / video.videoHeight * 100}%`, width: `${region.width / video.videoWidth * 100}%`, height: `${region.height / video.videoHeight * 100}%` });
      status('카드 한 장을 테두리에 맞추고 촬영하세요.');
    } catch (error) {
      if (ticket !== job) return;
      stopCamera();
      $('scanPreview').classList.toggle('hidden', !source); $('scanEmpty').classList.toggle('hidden', Boolean(source));
      status(error.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다. 브라우저 권한을 변경하거나 이미지를 불러오세요.' : '카메라를 사용할 수 없습니다. 연결을 확인하거나 이미지를 불러오세요.');
    } finally {
      if (ticket === job) { cameraStarting = false; $('scanCameraBtn').disabled = false; $('scanRecognizeBtn').disabled = Boolean(stream) || !source; }
    }
  }

  function cameraCrop() {
    const h = Math.min(video.videoHeight * .84, video.videoWidth * .84 * 88 / 63), w = h * 63 / 88;
    return { x: (video.videoWidth - w) / 2, y: (video.videoHeight - h) / 2, width: w, height: h };
  }
  $('scanCaptureBtn').addEventListener('click', () => {
    if (!video.videoWidth || !stream) return;
    const image = document.createElement('canvas'); image.width = video.videoWidth; image.height = video.videoHeight;
    image.getContext('2d').drawImage(video, 0, 0);
    const region = cameraCrop(); stopCamera(); useImage(image, region);
  });
  $('scanStopCameraBtn').addEventListener('click', () => {
    job++; stopCamera(); $('scanCameraBtn').disabled = false;
    $('scanRecognizeBtn').disabled = !source;
    $('scanPreview').classList.toggle('hidden', !source); $('scanEmpty').classList.toggle('hidden', Boolean(source));
    status('카메라를 닫았습니다.');
  });

  async function ensureIndex() {
    const cards = await getCatalog();
    if (cards !== indexedCards) { index = createScanIndex(cards); indexedCards = cards; }
  }

  function prepareOcrImage(titleOnly) {
    let region = crop || { x: 0, y: 0, width: source.width, height: source.height };
    // Card title is near the top. A wide crop is already a user-selected title strip.
    if (titleOnly && region.height / region.width > .75) region = {
      x: region.x + region.width * .045, y: region.y + region.height * .035,
      width: region.width * .83, height: region.height * .075
    };
    const output = document.createElement('canvas');
    const scale = Math.min(3, 1600 / region.width);
    output.width = Math.round(region.width * scale); output.height = Math.round(region.height * scale);
    const ctx = output.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, output.width, output.height);
    return output;
  }

  async function recognize() {
    if (!source || busy) return;
    stopCamera(); resetResults();
    $('scanOcrDetails').classList.add('hidden'); $('scanReadText').textContent = '';
    const ticket = ++job;
    setBusy(true); status('카드 DB와 인식 모델 준비 중…', {}, 2);
    let timer, timedOut = false;
    const assertActive = () => { if (ticket !== job || !dialog.open) throw new Error('cancelled'); };
    const work = async () => {
      await ensureIndex(); assertActive();
      const { default: Tesseract } = await import('./vendor/tesseract/tesseract.esm.min.js'); assertActive();
      const { createWorker, PSM } = Tesseract;
      const language = $('scanLanguage').value;
      const langs = language === 'ko' ? 'kor' : language === 'ja' ? 'jpn' : 'eng';
      const created = await createWorker(langs, 1, {
        workerPath: new URL('worker.min.js', OCR_ROOT).href,
        corePath: new URL('core/', OCR_ROOT).href,
        langPath: new URL('lang/', OCR_ROOT).href.replace(/\/$/, ''),
        workerBlobURL: false,
        logger: message => {
          if (ticket !== job) return;
          const reading = message.status === 'recognizing text';
          status(reading ? '카드 이름 읽는 중…' : '인식 모델 불러오는 중…', {}, reading ? 30 + (message.progress || 0) * 50 : 8 + (message.progress || 0) * 20);
        }
      });
      if (ticket !== job || !dialog.open) { await created.terminate(); return; }
      worker = created;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: '1' });
      const title = await worker.recognize(prepareOcrImage(true)); assertActive();
      let text = title.data.text;
      let hits = matchScanNames(text, index);
      if (!hits.length || hits[0].score < .90) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const full = await worker.recognize(prepareOcrImage(false)); assertActive();
        text = `${text}\n${full.data.text}`;
        hits = matchScanNames(text, index);
      }
      const nameQueries = scanNameQueries(text).filter(q => language === 'en' || (language === 'ko' ? /[가-힣]/.test(q) : /[\u3040-\u30ff\u3400-\u9fff]/.test(q)));
      $('scanNameInput').value = hits[0]?.matchedName || nameQueries[0] || '';
      $('scanReadText').textContent = text.trim() || t('읽힌 글자가 없습니다.');
      $('scanOcrDetails').classList.remove('hidden');
      if (language !== 'en' || !hits.length) {
        status('카드 이름 대조 중…', {}, 90);
        const online = await searchNames(nameQueries.slice(0, 3), language); assertActive();
        const onlineHits = matchScanNames(text, createScanIndex(online));
        hits = mergeHits([...hits, ...onlineHits]);
      }
      assertActive(); candidates = hits; selected = null; renderResults();
      if (hits.length) $('scanNameInput').value = hits[0].card.printed_name || hits[0].matchedName || hits[0].card.name;
      status(hits.length ? '후보의 이름과 이미지를 확인하고 추가할 카드를 선택하세요.' : '일치하는 카드를 찾지 못했습니다. 이름 영역을 다시 지정하거나 아래에서 이름을 수정해 검색하세요.');
    };
    try {
      await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('timeout')); }, 120_000); })]);
    } catch (error) {
      if (ticket === job) {
        console.warn('Card recognition failed:', error?.message || error);
        if (timedOut) { cancel(false); status('인식 시간이 초과되었습니다. 작은 이미지로 다시 시도하거나 이름으로 검색하세요.'); }
        else status('인식을 완료하지 못했습니다. 연결 상태를 확인하거나 이름으로 검색하세요.');
      }
    } finally {
      clearTimeout(timer);
      if (ticket === job) {
        if (worker) { await worker.terminate().catch(() => {}); worker = null; }
        setBusy(false);
      }
    }
  }

  function mergeHits(hits) {
    const result = new Map();
    for (const hit of hits.sort((a, b) => b.score - a.score)) {
      const key = hit.card.oracle_id || hit.card.id || hit.card.name;
      if (!result.has(key)) result.set(key, hit);
    }
    return [...result.values()].slice(0, 5);
  }

  $('scanNameForm').addEventListener('submit', async event => {
    event.preventDefault();
    const name = $('scanNameInput').value.trim();
    if (busy || name.length < 2) return;
    stopCamera(); const ticket = ++job; resetResults(); setBusy(true); status('카드 이름 대조 중…', {}, 15);
    try {
      await ensureIndex(); if (ticket !== job) return;
      let hits = matchScanNames(name, index);
      if (!hits.length || hits[0].score < .99 || $('scanLanguage').value !== 'en') {
        const cards = await searchNames([name], $('scanLanguage').value); if (ticket !== job) return;
        // Explicit manual search can show partial-name results too.
        const matched = matchScanNames(name, createScanIndex(cards));
        hits = mergeHits([...hits, ...matched, ...cards.map(card => ({ card, score: .5 }))]);
      }
      candidates = hits; renderResults();
      status(hits.length ? '후보의 이름과 이미지를 확인하고 추가할 카드를 선택하세요.' : '일치하는 카드를 찾지 못했습니다. 이름 영역을 다시 지정하거나 아래에서 이름을 수정해 검색하세요.');
    } catch {
      if (ticket === job) status('카드 검색에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.');
    } finally { if (ticket === job) setBusy(false); }
  });

  $('scanAddBtn').addEventListener('click', () => {
    if (!selected || busy) return;
    const amount = Number($('scanQuantity').value);
    if (!Number.isInteger(amount) || amount < 1 || amount > Number($('scanQuantity').max)) {
      $('scanQuantity').reportValidity(); return;
    }
    const card = selected.card;
    if (addCard(card, $('scanTarget').value, amount)) {
      status('덱에 추가했습니다: {name} ×{count}', { name: card.name, count: amount });
      selected = null; renderResults(); onAdded();
    } else status('덱에 추가하지 못했습니다. 포맷의 중복 제한 또는 커맨더 조건을 확인하세요.');
  });

  $('scanUploadBtn').addEventListener('click', () => $('scanFile').click());
  $('scanFile').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
  $('scanCameraBtn').addEventListener('click', startCamera);
  $('scanRecognizeBtn').addEventListener('click', recognize);
  $('scanCancelBtn').addEventListener('click', () => cancel());
  $('scanTarget').addEventListener('change', syncTargets);
  $('scanLanguage').addEventListener('change', resetResults);
  $('scanCloseBtn').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    cancel(false); stopCamera(); source = null; crop = null; dragStart = null;
    canvas.width = 1; canvas.height = 1;
    $('scanPreview').classList.add('hidden'); $('scanEmpty').classList.remove('hidden');
    $('scanOcrDetails').classList.add('hidden'); $('scanReadText').textContent = '';
    $('scanNameInput').value = ''; resetResults();
  });
  dialog.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  dialog.addEventListener('drop', event => {
    if (event.dataTransfer.files.length) { event.preventDefault(); loadFile(event.dataTransfer.files[0]); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (stream || cameraStarting)) {
      job++; stopCamera(); $('scanCameraBtn').disabled = false;
      $('scanRecognizeBtn').disabled = !source;
      $('scanPreview').classList.toggle('hidden', !source); $('scanEmpty').classList.toggle('hidden', Boolean(source));
      status('카메라를 닫았습니다.');
    }
  });
  window.addEventListener('pagehide', () => { cancel(false); stopCamera(); });
  $('scanBtn').addEventListener('click', () => {
    syncTargets(); setBusy(false); status('사진을 불러오거나 카메라로 카드 한 장을 촬영하세요.'); dialog.showModal();
  });
  return { translate() { syncTargets(); renderResults(); if (lastStatus) status(lastStatus, statusArgs); } };
}
