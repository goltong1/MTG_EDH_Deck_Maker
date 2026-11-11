// Detector integration: AGPL-3.0-or-later. See vendor/card-detector/NOTICE.md.
export const MAX_SCAN_CARDS = 60;
export function boxQuad(cx, cy, width, height, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => ({x:cx+x*width/2*c-y*height/2*s,y:cy+x*width/2*s+y*height/2*c}));
}
export function polygonArea(points) {
  return Math.abs(points.reduce((sum,p,i)=>{ const q=points[(i+1)%points.length]; return sum+p.x*q.y-q.x*p.y; },0))/2;
}
export function polygonIoU(a,b) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  let out=a.slice();
  for(let i=0;i<b.length;i++) {
    const p=b[i],q=b[(i+1)%b.length],input=out; out=[];
    if(!input.length) break;
    for(let j=0;j<input.length;j++) {
      const start=input[j],end=input[(j+1)%input.length],ds=cross(p,q,start),de=cross(p,q,end);
      if(ds>=0) out.push(start);
      if((ds>=0)!==(de>=0)) { const t=ds/(ds-de); out.push({x:start.x+t*(end.x-start.x),y:start.y+t*(end.y-start.y)}); }
    }
  }
  const intersection=out.length>2?polygonArea(out):0;
  return intersection/Math.max(1e-8,polygonArea(a)+polygonArea(b)-intersection);
}
export function suppressDetections(detections, threshold=.4, limit=MAX_SCAN_CARDS) {
  const kept=[];
  for(const item of [...detections].sort((a,b)=>b.score-a.score)) {
    if(!kept.some(other=>polygonIoU(item.quad,other.quad)>threshold)) kept.push(item);
    if(kept.length>=limit) break;
  }
  return kept;
}
export function decodeDetections(data,dims,mapping,threshold=.38) {
  // Fixed export: [1,7,8400]: cx,cy,w,h,mtg,pokemon,angle; no objectness channel.
  if(dims.length!==3||dims[1]!==7) throw new Error('Unexpected detector output');
  const n=dims[2],result=[];
  for(let i=0;i<n;i++) {
    const score=data[4*n+i];
    if(score<threshold||score<=data[5*n+i]) continue;
    const width=data[2*n+i]/mapping.scale,height=data[3*n+i]/mapping.scale;
    if(!Number.isFinite(width+height)||Math.min(width,height)<22||Math.max(width,height)/Math.min(width,height)>2.3) continue;
    const cx=(data[i]-mapping.padX)/mapping.scale+mapping.x,cy=(data[n+i]-mapping.padY)/mapping.scale+mapping.y;
    if(cx<mapping.x||cy<mapping.y||cx>mapping.x+mapping.width||cy>mapping.y+mapping.height) continue;
    result.push({score,quad:boxQuad(cx,cy,width,height,data[6*n+i])});
  }
  return suppressDetections(result);
}
export function detectionWindows(width,height,detailed=false) {
  const windows=[{x:0,y:0,width,height}];
  if(detailed&&Math.max(width,height)>1100) {
    const w=Math.round(width*.62),h=Math.round(height*.62);
    for(const y of [0,height-h]) for(const x of [0,width-w]) windows.push({x,y,width:w,height:h});
  }
  return windows;
}
export function portraitQuad(quad) {
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  return length(quad[0],quad[1])>length(quad[1],quad[2]) ? [quad[1],quad[2],quad[3],quad[0]] : quad;
}
export function pointInQuad(point,quad) {
  return quad.every((p,i)=>{const q=quad[(i+1)%4];return (q.x-p.x)*(point.y-p.y)-(q.y-p.y)*(point.x-p.x)>=0;});
}
export function selectedScanItems(items) {
  return items.filter(item=>item.checked&&!item.added&&item.chosen&&Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=99);
}
