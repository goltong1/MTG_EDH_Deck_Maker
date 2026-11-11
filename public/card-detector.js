// AGPL-3.0-or-later. See vendor/card-detector/NOTICE.md.
import {decodeDetections,detectionWindows,suppressDetections,portraitQuad} from './scan-geometry.js';
export function createCardDetector() {
  let worker=null,sequence=0,pending=null;
  function cancel() {
    worker?.terminate(); worker=null;
    if(pending) { clearTimeout(pending.timer);pending.reject(new Error('cancelled'));pending=null; }
  }
  function infer(pixels) {
    if(!worker) {
      worker=new Worker(new URL('./card-detector-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{if(pending?.id===data.id){const task=pending;pending=null;clearTimeout(task.timer);data.error?task.reject(new Error(data.error)):task.resolve(data);}};
      worker.onerror=()=>{const task=pending;cancel();task?.reject(new Error('detector-load'));};
    }
    return new Promise((resolve,reject)=>{const id=++sequence;pending={id,resolve,reject,timer:setTimeout(()=>cancel(),120000)};worker.postMessage({id,pixels},[pixels.buffer]);});
  }
  async function detect(source,{detailed=false,onProgress=()=>{}}={}) {
    const windows=detectionWindows(source.width,source.height,detailed),all=[];
    for(const [i,region] of windows.entries()) {
      onProgress(i,windows.length);
      const scale=Math.min(640/region.width,640/region.height),width=Math.round(region.width*scale),height=Math.round(region.height*scale);
      const padX=Math.floor((640-width)/2),padY=Math.floor((640-height)/2);
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,640,640);
      ctx.drawImage(source,region.x,region.y,region.width,region.height,padX,padY,width,height);
      const rgba=ctx.getImageData(0,0,640,640).data,pixels=new Float32Array(3*640*640);
      for(let p=0;p<640*640;p++){pixels[p]=rgba[p*4]/255;pixels[p+640*640]=rgba[p*4+1]/255;pixels[p+2*640*640]=rgba[p*4+2]/255;}
      const result=await infer(pixels);
      all.push(...decodeDetections(result.data,result.dims,{...region,scale,padX,padY}));
    }
    return suppressDetections(all).sort((a,b)=>{
      const center=q=>q.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0});const ca=center(a.quad),cb=center(b.quad);
      return Math.abs(ca.y-cb.y)<source.height*.04?ca.x-cb.x:ca.y-cb.y;
    });
  }
  return {detect,cancel};
}
export function cropCard(source,quad,{portrait=true}={}) {
  const q=portrait?portraitQuad(quad):quad;
  const [p0,p1,,p3]=q,w=Math.hypot(p1.x-p0.x,p1.y-p0.y),h=Math.hypot(p3.x-p0.x,p3.y-p0.y);
  const scale=Math.min(2,640/w,900/h),out=document.createElement('canvas');out.width=Math.max(1,Math.round(w*scale));out.height=Math.max(1,Math.round(h*scale));
  const ux=p1.x-p0.x,uy=p1.y-p0.y,vx=p3.x-p0.x,vy=p3.y-p0.y,det=ux*vy-uy*vx;
  if(Math.abs(det)<1) throw new Error('empty-crop');
  const a=out.width*vy/det,c=-out.width*vx/det,b=-out.height*uy/det,d=out.height*ux/det;
  const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.setTransform(a,b,c,d,-a*p0.x-c*p0.y,-b*p0.x-d*p0.y);ctx.drawImage(source,0,0);ctx.resetTransform();
  return out;
}
export function rotateCard(source,angle=180) {
  const out=document.createElement('canvas'),quarter=angle%180!==0;
  out.width=quarter?source.height:source.width;out.height=quarter?source.width:source.height;
  const ctx=out.getContext('2d');ctx.translate(out.width/2,out.height/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(source,-source.width/2,-source.height/2);return out;
}
