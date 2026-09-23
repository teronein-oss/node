# SEUM 성적 확인 포털

이 폴더는 로그인형 학원 대시보드와 분리된 공개 성적 열람 영역입니다.

- 진입점: `main.tsx`
- 전용 스타일: `report.css`
- 학생·교사 코드 판별 및 성적 화면: 이 폴더의 컴포넌트
- 공개 주소: `/report`

대시보드 UI나 테마를 수정할 때 이 폴더와 `report/index.html`을 변경하지 않습니다.
성적 포털을 수정할 때는 `src/dashboard.css`, `AppLayout`, `Sidebar`를 변경하지 않습니다.

## 시험 결과 등록

1. 시험지와 채점표를 `private/exam-imports/<시험 ID>/<학교 ID>/round-<회차>/`에 보관합니다. `private/`과 생성된 서버 시드는 Git에 포함하지 않습니다.
2. `scripts/exam_portal_2026_2_midterm.json`처럼 시험·학교·회차, 채점표 열, 문항 유형과 정답을 명시한 설정 파일을 만듭니다. 새 학교는 `cohorts`에 별도 `cohortId`로 추가합니다.
3. `python3 scripts/generate_exam_portal_seed.py --manifest <설정 파일>`을 실행합니다. 총점과 세부 점수 합계가 다르면 생성이 중단됩니다. 답안 공란·잘못된 선택지는 `private/exam-imports/<시험 ID>/import-audit.json`에 기록됩니다.
4. 생성된 `student-access-codes.csv`와 `teacher-master-codes.csv`는 학생·교사에게 각각 필요한 코드만 전달합니다. 서버에는 코드 원문 대신 해시만 포함됩니다. 같은 시험 ID로 재생성하면 기존 발급 코드를 유지합니다.
5. 서버와 웹 화면을 배포한 뒤 새 학생·교사 코드가 각각 해당 학교 데이터만 열고 이전 코드가 거부되는지 확인합니다.

학생 코드는 8자리, 학교별 교사용 마스터 코드는 12자리입니다. 새 학기 또는 코드 교체 시에는 별도 시험 ID와 코드 파일을 사용합니다.
