# GitHub Pages 배포 순서

## 1. 파일 구조 확인

저장소 첫 화면에서 다음 항목이 바로 보여야 합니다.

```text
.github/
public/
scripts/
tests/
package.json
README.md
```

압축파일 자체를 올리거나 전체 폴더를 한 단계 더 감싸면 Actions가 워크플로와 `public/index.html`을 찾지 못할 수 있습니다.

## 2. Pages 설정

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

## 3. 배포 실행

```text
Actions
→ Deploy Deck Canvas to GitHub Pages
→ Run workflow
```

`build`와 `deploy`가 모두 초록색 체크가 되어야 합니다.

## 4. 접속 주소

프로젝트 저장소:

```text
https://사용자명.github.io/저장소명/
```

사용자 사이트 저장소 이름이 정확히 `사용자명.github.io`인 경우에만 다음 주소를 사용합니다.

```text
https://사용자명.github.io/
```

## 5. 코드 업데이트

수정한 파일을 `main` 브랜치에 Push하면 자동으로 다시 배포됩니다. 카드 DB는 예약 실행 또는 수동 실행 시 Scryfall Bulk Data를 확인합니다.
