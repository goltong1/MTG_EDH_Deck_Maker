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

JavaScript 문법과 포맷별 복사 제한 테스트를 실행합니다.

## 카드 DB 업데이트

GitHub Actions는 매일 한 번 Scryfall Oracle Cards Bulk Data를 확인하여 변경된 경우 `public/data/cards.json.gz`를 재생성하고 Pages를 배포합니다. 웹앱에서는 `카드 DB → 지금 업데이트`를 눌러 배포된 최신 DB를 IndexedDB에 저장할 수 있습니다.

- Scryfall Bulk Data: https://scryfall.com/docs/api/bulk-data
- Scryfall API usage guidance: https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
- Magic formats: https://magic.wizards.com/en/formats
