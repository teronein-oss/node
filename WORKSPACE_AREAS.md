# 웹 작업 영역 구분

## 기존 로그인 웹 앱

- 진입점: `index.html`, `src/main.tsx`, `src/App.tsx`
- 전용 테마: `src/dashboard.css`
- 화면: `src/pages`, `src/components`, `src/router`
- 인증: Firebase 로그인 필수

## 공개 성적 확인 포털

- 진입점: `report/index.html`, `src/report-portal/main.tsx`
- 전용 테마: `src/report-portal/report.css`
- 화면: `src/report-portal`
- 인증: 로그인 없이 8자리 코드로 열람

두 영역은 별도의 HTML, JavaScript 진입 번들, CSS 번들로 빌드됩니다. 공통으로 사용하는 것은 Firebase 연결과 성적 데이터 타입뿐입니다.
