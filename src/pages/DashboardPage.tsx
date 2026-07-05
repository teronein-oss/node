import { useState, useMemo } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar, Megaphone, X, UserX } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { Class, HomeworkItem, ScheduleEvent } from '../types'
import { getMonthSessions, getWeekStart, getWeekStartForSession, formatDateKo, fmtDate, getClassDate, getMonthMWFSessions } from '../utils/helpers'
import { buildMonthOptions, getClassDatesForMonth, getCurrentYM } from '../utils/academic'

// ─── 달력 헬퍼 ────────────────────────────────────────────────────────────────
function buildCalDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const startPad = first.getDay()
  const days: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month - 1, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function daysBetween(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  while (cur <= endD) {
    dates.push(fmtDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function diffDays(start: string, end: string): number {
  return Math.round(
    (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000
  )
}

const ACADEMY_HOLIDAYS: Record<string, string> = {
  '2025-05-05': '어린이날',
  '2026-05-05': '어린이날',
}

const WEEK_DAYS = ['월', '화', '수', '목', '금', '토'] as const

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return fmtDate(d)
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

function getClassDateMapForWeek(classInfo: Class, weekDates: string[]) {
  const months = new Map<string, { year: number; month: number }>()
  for (const date of weekDates) {
    const d = new Date(date + 'T00:00:00')
    months.set(getMonthKey(date), { year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const entries = [...months.values()].flatMap(({ year, month }) =>
    getClassDatesForMonth({
      classInfo,
      year,
      month,
      includeFuture: true,
      filterMWFToCalendarMonth: true,
    })
  )
  return new Map(entries.map(entry => [entry.date, entry.sessionNum]))
}

// ─── 일정 패널 ────────────────────────────────────────────────────────────────
function SchedulePanel({
  title, icon: Icon, iconColor, events, todayStr, onToggle, onRemove, readOnly,
}: {
  title: string
  icon: React.ElementType
  iconColor: string
  events: ScheduleEvent[]
  todayStr: string
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  readOnly?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const activeEvents = useMemo(
    () => events
      .filter(e => e.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'ko')),
    [events, todayStr]
  )
  const todayCount = activeEvents.filter(e => e.startDate <= todayStr && e.endDate >= todayStr).length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center gap-2 px-5 py-3 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors"
      >
        <Icon size={15} className={iconColor} />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${todayCount > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
          오늘 {todayCount}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          전체 {activeEvents.length}
        </span>
        {isOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>
      {isOpen && (
        <ul className="divide-y divide-slate-50">
          {activeEvents.length === 0 && (
            <li className="px-5 py-3 text-xs text-slate-400 text-center">진행 중인 업무가 없습니다</li>
          )}
          {activeEvents.map(e => {
            const span = diffDays(e.startDate, e.endDate)
            const isToday = e.startDate <= todayStr && e.endDate >= todayStr
            return (
              <li key={e.id} className={`flex items-start gap-2 px-5 py-2.5 group ${isToday ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50'}`}>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className={`text-sm break-words ${e.completed ? 'line-through text-slate-400' : isToday ? 'font-semibold text-red-700' : 'text-slate-700'}`}>
                    {e.title}
                  </p>
                  <p className={`text-xs mt-0.5 ${isToday ? 'text-red-500' : 'text-slate-400'}`}>
                    {span > 0 ? `${e.startDate} ~ ${e.endDate} (${span + 1}일)` : e.startDate}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => onToggle(e.id)}
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border transition-colors shrink-0
                      ${e.completed
                        ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    <CheckCircle size={11} />
                    {e.completed ? '완료됨' : '완료'}
                  </button>
                )}
                {readOnly && e.completed && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border bg-green-50 text-green-600 border-green-200 shrink-0">
                    <CheckCircle size={11} />완료됨
                  </span>
                )}
                {!readOnly && (
                  <button
                    onClick={() => onRemove(e.id)}
                    className="text-slate-300 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100 pt-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── 미니 달력 ────────────────────────────────────────────────────────────────
function MiniCalendar({ year, month, scheduleEvents }: {
  year: number; month: number; scheduleEvents: ScheduleEvent[]
}) {
  const todayStr = fmtDate(new Date())
  const days = buildCalDays(year, month)
  const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {}
    for (const e of scheduleEvents) {
      for (const d of daysBetween(e.startDate, e.endDate)) {
        if (!map[d]) map[d] = []
        map[d].push(e)
      }
    }
    return map
  }, [scheduleEvents])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Calendar size={15} className="text-slate-400" />
        <span className="text-sm font-semibold text-slate-800">{year}년 {month}월</span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {DOW_LABELS.map((d, i) => (
            <div key={d} className={`text-center text-xs font-medium py-1
              ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {days.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} />
            const dateStr = fmtDate(date)
            const isToday = dateStr === todayStr
            const holiday = ACADEMY_HOLIDAYS[dateStr]
            const evts = eventsByDate[dateStr] ?? []
            const hasPersonal = evts.some(e => e.type === 'personal')
            const hasAll = evts.some(e => e.type === 'all')
            const dow = date.getDay()
            const eventBorder = hasAll ? 'ring-[3px] ring-red-400'
              : hasPersonal ? 'ring-[3px] ring-green-500'
              : ''

            return (
              <div key={dateStr} className="flex flex-col items-center py-0.5">
                <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium ${eventBorder}
                  ${isToday ? 'bg-slate-800 text-white'
                    : holiday ? 'text-red-500 font-semibold'
                    : dow === 0 ? 'text-red-400'
                    : dow === 6 ? 'text-blue-400'
                    : 'text-slate-600'}`}>
                  {date.getDate()}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-50 pt-2">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-4 h-4 rounded-full bg-slate-800 inline-block shrink-0" />오늘
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-4 h-4 rounded-full border-[3px] border-green-500 inline-block shrink-0" />개인
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-4 h-4 rounded-full border-[3px] border-red-400 inline-block shrink-0" />전체
          </div>
        </div>
      </div>
    </div>
  )
}

interface TodayTaskRow {
  classId: string
  className: string
  vocabRetests: TodayRetestItem[]
  dailyRetests: TodayRetestItem[]
  homeworkTargets: TodayHomeworkItem[]
  homeworkBadNames: string[]
  homeworkMissingNames: string[]
  homeworkDescription: string
}

interface TodayRetestItem {
  id: string
  name: string
  passed: boolean | null
}

interface TodayHomeworkItem {
  studentId: string
  name: string
  assignmentId?: string
  itemIds: string[]
  sessionNum: number
  completed: boolean
}

function TodayFocusPanel({
  rows,
  onCompleteRetest,
  onCompleteHomework,
}: {
  rows: TodayTaskRow[]
  onCompleteRetest: (item: TodayRetestItem) => void
  onCompleteHomework: (item: TodayHomeworkItem) => void
}) {
  const vocabTotal = rows.reduce((sum, row) => sum + row.vocabRetests.length, 0)
  const dailyTotal = rows.reduce((sum, row) => sum + row.dailyRetests.length, 0)
  const homeworkTotal = rows.reduce((sum, row) => sum + row.homeworkTargets.length, 0)
  const total = vocabTotal + dailyTotal + homeworkTotal

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
        <CheckCircle size={15} className="text-blue-500" />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">오늘 확인</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${total > 0 ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
          대상 {total}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-4 text-center text-xs text-slate-400">오늘 확인할 대상이 없습니다</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map(row => (
            <div key={row.classId} className="px-5 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">{row.className}</span>
                {row.homeworkDescription && (
                  <span className="truncate text-xs text-slate-400">{row.homeworkDescription}</span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <TodayRetestGroup label="단어 재시험" items={row.vocabRetests} color="purple" onComplete={onCompleteRetest} />
                <TodayRetestGroup label="Daily 재시험" items={row.dailyRetests} color="blue" onComplete={onCompleteRetest} />
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">숙제검사</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${row.homeworkTargets.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>
                      {row.homeworkTargets.length}
                    </span>
                  </div>
                  <TodayHomeworkList items={row.homeworkTargets} onComplete={onCompleteHomework} />
                  {(row.homeworkBadNames.length > 0 || row.homeworkMissingNames.length > 0) && (
                    <div className="mt-2 space-y-1">
                      <HomeworkStatusLine label="미흡" names={row.homeworkBadNames} color="orange" />
                      <HomeworkStatusLine label="미제출" names={row.homeworkMissingNames} color="red" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TodayRetestGroup({
  label,
  items,
  color,
  onComplete,
}: {
  label: string
  items: TodayRetestItem[]
  color: 'purple' | 'blue'
  onComplete: (item: TodayRetestItem) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${items.length > 0 ? color === 'purple' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <span className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle size={13} /> 없음</span>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
              <span className={`truncate text-xs font-medium ${color === 'purple' ? 'text-purple-700' : 'text-blue-700'}`}>{item.name}</span>
              {item.passed === true ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">통과</span>
              ) : (
                <button
                  onClick={() => onComplete(item)}
                  className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
                >
                  완료
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TodayHomeworkList({
  items,
  onComplete,
}: {
  items: TodayHomeworkItem[]
  onComplete: (item: TodayHomeworkItem) => void
}) {
  if (items.length === 0) return <span className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle size={13} /> 없음</span>

  return (
    <div className="space-y-1">
      {items.map(item => (
        <div key={item.studentId} className="flex items-center justify-between gap-2 rounded-lg bg-orange-50 px-2 py-1.5">
          <span className="truncate text-xs font-medium text-orange-700">{item.name}</span>
          {item.completed ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">완료</span>
          ) : (
            <button
              onClick={() => onComplete(item)}
              className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
            >
              완료
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── 메인 대시보드 ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { state, dispatch, getCurrentSession, selectedYM, setSelectedYM, globalScheduleEvents } = useApp()
  const { user, isAdmin, viewingUid } = useAuth()
  const isJogyo = user?.role === '조교'
  const { weekStart } = getCurrentSession()
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getWeekStart())

  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDate = today.getDate()
  const todayStr = fmtDate(today)

  const [selectedYear, selectedMonth] = selectedYM.split('-').map(Number)
  const currentYM = getCurrentYM(today)

  const ownEvents = state.scheduleEvents ?? []
  const allEvents = useMemo(
    () => (isAdmin && !viewingUid
      ? ownEvents.filter(e => e.type === 'all')
      : globalScheduleEvents
    ).sort((a: { startDate: string }, b: { startDate: string }) => a.startDate.localeCompare(b.startDate)),
    [isAdmin, viewingUid, ownEvents, globalScheduleEvents]
  )
  const scheduleEvents = allEvents

  // 월 목록
  const availableMonths = useMemo(() => {
    return buildMonthOptions({
      grades: state.grades,
      homeworks: state.homeworks,
      sort: 'asc',
      today,
    })
  }, [state.grades, state.homeworks, currentYM])

  const currentIdx = availableMonths.findIndex(m => m.ym === selectedYM)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < availableMonths.length - 1

  // 학생 이름 조회
  const getStudentName = (id: string) => state.students.find(s => s.id === id)?.name ?? '?'

  const weekDates = useMemo(
    () => WEEK_DAYS.map((label, idx) => {
      const date = addDays(selectedWeekStart, idx)
      return { label, date, display: formatDateKo(date) }
    }),
    [selectedWeekStart]
  )

  const weeklyRetestRows = useMemo(() => {
    return state.classes.map(cls => {
      const studentIds = new Set(state.students.filter(s => s.active && s.classId === cls.id).map(s => s.id))
      const dateMap = getClassDateMapForWeek(cls, weekDates.map(d => d.date))
      const days = weekDates.map(day => {
        const sessionNum = dateMap.get(day.date)
        if (!sessionNum) {
          return {
            ...day,
            sessionNum: null,
            vocabNames: [],
            dailyNames: [],
            isClassDay: false,
          }
        }
        const retests = state.retests.filter(
          r => r.sessionNum === sessionNum && r.passed === null && studentIds.has(r.studentId)
        )
        return {
          ...day,
          sessionNum,
          vocabNames: retests.filter(r => r.type === 'vocab').map(r => getStudentName(r.studentId)),
          dailyNames: retests.filter(r => r.type === 'daily').map(r => getStudentName(r.studentId)),
          isClassDay: true,
        }
      })
      return {
        classId: cls.id,
        className: cls.name,
        classDays: cls.days,
        days,
        total: days.reduce((sum, day) => sum + day.vocabNames.length + day.dailyNames.length, 0),
      }
    })
  }, [state.classes, state.students, state.retests, weekDates])

  const weeklyHomeworkRows = useMemo(() => {
    const statusRank: Record<string, number> = { '미제출': 3, '미흡': 2, '재확인완료': 1 }
    return state.classes.map(cls => {
      const studentIds = new Set(state.students.filter(s => s.active && s.classId === cls.id).map(s => s.id))
      const dateMap = getClassDateMapForWeek(cls, weekDates.map(d => d.date))
      const days = weekDates.map(day => {
        const sessionNum = dateMap.get(day.date)
        if (!sessionNum) {
          return {
            ...day,
            sessionNum: null,
            items: [],
            description: '',
            notGoodNames: [],
            missingNames: [],
            isClassDay: false,
          }
        }

        const hw = state.homeworks.find(
          h => h.sessionNum === sessionNum - 1 && (h.classId === cls.id || h.classId === '')
        )
        const gradeRecords = state.grades.filter(
          g => g.sessionNum === sessionNum && studentIds.has(g.studentId)
        )
        const hwMissSet = new Set<string>()
        const hwBadSet = new Set<string>()
        const items = hw?.items ?? []

        if (items.length > 0) {
          const worstMap = new Map<string, number>()
          for (const item of items) {
            for (const ss of (item.studentStatuses ?? [])) {
              if (!studentIds.has(ss.studentId)) continue
              const rank = statusRank[ss.status] ?? 0
              if (rank > (worstMap.get(ss.studentId) ?? 0)) worstMap.set(ss.studentId, rank)
            }
          }
          for (const [studentId, rank] of worstMap) {
            const name = getStudentName(studentId)
            if (rank === 3) hwMissSet.add(name)
            else if (rank === 2) hwBadSet.add(name)
          }
        } else {
          for (const g of gradeRecords) {
            if (g.attendance === '결석') continue
            if (g.homeworkDone === '미흡') hwBadSet.add(getStudentName(g.studentId))
          }
        }

        const missingNames = [...hwMissSet]
        return {
          ...day,
          sessionNum,
          items,
          description: hw?.description ?? '',
          notGoodNames: [...hwBadSet].filter(name => !hwMissSet.has(name)),
          missingNames,
          isClassDay: true,
        }
      })
      return {
        classId: cls.id,
        className: cls.name,
        classDays: cls.days,
        days,
        total: days.reduce((sum, day) => sum + day.notGoodNames.length + day.missingNames.length, 0),
      }
    })
  }, [state.classes, state.students, state.homeworks, state.grades, weekDates])

  const weekTotal = weeklyRetestRows.reduce((sum, row) => sum + row.total, 0)
  const homeworkWeekTotal = weeklyHomeworkRows.reduce((sum, row) => sum + row.total, 0)
  const selectedWeekEnd = weekDates[weekDates.length - 1]?.date ?? selectedWeekStart
  const isCurrentWeek = selectedWeekStart === getWeekStart()

  const todayTaskRows = useMemo<TodayTaskRow[]>(() => {
    const statusRank: Record<string, number> = { '미제출': 3, '미흡': 2, '재확인완료': 1 }

    return state.classes
      .map(cls => {
        const sessionNum = getClassDateMapForWeek(cls, [todayStr]).get(todayStr)
        if (!sessionNum) return null

        const activeStudents = state.students
          .filter(s => s.active && s.classId === cls.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        const studentIds = new Set(activeStudents.map(s => s.id))
        const retests = state.retests.filter(
          r => r.sessionNum === sessionNum && studentIds.has(r.studentId) && (r.passed === null || r.passed === true)
        )
        const vocabRetests = retests
          .filter(r => r.type === 'vocab')
          .map(r => ({ id: r.id, name: getStudentName(r.studentId), passed: r.passed }))
        const dailyRetests = retests
          .filter(r => r.type === 'daily')
          .map(r => ({ id: r.id, name: getStudentName(r.studentId), passed: r.passed }))
        const hw = state.homeworks.find(
          h => h.sessionNum === sessionNum - 1 && (h.classId === cls.id || h.classId === '')
        )
        const homeworkTargets: TodayHomeworkItem[] = hw ? activeStudents.map(student => {
          const itemIds = (hw.items ?? []).map(item => item.id)
          const itemStatuses = (hw.items ?? []).map(item =>
            (item.studentStatuses ?? []).find(ss => ss.studentId === student.id)?.status
          )
          const gradeStatus = state.grades.find(g => g.studentId === student.id && g.sessionNum === sessionNum)?.homeworkDone
          return {
            studentId: student.id,
            name: student.name,
            assignmentId: hw.id,
            itemIds,
            sessionNum,
            completed: itemStatuses.length > 0
              ? itemStatuses.every(status => status === '제출' || status === '재확인완료')
              : gradeStatus === '제출' || gradeStatus === '재확인완료',
          }
        }) : []
        const homeworkBadSet = new Set<string>()
        const homeworkMissingSet = new Set<string>()

        if (hw?.items?.length) {
          const worstMap = new Map<string, number>()
          for (const item of hw.items) {
            for (const ss of (item.studentStatuses ?? [])) {
              if (!studentIds.has(ss.studentId)) continue
              const rank = statusRank[ss.status] ?? 0
              if (rank > (worstMap.get(ss.studentId) ?? 0)) worstMap.set(ss.studentId, rank)
            }
          }
          for (const [studentId, rank] of worstMap) {
            const name = getStudentName(studentId)
            if (rank === 3) homeworkMissingSet.add(name)
            else if (rank === 2) homeworkBadSet.add(name)
          }
        } else if (hw) {
          for (const g of state.grades.filter(g => g.sessionNum === sessionNum && studentIds.has(g.studentId))) {
            if (g.attendance === '결석') continue
            if (g.homeworkDone === '미흡') homeworkBadSet.add(getStudentName(g.studentId))
          }
        }

        const row: TodayTaskRow = {
          classId: cls.id,
          className: cls.name,
          vocabRetests,
          dailyRetests,
          homeworkTargets,
          homeworkBadNames: [...homeworkBadSet].filter(name => !homeworkMissingSet.has(name)),
          homeworkMissingNames: [...homeworkMissingSet],
          homeworkDescription: hw?.description || (hw?.items ?? []).map(item => item.text).join(', '),
        }
        const hasTargets = row.vocabRetests.length > 0 || row.dailyRetests.length > 0 || row.homeworkTargets.length > 0
        return hasTargets ? row : null
      })
      .filter((row): row is TodayTaskRow => row !== null)
  }, [state.classes, state.students, state.retests, state.homeworks, state.grades, todayStr])

  const completeTodayRetest = (item: TodayRetestItem) => {
    if (!confirm(`${item.name} 재시험을 통과 처리하겠습니까?`)) return
    dispatch({ type: 'SAVE_RETEST', payload: { id: item.id, retestScore: null, passed: true } })
  }

  const completeTodayHomework = (item: TodayHomeworkItem) => {
    if (!confirm(`${item.name} 숙제검사를 완료 처리하겠습니까?`)) return
    if (item.assignmentId && item.itemIds.length > 0) {
      for (const itemId of item.itemIds) {
        dispatch({
          type: 'SET_ITEM_STUDENT_STATUS',
          payload: { assignmentId: item.assignmentId, itemId, studentId: item.studentId, status: '제출' },
        })
      }
    } else {
      dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: item.studentId, sessionNum: item.sessionNum, status: '제출' } })
    }
  }

  const goWeek = (offset: number) => {
    const nextWeekStart = addDays(selectedWeekStart, offset * 7)
    setSelectedWeekStart(nextWeekStart)
    setSelectedYM(getMonthKey(nextWeekStart))
  }

  // 해당 월 세션 목록 (넉넉하게 12개)
  const monthSessions = useMemo(
    () => getMonthSessions(selectedYear, selectedMonth, 12),
    [selectedYear, selectedMonth]
  )

  // 날짜 기반 행 생성 (반 하나에 대해)
  const buildRows = useMemo(() => {
    return (classId: string) => {
      const cls = state.classes.find(c => c.id === classId)
      if (!cls) return []
      const studentIds = new Set(state.students.filter(s => s.active && s.classId === classId).map(s => s.id))

      const sessions = cls.days === 'mon-wed-fri'
        ? getMonthMWFSessions(selectedYear, selectedMonth)
        : monthSessions

      return sessions
        .map(sNum => {
          const date = getClassDate(sNum, cls.days)
          const [y, m] = date.split('-').map(Number)
          if (y !== selectedYear || m !== selectedMonth) return null

          const retests = state.retests.filter(
            r => r.sessionNum === sNum && r.passed === null && studentIds.has(r.studentId)
          )
          const scope = state.scopes.find(s => s.sessionNum === sNum && s.classId === classId)
          const hw = state.homeworks.find(
            h => h.sessionNum === sNum - 1 && (h.classId === classId || h.classId === '')
          )
          const gradeRecords = state.grades.filter(
            g => g.sessionNum === sNum && studentIds.has(g.studentId)
          )
          const vocabNames = retests.filter(r => r.type === 'vocab').map(r => getStudentName(r.studentId))
          const dailyNames = retests.filter(r => r.type === 'daily').map(r => getStudentName(r.studentId))
          const hwDescription = hw?.description ?? ''
          const hwItems = hw?.items ?? []

          const hwMissSet = new Set<string>()
          const hwBadSet = new Set<string>()

          // 미제출(3) > 미흡(2) > 재확인완료(1) > 제출/없음(0)
          // 결석 학생은 결석생 현황에 별도 표시되므로 숙제 현황에서는 아이템/grade 상태만 사용
          const statusRank: Record<string, number> = { '미제출': 3, '미흡': 2, '재확인완료': 1 }
          if (hwItems.length > 0) {
            // 아이템이 있으면 아이템 상태만 사용 (숙제관리와 동일 기준)
            const worstMap = new Map<string, number>()
            for (const item of hwItems) {
              for (const ss of (item.studentStatuses ?? [])) {
                if (!studentIds.has(ss.studentId)) continue
                const rank = statusRank[ss.status] ?? 0
                if (rank > (worstMap.get(ss.studentId) ?? 0)) worstMap.set(ss.studentId, rank)
              }
            }
            for (const [studentId, rank] of worstMap) {
              const name = getStudentName(studentId)
              if (rank === 3) hwMissSet.add(name)
              else if (rank === 2) hwBadSet.add(name)
              // rank === 1 (재확인완료) → 표시 안 함
            }
          } else {
            // 아이템 없는 경우(기존 데이터)만 grade.homeworkDone fallback
            for (const g of gradeRecords) {
              if (g.attendance === '결석') continue
              const name = getStudentName(g.studentId)
              if (g.homeworkDone === '미흡') hwBadSet.add(name)
            }
          }
          const hwMissNames = [...hwMissSet]
          const hwNotGoodNames = [...hwBadSet].filter(n => !hwMissSet.has(n))

          const absentNames = gradeRecords
            .filter(g => g.attendance === '결석')
            .map(g => getStudentName(g.studentId))

          const hasGradeData =
            !!scope ||
            vocabNames.length > 0 ||
            dailyNames.length > 0 ||
            gradeRecords.length > 0
          const hasHwData = hwItems.length > 0 || hwDescription !== '' || hwNotGoodNames.length > 0 || hwMissNames.length > 0
          const hasAbsentData = absentNames.length > 0

          return {
            date,
            sessionNum: sNum,
            classId: cls.id,
            className: cls.name,
            isCurrent: getWeekStartForSession(sNum) === weekStart,
            vocabRange: scope?.vocabRange ?? '',
            dailyRange: scope?.dailyRange ?? '',
            vocabNames,
            dailyNames,
            hwDescription,
            hwItems,
            hwNotGoodNames,
            hwMissNames,
            absentNames,
            hasGradeData,
            hasHwData,
            hasAbsentData,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    }
  }, [state, monthSessions, selectedYear, selectedMonth, weekStart])

  // 현재 탭에 따라 표시할 행들 (오늘 이후 날짜 제외)
  const displayRows = useMemo(() => {
    const rows = state.classes
      .flatMap(cls => buildRows(cls.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.classId.localeCompare(b.classId))
    return rows.filter(r => r.date <= todayStr)
  }, [buildRows, state.classes, todayStr])

  // 결석생 현황: 결석 데이터 있는 행만
  const absentRows = useMemo(
    () => displayRows.filter(r => r.hasAbsentData),
    [displayRows]
  )

  const isAllTab = true

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">

      {/* 상단: 일정 패널 + 달력 */}
      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2 space-y-3">
          <SchedulePanel
            title="업무 공지"
            icon={Megaphone}
            iconColor="text-amber-500"
            events={allEvents}
            todayStr={todayStr}
            onToggle={id => dispatch({ type: 'TOGGLE_SCHEDULE_EVENT', payload: id })}
            onRemove={id => dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: id })}
            readOnly={isJogyo}
          />
          <TodayFocusPanel rows={todayTaskRows} onCompleteRetest={completeTodayRetest} onCompleteHomework={completeTodayHomework} />
        </div>
        <MiniCalendar year={selectedYear} month={selectedMonth} scheduleEvents={scheduleEvents} />
      </div>

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            {todayYear}년 {todayMonth}월 {todayDate}일
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Calendar size={15} className="text-slate-400" />
          <button
            onClick={() => hasPrev && setSelectedYM(availableMonths[currentIdx - 1].ym)}
            disabled={!hasPrev}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700 w-20 text-center">
            {selectedYear}년 {selectedMonth}월
            {selectedYM === currentYM && <span className="ml-1 text-xs text-blue-500 font-normal">(현재)</span>}
          </span>
          <button
            onClick={() => hasNext && setSelectedYM(availableMonths[currentIdx + 1].ym)}
            disabled={!hasNext}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 주간 미통과 현황 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">주간 미통과 현황</h2>
            <p className="text-xs text-slate-400 mt-1">
              {formatDateKo(selectedWeekStart)} ~ {formatDateKo(selectedWeekEnd)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${weekTotal > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              이번 주 미통과 {weekTotal}명
            </span>
            <button
              onClick={() => goWeek(-1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                setSelectedWeekStart(getWeekStart())
                setSelectedYM(currentYM)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${isCurrentWeek ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            >
              이번 주
            </button>
            <button
              onClick={() => goWeek(1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] table-fixed text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-4 py-3 w-32">반</th>
                {weekDates.map(day => (
                  <th
                    key={day.date}
                    className={`text-left px-3 py-3 ${day.date === todayStr ? 'bg-yellow-50 text-yellow-700' : ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{day.label}</span>
                      <span className="font-normal">{day.date.slice(5).replace('-', '.')}</span>
                      {day.date === todayStr && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">오늘</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 w-20">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {weeklyRetestRows.map(row => (
                <tr key={row.classId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-800">{row.className}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {row.classDays === 'mon-fri' ? '월·금'
                        : row.classDays === 'tue-thu' ? '화·목'
                        : row.classDays === 'wed-sat' ? '수·토'
                        : '월·수·금'}
                    </div>
                  </td>
                  {row.days.map(day => (
                    <td
                      key={`${row.classId}-${day.date}`}
                      className={`px-3 py-3 align-top ${day.date === todayStr ? 'bg-yellow-50/40' : ''}`}
                    >
                      <WeeklyRetestCell
                        isClassDay={day.isClassDay}
                        vocabNames={day.vocabNames}
                        dailyNames={day.dailyNames}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 align-top text-right">
                    <span className={`inline-flex min-w-8 justify-center rounded-full px-2 py-1 text-xs font-semibold ${row.total > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'}`}>
                      {row.total}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 주간 숙제 제출현황 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">주간 숙제 제출현황</h2>
            <p className="text-xs text-slate-400 mt-1">
              {formatDateKo(selectedWeekStart)} ~ {formatDateKo(selectedWeekEnd)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${homeworkWeekTotal > 0 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
              이번 주 미흡/미제출 {homeworkWeekTotal}명
            </span>
            <a href="/homework" className="text-xs text-blue-600 hover:underline">숙제관리 →</a>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] table-fixed text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-4 py-3 w-32">반</th>
                {weekDates.map(day => (
                  <th
                    key={`hw-head-${day.date}`}
                    className={`text-left px-3 py-3 ${day.date === todayStr ? 'bg-yellow-50 text-yellow-700' : ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{day.label}</span>
                      <span className="font-normal">{day.date.slice(5).replace('-', '.')}</span>
                      {day.date === todayStr && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">오늘</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 w-20">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {weeklyHomeworkRows.map(row => (
                <tr key={`weekly-hw-${row.classId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-800">{row.className}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {row.classDays === 'mon-fri' ? '월·금'
                        : row.classDays === 'tue-thu' ? '화·목'
                        : row.classDays === 'wed-sat' ? '수·토'
                        : '월·수·금'}
                    </div>
                  </td>
                  {row.days.map(day => (
                    <td
                      key={`${row.classId}-${day.date}-homework`}
                      className={`px-3 py-3 align-top ${day.date === todayStr ? 'bg-yellow-50/40' : ''}`}
                    >
                      <WeeklyHomeworkCell
                        isClassDay={day.isClassDay}
                        items={day.items}
                        description={day.description}
                        notGoodNames={day.notGoodNames}
                        missingNames={day.missingNames}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 align-top text-right">
                    <span className={`inline-flex min-w-8 justify-center rounded-full px-2 py-1 text-xs font-semibold ${row.total > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>
                      {row.total}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 결석생 현황 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <UserX size={15} className="text-rose-500" />
          <h2 className="font-semibold text-slate-800">{selectedYear}년 {selectedMonth}월 결석생 현황</h2>
          <span className="ml-auto text-xs text-slate-400">결석 처리된 수업 기준</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-5 py-3 w-36">날짜</th>
                {isAllTab && <th className="text-left px-4 py-3 w-28">반</th>}
                <th className="text-left px-4 py-3 w-44">결석 학생</th>
                <th className="text-left px-4 py-3 w-36">단어시험 범위</th>
                <th className="text-left px-4 py-3 w-36">Daily 범위</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {absentRows.length === 0 ? (
                <tr>
                  <td colSpan={isAllTab ? 5 : 4} className="px-5 py-8 text-center text-sm text-slate-300">
                    결석 학생이 없습니다
                  </td>
                </tr>
              ) : absentRows.map(row => (
                <tr
                  key={`absent-${row.classId}-${row.date}`}
                  className={`hover:bg-slate-50 ${row.isCurrent ? 'bg-blue-50/50' : ''} ${row.date === todayStr ? 'bg-yellow-50/40' : ''}`}
                >
                  <td className="px-5 py-3 whitespace-nowrap align-top">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{formatDateKo(row.date)}</span>
                      {row.date === todayStr && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">오늘</span>
                      )}
                    </div>
                  </td>
                  {isAllTab && (
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium">{row.className}</span>
                    </td>
                  )}
                  <td className="px-4 py-3 align-top">
                    <NameTags names={row.absentNames} color="orange" limit={3} />
                  </td>
                  <td className="px-4 py-3 text-sm align-top">
                    {row.vocabRange
                      ? <span className="text-slate-700">{row.vocabRange}</span>
                      : <span className="text-slate-300 text-xs">미입력</span>}
                  </td>
                  <td className="px-4 py-3 text-sm align-top">
                    {row.dailyRange
                      ? <span className="text-slate-700">{row.dailyRange}</span>
                      : <span className="text-slate-300 text-xs">미입력</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function WeeklyRetestCell({
  isClassDay,
  vocabNames,
  dailyNames,
}: {
  isClassDay: boolean
  vocabNames: string[]
  dailyNames: string[]
}) {
  if (!isClassDay) {
    return (
      <div className="min-h-24 rounded-lg border border-dashed border-slate-100 bg-slate-50/50 px-2 py-3 text-center text-xs text-slate-300">
        수업 없음
      </div>
    )
  }

  const hasRetests = vocabNames.length > 0 || dailyNames.length > 0

  return (
    <div className={`min-h-24 rounded-lg border px-2.5 py-2.5 ${hasRetests ? 'border-rose-100 bg-rose-50/30' : 'border-emerald-100 bg-emerald-50/30'}`}>
      <div className="space-y-2">
        <RetestLine label="단어" names={vocabNames} color="purple" />
        <RetestLine label="Daily" names={dailyNames} color="blue" />
      </div>
    </div>
  )
}

function RetestLine({
  label,
  names,
  color,
}: {
  label: string
  names: string[]
  color: 'purple' | 'blue'
}) {
  const dotStyles = {
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
  }
  const tagStyles = {
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[color]}`} />
          {label}
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${names.length > 0 ? tagStyles[color] : 'bg-slate-100 text-slate-400'}`}>
          {names.length}
        </span>
      </div>
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {names.map(name => (
            <span key={name} className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tagStyles[color]}`}>
              {name}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-emerald-600">미통과 없음</div>
      )}
    </div>
  )
}

function WeeklyHomeworkCell({
  isClassDay,
  items,
  description,
  notGoodNames,
  missingNames,
}: {
  isClassDay: boolean
  items: HomeworkItem[]
  description: string
  notGoodNames: string[]
  missingNames: string[]
}) {
  if (!isClassDay) {
    return (
      <div className="min-h-28 rounded-lg border border-dashed border-slate-100 bg-slate-50/50 px-2 py-3 text-center text-xs text-slate-300">
        수업 없음
      </div>
    )
  }

  const hasHomework = items.length > 0 || description.trim() !== ''
  const hasIssues = notGoodNames.length > 0 || missingNames.length > 0
  const visibleItems = items.slice(0, 2)

  return (
    <div className={`min-h-28 rounded-lg border px-2.5 py-2.5 ${hasIssues ? 'border-orange-100 bg-orange-50/30' : 'border-emerald-100 bg-emerald-50/30'}`}>
      <div className="mb-2 border-b border-white/70 pb-2">
        {items.length > 0 ? (
          <ul className="space-y-0.5">
            {visibleItems.map(item => (
              <li key={item.id} className={`truncate text-[11px] ${item.done ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                {item.done ? '완료' : '숙제'} · {item.text}
              </li>
            ))}
            {items.length > visibleItems.length && (
              <li className="text-[11px] text-slate-400">+{items.length - visibleItems.length}개 더 있음</li>
            )}
          </ul>
        ) : description ? (
          <div className="truncate text-[11px] text-slate-600">{description}</div>
        ) : (
          <div className="text-[11px] text-slate-300">숙제 미입력</div>
        )}
      </div>
      {hasHomework ? (
        <div className="space-y-2">
          <HomeworkStatusLine label="미흡" names={notGoodNames} color="orange" />
          <HomeworkStatusLine label="미제출" names={missingNames} color="red" />
        </div>
      ) : (
        <div className="text-[11px] text-slate-300">확인 대상 없음</div>
      )}
    </div>
  )
}

function HomeworkStatusLine({
  label,
  names,
  color,
}: {
  label: string
  names: string[]
  color: 'orange' | 'red'
}) {
  const dotStyles = {
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  }
  const tagStyles = {
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[color]}`} />
          {label}
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${names.length > 0 ? tagStyles[color] : 'bg-slate-100 text-slate-400'}`}>
          {names.length}
        </span>
      </div>
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {names.map(name => (
            <span key={name} className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tagStyles[color]}`}>
              {name}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-emerald-600">없음</div>
      )}
    </div>
  )
}

function NameTags({ names, color, limit }: { names: string[]; color: 'purple' | 'blue' | 'red' | 'orange'; limit?: number }) {
  const [expanded, setExpanded] = useState(false)
  const styles = {
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-700',
  }
  if (names.length === 0) return <span className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle size={13} /> 없음</span>
  const collapsed = !expanded && limit !== undefined && names.length > limit
  const visible = collapsed ? names.slice(0, limit) : names
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((name, i) => (
        <span key={i} className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${styles[color]}`}>{name}</span>
      ))}
      {collapsed && (
        <button onClick={() => setExpanded(true)} className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1 transition-colors">
          <ChevronDown size={12} />+{names.length - limit!}명 더보기
        </button>
      )}
      {expanded && limit !== undefined && names.length > limit && (
        <button onClick={() => setExpanded(false)} className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1 transition-colors">
          <ChevronUp size={12} />접기
        </button>
      )}
    </div>
  )
}
