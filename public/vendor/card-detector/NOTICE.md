# Multi-card detector — Deck Canvas 4.4

The detector weights and detector integration modules are AGPL-3.0-or-later. Retain the included LICENSE and attribution when redistributing. Runtime dependencies retain their own licenses. Card art and names belong to their respective rights holders.

- Author: matteot11; architecture: Ultralytics YOLO11n OBB.
- Upstream model: https://huggingface.co/matteot11/collector-mtg-pkm-detector-yolo11n-obb
- Pinned revision: 6ab578bb32cde3d9e7ced085d7f6994d8ff9581f
- Upstream training workflow: https://github.com/matteot11/open-card-collector
- Original model card: [MODEL_CARD.md](./MODEL_CARD.md)
- License: [LICENSE](./LICENSE)
- Corresponding original checkpoint: [best.pt](./best.pt)
- Training settings: [training-args.yaml](./training-args.yaml)
- Conversion source and exact dependencies: [export_model.py](./export_model.py)
- App integration source: [card-detector.js](../../card-detector.js), [card-detector-worker.js](../../card-detector-worker.js), [scan-geometry.js](../../scan-geometry.js), [card-scanner.js](../../card-scanner.js).

This package converts the published checkpoint to ONNX FP32, opset 17, fixed 640×640, without retraining or quantization. Outputs are [1,7,8400] (cx, cy, w, h, MTG score, Pokemon score, angle). The app keeps only MTG detections, applies rotated polygon NMS, crops/rotates each card, then uses the separately licensed Tesseract OCR model for names. No card embedding gallery is included.

Model-card benchmark numbers refer to synthetic validation, not this app or real phone-camera accuracy. A bounding rectangle is not a four-corner perspective estimator; severe perspective and occlusion still need a better photo/manual correction.

ONNX Runtime Web 1.22.0 uses one WASM thread inside a dedicated Web Worker. Its MIT license and third-party notices are in ../onnxruntime/. Tesseract.js 6.0.1 and core 6.1.2 are in ../tesseract/.
