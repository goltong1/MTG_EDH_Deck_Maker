# 카드 스캔 / Card scanning — v4.4

## 여러 장 한 번에 읽기

1. 상단 **카드 스캔 → 이미지 불러오기**, 또는 **카메라 켜기 → 촬영**을 누릅니다. 카메라는 가운데 한 장을 자르지 않고 전체 프레임을 사용합니다.
2. 카드를 겹치지 않게 펼치고 이름이 읽힐 만큼 가까이 촬영하세요. 사진 파일을 스캔 창에 끌어놓아도 됩니다. 한 사진씩 불러오며, 다음 사진을 추가해도 이전 사진의 스캔 목록은 유지됩니다.
3. 카드 인쇄 언어를 English / 한국어 / 日本語(β) 중에서 고릅니다. UI 언어와 별개입니다.
4. **검출하고 모두 읽기**를 누르면 MTG 카드 영역 검출 → 회전 보정 → 각 카드 이름 OCR → 이름 대조를 순서대로 진행합니다. **여러 장 자동 검출**은 영역만 먼저 확인할 때 사용합니다.
5. 사진의 번호와 오른쪽 목록을 비교합니다. 누락된 카드는 사진 위를 드래그해 직접 영역을 추가하고 **검출하고 모두 읽기**를 다시 누릅니다. 잘못 검출된 영역은 목록의 ×로 제거합니다. 한 장 사진 또는 제목만 자른 이미지는 **이 사진은 한 장**을 사용할 수 있습니다.
6. 이름이 정확히 일치하면 후보가 제시되지만 추가 체크박스는 자동 선택하지 않습니다. 유사한 이름은 해당 카드를 눌러 후보를 직접 선택합니다. **읽힌 이름 수정 / 직접 찾기**, **이 카드 다시 읽기**, **90° 회전**으로 보정할 수 있습니다.
7. 각 카드의 수량을 확인하고 체크하거나 **후보 있는 카드 모두 선택**을 누릅니다. 추가할 구역을 고른 뒤 **선택한 카드들 일괄 추가**를 누릅니다. 메인 덱은 카드 유형별로 자동 분류합니다.
8. 성공한 항목은 **추가 완료**로 표시되어 같은 목록에서 재추가되지 않습니다. 포맷 제한으로 실패한 항목은 **덱 규칙 확인**으로 남으며, 다른 항목의 성공은 유지됩니다. **목록 비우기**는 스캔 목록만 비우며 덱을 삭제하지 않습니다.

## 수량과 촬영 조건

- **보이는 물리적 카드 영역 하나 = 기본 1장**입니다. 같은 카드 두 장이 따로 놓여 있으면 별도 항목 두 개로 유지합니다. 타일 검출에서 동일 영역이 중복 발견되는 경우에만 회전 박스 중복 억제를 적용합니다.
- 덱 화면의 `×4` 같은 글자, 아래에 가려진 카드, 카드 뒷면만 보이는 묶음의 내용은 자동 수량/이름으로 추정하지 않습니다. 수량을 직접 수정하세요.
- 한 스캔 목록은 최대 60개 영역, 항목당 수량은 1–99입니다. 커맨더 구역은 항목당 1장이어야 합니다. 기존 싱글턴·4장 제한을 그대로 적용합니다.
- **작은 카드 추가 검출**은 1,100px보다 큰 사진을 전체 프레임 + 겹치는 4개 영역으로 나누어 읽습니다. 시간이 더 걸리며, 너무 작아 읽을 수 없는 글자를 복원하지는 못합니다.
- 작업용 이미지는 긴 변 최대 4,096px로 축소합니다. 큰 덱은 글자를 읽을 수 있는 거리에서 여러 사진으로 나누고 목록에 누적하는 편이 좋습니다.
- 회전한 카드는 세로 방향으로 잘라 정방향/180° 제목을 비교합니다. 모델은 회전 사각형을 찾으며 완전한 네 모서리 원근 복원 모델은 아닙니다. 심한 원근 왜곡, 반사광, 슬리브 반사, 겹침, 무문자 프레임은 수동 보정이나 재촬영이 필요합니다. 일부 쇼케이스 프레임은 카드 전체 대신 내부 텍스트 상자를 검출할 수 있어 번호 박스를 반드시 확인하세요.
- 일본어는 후리가나·장식 글꼴 때문에 여전히 실험적 지원입니다. 한국어/일본어는 Scryfall에 대응 인쇄본이 있어야 합니다.
- 카드명 식별이며 세트·컬렉터 번호·포일·정확한 아트 버전 판별은 하지 않습니다.

## 실제 탑재 모델

| 단계 | 탑재 모델 / 실행 방식 |
| --- | --- |
| 여러 카드 위치 검출 | matteot11의 MTG/Pokemon YOLO11n OBB 체크포인트를 ONNX FP32로 변환. MTG 클래스만 사용 |
| 작은 카드 추가 검출 | 전체 + 중첩 타일, 회전 다각형 IoU 중복 억제 |
| 카드 이름 인식 | Tesseract.js 6.0.1 + core 6.1.2 / eng·kor·jpn LSTM 모델 |
| 카드 대조 | 포함된 Oracle 카드 DB 우선, 필요한 카드명만 Scryfall 대조 |

검출 모델: https://huggingface.co/matteot11/collector-mtg-pkm-detector-yolo11n-obb

고정 체크포인트 revision: `6ab578bb32cde3d9e7ced085d7f6994d8ff9581f`. 추가 학습했다고 주장하지 않습니다. 공개 체크포인트를 변환·통합했으며, 모델 카드의 합성 검증 수치는 이 앱의 정확도가 아닙니다.

ONNX Runtime Web **1.22.0**, 단일 WASM 스레드의 별도 Web Worker에서 실행합니다. WebGPU, API 키, 백엔드 서버, GitHub Pages의 특수 응답 헤더가 필요하지 않습니다. 초기 모델/런타임 다운로드 이후 버전별 캐시를 사용합니다.

MTG 이미지 임베딩 갤러리를 탑재한 것은 아닙니다. 카드 검출은 비전 모델, 이름 식별은 OCR입니다. 이름을 읽지 못한 경우 이미지만 보고 카드 정체를 확정하지 않습니다.

## 연결과 개인정보

사진과 검출·OCR은 기기 내 브라우저에서 처리하며 사진을 서버에 업로드하지 않습니다. 영문 카드명 로컬 대조 실패 또는 번역명 검색 시 카드명만 Scryfall로 보내고, 후보 이미지는 Scryfall에서 불러옵니다. 첫 카드 DB 설치와 모델 로딩에는 연결이 필요합니다.

카메라는 HTTPS 또는 localhost 및 브라우저 권한이 필요합니다. 촬영·창 닫기·탭 숨김 시 카메라 트랙을 종료합니다. 인식 취소는 검출 Worker와 OCR Worker를 종료하고 완료된 목록을 유지합니다. 창을 닫으면 사진·스캔 목록을 메모리에서 정리하므로, 먼저 덱에 추가하세요.

지원 형식은 브라우저가 읽을 수 있는 JPG, PNG, WebP 등이며 파일당 최대 25MB입니다. HEIC가 지원되지 않는 브라우저는 JPG/PNG로 변환하세요.

## 소스와 배포

- `public/vendor/card-detector/`: ONNX, 원본 체크포인트, 모델 카드, 학습 설정, 재현용 변환 스크립트, AGPL 라이선스 및 출처 안내.
- `public/vendor/onnxruntime/`: 런타임, MIT 라이선스 및 제3자 고지.
- `public/vendor/tesseract/`: OCR 런타임과 언어 모델, 해당 라이선스.
- 각 폴더의 `ASSETS.json`에 파일별 SHA-256을 기록했습니다.
- 변환은 개발 시 한 번 완료한 상태입니다. GitHub Actions에서 PyTorch 설치나 모델 변환을 실행하지 않습니다. 기존 Pages 배포 절차를 그대로 사용하세요.
- 배포 시 `public/vendor` 전체와 새 JS 파일을 함께 업로드하고 동봉된 라이선스·고지를 유지하세요.

## English quick guide

Open **Scan cards**, upload or capture a photo of separated cards, choose the print language, then press **Detect & read all**. Review the numbered regions. Drag to add missed cards and remove false regions with ×. New photos accumulate in the scan list until it is cleared or the dialog is closed.

Review each candidate and quantity. Exact name matches are proposed but never checked automatically. Approximate matches require an explicit candidate choice. Select reviewed items and press **Add selected cards**. Completed entries cannot be added again from the same list; deck-rule failures remain visible.

One visible region defaults to one copy. Printed quantity badges, hidden cards and exact print editions are not inferred. A 60-region review limit controls memory usage. Photos stay on-device; name lookups may use Scryfall. Severe glare, occlusion, perspective and tiny text still require manual correction or a clearer photo.
