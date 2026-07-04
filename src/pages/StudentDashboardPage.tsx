import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { Check, LayoutGrid, Loader2 } from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import type { Class, Student } from '../types'

interface SharedRoster {
  uid: string
  classes: Class[]
  students: Student[]
  updatedAt?: string
}

interface SheetRowData {
  prevVocab?: string
  currentVocab?: string
  vocabProgress?: string
  firstMidScore?: string
  firstMidConsulted?: string
  firstFinalScore?: string
  firstFinalConsulted?: string
  scoreGrowth?: string
  firstGrade?: string
  secondMidScore?: string
  secondMidConsulted?: string
  secondFinalScore?: string
  secondFinalConsulted?: string
  secondGrade?: string
  mockMarch?: string
  mockJune?: string
  mockSeptember?: string
  mockOctober?: string
  memo?: string
}

interface DashboardRow {
  rowId: string
  teacherUid: string
  teacherName: string
  classId: string
  className: string
  schoolKey: string
  schoolName: string
  grade: string
  level: string
  student: Student
  sheet: SheetRowData
}

const LEVEL_ORDER = ['S1', 'S2', 'A1', 'A2', 'A3']
const TEXTBOOK_OPTIONS = ['', '없음', '(고2)특급VOCA', '(고2)ASAP VOCA', '능률VOCA', '워드마스터']
const STATUS_OPTIONS = ['', '완료', '예정', '필요', '보류']
const GRADE_OPTIONS = ['', '1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급']

function parseClassName(name: string) {
  const trimmed = name.trim()
  const match = trimmed.match(/^(.+?)(\d+)\s+(S\d+|A\d+)$/)
  if (!match) {
    return { schoolName: trimmed, grade: '', level: '', schoolKey: trimmed }
  }
  return {
    schoolName: match[1],
    grade: match[2],
    level: match[3],
    schoolKey: `${match[1]}${match[2]}`,
  }
}

function levelRank(level: string) {
  const idx = LEVEL_ORDER.indexOf(level)
  return idx === -1 ? LEVEL_ORDER.length : idx
}

function buildRowId(teacherUid: string, studentId: string) {
  return `${teacherUid}_${studentId}`
}

function SelectCell({
  value,
  options,
  tone = 'slate',
  onSave,
}: {
  value?: string
  options: string[]
  tone?: 'slate' | 'yellow' | 'green' | 'red'
  onSave: (value: string) => void
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    yellow: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
  }
  return (
    <select
      value={value ?? ''}
      onChange={e => onSave(e.target.value)}
      className={`w-full rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-200 ${tones[tone]}`}
    >
      {options.map(option => (
        <option key={option || 'empty'} value={option}>{option || '-'}</option>
      ))}
    </select>
  )
}

function TextCell({
  value,
  onSave,
  placeholder,
  align = 'center',
}: {
  value?: string
  onSave: (value: string) => void
  placeholder?: string
  align?: 'left' | 'center'
}) {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  return (
    <input
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => onSave(draft.trim())}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      placeholder={placeholder}
      className={`w-full rounded-md border border-transparent bg-white px-2 py-1 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-300 hover:border-slate-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 ${align === 'center' ? 'text-center' : 'text-left'}`}
    />
  )
}

export default function StudentDashboardPage() {
  const { approvedTeachers, isAdmin, user } = useAuth()
  const [rosters, setRosters] = useState<SharedRoster[]>([])
  const [sheetRows, setSheetRows] = useState<Record<string, SheetRowData>>({})
  const [activeSchool, setActiveSchool] = useState('')
  const [loading, setLoading] = useState(true)
  const adminBootstrapDone = useRef(false)
  const teacherNameMap = useMemo(() => {
    const map = new Map(approvedTeachers.map(t => [t.uid, t.displayName]))
    if (user) map.set(user.uid, user.displayName)
    return map
  }, [approvedTeachers, user])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sharedStudentRosters'), (snap) => {
      setRosters(snap.docs.map(d => ({ uid: d.id, ...(d.data() as Omit<SharedRoster, 'uid'>) })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'studentDashboardRows'), (snap) => {
      const next: Record<string, SheetRowData> = {}
      snap.docs.forEach(d => {
        next[d.id] = d.data() as SheetRowData
      })
      setSheetRows(next)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!isAdmin || adminBootstrapDone.current) return
    adminBootstrapDone.current = true
    getDocs(collection(db, 'appData')).then(async snap => {
      await Promise.all(snap.docs.map(async appDoc => {
        const data = appDoc.data() as { classes?: Class[]; students?: Student[] }
        if (!Array.isArray(data.classes) && !Array.isArray(data.students)) return
        await setDoc(doc(db, 'sharedStudentRosters', appDoc.id), {
          uid: appDoc.id,
          classes: data.classes ?? [],
          students: data.students ?? [],
          updatedAt: new Date().toISOString(),
        }, { merge: true })
      }))
    }).catch(err => console.error('공유 학생 명단 초기 동기화 실패:', err?.code))
  }, [isAdmin])

  const rows = useMemo(() => {
    const built: DashboardRow[] = []
    for (const roster of rosters) {
      for (const cls of roster.classes ?? []) {
        const parsed = parseClassName(cls.name)
        const students = (roster.students ?? [])
          .filter(s => s.active && s.classId === cls.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        for (const student of students) {
          const rowId = buildRowId(roster.uid, student.id)
          built.push({
            rowId,
            teacherUid: roster.uid,
            teacherName: teacherNameMap.get(roster.uid) ?? '이름 미확인',
            classId: cls.id,
            className: cls.name,
            ...parsed,
            student,
            sheet: sheetRows[rowId] ?? {},
          })
        }
      }
    }
    return built.sort((a, b) =>
      a.schoolKey.localeCompare(b.schoolKey, 'ko') ||
      levelRank(a.level) - levelRank(b.level) ||
      a.className.localeCompare(b.className, 'ko') ||
      a.teacherName.localeCompare(b.teacherName, 'ko') ||
      a.student.name.localeCompare(b.student.name, 'ko')
    )
  }, [rosters, sheetRows, teacherNameMap])

  const schoolKeys = useMemo(() => [...new Set(rows.map(r => r.schoolKey))], [rows])
  const currentSchool = activeSchool && schoolKeys.includes(activeSchool) ? activeSchool : (schoolKeys[0] ?? '')
  const visibleRows = rows.filter(r => r.schoolKey === currentSchool)

  const updateRow = async (rowId: string, patch: SheetRowData) => {
    const prev = sheetRows[rowId] ?? {}
    setSheetRows(cur => ({ ...cur, [rowId]: { ...(cur[rowId] ?? {}), ...patch } }))
    await setDoc(doc(db, 'studentDashboardRows', rowId), {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.displayName ?? user?.email ?? 'unknown',
    }, { merge: true })
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">학생 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">선생님별 담당 학생을 학교·레벨별로 모아 보는 공유 시트</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm border border-slate-100">
          <LayoutGrid size={14} className="text-blue-500" />
          실시간 공유 편집
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {schoolKeys.length === 0 ? (
          <span className="rounded-full bg-white px-4 py-2 text-sm text-slate-400 border border-slate-200">학교 탭 없음</span>
        ) : schoolKeys.map(key => (
          <button
            key={key}
            onClick={() => setActiveSchool(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors
              ${currentSchool === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'}`}
          >
            {key}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            학생 명단을 불러오는 중...
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">표시할 학생이 없습니다</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1900px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-800 bg-slate-50 text-xs text-slate-700">
                  <th className="sticky left-0 z-20 w-28 border-r border-slate-300 bg-slate-50 px-3 py-3 text-left">반</th>
                  <th className="sticky left-28 z-20 w-24 border-r border-slate-300 bg-slate-50 px-3 py-3 text-left">선생님</th>
                  <th className="sticky left-52 z-20 w-16 border-r border-slate-300 bg-slate-50 px-3 py-3 text-center">번호</th>
                  <th className="sticky left-[17rem] z-20 w-28 border-r-2 border-slate-800 bg-slate-50 px-3 py-3 text-left">이름</th>
                  <th className="w-44 border-r border-slate-200 bg-slate-100 px-3 py-3">1~2월 단어장</th>
                  <th className="w-44 border-r border-slate-200 bg-amber-100 px-3 py-3">3월 이후 단어장</th>
                  <th className="w-28 border-r border-slate-200 bg-rose-100 px-3 py-3">청상담</th>
                  <th className="w-24 border-r border-slate-200 bg-emerald-50 px-3 py-3">1학기 중간</th>
                  <th className="w-28 border-r border-slate-200 bg-rose-100 px-3 py-3">중간 상담</th>
                  <th className="w-24 border-r border-slate-200 px-3 py-3">1학기 기말</th>
                  <th className="w-28 border-r border-slate-200 bg-rose-100 px-3 py-3">기말 상담</th>
                  <th className="w-24 border-r border-slate-200 bg-emerald-100 px-3 py-3">점수 등락폭</th>
                  <th className="w-28 border-r-2 border-slate-800 bg-yellow-100 px-3 py-3">1학기 등급</th>
                  <th className="w-24 border-r border-slate-200 px-3 py-3">2학기 중간</th>
                  <th className="w-28 border-r border-slate-200 bg-rose-100 px-3 py-3">중간 상담</th>
                  <th className="w-24 border-r border-slate-200 px-3 py-3">2학기 기말</th>
                  <th className="w-28 border-r border-slate-200 bg-rose-100 px-3 py-3">기말 상담</th>
                  <th className="w-28 border-r-2 border-slate-800 bg-yellow-100 px-3 py-3">2학기 등급</th>
                  <th className="w-28 border-r border-slate-200 px-3 py-3">3월 모의</th>
                  <th className="w-28 border-r border-slate-200 px-3 py-3">6월 모의</th>
                  <th className="w-28 border-r border-slate-200 px-3 py-3">9월 모의</th>
                  <th className="w-28 border-r border-slate-200 px-3 py-3">10월 모의</th>
                  <th className="w-56 px-3 py-3 text-left">메모</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  const prev = visibleRows[idx - 1]
                  const startsGroup = !prev || prev.classId !== row.classId || prev.teacherUid !== row.teacherUid
                  const classRows = visibleRows.filter(r => r.classId === row.classId && r.teacherUid === row.teacherUid)
                  const number = classRows.findIndex(r => r.rowId === row.rowId) + 1
                  return (
                    <tr key={row.rowId} className={`${startsGroup ? 'border-t-2 border-slate-800' : 'border-t border-slate-200'} hover:bg-blue-50/30`}>
                      <td className="sticky left-0 z-10 border-r border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800">{row.className}</td>
                      <td className="sticky left-28 z-10 border-r border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">{row.teacherName}</td>
                      <td className="sticky left-52 z-10 border-r border-slate-300 bg-white px-3 py-2 text-center text-slate-500">{number}</td>
                      <td className="sticky left-[17rem] z-10 border-r-2 border-slate-800 bg-white px-3 py-2 font-medium text-slate-800">{row.student.name}</td>
                      <td className="border-r border-slate-200 px-2 py-1"><SelectCell value={row.sheet.prevVocab} options={TEXTBOOK_OPTIONS} onSave={value => updateRow(row.rowId, { prevVocab: value })} /></td>
                      <td className="border-r border-slate-200 bg-amber-50/60 px-2 py-1"><SelectCell value={row.sheet.currentVocab} options={TEXTBOOK_OPTIONS} tone="yellow" onSave={value => updateRow(row.rowId, { currentVocab: value })} /></td>
                      <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.vocabProgress} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { vocabProgress: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.firstMidScore} onSave={value => updateRow(row.rowId, { firstMidScore: value })} /></td>
                      <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.firstMidConsulted} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { firstMidConsulted: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.firstFinalScore} onSave={value => updateRow(row.rowId, { firstFinalScore: value })} /></td>
                      <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.firstFinalConsulted} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { firstFinalConsulted: value })} /></td>
                      <td className="border-r border-slate-200 bg-emerald-50/70 px-2 py-1"><TextCell value={row.sheet.scoreGrowth} onSave={value => updateRow(row.rowId, { scoreGrowth: value })} /></td>
                      <td className="border-r-2 border-slate-800 bg-yellow-50/70 px-2 py-1"><SelectCell value={row.sheet.firstGrade} options={GRADE_OPTIONS} tone="yellow" onSave={value => updateRow(row.rowId, { firstGrade: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.secondMidScore} onSave={value => updateRow(row.rowId, { secondMidScore: value })} /></td>
                      <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.secondMidConsulted} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { secondMidConsulted: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.secondFinalScore} onSave={value => updateRow(row.rowId, { secondFinalScore: value })} /></td>
                      <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.secondFinalConsulted} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { secondFinalConsulted: value })} /></td>
                      <td className="border-r-2 border-slate-800 bg-yellow-50/70 px-2 py-1"><SelectCell value={row.sheet.secondGrade} options={GRADE_OPTIONS} tone="yellow" onSave={value => updateRow(row.rowId, { secondGrade: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.mockMarch} onSave={value => updateRow(row.rowId, { mockMarch: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.mockJune} onSave={value => updateRow(row.rowId, { mockJune: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.mockSeptember} onSave={value => updateRow(row.rowId, { mockSeptember: value })} /></td>
                      <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.mockOctober} onSave={value => updateRow(row.rowId, { mockOctober: value })} /></td>
                      <td className="px-2 py-1"><TextCell value={row.sheet.memo} align="left" placeholder="메모" onSave={value => updateRow(row.rowId, { memo: value })} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Check size={13} className="text-emerald-500" />
        학생 명단은 선생님별 반·학생 데이터에서 자동 동기화되고, 입력값은 모든 승인 사용자가 공유합니다.
      </div>
    </div>
  )
}
