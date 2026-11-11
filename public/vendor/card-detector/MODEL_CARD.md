---
license: agpl-3.0
library_name: ultralytics
pipeline_tag: object-detection
tags:
  - magic-the-gathering
  - pokemon
  - trading-cards
  - object-detection
  - oriented-object-detection
  - yolo
---
# MTG + Pokemon Card Detector - YOLO11n OBB

This model detects Magic: The Gathering and Pokemon cards in camera frames and returns oriented bounding boxes. It is intended for use before perspective correction and game-specific card-image retrieval.

## Model

- Architecture: Ultralytics YOLO11n OBB
- Base checkpoint: `yolo11n-obb.pt`
- Classes: `mtg` (class 0), `pokemon` (class 1)
- Input size: 640 pixels
- Weights: `best.pt`

## Training

The detector was fine-tuned for 10 epochs with a batch size of 16 and seed `42`, using the `mtg_pokemon_v1` synthetic dataset. Scenes include MTG-only, Pokemon-only, and mixed compositions, with generated or custom backgrounds, perspective transformations, lighting effects, occlusion, and rotation. Training ran on Apple MPS.

The synthetic scenes were created with the scripts in the [Open Card Collector](https://github.com/matteot11/open-card-collector) repository. Training settings are included in `args.yaml`.

## Synthetic Validation

The final epoch's recorded validation metrics were:

| Metric | Value |
| --- | --- |
| Precision | 0.99756 |
| Recall | 0.99824 |
| mAP50 | 0.99490 |
| mAP50-95 | 0.99034 |

These results are from the synthetic validation split, not a real-camera benchmark, and do not establish equivalent performance on real footage.

## Usage

```python
from ultralytics import YOLO

model = YOLO("best.pt")
results = model("frame.jpg")
```

## Limitations

This model was trained for MTG and Pokemon cards in synthetic camera conditions. Detection quality may degrade with severe motion blur, glare, heavy occlusion, very small cards, unusual lighting, or scenes unlike its synthetic backgrounds. It detects card geometry; it does not identify a card printing.

## License and Attribution

This model is released under the AGPL-3.0 license. It is fine-tuned from Ultralytics `yolo11n-obb.pt`; use and redistribution must comply with the Ultralytics license terms.

The training workflow uses card imagery obtained through Scryfall and TCGdex. Card names, artwork, and related intellectual property belong to their respective rights holders. This repository does not distribute the training images or catalog data. Scryfall and TCGdex do not endorse this project.
