/**
 * 학생 일괄 등록 스크립트
 * 사용법: 관리자 계정으로 로그인한 상태에서 브라우저 개발자 콘솔에 전체 붙여넣기
 */
(async () => {
  const { getFirestore, collection, getDocs, doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  // 이미 초기화된 Firebase app 사용
  const app = window.__FIREBASE_APP__ || (()=>{ throw new Error('Firebase app을 찾을 수 없습니다. 대시보드에서 실행해주세요.') })();
  const db = getFirestore(app);

  // ── 등록할 데이터 정의 ─────────────────────────────────────────────────────
  const IMPORT_DATA = {
    '김동재': {
      '백현고3 영독작': ['김건우', '박지원', '서유리', '유재웅', '이나경', '이성민', '이현정', '이현찬', '하유빈', '허은서', '허채윤'],
      '동백고1s1': ['강지용', '문서연', '박서현', '이단비', '이승준', '이윤수', '이제아', '조서연', '조유담', '최민성', '최서현'],
      '동백고1s2': ['김민제', '김서율', '김은우', '남경민', '박준후', '선우진', '소민준', '오수영', '유민우', '이소율', '임서진', '진하진', '홍진서', '황서정'],
      '동백고1a3': ['김서준', '나지훈', '노서율', '명하윤', '박규민', '변서희', '신하윤', '이하랑', '장시훈', '장민수', '조서연', '지은찬'],
      '백현고1s1': ['김국호', '김채원', '박진아', '성은찬', '유은서', '이동현', '이하연', '이하은', '임대현', '정서우', '정현준'],
      '백현고1s2': ['강현수', '김승빈', '김한결', '도우민', '문지호', '이민우', '임다은', '조채원', '조현지', '최서원', '최준원'],
      '백현고1a3': ['김려진', '안채은', '이예선', '이준서', '전수호'],
    },
    '정지연': {
      '성지고1': ['김서하', '이준원'],
      '동백1a1': ['김도윤', '김아림', '노연진', '서해민', '윤화영', '이주혜', '정재현', '주지윤', '최석현', '황윤서', '김건형', '오윤권', '조예림'],
      '동백1a2': ['김민석', '박서윤', '신민강', '염유나', '이서준', '조한슬', '주민'],
      '청덕2a1': ['정예담', '김유진', '오초아', '방지민'],
      '초당2a1': ['박규범', '이재원', '이형진', '김지민', '김윤선', '이현석'],
      '성지고2': ['김서영', '신도윤', '양준우', '정예지', '조하'],
    },
    '송지예': {
      '백현고2_s1': ['권서휘', '김시우', '양세인', '유현종', '이서진', '정민우', '최윤호', '여승기', '장서연'],
      '백현고2_s2': ['김경민', '나유진', '이치원', '이하랑', '장준혁', '전세영', '전현우', '정하원', '하서정', '이지윤', '조은빈', '김건'],
      '동백고2_A1': ['강연우', '강영진', '김려원', '김서우', '노호준', '라유진', '배선우', '신이정', '유현준', '윤산', '윤현희', '이서현', '정지원', '최준우'],
      '동백고2_A2': ['강하라', '김하빈', '신동빈', '원희선', '이성주', '이준서', '이형석', '이효주', '조은별'],
    },
  };

  // ── 유틸 ─────────────────────────────────────────────────────────────────
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function normalize(str) {
    // 공백·언더스코어·하이픈 제거 후 소문자 비교
    return str.replace(/[\s_\-]/g, '').toLowerCase();
  }

  // ── registrations 컬렉션에서 선생님 UID 찾기 ──────────────────────────────
  console.log('📋 registrations 조회 중...');
  const regSnap = await getDocs(collection(db, 'registrations'));
  const teacherMap = {}; // displayName → uid
  regSnap.forEach(d => {
    const { displayName, role, status } = d.data();
    if (status === 'approved') {
      teacherMap[displayName] = d.id;
    }
  });
  console.log('선생님 목록:', teacherMap);

  // ── 각 선생님 처리 ──────────────────────────────────────────────────────
  for (const [teacherName, classStudents] of Object.entries(IMPORT_DATA)) {
    // 이름 부분 매칭 (성만 일치해도)
    const uid = Object.entries(teacherMap).find(([name]) => name.includes(teacherName))?.[1];
    if (!uid) {
      console.warn(`⚠️  "${teacherName}" 계정을 찾을 수 없습니다 (uid 없음)`);
      continue;
    }
    console.log(`\n👤 ${teacherName} (${uid}) 처리 중...`);

    // appData 읽기
    const appRef = doc(db, 'appData', uid);
    const appSnap = await getDoc(appRef);
    if (!appSnap.exists()) {
      console.warn(`⚠️  ${teacherName}의 appData가 없습니다`);
      continue;
    }

    const appData = appSnap.data();
    const classes = appData.classes ?? [];
    const students = appData.students ?? [];
    const existingNames = new Set(students.filter(s => s.active).map(s => s.name));

    console.log(`  반 목록: ${classes.map(c => c.name).join(', ')}`);

    let addedCount = 0;
    let skippedCount = 0;

    for (const [targetClass, names] of Object.entries(classStudents)) {
      // 반 이름 유사 매칭
      const cls = classes.find(c => normalize(c.name) === normalize(targetClass));
      if (!cls) {
        console.warn(`  ⚠️  반 "${targetClass}" 을 찾을 수 없습니다. 현재 반: ${classes.map(c => c.name).join(', ')}`);
        continue;
      }
      console.log(`  ✅ 반 매칭: "${targetClass}" → "${cls.name}" (${cls.id})`);

      for (const name of names) {
        if (existingNames.has(name)) {
          console.log(`    ⏭  ${name} 이미 존재`);
          skippedCount++;
          continue;
        }
        const newStudent = {
          id: genId(),
          name,
          classId: cls.id,
          active: true,
        };
        students.push(newStudent);
        existingNames.add(name);
        addedCount++;
      }
    }

    // 저장
    await setDoc(appRef, { ...appData, students }, { merge: false });
    console.log(`  💾 저장 완료 — 추가: ${addedCount}명, 스킵: ${skippedCount}명`);
  }

  console.log('\n✅ 전체 완료!');
})();
