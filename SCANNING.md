# 카드 스캔 / Card scanning — v4.3

## 사용 방법

1. 상단 **카드 스캔**을 누릅니다.
2. **이미지 불러오기**로 사진을 선택하거나 **카메라 켜기 → 촬영**을 누릅니다. 사진 파일을 스캔 창으로 끌어놓아도 됩니다.
3. 카드 인쇄 언어를 English / 한국어 / 日本語 중에서 선택합니다. UI 언어와는 별개입니다. 일본어(β)는 실험적 지원이며 후리가나·장식 글꼴 때문에 이름 수정이 필요할 수 있습니다.
4. 카드가 옆으로 누웠으면 **90° 회전**을 누릅니다. 주변 배경이 많으면 사진 위를 드래그하여 카드 한 장 또는 이름 부분을 지정합니다. **전체 이미지**로 선택을 초기화합니다.
5. **카드 인식**을 누르고 후보의 이름과 이미지를 확인합니다. 인식이 부정확하면 이름을 고쳐 **찾기**를 누릅니다.
6. 후보를 직접 선택하고, 추가할 구역과 수량을 정한 뒤 **선택한 카드 추가**를 누릅니다. 메인 덱은 유형별로 자동 분류됩니다. 포맷에 따라 커맨더 또는 사이드보드를 선택할 수 있습니다.

후보는 자동 선택·자동 추가되지 않습니다. 추가 후 브라우저에 덱이 저장되며, 같은 카드를 실수로 연속 추가하지 않도록 선택이 해제됩니다. 싱글턴·4장 제한 등 기존 덱 규칙이 동일하게 적용됩니다.

사진은 한 번에 한 장씩 처리합니다. 반사광을 피하고 이름이 선명하게 보이도록 정면에서 촬영하세요. 겹친 여러 장, 심한 원근 왜곡, 흐릿한 글자, 텍스트가 없는 특수 프레임은 정확하게 인식하기 어렵습니다. 카드명에 해당하는 카드를 찾는 기능이며, 세트·컬렉터 번호·포일·특수 아트의 정확한 인쇄본 판별 기능은 아닙니다.

## 연결과 개인정보

- 사진의 OCR은 브라우저 Web Worker / WebAssembly에서 실행하며 사진을 외부 서버에 업로드하지 않습니다. 창을 닫으면 사진과 OCR 결과를 메모리에서 정리합니다.
- 영어는 포함된 Oracle 카드 DB와 우선 대조합니다. DB가 아직 설치되지 않았다면 첫 인식 때 배포된 압축 DB를 브라우저에 설치합니다.
- 영어 로컬 대조 실패 시, 또는 한국어·일본어 인쇄본을 대조할 때는 읽힌 카드명만 Scryfall API로 전달합니다. 후보 카드 이미지는 Scryfall에서 불러옵니다. 한국어·일본어 인식 결과는 해당 인쇄본이 Scryfall에 등록되어 있어야 합니다.
- OCR 모델과 WASM 파일을 `public/vendor/tesseract/`에 포함했습니다. 배포한 사이트에서 필요한 언어 파일만 처음 사용 시 로드하며 API 키나 별도 서버가 필요하지 않습니다. Service Worker와 IndexedDB 캐시를 재사용하므로 반복 실행 시 다운로드가 줄어듭니다. 처음부터 완전 오프라인 사용을 보장하지는 않습니다.
- 카메라는 HTTPS(GitHub Pages 포함) 또는 localhost와 브라우저 권한이 필요합니다. 카메라가 없거나 권한이 거부되면 이미지 업로드를 사용할 수 있습니다. 촬영 완료, 창 닫기, 탭을 숨길 때 카메라 트랙을 종료합니다.
- JPG, PNG, WebP 등 브라우저가 해석하는 이미지, 파일당 최대 25 MB입니다. HEIC는 브라우저에 따라 지원되지 않으므로 이 경우 JPG/PNG로 변환하세요.

## 검토한 모델과 이번 선택

| 후보 | 방식 | 이번 패키지에서의 판단 |
| --- | --- | --- |
| [Tesseract.js](https://github.com/naptha/tesseract.js) + [tessdata LSTM](https://github.com/naptha/tessdata) | OCR로 카드명을 읽고 카드 DB에서 이름을 대조 | **채택.** 정적 사이트에서 직접 실행하고 모델 파일을 함께 배포할 수 있음. 글자가 안 보이는 카드는 식별에 한계가 있음. |
| [dhvazquez/mtg_card_identification_embeddings](https://huggingface.co/dhvazquez/mtg_card_identification_embeddings) | EfficientNet-Lite0 기반 256차원 이미지 임베딩; ONNX 배포 | MTG 전용 비전 모델 후보. 모델 이외에 대응하는 참조 이미지 임베딩 갤러리를 구축·갱신해야 하므로 이번 경량 정적 배포에는 통합하지 않음. |
| [CollectorVision](https://github.com/HanClinto/CollectorVision) | 카드 모서리 검출, 원근 보정, 임베딩과 카탈로그 검색. 실험적 JS 포트 제공 | 자동 원근 보정·그림 기반 식별을 위한 확장 후보. 별도 카탈로그와 AGPL-3.0 배포 조건 검토가 필요하여 이번 패키지에는 포함하지 않음. |

조사 기준: 2026-11-11. 위 비전 모델의 공개 벤치마크 수치는 이 앱의 인식 정확도로 사용하지 않았습니다. 이 패키지의 실제 구현은 OCR이며 MTG 전용 이미지 임베딩 모델을 탑재했다고 주장하지 않습니다.

고정한 배포 버전은 Tesseract.js **6.0.1**, tesseract.js-core **6.1.2**, `@tesseract.js-data/{eng,kor,jpn}` **1.0.0**의 `4.0.0_best_int`입니다. 신규 버전 자동 다운로드를 사용하지 않습니다. 각 파일의 SHA-256은 `public/vendor/tesseract/ASSETS.json`, 라이선스는 해당 폴더에 포함했습니다.

## English quick guide

Open **Scan cards**, upload an image or capture one from your camera, choose the card's print language, and press **Recognize card**. Drag over the preview to select a single card or its title, and rotate sideways photos if needed. Review the candidates, select the correct card, then choose a destination and quantity. Manual name correction is available when OCR fails.

Photos stay on your device. Name lookups and reference images may require Scryfall. Camera access requires HTTPS or localhost. This identifies card names, not exact printings or foil treatments. OCR quality depends on glare, resolution, angle, typography, and the availability of translated printings in Scryfall. Japanese support is experimental; furigana may require manual name correction.
