"""Rebuild the shipped model. Conversion only; no retraining.
python -m venv .venv
.venv/bin/pip install torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install ultralytics==8.3.233 onnx==1.19.1
.venv/bin/python export_model.py
"""
from pathlib import Path
import hashlib
from ultralytics import YOLO
root = Path(__file__).resolve().parent
weights = root / 'best.pt'
assert hashlib.sha256(weights.read_bytes()).hexdigest() == '45496ed002e20bd008d7ba52b58c7420e419beaf8d270c8f8bd3968db3672c85'
output = YOLO(str(weights)).export(format='onnx', imgsz=640, opset=17, simplify=False, dynamic=False, nms=False, device='cpu')
Path(output).replace(root / 'cards-obb.onnx')
