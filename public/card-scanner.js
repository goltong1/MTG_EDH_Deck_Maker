// Multi-card integration: AGPL-3.0-or-later. See vendor/card-detector/NOTICE.md.
import { t } from './i18n.js';
import { createScanIndex, matchScanNames, scanNameQueries, normalizeScanName, clampCrop } from './scan-matcher.js';
import { createCardDetector, cropCard, rotateCard } from './card-detector.js';
import { boxQuad, pointInQuad, polygonIoU, selectedScanItems, MAX_SCAN_CARDS } from './scan-geometry.js';

const $ = id => document.getElementById(id);
const OCR_ROOT = new URL('./vendor/tesseract/', import.meta.url);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

export function setupCardScanner({ getCatalog, searchNames, addCard, getFormat, cardImage, onAdded }) {
  const dialog=$('scanDialog'), canvas=$('scanCanvas'), video=$('scanVideo'), detector=createCardDetector();
  let source=null, photo=0, nextId=0, items=[], activeId=null, dragStart=null, draft=null;
  let stream=null, cameraStarting=false, worker=null, job=0, busy=false;
  let indexedCards=null,index=[],lastStatus='',statusArgs={},lastProgress=null;
  const active=()=>items.find(item=>item.id===activeId);
  const currentItems=()=>items.filter(item=>item.photo===photo);

  function status(key,args={},progress=null) {
    lastStatus=key;statusArgs=args;lastProgress=progress;
    $('scanStatus').textContent=t(key,args);
    $('scanProgress').classList.toggle('hidden',progress===null);
    if(progress!==null) $('scanProgress').value=Math.max(0,Math.min(100,progress));
  }
  function setBusy(value) {
    busy=value;dialog.setAttribute('aria-busy',String(value));
    for(const id of ['scanUploadBtn','scanCameraBtn','scanLanguage','scanDetailed','scanNameBtn','scanNameInput','scanTarget','scanClearQueueBtn','scanSelectAll','scanSelectNone']) $(id).disabled=value;
    for(const input of $('scanQueue').querySelectorAll('button,input')) input.disabled=value||input.dataset.locked==='true';
    $('scanDetectBtn').disabled=value||!source||Boolean(stream);
    $('scanWholeBtn').disabled=value||!source||Boolean(stream);
    $('scanRecognizeBtn').disabled=value||Boolean(stream)||(!source&&!items.length);
    $('scanReadActiveBtn').disabled=value||!active()||active().added;
    $('scanRotateBtn').disabled=value||!active()||active().added;
    $('scanQuantity').disabled=value||!active()||active().added;
    for(const id of ['scanNameBtn','scanNameInput']) $(id).disabled=value||!active()||active().added;
    $('scanCancelBtn').classList.toggle('hidden',!value);
    $('scanAddBtn').disabled=value||!active()?.chosen||active().added;
    $('scanBatchAddBtn').disabled=value||!selectedScanItems(items).length;
    canvas.style.pointerEvents=value?'none':'';
    for(const input of $('scanCandidates').querySelectorAll('input')) input.disabled=value||active()?.added;
  }
  function stopCamera() {
    stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;cameraStarting=false;
    $('scanLive').classList.add('hidden');
  }
  function cancel(show=true) {
    job++;detector.cancel();
    if(worker) {worker.terminate().catch(()=>{});worker=null;}
    for(const item of items) if(item.state==='reading') item.state='pending';
    setBusy(false);renderQueue();
    if(show) status('중단했습니다. 완료된 인식 결과는 목록에 남아 있습니다.');
  }
  function syncTargets() {
    const value=$('scanTarget').value,commander=getFormat().mode==='commander';
    $('scanTarget').innerHTML=`<option value="main">${escape(t('메인 덱'))}</option>`+(commander?`<option value="commander">${escape(t('커맨더'))}</option>`:`<option value="sideboard">${escape(t('사이드보드'))}</option>`);
    if([...$('scanTarget').options].some(option=>option.value===value)) $('scanTarget').value=value;
  }
  function renderQueue() {
    const container=$('scanQueue');container.innerHTML='';
    for(const item of items) {
      const row=document.createElement('div');row.className=`scan-queue-row${item.id===activeId?' active':''}${item.added?' added':''}`;
      const name=item.chosen?.card.printed_name||item.chosen?.card.name||t('이름 확인 필요');
      const state=item.added?'추가 완료':item.state==='blocked'?'덱 규칙 확인':item.state==='reading'?'읽는 중…':item.state==='error'?'다시 시도':item.chosen?'후보 확인 필요':item.state==='pending'?'인식 대기':'이름 확인 필요';
      row.innerHTML=`<input class="scan-include" type="checkbox" aria-label="${escape(t('카드 {n} 선택',{n:item.id}))}" ${item.checked?'checked':''} ${!item.chosen||item.added?'disabled data-locked="true"':''}><button type="button" class="scan-item-focus" aria-pressed="${item.id===activeId}"><img src="${item.thumb}" alt=""><span><small>#${item.id} · ${escape(t('사진 {n}',{n:item.photo}))}</small><strong>${escape(name)}</strong><em>${escape(t(state))} · ×${item.quantity}</em></span></button><button class="scan-remove" type="button" aria-label="${escape(t('카드 {n} 목록에서 제거',{n:item.id}))}">×</button>`;
      row.querySelector('.scan-include').addEventListener('change',event=>{item.checked=event.target.checked;renderSummary();setBusy(busy);draw();});
      row.querySelector('.scan-item-focus').addEventListener('click',()=>selectItem(item.id));
      row.querySelector('.scan-remove').addEventListener('click',()=>{if(busy)return;items=items.filter(other=>other!==item);if(activeId===item.id)activeId=items[0]?.id??null;renderAll();});
      container.append(row);
    }
    $('scanResultsEmpty').classList.toggle('hidden',items.length>0);
    renderSummary();setBusy(busy);
  }
  function renderSummary() {
    const selected=selectedScanItems(items),quantity=selected.reduce((n,item)=>n+item.quantity,0);
    $('scanQueueSummary').textContent=t('검출 {count}개 · 선택 {selected}개 / {quantity}장',{count:items.length,selected:selected.length,quantity});
  }
  function renderCandidates() {
    const item=active(),hits=item?.candidates||[];
    $('scanActiveTitle').textContent=item?t('카드 {n} 확인',{n:item.id}):t('목록에서 카드를 선택하세요');
    $('scanCandidates').innerHTML='';
    $('scanNameInput').value=item?.query||'';
    $('scanQuantity').value=item?.quantity||1;
    $('scanReadText').textContent=item?.text||'';
    $('scanOcrDetails').classList.toggle('hidden',!item?.text);
    for(const [i,hit] of hits.entries()) {
      const label=document.createElement('label');label.className=`scan-candidate${item.chosen===hit?' selected':''}`;
      const img=cardImage(hit.card,'small');
      label.innerHTML=`<input type="radio" name="scan-card" value="${i}" ${item.chosen===hit?'checked':''}>${img?`<img src="${escape(img)}" alt="" loading="lazy">`:'<span class="scan-card-back">◇</span>'}<span><strong>${escape(hit.card.printed_name||hit.card.name)}</strong>${hit.card.printed_name?`<small>${escape(hit.card.name)}</small>`:''}<small>${escape(hit.card.type_line||'')}</small><em>${escape(t(hit.exactName?'이름 일치 · 이미지 확인 필요':'유사한 이름 · 이미지 확인 필요'))}</em></span>`;
      label.querySelector('input').addEventListener('change',()=>{item.chosen=hit;item.checked=true;item.query=hit.card.printed_name||hit.card.name;item.state='ready';renderAll();});
      $('scanCandidates').append(label);
    }
    setBusy(busy);
  }
  function renderAll(){renderQueue();renderCandidates();draw();}
  function selectItem(id){activeId=id;renderAll();}
  function draw() {
    if(!source)return;
    canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
    for(const item of currentItems()) {
      const color=item.added?'#83ba91':item.id===activeId?'#ffe2a0':item.chosen?'#d4b271':'#eb9b69';
      ctx.beginPath();item.quad.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(3,source.width/220);ctx.stroke();
      if(item.id===activeId){ctx.fillStyle='#e4b76620';ctx.fill();}
      const p=item.quad.reduce((a,b)=>b.y<a.y?b:a),size=Math.max(22,source.width/37);
      ctx.fillStyle=color;ctx.fillRect(p.x,p.y,size*1.65,size*1.1);ctx.fillStyle='#111';ctx.font=`bold ${size*.8}px sans-serif`;ctx.fillText(String(item.id),p.x+size*.15,p.y+size*.85);
    }
    if(draft){ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,source.width/300);ctx.setLineDash([12,8]);ctx.strokeRect(draft.x,draft.y,draft.width,draft.height);}
  }
  function appendRegion(quad,portrait=true) {
    if(items.length>=MAX_SCAN_CARDS){status('목록은 최대 {n}개입니다. 추가를 마친 뒤 목록을 비워주세요.',{n:MAX_SCAN_CARDS});return null;}
    if(currentItems().some(item=>polygonIoU(item.quad,quad)>.5))return null;
    const bitmap=cropCard(source,quad,{portrait}),thumb=bitmap.toDataURL('image/jpeg',.65);
    const item={id:++nextId,photo,quad,bitmap,thumb,candidates:[],chosen:null,checked:false,quantity:1,added:false,state:'pending',text:'',query:''};
    items.push(item);activeId=item.id;return item;
  }
  function useImage(image) {
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    const scale=Math.min(1,4096/Math.max(width,height));
    source=document.createElement('canvas');source.width=Math.round(width*scale);source.height=Math.round(height*scale);
    source.getContext('2d').drawImage(image,0,0,source.width,source.height);photo++;activeId=null;
    $('scanEmpty').classList.add('hidden');$('scanPreview').classList.remove('hidden');
    renderAll();setBusy(false);status('여러 장을 자동 검출하거나 사진 위를 드래그해 카드 영역을 추가하세요.');
  }
  async function loadFile(file) {
    if(!file||busy)return;
    cancel(false);stopCamera();$('scanPreview').classList.toggle('hidden',!source);$('scanEmpty').classList.toggle('hidden',Boolean(source));const ticket=job;
    if(!/^image\/(jpeg|png|webp|avif|heic|heif|bmp)$/i.test(file.type)&&!/\.(jpe?g|png|webp|avif|heic|heif|bmp)$/i.test(file.name)){status('JPG, PNG, WebP 등 이미지 파일을 선택하세요.');return;}
    if(file.size>25*1024*1024){status('25MB 이하의 이미지를 선택하세요.');return;}
    setBusy(true);status('이미지 불러오는 중…');const url=URL.createObjectURL(file);
    try{const image=new Image();image.src=url;await image.decode();if(ticket!==job||!dialog.open)return;if(image.naturalWidth<40||image.naturalHeight<20)throw new Error('small');useImage(image);}
    catch{if(ticket===job)status('이미지를 읽지 못했습니다. HEIC 사진은 JPG 또는 PNG로 변환해주세요.');}
    finally{URL.revokeObjectURL(url);if(ticket===job)setBusy(false);}
  }
  function position(event){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(source.width,(event.clientX-r.left)*source.width/r.width)),y:Math.max(0,Math.min(source.height,(event.clientY-r.top)*source.height/r.height))};}
  canvas.addEventListener('pointerdown',event=>{if(!source||busy||event.button!==0)return;canvas.setPointerCapture(event.pointerId);dragStart=position(event);draft=null;});
  canvas.addEventListener('pointermove',event=>{if(!dragStart)return;const p=position(event);draft=clampCrop({x:Math.min(p.x,dragStart.x),y:Math.min(p.y,dragStart.y),width:Math.abs(p.x-dragStart.x),height:Math.abs(p.y-dragStart.y)},source.width,source.height);draw();});
  canvas.addEventListener('pointerup',()=>{
    if(!dragStart)return;
    if(draft&&draft.width>35&&draft.height>20){appendRegion(boxQuad(draft.x+draft.width/2,draft.y+draft.height/2,draft.width,draft.height,0),false);}
    else{const item=currentItems().find(item=>pointInQuad(dragStart,item.quad));if(item)activeId=item.id;}
    dragStart=null;draft=null;renderAll();
  });
  canvas.addEventListener('pointercancel',()=>{dragStart=null;draft=null;draw();});
  $('scanWholeBtn').addEventListener('click',()=>{if(!source||busy)return;appendRegion(boxQuad(source.width/2,source.height/2,source.width,source.height,0),false);renderAll();});
  $('scanRotateBtn').addEventListener('click',()=>{const item=active();if(!item||busy||item.added)return;item.bitmap=rotateCard(item.bitmap,90);item.thumb=item.bitmap.toDataURL('image/jpeg',.65);item.chosen=null;item.candidates=[];item.checked=false;item.state='pending';item.text='';item.query='';renderAll();});

  async function startCamera() {
    if(busy||cameraStarting)return;cancel(false);stopCamera();
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다. 이미지 불러오기도 이용할 수 있습니다.');return;}
    const ticket=job;cameraStarting=true;$('scanCaptureBtn').disabled=true;setBusy(true);status('카메라 권한을 허용해주세요.');
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
      if(ticket!==job||!dialog.open){media.getTracks().forEach(track=>track.stop());return;}
      stream=media;video.srcObject=media;$('scanLive').classList.remove('hidden');$('scanPreview').classList.add('hidden');$('scanEmpty').classList.add('hidden');await video.play();
      if(ticket!==job)return;$('scanCaptureBtn').disabled=false;status('카드들을 겹치지 않게 펼치고 이름이 보이도록 촬영하세요.');
    }catch(error){if(ticket===job){stopCamera();$('scanPreview').classList.toggle('hidden',!source);$('scanEmpty').classList.toggle('hidden',Boolean(source));status(error.name==='NotAllowedError'?'카메라 권한이 거부되었습니다. 브라우저 권한을 변경하거나 이미지를 불러오세요.':'카메라를 사용할 수 없습니다. 연결을 확인하거나 이미지를 불러오세요.');}}
    finally{if(ticket===job){cameraStarting=false;setBusy(false);}}
  }
  $('scanCaptureBtn').addEventListener('click',()=>{if(!video.videoWidth||!stream)return;const image=document.createElement('canvas');image.width=video.videoWidth;image.height=video.videoHeight;image.getContext('2d').drawImage(video,0,0);stopCamera();useImage(image);});
  $('scanStopCameraBtn').addEventListener('click',()=>{cancel(false);stopCamera();$('scanPreview').classList.toggle('hidden',!source);$('scanEmpty').classList.toggle('hidden',Boolean(source));setBusy(false);status('카메라를 닫았습니다.');});

  function assertActive(ticket){if(ticket!==job||!dialog.open)throw new Error('cancelled');}
  async function detectRegions(ticket) {
    if(!source)return 0;
    const detected=await detector.detect(source,{detailed:$('scanDetailed').checked,onProgress:(i,total)=>status('카드 위치 찾는 중… {n}/{total}',{n:i+1,total},4+i/total*18)});assertActive(ticket);
    let count=0;for(const detection of detected)if(appendRegion(detection.quad))count++;
    activeId=currentItems().find(item=>!item.added)?.id??activeId;renderAll();return count;
  }
  $('scanDetectBtn').addEventListener('click',async()=>{
    if(busy||!source)return;const ticket=++job;setBusy(true);
    try{await detectRegions(ticket);status(currentItems().length?'검출된 영역을 확인하세요. 누락된 카드는 드래그로 추가할 수 있습니다.':'카드를 찾지 못했습니다. 드래그로 영역을 지정하거나 한 장 모드를 이용하세요.');}
    catch(error){if(ticket===job)status('자동 검출을 완료하지 못했습니다. 드래그로 카드 영역을 지정해 계속할 수 있습니다.');}
    finally{if(ticket===job){detector.cancel();setBusy(false);}}
  });
  async function ensureIndex(){const cards=await getCatalog();if(cards!==indexedCards){index=createScanIndex(cards);indexedCards=cards;}}
  function ocrImage(bitmap,titleOnly=true,variant=0){
    const portrait=bitmap.height/bitmap.width>.75;
    const strips=[[.035,.035,.85,.075],[.065,.035,.795,.075],[.065,.025,.795,.065],[.065,.06,.795,.05]];
    const [left,top,width,height]=strips[variant]||strips[0];
    const r=titleOnly&&portrait?{x:bitmap.width*left,y:bitmap.height*top,width:bitmap.width*width,height:bitmap.height*height}:{x:0,y:0,width:bitmap.width,height:bitmap.height};
    const out=document.createElement('canvas'),scale=Math.min(3,1500/r.width),padding=20;
    const w=Math.max(1,Math.round(r.width*scale)),h=Math.max(1,Math.round(r.height*scale));out.width=w+padding*2;out.height=h+padding*2;
    const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(bitmap,r.x,r.y,r.width,r.height,padding,padding,w,h);return out;
  }
  function mergeHits(hits){const map=new Map();for(const hit of hits.sort((a,b)=>b.score-a.score)){const key=hit.card.oracle_id||hit.card.id||hit.card.name;if(!map.has(key))map.set(key,hit);}return[...map.values()].slice(0,5);}
  async function readItem(item,ocr,PSM,language,ticket) {
    let best={text:'',hits:[],bitmap:item.bitmap,confidence:0};
    const trials=[];
    // An OBB has no top/bottom semantics. Test both orientations and a tighter title strip.
    const orientations=[item.bitmap,rotateCard(item.bitmap)];
    outer: for(const bitmap of orientations) {
      for(const variant of [0,1,2,3]) {
        await ocr.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,preserve_interword_spaces:'1'});
        const result=await ocr.recognize(ocrImage(bitmap,true,variant));assertActive(ticket);
        const text=result.data.text,hits=matchScanNames(text,index),confidence=result.data.confidence||0;
        trials.push({text,hits,bitmap,confidence});
        const merit=hits[0]?.score||0,bestMerit=best.hits[0]?.score||0;
        if(merit>bestMerit||(merit===bestMerit&&confidence>best.confidence))best={text,hits,bitmap,confidence};
        if(hits[0]?.exactName)break outer;
      }
    }
    if(!best.hits[0]?.exactName&&language==='en'){
      for(const bitmap of orientations){
        await ocr.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
        const result=await ocr.recognize(ocrImage(bitmap,false));assertActive(ticket);
        const hits=matchScanNames(result.data.text,index);
        if((hits[0]?.score||0)>(best.hits[0]?.score||0))best={text:result.data.text,hits,bitmap,confidence:result.data.confidence||0};
        if(best.hits[0]?.exactName)break;
      }
    }
    const texts=language==='en'?[best.text]:[...trials].sort((a,b)=>b.confidence-a.confidence).map(trial=>trial.text);
    const validQuery=q=>language==='en'||(language==='ko'?/[가-힣]/.test(q):/[\u3040-\u30ff\u3400-\u9fff]/.test(q));
    const queries=[...new Set(texts.flatMap(text=>scanNameQueries(text).filter(validQuery).slice(0,language==='en'?3:1)))].slice(0,language==='en'?3:8);
    if(language!=='en'||!best.hits.length){
      try{
        for(let offset=0;offset<queries.length;offset+=3){
          const online=await searchNames(queries.slice(offset,offset+3),language);assertActive(ticket);
          const onlineHits=matchScanNames(language==='en'?best.text:queries.join('\n'),createScanIndex(online));
          best.hits=mergeHits([...best.hits,...onlineHits]);
          if(best.hits[0]?.exactName)break;
        }
        if(language!=='en'&&best.hits.length){
          const matched=normalizeScanName(best.hits[0].matchedName);
          const matchingTrial=trials.find(trial=>scanNameQueries(trial.text).some(q=>normalizeScanName(q)===matched));
          if(matchingTrial){best.bitmap=matchingTrial.bitmap;best.text=matchingTrial.text;}
        }
      }catch(error){assertActive(ticket);item.lookupFailed=true;}
    }
    assertActive(ticket);item.bitmap=best.bitmap;item.thumb=best.bitmap.toDataURL('image/jpeg',.65);item.text=(language==='en'?best.text:trials.map(trial=>trial.text.trim()).filter(Boolean).join('\n\n')).trim();item.candidates=best.hits;
    item.chosen=best.hits[0]?.exactName?best.hits[0]:null;item.checked=false;item.query=item.chosen?.card.printed_name||item.chosen?.card.name||queries[0]||'';item.state=item.chosen?'ready':'unmatched';
  }
  async function recognize(onlyActive=false) {
    if(busy||(!source&&!items.length))return;stopCamera();const ticket=++job;setBusy(true);
    let timer,timeout=false;
    try{
      if(!onlyActive&&source&&!currentItems().length)await detectRegions(ticket);
      assertActive(ticket);
      const targets=onlyActive?[active()].filter(item=>item&&!item.added):items.filter(item=>!item.added&&['pending','error'].includes(item.state));
      if(!targets.length){status(items.length?'미인식 카드가 없습니다. 다시 읽을 카드를 선택하거나 새 사진을 불러오세요.':'카드를 찾지 못했습니다. 드래그로 영역을 지정하거나 한 장 모드를 이용하세요.');return;}
      status('카드 DB와 인식 모델 준비 중…',{},23);await ensureIndex();assertActive(ticket);
      const {default:Tesseract}=await import('./vendor/tesseract/tesseract.esm.min.js');assertActive(ticket);
      const language=$('scanLanguage').value;
      const create=Tesseract.createWorker(language==='ko'?'kor':language==='ja'?'jpn':'eng',1,{workerPath:new URL('worker.min.js',OCR_ROOT).href,corePath:new URL('core/',OCR_ROOT).href,langPath:new URL('lang/',OCR_ROOT).href.replace(/\/$/,''),workerBlobURL:false});
      timer=setTimeout(()=>{timeout=true;cancel(false);status('인식 시간이 초과되었습니다. 완료된 결과를 확인하고 남은 카드를 다시 읽어주세요.');},120000);
      const created=await create;
      if(ticket!==job||!dialog.open){await created.terminate();return;}
      clearTimeout(timer);worker=created;
      for(const [i,item] of targets.entries()){
        assertActive(ticket);activeId=item.id;item.state='reading';item.checked=false;renderAll();status('카드 읽는 중… {n}/{total}',{n:i+1,total:targets.length},25+i/targets.length*70);
        const task=readItem(item,created,Tesseract.PSM,language,ticket);
        await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{timeout=true;reject(new Error('timeout'));},90000);})]);
        clearTimeout(timer);assertActive(ticket);renderAll();
      }
      status('인식이 끝났습니다. 카드별 후보와 수량을 확인하고 선택한 카드들을 추가하세요.');
    }catch(error){
      if(ticket===job){if(timeout){cancel(false);status('인식 시간이 초과되었습니다. 완료된 결과를 확인하고 남은 카드를 다시 읽어주세요.');}
        else{for(const item of items)if(item.state==='reading')item.state='error';status('인식을 완료하지 못했습니다. 검출 영역을 확인하거나 이름으로 검색하세요.');console.warn('Scan:',error.message);}}
    }finally{clearTimeout(timer);if(ticket===job){detector.cancel();if(worker){await worker.terminate().catch(()=>{});worker=null;}setBusy(false);renderAll();}}
  }
  $('scanNameForm').addEventListener('submit',async event=>{
    event.preventDefault();const item=active(),name=$('scanNameInput').value.trim();if(!item||item.added||busy||name.length<2)return;
    const ticket=++job;setBusy(true);status('카드 이름 대조 중…',{},20);
    try{await ensureIndex();assertActive(ticket);let hits=matchScanNames(name,index);
      if(!hits.length||hits[0].score<.99||$('scanLanguage').value!=='en'){const cards=await searchNames([name],$('scanLanguage').value);assertActive(ticket);hits=mergeHits([...hits,...matchScanNames(name,createScanIndex(cards)),...cards.map(card=>({card,score:.5}))]);}
      item.candidates=hits;item.chosen=null;item.checked=false;item.query=name;item.state='unmatched';renderAll();status(hits.length?'후보의 이름과 이미지를 확인하고 추가할 카드를 선택하세요.':'일치하는 카드를 찾지 못했습니다. 이름 영역을 다시 지정하거나 아래에서 이름을 수정해 검색하세요.');
    }catch{if(ticket===job)status('카드 검색에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.');}finally{if(ticket===job)setBusy(false);}
  });
  function updateQuantity(validate=false){
    const item=active(),quantity=Number($('scanQuantity').value);if(!item||item.added)return;
    if(!Number.isInteger(quantity)||quantity<1||quantity>99){if(validate){$('scanQuantity').reportValidity();$('scanQuantity').value=item.quantity;}return;}
    item.quantity=quantity;renderQueue();
  }
  $('scanQuantity').addEventListener('input',()=>updateQuantity());
  $('scanQuantity').addEventListener('change',()=>updateQuantity(true));
  function addItems(targets){
    if(busy)return;const destination=$('scanTarget').value;let added=0,failed=0;
    for(const item of targets){if(item.added||!item.chosen)continue;
      if(destination==='commander'&&item.quantity!==1){item.state='blocked';failed++;continue;}
      if(addCard(item.chosen.card,destination,item.quantity)){item.added=true;item.checked=false;added+=item.quantity;}
      else{item.state='blocked';failed++;}
    }
    if(added)onAdded();renderAll();status('덱에 {count}장 추가했습니다. 추가하지 못한 항목: {failed}개',{count:added,failed});
  }
  $('scanAddBtn').addEventListener('click',()=>{const item=active();if(item)addItems([item]);});
  $('scanBatchAddBtn').addEventListener('click',()=>addItems(selectedScanItems(items)));
  $('scanSelectAll').addEventListener('click',()=>{for(const item of items)item.checked=Boolean(item.chosen&&!item.added);renderAll();});
  $('scanSelectNone').addEventListener('click',()=>{for(const item of items)item.checked=false;renderAll();});
  $('scanClearQueueBtn').addEventListener('click',()=>{if(busy)return;items=[];activeId=null;renderAll();status('스캔 목록을 비웠습니다. 덱에 추가한 카드는 유지됩니다.');});
  $('scanUploadBtn').addEventListener('click',()=>$('scanFile').click());
  $('scanFile').addEventListener('change',event=>{loadFile(event.target.files[0]);event.target.value='';});
  $('scanCameraBtn').addEventListener('click',startCamera);
  $('scanRecognizeBtn').addEventListener('click',()=>recognize());
  $('scanReadActiveBtn').addEventListener('click',()=>recognize(true));
  $('scanCancelBtn').addEventListener('click',()=>{cancel();if(cameraStarting||stream)stopCamera();});
  $('scanCloseBtn').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    cancel(false);stopCamera();source=null;items=[];activeId=null;photo=0;nextId=0;draft=null;dragStart=null;canvas.width=canvas.height=1;
    $('scanPreview').classList.add('hidden');$('scanEmpty').classList.remove('hidden');renderAll();
  });
  dialog.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
  dialog.addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();loadFile(event.dataTransfer.files[0]);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||cameraStarting)){cancel(false);stopCamera();$('scanPreview').classList.toggle('hidden',!source);$('scanEmpty').classList.toggle('hidden',Boolean(source));setBusy(false);status('카메라를 닫았습니다.');}});
  window.addEventListener('pagehide',()=>{cancel(false);stopCamera();});
  $('scanBtn').addEventListener('click',()=>{syncTargets();renderAll();setBusy(false);status('여러 카드가 보이는 사진을 불러오거나 카메라로 촬영하세요.');dialog.showModal();});
  return{translate(){syncTargets();renderAll();if(lastStatus)status(lastStatus,statusArgs,lastProgress);}};
}
