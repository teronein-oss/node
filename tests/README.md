# 성적 저장 회귀 테스트

프로젝트 루트에서 실행합니다. Playwright와 Chromium이 필요합니다.

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node --test tests/grade-persistence.test.mjs
```

이미 설치된 Chrome을 쓰려면 `PLAYWRIGHT_CHANNEL=chrome`을 설정합니다.
별도 런타임의 Playwright를 사용하려면 `PLAYWRIGHT_MODULE`에 해당 패키지의
`index.mjs` 절대 경로를 지정할 수 있습니다.

실제 `GradePage`, `AppProvider`, reducer, 저장 큐를 실행하며, 인증과 Firestore만
테스트 대역으로 교체합니다. 운영 데이터나 로그인 정보는 사용하지 않습니다.
브라우저 시간을 정지한 상태로 입력 직후 페이지·반·날짜를 바꾸고,
저장 완료 후 다시 로드하여 값이 남아 있는지 확인합니다.

추가 항목, 재시험 원점수·일정, 소수점·0점·빈칸, 출결·숙제 상태,
저장 실패 후 재시도, 초기화 후 복원 방지도 검증합니다.
