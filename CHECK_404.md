# GitHub Pages 404 점검

1. 저장소 루트에 `.github/workflows/deploy-pages.yml`이 있는지 확인합니다.
2. `Settings → Pages`의 Source가 `GitHub Actions`인지 확인합니다.
3. Actions에서 `Deploy Deck Canvas to GitHub Pages`가 성공했는지 확인합니다.
4. 일반 저장소는 주소 끝에 저장소 이름이 포함되어야 합니다.
5. 저장소에 ZIP만 올리지 않았는지 확인합니다.
6. 파일이 `저장소/다른폴더/public/index.html`처럼 한 단계 아래에 있지 않은지 확인합니다.
7. 이전 Service Worker가 남아 있으면 브라우저 개발자 도구에서 사이트 데이터를 삭제한 뒤 새로고침합니다.
