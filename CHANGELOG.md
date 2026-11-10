# 변경 사항

## v4.0.1

- Scryfall의 최신 `jsonl_download_uri` / `.jsonl.gz` 응답을 지원하여 `build:data` 실패 수정
- gzip 해제 후 JSONL을 카드별로 읽고, 기존 `download_uri` JSON 배열 형식도 지원
- HTTP 전송 단계에서 이미 압축이 해제된 응답은 중복 해제하지 않도록 처리
- 메타데이터 목록 응답에서 `oracle_cards` 항목 선택 및 HTTP 오류 상세 메시지 개선
- 카드 DB 빌드 회귀 테스트를 `npm run check`와 Pages 빌드에 추가

## v4.0.0

- Commander 모드 유지
- Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Explorer, Historic, Timeless, Alchemy 추가
- 60장 Constructed 메인 덱과 최대 15장 사이드보드 영역 추가
- 메인 덱과 사이드보드 합산 4장 제한 검사
- 기본 대지와 카드 텍스트의 특수 복사 수량 예외 처리
- Vintage 및 Timeless restricted 카드 1장 제한 처리
- 선택 포맷 합법성으로 검색 필터와 규칙 검사 연동
- Arena 및 Moxfield Sideboard 가져오기/내보내기
- Commander와 Constructed 전환 시 숨겨진 구역의 카드를 메인 덱으로 안전하게 이동
- 서비스 워커 캐시 버전 갱신
- 포맷 규칙 단위 테스트 추가
