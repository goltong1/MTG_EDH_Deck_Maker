# Commander Canvas — GitHub Pages Edition

## GitHub Pages 404 방지

압축을 풀면 `.github`, `public`, `scripts`, `package.json`, `index.html`이 바로 보여야 합니다. 이 파일들을 저장소 루트에 올리세요. 상위 폴더나 ZIP 파일만 저장소에 올리면 Pages가 진입 파일을 찾지 못합니다. 자세한 확인 절차는 `CHECK_404.md`를 참고하세요.


Scryfall 카드 데이터로 커맨더 덱을 드래그 앤 드롭 방식으로 구성하는 정적 웹앱입니다.

이 버전은 **GitHub Pages에 바로 배포**할 수 있도록 Node 백엔드 의존성을 제거했습니다.

- 프런트엔드: HTML / CSS / JavaScript
- 배포: GitHub Actions → GitHub Pages
- 카드 DB 생성: Scryfall Oracle Cards Bulk Data
- 로컬 검색: 브라우저 IndexedDB
- 이미지 캐시: Service Worker Cache Storage
- 덱 저장: LocalStorage

## 주요 기능

- 카드 이미지 기반 검색
- 카드 드래그 앤 드롭
- 커맨드 존과 유형별 덱 구역
- 커맨더 100장, 색 정체성, 싱글턴, 합법성 검사
- 마나 커브와 카드 유형 통계
- Arena / Moxfield / 일반 텍스트 내보내기
- Arena / Moxfield 덱 목록 가져오기
- 브라우저 카드 DB 설치 및 업데이트
- Scryfall 연결 실패 시 브라우저 DB 검색
- PWA 셸 및 카드 이미지 캐시

## GitHub에 배포하는 방법

### 1. 새 저장소 만들기

GitHub에서 새 Repository를 만듭니다.

저장소 이름은 자유롭게 정할 수 있습니다. 예:

```text
commander-canvas
```

### 2. 압축을 풀고 저장소에 업로드

압축을 푼 폴더 안의 파일들을 저장소 루트에 올립니다.

저장소의 최상단 구조가 다음처럼 보여야 합니다.

```text
.github/
public/
scripts/
.gitignore
dev-server.mjs
package.json
README.md
```

`commander-canvas-github-pages` 폴더 자체를 한 단계 더 중첩해서 올리지 않도록 주의합니다.

### 3. GitHub Pages 활성화

저장소에서 다음 메뉴로 이동합니다.

```text
Settings → Pages → Build and deployment → Source
```

Source를 다음으로 설정합니다.

```text
GitHub Actions
```

### 4. 배포 실행

`main` 브랜치에 파일을 올리면 `.github/workflows/deploy-pages.yml`이 실행됩니다.

워크플로는 다음 작업을 자동 수행합니다.

1. Scryfall Bulk Data 메타데이터 확인
2. Oracle Cards 데이터 다운로드
3. 웹앱에 필요한 필드만 추출
4. `cards.json.gz`로 압축
5. 정적 사이트와 카드 DB를 GitHub Pages에 배포

배포된 주소는 GitHub 저장소의 `Settings → Pages` 또는 Actions의 deployment 결과에서 확인할 수 있습니다.

기본 주소 형식:

```text
https://<GitHub사용자명>.github.io/<저장소명>/
```

## 카드 데이터 업데이트 방식

### GitHub 쪽 카드 DB 갱신

워크플로는 세 방식으로 실행됩니다.

- `main` 브랜치 Push
- Actions 화면의 수동 실행
- 매일 예약 실행

예약 시각은 현재 다음과 같습니다.

```yaml
schedule:
  - cron: '23 3 * * *'
```

이는 매일 **한국 시간 12:23**에 해당합니다.

수동 갱신:

```text
GitHub 저장소 → Actions → Deploy Commander Canvas to GitHub Pages
→ Run workflow
```

Scryfall의 Bulk Data 버전이 이전 실행과 같으면 Actions 캐시의 압축 DB를 재사용합니다.

### 사용자의 브라우저 DB 갱신

웹페이지 상단의 `카드 DB` 버튼을 누른 뒤 `지금 업데이트`를 선택합니다.

이 버튼은 Scryfall Bulk Data 전체를 직접 요청하지 않고, **GitHub Pages에 최근 배포된 압축 DB**를 다운로드하여 브라우저 IndexedDB에 저장합니다.

즉 역할이 다음처럼 나뉩니다.

```text
GitHub Actions
Scryfall → 압축 카드 DB 생성 → GitHub Pages 배포

브라우저의 지금 업데이트 버튼
GitHub Pages → 최신 압축 DB 다운로드 → IndexedDB 저장
```

주기적 자동 업데이트를 활성화하면 브라우저는 설정한 주기마다 배포된 DB의 버전을 확인합니다.

## 첫 사용

1. 배포된 페이지 접속
2. 상단 `카드 DB` 클릭
3. `브라우저 DB 설치` 클릭
4. 검색 데이터 소스를 `자동 · 브라우저 DB 우선`으로 설정

DB 설치 전에도 Scryfall 온라인 검색을 사용할 수 있습니다.

## 로컬에서 실행

Node.js 20 이상이 필요합니다.

```bash
npm start
```

브라우저에서 다음 주소를 엽니다.

```text
http://127.0.0.1:4173
```

### 로컬용 실제 카드 DB 생성

```bash
npm run build:data
npm start
```

`npm run build:data`는 `public/data/cards.json.gz`와 `public/data/meta.json`을 생성합니다.

## 검색 데이터 소스

### 자동 · 브라우저 DB 우선

일반적인 카드명, 유형, 오라클 텍스트, 색, 마나 값 검색은 IndexedDB에서 처리합니다.

브라우저 DB가 없거나 로컬에서 처리하기 어려운 검색은 Scryfall 온라인 API를 사용합니다. 온라인 요청이 실패하면 가능한 경우 브라우저 DB로 다시 검색합니다.

### 브라우저 DB만

Scryfall API에 연결하지 않고 설치된 IndexedDB만 검색합니다.

### Scryfall 온라인

항상 Scryfall 온라인 API를 사용합니다.

## 데이터 저장 위치

| 데이터 | 위치 |
|---|---|
| 덱 내용 | LocalStorage |
| 카드 DB | IndexedDB |
| 카드 이미지 | Cache Storage |
| 사이트 셸 | Service Worker Cache |
| 배포용 압축 DB | GitHub Pages `public/data` |

브라우저 사이트 데이터나 저장 공간을 삭제하면 덱 및 브라우저 카드 DB도 제거될 수 있습니다. 중요한 덱은 Arena 또는 Moxfield 형식으로 내보내 보관하는 것이 좋습니다.

## 워크플로 수정

파일:

```text
.github/workflows/deploy-pages.yml
```

매일 갱신이 필요 없다면 `schedule` 구간을 제거할 수 있습니다.

```yaml
schedule:
  - cron: '23 3 * * *'
```

수동 배포만 사용하려면 `push`와 `schedule`을 제거하고 `workflow_dispatch`만 남길 수 있습니다.

## 점검 명령

```bash
npm run check
```

검사 대상:

- 웹앱 JavaScript 문법
- Service Worker 문법
- 카드 DB 생성 스크립트 문법

## 주의 사항

- GitHub Pages는 정적 호스팅이므로 기존 Node API 프록시는 포함하지 않습니다.
- 브라우저의 온라인 검색은 Scryfall API에 직접 연결됩니다.
- 대량 데이터 다운로드는 브라우저가 아니라 GitHub Actions에서 처리합니다.
- 배포용 카드 DB는 Oracle Cards 기준이므로 기본적으로 영어 Oracle 인쇄본이 저장됩니다.
- 한국어 및 일본어 인쇄본 중심 검색은 Scryfall 온라인 검색을 사용하는 편이 정확합니다.
- Scryfall 카드 이미지와 데이터에는 Scryfall 및 Wizards of the Coast의 관련 정책이 적용됩니다.

## 파일 구조

```text
.
├─ .github/
│  └─ workflows/
│     └─ deploy-pages.yml
├─ public/
│  ├─ data/
│  │  ├─ cards.json.gz
│  │  └─ meta.json
│  ├─ app.js
│  ├─ index.html
│  ├─ manifest.webmanifest
│  ├─ service-worker.js
│  └─ styles.css
├─ scripts/
│  └─ build-card-db.mjs
├─ dev-server.mjs
├─ package.json
└─ README.md
```
