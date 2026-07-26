# GitHub Pages 404 확인 순서

## 가장 먼저 확인

저장소 첫 화면에서 아래 항목이 **바로 보여야** 합니다.

```text
.github/
public/
scripts/
package.json
index.html
```

저장소 안에 `scryfall-commander-builder-github-pages/` 같은 폴더가 하나 더 있고 위 파일들이 그 안에 있다면 한 단계 잘못 업로드된 것입니다.

## 권장 배포 설정

1. `Settings → Pages`
2. `Build and deployment → Source → GitHub Actions`
3. `Actions → Deploy Commander Canvas to GitHub Pages`
4. 최신 실행이 초록색 체크인지 확인
5. 실행 결과의 `deploy` 단계에 표시된 URL로 접속

프로젝트 저장소의 주소는 보통 다음과 같습니다.

```text
https://사용자명.github.io/저장소명/
```

저장소 이름이 정확히 `사용자명.github.io`인 경우에만 다음 루트 주소를 사용합니다.

```text
https://사용자명.github.io/
```

## GitHub Actions 대신 브랜치 배포를 선택한 경우

이 패키지는 실수 방지를 위해 저장소 루트의 `index.html`이 `public/`로 이동하도록 구성되어 있습니다. 그래도 카드 DB 자동 생성과 갱신을 사용하려면 GitHub Actions 배포가 권장됩니다.
