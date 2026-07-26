# GitHub Pages 빠른 배포

## 웹에서 파일 업로드

1. GitHub에서 새 저장소 생성
2. 압축 해제
3. 압축을 풀었을 때 보이는 `.github`, `public`, `scripts`, `package.json`, `index.html`을 저장소 루트에 업로드
   - 상위 폴더 자체를 올리거나 ZIP 파일만 업로드하면 안 됩니다.
4. Commit changes
5. `Settings → Pages`
6. Source를 `GitHub Actions`로 설정
7. `Actions → Deploy Commander Canvas to GitHub Pages`에서 실행 결과 확인

## Git 명령어 사용

아래의 `<저장소주소>`를 본인의 GitHub 저장소 주소로 변경합니다.

```bash
git init
git add .
git commit -m "Initial Commander Canvas deployment"
git branch -M main
git remote add origin <저장소주소>
git push -u origin main
```

그다음 GitHub 저장소에서:

```text
Settings → Pages → Source → GitHub Actions
```

## 카드 DB 강제 갱신

```text
Actions
→ Deploy Commander Canvas to GitHub Pages
→ Run workflow
```

웹앱의 `카드 DB → 지금 업데이트`는 GitHub Pages에 배포된 최신 DB를 브라우저에 받는 기능입니다. Scryfall에서 새 Bulk Data를 다시 생성하려면 GitHub Actions를 실행해야 합니다.


## 404가 표시될 때

`CHECK_404.md`의 순서대로 저장소 구조, Pages Source, Actions 실행 상태와 접속 URL을 확인하세요.
