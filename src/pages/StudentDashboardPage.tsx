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

interface SchoolGroup {
  key: string
  schoolName: string
  grade: string
  label: string
}

interface ClassBlock {
  key: string
  label: string
  level: string
  rows: DashboardRow[]
  isEmpty: boolean
}

interface RegisteredClass {
  teacherUid: string
  teacherName: string
  classId: string
  className: string
  schoolKey: string
  schoolName: string
  grade: string
  level: string
}

const HIGH_LEVEL_ORDER = ['S1', 'S2', 'A1', 'A2', 'A3']
const MIDDLE_LEVEL_ORDER = ['A', 'B', 'A1', 'A2', 'B1', 'B2']
const ELEMENTARY_LEVEL_ORDER = ['A1', 'A2', 'A3', 'A4', 'S1', 'S2']
const LEVEL_SORT_ORDER = ['S1', 'S2', 'A', 'B', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2']
const STATUS_OPTIONS = ['', '완료', '예정', '필요', '보류']
const GRADE_OPTIONS = ['', '1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급']

function parseClassName(name: string) {
  const trimmed = name.trim()
  const match = trimmed.match(/^(.+?)(\d+)[\s_]+([A-Za-z가-힣]+\d*)$/)
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
  const idx = LEVEL_SORT_ORDER.indexOf(level)
  return idx === -1 ? LEVEL_SORT_ORDER.length : idx
}

function formatClassLabel(schoolKey: string, level: string) {
  return level ? `${schoolKey} ${level}` : schoolKey
}

function getDefaultLevels(group?: SchoolGroup) {
  if (!group) return HIGH_LEVEL_ORDER
  if (group.schoolName.startsWith('중')) return MIDDLE_LEVEL_ORDER
  if (group.schoolName.startsWith('초')) return ELEMENTARY_LEVEL_ORDER
  return HIGH_LEVEL_ORDER
}

function buildRowId(teacherUid: string, studentId: string) {
  return `${teacherUid}_${studentId}`
}

function parseScore(value?: string) {
  if (!value) return null
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const score = Number(normalized)
  return Number.isFinite(score) ? score : null
}

function getScoreDelta(midScore?: string, finalScore?: string) {
  const mid = parseScore(midScore)
  const final = parseScore(finalScore)
  if (mid === null || final === null) return null
  return Number((final - mid).toFixed(1))
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

function ScoreDeltaCell({ midScore, finalScore }: { midScore?: string; finalScore?: string }) {
  const delta = getScoreDelta(midScore, finalScore)
  if (delta === null) {
    return (
      <div className="h-8 rounded-md bg-white text-center text-xs text-slate-300" />
    )
  }
  if (delta === 0) {
    return (
      <div className="flex h-8 items-center justify-center rounded-md bg-white text-xs font-semibold text-slate-400">0</div>
    )
  }
  const improved = delta > 0
  return (
    <div className={`flex h-8 items-center justify-center rounded-md bg-white text-xs font-bold ${improved ? 'text-red-500' : 'text-blue-600'}`}>
      <span className="mr-1">{improved ? '▲' : '▼'}</span>
      {Math.abs(delta).toFixed(1)}
    </div>
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

  const syncedRosters = useMemo(
    () => rosters.filter(roster => teacherNameMap.has(roster.uid)),
    [rosters, teacherNameMap]
  )

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
    for (const roster of syncedRosters) {
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
  }, [syncedRosters, sheetRows, teacherNameMap])

  const registeredClasses = useMemo(() => {
    const built: RegisteredClass[] = []
    for (const roster of syncedRosters) {
      for (const cls of roster.classes ?? []) {
        const parsed = parseClassName(cls.name)
        built.push({
          teacherUid: roster.uid,
          teacherName: teacherNameMap.get(roster.uid) ?? '이름 미확인',
          classId: cls.id,
          className: cls.name,
          ...parsed,
        })
      }
    }
    return built.sort((a, b) =>
      a.schoolName.localeCompare(b.schoolName, 'ko') ||
      a.grade.localeCompare(b.grade, 'ko') ||
      levelRank(a.level) - levelRank(b.level) ||
      a.className.localeCompare(b.className, 'ko') ||
      a.teacherName.localeCompare(b.teacherName, 'ko')
    )
  }, [syncedRosters, teacherNameMap])

  const schoolGroups = useMemo(() => {
    const map = new Map<string, SchoolGroup>()
    for (const cls of registeredClasses) {
      if (!map.has(cls.schoolKey)) {
        map.set(cls.schoolKey, {
          key: cls.schoolKey,
          schoolName: cls.schoolName,
          grade: cls.grade,
          label: cls.schoolKey,
        })
      }
    }
    return [...map.values()].sort((a, b) =>
      a.schoolName.localeCompare(b.schoolName, 'ko') ||
      a.grade.localeCompare(b.grade, 'ko') ||
      a.label.localeCompare(b.label, 'ko')
    )
  }, [registeredClasses])

  const currentSchool = activeSchool && schoolGroups.some(s => s.key === activeSchool)
    ? activeSchool
    : (schoolGroups[0]?.key ?? '')
  const currentGroup = schoolGroups.find(s => s.key === currentSchool)
  const visibleRows = rows.filter(r => r.schoolKey === currentSchool)
  const visibleClasses = registeredClasses.filter(c => c.schoolKey === currentSchool)
  const levelOptions = useMemo(() => {
    const existing = new Set([
      ...visibleClasses.map(c => c.level).filter(Boolean),
      ...visibleRows.map(r => r.level).filter(Boolean),
    ])
    const defaults = getDefaultLevels(currentGroup)
    const extras = [...existing]
      .filter(level => !defaults.includes(level))
      .sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b, 'ko'))
    return [...defaults, ...extras]
  }, [currentGroup, visibleClasses, visibleRows])

  const classBlocks = useMemo<ClassBlock[]>(() => {
    if (!currentSchool) return []
    const levelBlocks: ClassBlock[] = levelOptions.map(level => {
      const blockRows = visibleRows.filter(r => r.level === level)
      return {
        key: `${currentSchool}-${level}`,
        label: formatClassLabel(currentSchool, level),
        level,
        rows: blockRows,
        isEmpty: blockRows.length === 0,
      }
    })
    const unparsedBlocks: ClassBlock[] = visibleClasses
      .filter(cls => !cls.level)
      .map(cls => {
        const blockRows = visibleRows.filter(r => r.teacherUid === cls.teacherUid && r.classId === cls.classId)
        return {
          key: `${cls.teacherUid}-${cls.classId}`,
          label: cls.className,
          level: '',
          rows: blockRows,
          isEmpty: blockRows.length === 0,
        }
      })
    return [...levelBlocks, ...unparsedBlocks]
  }, [currentSchool, levelOptions, visibleClasses, visibleRows])

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
        {schoolGroups.length === 0 ? (
          <span className="rounded-full bg-white px-4 py-2 text-sm text-slate-400 border border-slate-200">학교 탭 없음</span>
        ) : schoolGroups.map(group => (
          <button
            key={group.key}
            onClick={() => setActiveSchool(group.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors
              ${currentSchool === group.key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'}`}
          >
            {group.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {currentGroup && (
          <div className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="text-lg font-bold text-slate-800">{currentGroup.label}</div>
            <div className="mt-1 text-xs text-slate-400">{levelOptions.join(' · ')} 순서로 정렬</div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            학생 명단을 불러오는 중...
          </div>
        ) : classBlocks.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">표시할 학교·반이 없습니다</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1780px] w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-800 bg-slate-50 text-xs text-slate-700">
                  <th className="sticky left-0 z-30 w-36 border-r border-slate-300 bg-slate-50 px-3 py-3 text-left whitespace-nowrap">반</th>
                  <th className="sticky left-[9rem] z-30 w-32 border-r border-slate-300 bg-slate-50 px-3 py-3 text-left whitespace-nowrap">선생님</th>
                  <th className="sticky left-[17rem] z-30 w-16 border-r border-slate-300 bg-slate-50 px-3 py-3 text-center whitespace-nowrap">번호</th>
                  <th className="sticky left-[21rem] z-30 w-32 border-r-2 border-slate-800 bg-slate-50 px-3 py-3 text-left whitespace-nowrap">이름</th>
                  <th className="w-24 border-r border-slate-200 bg-rose-100 px-2 py-3 whitespace-nowrap">첫상담</th>
                  <th className="w-24 border-r border-slate-200 bg-emerald-50 px-2 py-3 whitespace-nowrap">1학기 중간</th>
                  <th className="w-24 border-r border-slate-200 bg-rose-100 px-2 py-3 whitespace-nowrap">중간 상담</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">1학기 기말</th>
                  <th className="w-24 border-r border-slate-200 bg-rose-100 px-2 py-3 whitespace-nowrap">기말 상담</th>
                  <th className="w-28 border-r border-slate-200 bg-emerald-100 px-2 py-3 whitespace-nowrap">점수 등락폭</th>
                  <th className="w-24 border-r-2 border-slate-800 bg-yellow-100 px-2 py-3 whitespace-nowrap">1학기 등급</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">2학기 중간</th>
                  <th className="w-24 border-r border-slate-200 bg-rose-100 px-2 py-3 whitespace-nowrap">중간 상담</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">2학기 기말</th>
                  <th className="w-24 border-r border-slate-200 bg-rose-100 px-2 py-3 whitespace-nowrap">기말 상담</th>
                  <th className="w-24 border-r-2 border-slate-800 bg-yellow-100 px-2 py-3 whitespace-nowrap">2학기 등급</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">3월 모의</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">6월 모의</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">9월 모의</th>
                  <th className="w-24 border-r border-slate-200 px-2 py-3 whitespace-nowrap">10월 모의</th>
                  <th className="w-44 px-2 py-3 text-left whitespace-nowrap">메모</th>
                </tr>
              </thead>
              <tbody>
                {classBlocks.map(block => (
                  block.isEmpty ? (
                    <tr key={block.key} className="border-t-2 border-slate-800 bg-slate-50/50">
                      <td className="sticky left-0 z-20 border-r border-slate-300 bg-slate-50 px-3 py-4 font-semibold text-slate-500">{block.label}</td>
                      <td className="sticky left-[9rem] z-20 border-r border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-300" />
                      <td className="sticky left-[17rem] z-20 border-r border-slate-300 bg-slate-50 px-3 py-4 text-center text-slate-300" />
                      <td className="sticky left-[21rem] z-20 border-r-2 border-slate-800 bg-slate-50 px-3 py-4 text-sm text-slate-300">등록 학생 없음</td>
                      {Array.from({ length: 17 }, (_, i) => (
                        <td key={`${block.key}-empty-${i}`} className="border-r border-slate-100 bg-slate-50/60 px-2 py-4" />
                      ))}
                    </tr>
                  ) : block.rows.map((row, idx) => {
                    const startsGroup = idx === 0
                    const number = idx + 1
                    return (
                      <tr key={row.rowId} className={`${startsGroup ? 'border-t-2 border-slate-800' : 'border-t border-slate-200'} hover:bg-blue-50/30`}>
                        <td className="sticky left-0 z-20 border-r border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800">{startsGroup ? block.label : ''}</td>
                        <td className="sticky left-[9rem] z-20 border-r border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">{startsGroup ? row.teacherName : ''}</td>
                        <td className="sticky left-[17rem] z-20 border-r border-slate-300 bg-white px-3 py-2 text-center text-slate-500">{number}</td>
                        <td className="sticky left-[21rem] z-20 border-r-2 border-slate-800 bg-white px-3 py-2 font-medium text-slate-800">{row.student.name}</td>
                        <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.vocabProgress} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { vocabProgress: value })} /></td>
                        <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.firstMidScore} onSave={value => updateRow(row.rowId, { firstMidScore: value })} /></td>
                        <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.firstMidConsulted} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { firstMidConsulted: value })} /></td>
                        <td className="border-r border-slate-200 px-2 py-1"><TextCell value={row.sheet.firstFinalScore} onSave={value => updateRow(row.rowId, { firstFinalScore: value })} /></td>
                        <td className="border-r border-slate-200 bg-rose-50/60 px-2 py-1"><SelectCell value={row.sheet.firstFinalConsulted} options={STATUS_OPTIONS} tone="green" onSave={value => updateRow(row.rowId, { firstFinalConsulted: value })} /></td>
                        <td className="border-r border-slate-200 bg-emerald-50/70 px-2 py-1"><ScoreDeltaCell midScore={row.sheet.firstMidScore} finalScore={row.sheet.firstFinalScore} /></td>
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
                  })
                ))}
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
