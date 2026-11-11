// AGPL-3.0-or-later. Runs locally; terminating this Worker cancels model loading/inference.
import * as ort from './vendor/onnxruntime/ort.wasm.min.mjs';
ort.env.wasm.wasmPaths = new URL('./vendor/onnxruntime/',import.meta.url).href;
ort.env.wasm.numThreads=1; // GitHub Pages does not require COOP/COEP headers.
let session;
self.onmessage=async({data})=>{
  try {
    session ||= await ort.InferenceSession.create(new URL('./vendor/card-detector/cards-obb.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    const input=new ort.Tensor('float32',data.pixels,[1,3,640,640]);
    const outputs=await session.run({[session.inputNames[0]]:input});
    const output=outputs[session.outputNames[0]],values=Float32Array.from(output.data),dims=[...output.dims];
    input.dispose(); Object.values(outputs).forEach(tensor=>tensor.dispose());
    self.postMessage({id:data.id,data:values,dims},[values.buffer]);
  } catch(error) { self.postMessage({id:data.id,error:String(error?.message||error)}); }
};
