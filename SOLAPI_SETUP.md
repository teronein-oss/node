# SOLAPI 문자 발송 설정

이 프로젝트의 문자 발송 흐름은 다음과 같습니다.

1. 로그인한 관리자/원장이 Firebase Callable Function을 호출합니다.
2. 서버가 Firestore의 `registrations/{uid}`에서 승인 상태와 역할, 학원 소속을 다시 확인합니다.
3. 서버만 읽을 수 있는 Secret Manager의 SOLAPI 인증 정보로 SMS 또는 MMS를 요청합니다.
4. 발송 요청과 수신번호별 상태를 `academies/{academyId}/messageLogs/{requestId}`에 저장합니다.
5. `syncSolapiMessageResults`가 5분마다 SOLAPI 결과를 조회해 실제 성공/실패 상태를 갱신합니다. 관리자 화면에서 즉시 수동 갱신할 수도 있습니다.

## 1. 사전 준비

- Firebase 프로젝트를 Blaze 요금제로 전환합니다. Cloud Functions 2세대와 예약 함수에 필요합니다.
- SOLAPI 콘솔에서 사용할 발신번호를 먼저 등록하고 인증합니다.
- SOLAPI API Key와 API Secret을 발급합니다.
- MMS는 200KB 이하 JPG 이미지만 지원합니다.

## 2. 의존성 설치

```bash
npm install
npm --prefix functions install
```

## 3. 운영 Secret 등록

아래 값은 `.env`나 `VITE_*` 변수에 넣지 않습니다. `VITE_*` 변수는 브라우저 번들에 포함될 수 있습니다.

```bash
firebase functions:secrets:set SOLAPI_API_KEY
firebase functions:secrets:set SOLAPI_API_SECRET
firebase functions:secrets:set SOLAPI_SENDER
```

`SOLAPI_SENDER`에는 SOLAPI에 등록한 발신번호를 하이픈 없이 입력합니다. 예: `0212345678`

## 4. 배포

```bash
npm run build
npm run test:functions
firebase deploy --only functions,firestore:rules
```

배포되는 함수는 다음 세 개입니다.

- `sendSolapiMessage`: 인증·권한·입력값을 검증하고 발송 요청 및 최초 결과 저장
- `refreshSolapiMessageStatus`: 관리자 화면에서 특정 발송 건의 결과 즉시 갱신
- `syncSolapiMessageResults`: 5분마다 처리 중인 발송 건의 최종 결과 자동 갱신

## 5. 로컬 에뮬레이터

`functions/.secret.local.example`을 `functions/.secret.local`로 복사한 뒤 테스트용 키를 입력합니다. `.secret.local`은 Git에서 제외됩니다.

```bash
firebase emulators:start --only functions,firestore
```

실제 SOLAPI 키를 넣으면 에뮬레이터에서도 실제 발송 비용이 발생할 수 있습니다.

## 보안 및 운영 기준

- API Key와 Secret은 프론트엔드에 전달되지 않습니다.
- Firebase Auth만으로 신뢰하지 않고 서버에서 승인 상태 및 `관리자`/`원장` 역할을 확인합니다.
- 학원 ID는 일반 사용자의 요청값을 신뢰하지 않고 등록 문서에서 결정합니다.
- 동일한 `clientRequestId`는 한 번만 처리해 중복 발송을 방지합니다.
- 한 요청은 최대 100명입니다. 전송 전 화면에서 비용 발생 확인을 받습니다.
- Firestore 보안 규칙상 발송 기록은 해당 학원의 관리자/원장만 읽을 수 있고 클라이언트 쓰기는 차단됩니다.
- 운영 공개 전 Firebase App Check를 웹 앱에 설정하고 두 Callable Function의 `enforceAppCheck` 옵션을 활성화하는 것을 권장합니다.
- 전화번호는 개인정보입니다. 조직의 보존 정책에 맞춰 오래된 `messageLogs`를 삭제하는 별도 보존 정책을 적용하세요.
