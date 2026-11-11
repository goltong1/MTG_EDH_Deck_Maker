# Deck Canvas

Scryfall 카드 데이터로 Commander와 주요 60장 Constructed 포맷의 덱을 드래그 앤 드롭으로 구성하는 정적 웹앱입니다. GitHub Pages에서 서버 없이 동작하며, GitHub Actions가 Scryfall Oracle Cards Bulk Data를 압축 DB로 생성합니다.

## 지원 포맷

- Commander
- Standard
- Pioneer
- Modern
- Legacy
- Vintage
- Pauper
- Explorer
- Historic
- Timeless
- Alchemy

60장 Constructed 포맷은 메인 덱 최소 60장, 사이드보드 최대 15장, 메인 덱과 사이드보드를 합친 카드명별 복사 제한을 검사합니다. Vintage와 Timeless의 `restricted` 카드는 합계 1장으로 검사합니다. 기본 대지와 카드 자체에 별도 덱 구성 문구가 있는 카드는 예외를 반영합니다.

## v4.2 사용 방법

- 덱 상단의 **카드 보기 / 텍스트 보기**에서 표시 방식을 전환합니다. 텍스트 모드에서는 이미지 없이 유형별 수량·카드명·마나 비용을 볼 수 있고, 수량 변경·제거·드래그도 그대로 사용할 수 있습니다.
- **목록 복사 / TXT 저장**은 커맨더, 메인 덱, 사이드보드 중 현재 포맷에 사용하는 전체 구역을 내보냅니다. 변경한 수량이 즉시 반영됩니다.
- 검색 결과 오른쪽 위 **목록** 버튼도 이미지 없는 텍스트 검색 목록으로 전환합니다. 덱과 검색 목록의 보기 설정은 각각 저장됩니다.

- 오른쪽 위 `한국어 / English`에서 UI 언어를 바꿀 수 있습니다. 선택은 새로고침 후에도 유지되며, 카드의 인쇄 언어는 검색 옵션에서 별도로 고릅니다.
- 왼쪽에서 색, 카드 유형, 마나 값 버튼을 눌러 검색합니다. `희귀도 · 키워드 · 검색 옵션`을 열면 희귀도와 능력 키워드도 조합할 수 있습니다. 같은 그룹 안의 선택은 OR, 서로 다른 그룹은 AND로 적용합니다.
- 검색 결과를 메인 덱 아무 곳에 놓으면 카드 유형별로 자동 분류합니다. `+` 버튼과 더블클릭도 동일하게 동작합니다. 커맨더와 사이드보드는 각 전용 영역에 놓습니다.
- 마법물체 생물은 생물, 마법물체 대지는 대지로 분류하며 양면/모험 카드는 앞면 유형을 기준으로 분류합니다. 검색은 양쪽 면의 유형을 찾을 수 있습니다.
- 모바일은 `카드 검색 / 내 덱` 탭과 `+` 버튼을 사용합니다. 덱은 30초마다 브라우저에 자동 저장하며, `덱 저장`으로 즉시 저장할 수 있습니다.
- 39,288장 압축 DB가 포함되어 있습니다. `카드 DB → 브라우저 DB 설치`를 실행하면 로컬 검색과 덱 목록 가져오기에 사용할 수 있습니다. 카드 이미지는 최초 로딩에 네트워크가 필요합니다.

### English

Choose **English** in the top bar. Filter by color, type, mana value, rarity and keyword; selections are OR within each group and AND across groups. Drop cards anywhere in the main deck to sort them automatically. Commander and sideboard cards go in their dedicated zones. Use **Card library / My deck** tabs on mobile and **+** to add cards. UI language and card print language are separate settings.

Switch the deck to **Text view** for grouped quantities, names and mana costs without artwork. Quantity controls, removal and dragging remain available. **Copy list / Save TXT** includes every active deck zone. Use **List** above search results for text-only search results. Both view preferences are remembered separately.

## 주요 기능

- 포맷 선택에 따른 Scryfall 합법성 검색
- Commander 커맨드 존과 색 정체성 검사
- Constructed 메인 덱 및 사이드보드 드래그 앤 드롭
- 포맷별 banned / not_legal / restricted 검사
- 일반 카드 4장 제한, Commander 싱글턴, 기본 대지 및 특수 복사 수량 예외
- Arena / Moxfield / 일반 텍스트 가져오기와 내보내기
- Arena `Deck`, `Commander`, `Sideboard` 헤더 인식
- Moxfield `*CMDR*`와 `SIDEBOARD:` 인식
- 브라우저 IndexedDB 로컬 카드 DB
- Scryfall 연결 장애 시 로컬 검색 폴백
- GitHub Actions 일일 카드 DB 갱신 및 Pages 자동 배포
- Service Worker 앱 셸 및 카드 이미지 캐시

## GitHub Pages 배포

1. 이 패키지의 압축을 풉니다.
2. `.github`, `public`, `scripts`, `tests`, `package.json` 등이 저장소 루트에 바로 보이도록 업로드합니다.
3. GitHub 저장소에서 `Settings → Pages → Source → GitHub Actions`를 선택합니다.
4. `Actions → Deploy Deck Canvas to GitHub Pages → Run workflow`를 실행합니다.
5. `build`와 `deploy` 작업이 성공하면 Pages 주소에 접속합니다.

일반 프로젝트 저장소의 접속 주소는 다음 형태입니다.

```text
https://사용자명.github.io/저장소명/
```

## 로컬 실행

Node.js 20 이상에서 다음 명령을 실행합니다.

```bash
npm start
```

브라우저에서 다음 주소를 엽니다.

```text
http://127.0.0.1:4173
```

## 검사

```bash
npm run check
```

JavaScript 문법, 포맷별 복사 제한, 카드 DB 빌드, 자동 분류, 시각적 필터, 한영 번역 및 로컬 이름 인덱스 회귀 테스트를 실행합니다. 회귀 테스트는 로컬 테스트 서버를 사용하며 Scryfall에 접속하지 않습니다.

## 카드 DB 업데이트

GitHub Actions는 매일 한 번 Scryfall Oracle Cards Bulk Data를 확인하여 변경된 경우 `public/data/cards.json.gz`를 재생성하고 Pages를 배포합니다. 웹앱에서는 `카드 DB → 지금 업데이트`를 눌러 배포된 최신 DB를 IndexedDB에 저장할 수 있습니다.

```bash
npm run build:data
```

v4.0.1부터 Scryfall의 `jsonl_download_uri`가 가리키는 압축 JSONL과 기존 `download_uri` JSON 배열을 모두 지원합니다. 브라우저에 배포하는 파일은 기존과 동일한 gzip 압축 JSON 배열입니다. `SCRYFALL_BULK_INFO_URL`을 지정한 경우 단일 Oracle Cards 메타데이터와 `/bulk-data` 목록 응답 모두 사용할 수 있습니다.

- Scryfall Bulk Data: https://scryfall.com/docs/api/bulk-data
- Scryfall API usage guidance: https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
- Magic formats: https://magic.wizards.com/en/formats
