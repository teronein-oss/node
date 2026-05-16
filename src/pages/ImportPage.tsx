import { useState } from 'react'
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
function norm(s: string) {
  return s.replace(/[\s_\-]/g, '').toLowerCase()
}

const IMPORT_DATA: Record<string, Record<string, string[]>> = {
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
}

type LogEntry = { type: 'info' | 'warn' | 'error' | 'ok'; msg: string }

export default function ImportPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  if (!isAdmin) {
    navigate('/')
    return null
  }

  const log = (type: LogEntry['type'], msg: string) =>
    setLogs(prev => [...prev, { type, msg }])

  const run = async () => {
    setRunning(true)
    setLogs([])

    // 1. registrations 조회
    log('info', 'registrations 컬렉션 조회 중...')
    const regSnap = await getDocs(collection(db, 'registrations'))
    const teacherMap: Record<string, string> = {}
    regSnap.forEach(d => {
      const { displayName, status } = d.data() as { displayName: string; status: string }
      if (status === 'approved') teacherMap[displayName] = d.id
    })
    log('info', `승인된 계정: ${Object.keys(teacherMap).join(', ')}`)

    // 2. 각 선생님 처리
    for (const [teacherKey, classMap] of Object.entries(IMPORT_DATA)) {
      const entry = Object.entries(teacherMap).find(([n]) => n.includes(teacherKey))
      if (!entry) {
        log('warn', `"${teacherKey}" 계정을 찾을 수 없음 — 건너뜀`)
        continue
      }
      const [teacherName, uid] = entry
      log('info', `\n▶ ${teacherName} (${uid}) 처리 시작`)

      const appRef = doc(db, 'appData', uid)
      const appSnap = await getDoc(appRef)
      if (!appSnap.exists()) {
        log('warn', `  appData 없음 — 건너뜀`)
        continue
      }

      const appData = appSnap.data() as { classes?: { id: string; name: string }[]; students?: { id: string; name: string; classId: string; active: boolean }[] }
      const classes = appData.classes ?? []
      const students = [...(appData.students ?? [])]
      const existingNames = new Set(students.filter(s => s.active).map(s => s.name))

      log('info', `  등록된 반: ${classes.map(c => c.name).join(', ')}`)

      let added = 0
      let skipped = 0
      let missingClass = 0

      for (const [targetClass, names] of Object.entries(classMap)) {
        const cls = classes.find(c => norm(c.name) === norm(targetClass))
        if (!cls) {
          log('warn', `  반 "${targetClass}" 매칭 실패 (등록된 반: ${classes.map(c => c.name).join(', ')})`)
          missingClass++
          continue
        }
        log('ok', `  반 매칭: "${targetClass}" → "${cls.name}"`)

        for (const name of names) {
          if (existingNames.has(name)) {
            skipped++
            continue
          }
          students.push({ id: genId(), name, classId: cls.id, active: true })
          existingNames.add(name)
          added++
        }
      }

      await setDoc(appRef, { ...appData, students })
      log('ok', `  저장 완료 — 추가 ${added}명, 스킵 ${skipped}명${missingClass > 0 ? `, 반 미매칭 ${missingClass}개` : ''}`)
    }

    log('ok', '\n✅ 전체 임포트 완료!')
    setDone(true)
    setRunning(false)
  }

  const colorMap = {
    info: 'text-slate-600',
    warn: 'text-amber-600 font-medium',
    error: 'text-red-600 font-medium',
    ok: 'text-green-700',
  }

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">학생 일괄 등록 (임시 관리자 도구)</h1>
        <button onClick={() => navigate('/admin')} className="text-xs text-slate-400 hover:text-slate-600">← 관리자 패널</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800">
        이 페이지는 일회성 데이터 등록 도구입니다. 완료 후 코드에서 제거해주세요.
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="text-sm text-slate-600">
          <p className="font-semibold mb-2">등록 예정 내역:</p>
          {Object.entries(IMPORT_DATA).map(([t, cm]) => (
            <div key={t} className="mb-2">
              <span className="font-medium text-slate-800">{t}</span>
              {Object.entries(cm).map(([cls, names]) => (
                <div key={cls} className="ml-4 text-xs text-slate-500">
                  {cls}: {names.length}명 ({names.join(', ')})
                </div>
              ))}
            </div>
          ))}
        </div>

        <button
          onClick={run}
          disabled={running || done}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {running ? '등록 중...' : done ? '완료됨' : '학생 등록 실행'}
        </button>
      </div>

      {logs.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs space-y-0.5 max-h-96 overflow-y-auto">
          {logs.map((l, i) => (
            <div key={i} className={colorMap[l.type]}>{l.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}
