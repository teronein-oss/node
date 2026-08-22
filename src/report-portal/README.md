# SEUM 성적 확인 포털

이 폴더는 로그인형 학원 대시보드와 분리된 공개 성적 열람 영역입니다.

- 진입점: `main.tsx`
- 전용 스타일: `report.css`
- 학생·교사 코드 판별 및 성적 화면: 이 폴더의 컴포넌트
- 공개 주소: `/report`

대시보드 UI나 테마를 수정할 때 이 폴더와 `report/index.html`을 변경하지 않습니다.
성적 포털을 수정할 때는 `src/dashboard.css`, `AppLayout`, `Sidebar`를 변경하지 않습니다.
