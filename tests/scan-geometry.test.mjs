import test from 'node:test';
import assert from 'node:assert/strict';
import {boxQuad,polygonArea,polygonIoU,suppressDetections,decodeDetections,detectionWindows,portraitQuad,pointInQuad,selectedScanItems} from '../public/scan-geometry.js';

test('Rotated card geometry preserves area and point membership',()=>{
 const q=boxQuad(200,200,100,140,Math.PI/4);
 assert.ok(Math.abs(polygonArea(q)-14000)<1e-6);assert.ok(pointInQuad({x:200,y:200},q));assert.equal(pointInQuad({x:10,y:10},q),false);
 assert.ok(Math.abs(polygonIoU(q,q)-1)<1e-6);
});
test('Tile duplicates are removed while adjacent and partially overlapping cards survive',()=>{
 const a={score:.9,quad:boxQuad(100,100,60,90,.1)},duplicate={score:.7,quad:boxQuad(102,101,60,90,.1)},b={score:.8,quad:boxQuad(153,100,60,90,.1)};
 assert.equal(suppressDetections([duplicate,b,a]).length,2);
 assert.equal(suppressDetections([duplicate,b,a])[0],a);
 assert.equal(polygonIoU(a.quad,boxQuad(500,500,60,90,0)),0);
});
test('Decoder excludes Pokemon, low scores and malformed regions and reverses letterboxing',()=>{
 const values=new Float32Array([320,320,320,320, 320,320,320,320, 100,100,100,100, 140,140,140,140, .9,.8,.2,.9, .1,.95,.1,.1, 0,0,0,0]);
 const result=decodeDetections(values,[1,7,4],{x:30,y:40,width:1000,height:800,padX:0,padY:64,scale:.64});
 assert.equal(result.length,1);assert.ok(Math.abs(result[0].quad[0].x-(30+270/.64))<.01);
 assert.throws(()=>decodeDetections(values,[1,6,4],{}),/Unexpected/);
});
test('Detailed detection covers borders with overlapping tiles',()=>{
 assert.equal(detectionWindows(800,600,true).length,1);
 const windows=detectionWindows(2400,1800,true);assert.equal(windows.length,5);
 for(const p of [{x:0,y:0},{x:2399,y:0},{x:0,y:1799},{x:2399,y:1799},{x:1200,y:900}]) assert.ok(windows.slice(1).some(w=>p.x>=w.x&&p.y>=w.y&&p.x<=w.x+w.width&&p.y<=w.y+w.height));
});
test('Landscape detections become portrait crops without losing vertices',()=>{
 const q=boxQuad(100,100,140,100,.3),p=portraitQuad(q);
 assert.ok(Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)<Math.hypot(p[2].x-p[1].x,p[2].y-p[1].y));assert.ok(Math.abs(polygonArea(p)-polygonArea(q))<1e-6);
});
test('Batch selection retains physical duplicates but excludes added, unresolved and invalid quantities',()=>{
 const chosen={card:{name:'Mountain'}};
 const items=[{chosen,checked:true,quantity:1},{chosen,checked:true,quantity:2},{chosen,checked:true,quantity:1,added:true},{chosen:null,checked:true,quantity:1},{chosen,checked:false,quantity:1},{chosen,checked:true,quantity:0},{chosen,checked:true,quantity:1.5}];
 assert.equal(selectedScanItems(items).length,2);assert.equal(selectedScanItems(items).reduce((n,i)=>n+i.quantity,0),3);
});
