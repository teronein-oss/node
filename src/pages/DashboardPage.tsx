import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle, ChevronUp, ChevronLeft, ChevronRight, Calendar, Megaphone, Users, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { Class, HomeworkItem, ScheduleEvent } from '../types'
import { getWeekStart, formatDateKo, fmtDate, getClassDate, getClassDaysLabel } from '../utils/helpers'
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

type DateValue = string | number | Date | { seconds?: number; _seconds?: number; toDate?: () => Date } | undefined | null

function toDateKey(date: DateValue): string | undefined {
  if (!date) return undefined
  if (date instanceof Date) return fmtDate(date)
  if (typeof date === 'number') return fmtDate(new Date(date))
  if (typeof date === 'object') {
    if (typeof date.toDate === 'function') return fmtDate(date.toDate())
    const seconds = date.seconds ?? date._seconds
    if (typeof seconds === 'number') return fmtDate(new Date(seconds * 1000))
  }
  const raw = String(date).trim()
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const ko = raw.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (ko) return `${ko[1]}-${ko[2].padStart(2, '0')}-${ko[3].padStart(2, '0')}`
  return undefined
}

function inRange(date: DateValue, start: string, end: string) {
  const day = toDateKey(date)
  if (!day) return false
  return day >= start && day <= end
}

function getWithdrawnDate(student: { active: boolean; withdrawnAt?: DateValue }, fallbackDate: string) {
  if (student.active) return undefined
  return toDateKey(student.withdrawnAt) ?? fallbackDate
}

function DashboardModal({
  title,
  count,
  onClose,
  children,
}: {
  title: string
  count?: number
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          {count !== undefined && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{count}</span>
          )}
          <button type="button" onClick={onClose} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
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

  const renderEvent = (e: ScheduleEvent) => {
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
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center gap-2 bg-amber-50/60 px-5 py-3 text-left hover:bg-amber-50 transition-colors"
      >
        <Icon size={15} className={iconColor} />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${todayCount > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
          오늘 {todayCount}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          전체 {activeEvents.length}
        </span>
        {isOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
      </button>
      {isOpen && (
        <ul className="max-h-72 divide-y divide-slate-50 overflow-y-auto">
          {activeEvents.length === 0
            ? <li className="px-5 py-10 text-xs text-slate-400 text-center">진행 중인 업무가 없습니다</li>
            : activeEvents.map(renderEvent)}
        </ul>
      )}
    </div>
  )
}

function ScheduleListPanel({
  events,
  todayStr,
}: {
  events: ScheduleEvent[]
  todayStr: string
}) {
  const activeEvents = useMemo(
    () => events
      .filter(e => e.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'ko')),
    [events, todayStr]
  )
  const previewEvents = activeEvents.slice(0, 3)
  const [isOpen, setIsOpen] = useState(false)

  const renderEvent = (event: ScheduleEvent) => {
    const isToday = event.startDate <= todayStr && event.endDate >= todayStr
    return (
      <div key={event.id} className="flex items-center gap-3 px-4 py-3">
        <span className={`h-2.5 w-2.5 rounded-full ${event.type === 'all' ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <span className={`text-xs font-semibold ${event.type === 'all' ? 'text-red-500' : 'text-emerald-600'}`}>
          {event.type === 'all' ? '전체' : '개인'}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${isToday ? 'text-slate-900' : 'text-slate-700'}`}>{event.title}</span>
        <span className="shrink-0 text-xs text-slate-400">
          {event.time ? event.time : event.startDate}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="divide-y divide-slate-50">
        {previewEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">예정된 일정이 없습니다</div>
        ) : (
          previewEvents.map(renderEvent)
        )}
      </div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        전체 일정표 보기 <ChevronRight size={13} />
      </button>
      {isOpen && (
        <DashboardModal title="전체 일정표" count={activeEvents.length} onClose={() => setIsOpen(false)}>
          <div className="divide-y divide-slate-50">
            {activeEvents.length === 0
              ? <div className="px-5 py-10 text-center text-xs text-slate-400">예정된 일정이 없습니다</div>
              : activeEvents.map(renderEvent)}
          </div>
        </DashboardModal>
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
  studentId: string
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

interface TodayStudentTask {
  key: string
  name: string
  className: string
  vocab?: TodayRetestItem
  daily?: TodayRetestItem
  homework?: TodayHomeworkItem
}

interface ManagementStudent {
  studentId: string
  name: string
  className: string
  retestCount: number
  homeworkMissingCount: number
  homeworkBadCount: number
  total: number
  reasons: string[]
}

function TodayFocusPanel({
  rows,
  onCompleteRetest,
  onCompleteHomework,
}: {
  rows: TodayTaskRow[]
  onCompleteRetest: (item: TodayRetestItem, label?: string) => void
  onCompleteHomework: (item: TodayHomeworkItem) => void
}) {
  const vocabTotal = rows.reduce((sum, row) => sum + row.vocabRetests.length, 0)
  const dailyTotal = rows.reduce((sum, row) => sum + row.dailyRetests.length, 0)
  const homeworkTotal = rows.reduce((sum, row) => sum + row.homeworkTargets.length, 0)
  const total = vocabTotal + dailyTotal + homeworkTotal
  const [isOpen, setIsOpen] = useState(false)
  const studentTasks = rows.flatMap(row => {
    const taskMap = new Map<string, TodayStudentTask>()
    const getTask = (studentId: string, name: string) => {
      const key = `${row.classId}-${studentId}`
      const prev = taskMap.get(key)
      if (prev) return prev
      const next: TodayStudentTask = { key, name, className: row.className }
      taskMap.set(key, next)
      return next
    }
    for (const item of row.vocabRetests) getTask(item.studentId, item.name).vocab = item
    for (const item of row.dailyRetests) getTask(item.studentId, item.name).daily = item
    for (const item of row.homeworkTargets) getTask(item.studentId, item.name).homework = item
    return [...taskMap.values()]
  })
  const taskButtonClass = "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors"
  const renderTaskButton = (
    label: string,
    item: TodayRetestItem | TodayHomeworkItem | undefined,
    color: 'purple' | 'blue' | 'orange',
    onClick: () => void
  ) => {
    if (!item) return null
    const styles = {
      purple: 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100',
      blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
      orange: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
    }[color]
    return (
      <button type="button" onClick={onClick} className={`${taskButtonClass} ${styles}`}>
        {label}
      </button>
    )
  }

  const renderTask = (task: TodayStudentTask) => (
    <div key={task.key} className="grid grid-cols-[72px_90px_max-content] items-center justify-start gap-3 border-b border-slate-50 px-5 py-2.5 last:border-b-0">
      <span className="truncate text-sm font-semibold text-slate-800">{task.name}</span>
      <span className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-center text-[11px] font-semibold text-slate-500">
        {task.className}
      </span>
      <div className="flex gap-1.5">
        {renderTaskButton('단어', task.vocab, 'purple', () => task.vocab && onCompleteRetest(task.vocab, '단어 재시험'))}
        {renderTaskButton('Daily', task.daily, 'blue', () => task.daily && onCompleteRetest(task.daily, 'Daily 재시험'))}
        {renderTaskButton('숙제', task.homework, 'orange', () => task.homework && onCompleteHomework(task.homework))}
      </div>
    </div>
  )

  return (
    <div className="flex h-[390px] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex shrink-0 items-center gap-2 px-5 py-4 border-b border-slate-100">
        <CheckCircle size={15} className="text-blue-500" />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">오늘 확인</h2>
        <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">항목을 누르면 완료됩니다</span>
        <button type="button" onClick={() => setIsOpen(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          전체 보기
        </button>
      </div>
      {studentTasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-slate-400">오늘 확인할 대상이 없습니다</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[72px_90px_max-content] justify-start gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2 text-[11px] font-semibold text-slate-400">
            <span>학생</span>
            <span className="text-center">반</span>
            <span>처리 항목</span>
          </div>
          {studentTasks.map(renderTask)}
        </div>
      )}
      {isOpen && (
        <DashboardModal title="오늘 확인 전체" count={total} onClose={() => setIsOpen(false)}>
          {studentTasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-slate-400">오늘 확인할 대상이 없습니다</div>
          ) : (
            <div>
              <div className="grid grid-cols-[72px_90px_max-content] justify-start gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2 text-[11px] font-semibold text-slate-400">
                <span>학생</span>
                <span className="text-center">반</span>
                <span>처리 항목</span>
              </div>
              {studentTasks.map(renderTask)}
            </div>
          )}
        </DashboardModal>
      )}
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
  const [weeklyTab, setWeeklyTab] = useState<WeeklyTab>('retest')

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
        const activeStudents = state.students
          .filter(s => s.active && s.classId === cls.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        const studentIds = new Set(activeStudents.map(s => s.id))
        const retests = state.retests.filter(
          r => r.retestDate === todayStr && r.passed === null && studentIds.has(r.studentId)
        )
        const vocabRetests = retests
          .filter(r => r.type === 'vocab')
          .map(r => ({ id: r.id, studentId: r.studentId, name: getStudentName(r.studentId), passed: r.passed }))
        const dailyRetests = retests
          .filter(r => r.type === 'daily')
          .map(r => ({ id: r.id, studentId: r.studentId, name: getStudentName(r.studentId), passed: r.passed }))
        const dueHomeworks = state.homeworks.filter(
          h => h.classId === cls.id || h.classId === ''
        )
        const homeworkTargets: TodayHomeworkItem[] = []
        const homeworkBadSet = new Set<string>()
        const homeworkMissingSet = new Set<string>()
        const homeworkDescriptionSet = new Set<string>()

        for (const hw of dueHomeworks) {
          const defaultRecheckDate = getClassDate(hw.sessionNum + 2, cls.days, cls.weekdays)
          const description = hw.description || (hw.items ?? []).map(item => item.text).join(', ')

          if (hw.items?.length) {
            const targetsByStudent = new Map<string, { itemIds: string[]; rank: number }>()
            for (const item of hw.items) {
              for (const ss of (item.studentStatuses ?? [])) {
                if (!studentIds.has(ss.studentId)) continue
                const rank = statusRank[ss.status] ?? 0
                if (rank < 2) continue
                const recheckDate = hw.recheckDates?.find(rd => rd.studentId === ss.studentId)?.date ?? defaultRecheckDate
                if (recheckDate !== todayStr) continue
                const target = targetsByStudent.get(ss.studentId) ?? { itemIds: [], rank: 0 }
                target.itemIds.push(item.id)
                target.rank = Math.max(target.rank, rank)
                targetsByStudent.set(ss.studentId, target)
              }
            }
            for (const [studentId, target] of targetsByStudent) {
              const student = activeStudents.find(s => s.id === studentId)
              if (!student) continue
              homeworkTargets.push({
                studentId,
                name: student.name,
                assignmentId: hw.id,
                itemIds: target.itemIds,
                sessionNum: hw.sessionNum + 1,
                completed: false,
              })
              if (description) homeworkDescriptionSet.add(description)
              const name = getStudentName(studentId)
              if (target.rank === 3) homeworkMissingSet.add(name)
              else if (target.rank === 2) homeworkBadSet.add(name)
            }
          } else {
            const checkSessionNum = hw.sessionNum + 1
            for (const g of state.grades.filter(g => g.sessionNum === checkSessionNum && studentIds.has(g.studentId))) {
              if (g.attendance === '결석') continue
              if (g.homeworkDone !== '미흡') continue
              const recheckDate = hw.recheckDates?.find(rd => rd.studentId === g.studentId)?.date ?? defaultRecheckDate
              if (recheckDate !== todayStr) continue
              homeworkTargets.push({
                studentId: g.studentId,
                name: getStudentName(g.studentId),
                assignmentId: hw.id,
                itemIds: [],
                sessionNum: checkSessionNum,
                completed: false,
              })
              if (description) homeworkDescriptionSet.add(description)
              homeworkBadSet.add(getStudentName(g.studentId))
            }
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
          homeworkDescription: [...homeworkDescriptionSet].join(' / '),
        }
        const hasTargets = row.vocabRetests.length > 0 || row.dailyRetests.length > 0 || row.homeworkTargets.length > 0
        return hasTargets ? row : null
      })
      .filter((row): row is TodayTaskRow => row !== null)
  }, [state.classes, state.students, state.retests, state.homeworks, state.grades, todayStr])

  const classPopulationRows = useMemo(() => {
    const monthStart = `${selectedYM}-01`
    const monthEnd = fmtDate(new Date(selectedYear, selectedMonth, 0))
    return state.classes
      .map(cls => {
        const activeCount = state.students.filter(s => s.active && s.classId === cls.id).length
        const withdrawnInMonth = state.students.filter(s => {
          const withdrawnAt = getWithdrawnDate(s, todayStr)
          return s.classId === cls.id && inRange(withdrawnAt, monthStart, monthEnd)
        }).length
        return {
          classId: cls.id,
          className: cls.name,
          classDays: cls.days,
          activeCount,
          withdrawnInMonth,
        }
      })
      .sort((a, b) => b.activeCount - a.activeCount || a.className.localeCompare(b.className, 'ko'))
  }, [selectedMonth, selectedYM, selectedYear, state.classes, state.students, todayStr])

  const monthlyFlow = useMemo(() => {
    const monthStart = `${selectedYM}-01`
    const monthEnd = fmtDate(new Date(selectedYear, selectedMonth, 0))
    return {
      registered: state.students.filter(s => inRange(s.registeredAt, monthStart, monthEnd)).length,
      withdrawn: state.students.filter(s => {
        const withdrawnAt = getWithdrawnDate(s, todayStr)
        return inRange(withdrawnAt, monthStart, monthEnd)
      }).length,
    }
  }, [selectedMonth, selectedYM, selectedYear, state.students, todayStr])

  const managementStudents = useMemo<ManagementStudent[]>(() => {
    const activeStudents = state.students.filter(s => s.active)
    const map = new Map<string, ManagementStudent>()
    const monthStart = `${selectedYM}-01`
    const monthEnd = fmtDate(new Date(selectedYear, selectedMonth, 0))
    const classById = new Map(state.classes.map(cls => [cls.id, cls]))
    const studentById = new Map(state.students.map(student => [student.id, student]))

    for (const student of activeStudents) {
      const cls = state.classes.find(c => c.id === student.classId)
      map.set(student.id, {
        studentId: student.id,
        name: student.name,
        className: cls?.name ?? '',
        retestCount: 0,
        homeworkMissingCount: 0,
        homeworkBadCount: 0,
        total: 0,
        reasons: [],
      })
    }

    for (const retest of state.retests) {
      if (retest.passed !== null) continue
      const student = studentById.get(retest.studentId)
      const cls = student ? classById.get(student.classId) : undefined
      const basisDate = retest.retestDate ?? (cls ? getClassDate(retest.sessionNum, cls.days, cls.weekdays) : '')
      if (basisDate < monthStart || basisDate > monthEnd) continue
      const target = map.get(retest.studentId)
      if (!target) continue
      target.retestCount += 1
    }

    const statusRank: Record<string, number> = { '미제출': 3, '미흡': 2, '재확인완료': 1, '제출': 0 }
    for (const hw of state.homeworks) {
      const cls = classById.get(hw.classId)
      const checkDate = cls ? getClassDate(hw.sessionNum + 1, cls.days, cls.weekdays) : hw.weekStart
      if (checkDate < monthStart || checkDate > monthEnd) continue
      const worstByStudent = new Map<string, number>()
      for (const item of hw.items ?? []) {
        for (const ss of item.studentStatuses ?? []) {
          if (!map.has(ss.studentId)) continue
          const rank = statusRank[ss.status] ?? 0
          if (rank > (worstByStudent.get(ss.studentId) ?? 0)) worstByStudent.set(ss.studentId, rank)
        }
      }
      for (const [studentId, rank] of worstByStudent) {
        const target = map.get(studentId)
        if (!target) continue
        if (rank === 3) target.homeworkMissingCount += 1
        if (rank === 2) target.homeworkBadCount += 1
      }
    }

    for (const grade of state.grades) {
      if (grade.homeworkDone !== '미흡') continue
      const student = studentById.get(grade.studentId)
      const cls = student ? classById.get(student.classId) : undefined
      const basisDate = cls ? getClassDate(grade.sessionNum, cls.days, cls.weekdays) : grade.weekStart
      if (basisDate < monthStart || basisDate > monthEnd) continue
      const target = map.get(grade.studentId)
      if (!target) continue
      target.homeworkBadCount += 1
    }

    return [...map.values()]
      .map(student => {
        const homeworkIssueCount = student.homeworkMissingCount + student.homeworkBadCount
        const reasons: string[] = []
        if (student.retestCount >= 3) reasons.push(`재시험 ${student.retestCount}회`)
        if (student.homeworkMissingCount >= 3) reasons.push(`숙제 미제출 ${student.homeworkMissingCount}회`)
        if (student.homeworkBadCount >= 3) reasons.push(`숙제 미흡 ${student.homeworkBadCount}회`)
        if (homeworkIssueCount >= 3 && student.homeworkMissingCount < 3 && student.homeworkBadCount < 3) reasons.push(`숙제 문제 ${homeworkIssueCount}회`)
        return {
          ...student,
          total: student.retestCount + homeworkIssueCount,
          reasons,
        }
      })
      .filter(student => student.reasons.length > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'))
  }, [state.classes, state.students, state.retests, state.homeworks, state.grades, selectedYM, selectedYear, selectedMonth])

  const completeTodayRetest = (item: TodayRetestItem, label = '재시험') => {
    if (!confirm(`${item.name} ${label}을 통과 처리하겠습니까?`)) return
    dispatch({ type: 'SAVE_RETEST', payload: { id: item.id, retestScore: null, passed: true } })
  }

  const completeTodayHomework = (item: TodayHomeworkItem) => {
    if (!confirm(`${item.name} 숙제검사를 완료 처리하겠습니까?`)) return
    if (item.assignmentId && item.itemIds.length > 0) {
      for (const itemId of item.itemIds) {
        dispatch({
          type: 'SET_ITEM_STUDENT_STATUS',
          payload: { assignmentId: item.assignmentId, itemId, studentId: item.studentId, status: '재확인완료' },
        })
      }
    } else {
      dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: item.studentId, sessionNum: item.sessionNum, status: '재확인완료' } })
    }
  }

  const goWeek = (offset: number) => {
    const nextWeekStart = addDays(selectedWeekStart, offset * 7)
    setSelectedWeekStart(nextWeekStart)
    setSelectedYM(getMonthKey(nextWeekStart))
  }

  // 날짜 기반 행 생성 (반 하나에 대해)
  const buildRows = useMemo(() => {
    return (classId: string) => {
      const cls = state.classes.find(c => c.id === classId)
      if (!cls) return []
      const studentIds = new Set(state.students.filter(s => s.active && s.classId === classId).map(s => s.id))

      const sessions = getClassDatesForMonth({
        classInfo: cls,
        year: selectedYear,
        month: selectedMonth,
        includeFuture: true,
        filterMWFToCalendarMonth: true,
      }).map(entry => entry.sessionNum)

      return sessions
        .map(sNum => {
          const date = getClassDate(sNum, cls.days, cls.weekdays)
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
            isCurrent: getWeekStart(new Date(date + 'T00:00:00')) === weekStart,
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
  }, [state, selectedYear, selectedMonth, weekStart])

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
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
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

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800">오늘 처리</h2>
        <div className="grid grid-cols-1 gap-4 items-start xl:grid-cols-[1fr_480px]">
          <TodayFocusPanel rows={todayTaskRows} onCompleteRetest={completeTodayRetest} onCompleteHomework={completeTodayHomework} />
          <div className="space-y-3">
            <MiniCalendar year={selectedYear} month={selectedMonth} scheduleEvents={scheduleEvents} />
            <ScheduleListPanel events={scheduleEvents} todayStr={todayStr} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800">운영 현황</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ClassPopulationPanel rows={classPopulationRows} />
          <ManagementNeededPanel students={managementStudents} />
          <MonthlyFlowPanel registered={monthlyFlow.registered} withdrawn={monthlyFlow.withdrawn} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">주간 현황</h2>
          <div className="flex items-center gap-2">
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
        <WeeklyOverviewPanel
          activeTab={weeklyTab}
          setActiveTab={setWeeklyTab}
          selectedWeekStart={selectedWeekStart}
          selectedWeekEnd={selectedWeekEnd}
          weekTotal={weekTotal}
          homeworkWeekTotal={homeworkWeekTotal}
          absentTotal={absentRows.length}
          weeklyRetestRows={weeklyRetestRows}
          weeklyHomeworkRows={weeklyHomeworkRows}
          absentRows={absentRows}
          weekDates={weekDates}
          todayStr={todayStr}
          isAllTab={isAllTab}
        />
      </section>
    </div>
  )
}

function ClassPopulationPanel({
  rows,
}: {
  rows: { classId: string; className: string; classDays: string; activeCount: number; withdrawnInMonth: number }[]
}) {
  const total = rows.reduce((sum, row) => sum + row.activeCount, 0)

  return (
    <section className="h-72 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <Users size={15} className="text-blue-500" />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">반별 인원 현황</h2>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">전체 {total}명</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-20 text-center text-xs text-slate-400">등록된 반이 없습니다</div>
      ) : (
        <div className="max-h-[216px] divide-y divide-slate-50 overflow-y-auto">
          {rows.map(row => (
            <div key={row.classId} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{row.className}</div>
                <div className="mt-0.5 text-xs text-slate-400">{getClassDaysLabel(row.classDays)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-800">{row.activeCount}명</div>
                <div className="text-[11px] text-slate-400">월 퇴원 {row.withdrawnInMonth}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MonthlyFlowPanel({
  registered,
  withdrawn,
}: {
  registered: number
  withdrawn: number
}) {
  const trend = [6, 9, 7, 11, 13, 10, 14].map((v, idx) => ({
    value: v,
    color: idx % 2 === 0 ? 'bg-emerald-500' : 'bg-orange-400',
  }))

  return (
    <section className="h-72 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 text-sm">이번 달 등록/퇴원 요약</h2>
      </div>
      <div className="px-5 py-5">
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <div>
            <div className="text-xs font-semibold text-slate-400">등록</div>
            <div className="mt-2 text-3xl font-bold text-emerald-600">{registered}<span className="ml-1 text-base">명</span></div>
          </div>
          <div className="pl-5">
            <div className="text-xs font-semibold text-slate-400">퇴원</div>
            <div className="mt-2 text-3xl font-bold text-orange-500">{withdrawn}<span className="ml-1 text-base">명</span></div>
          </div>
        </div>
        <div className="mt-7 flex h-20 items-end gap-2 border-b border-slate-100 pb-2">
          {trend.map((bar, idx) => (
            <div key={idx} className="flex flex-1 items-end">
              <div className={`w-full rounded-t ${bar.color}`} style={{ height: `${Math.max(12, bar.value * 4)}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />등록</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" />퇴원</span>
        </div>
      </div>
    </section>
  )
}

type WeeklyTab = 'retest' | 'homework' | 'absent'

function WeeklyOverviewPanel({
  activeTab,
  setActiveTab,
  selectedWeekStart,
  selectedWeekEnd,
  weekTotal,
  homeworkWeekTotal,
  absentTotal,
  weeklyRetestRows,
  weeklyHomeworkRows,
  absentRows,
  weekDates,
  todayStr,
  isAllTab,
}: {
  activeTab: WeeklyTab
  setActiveTab: (tab: WeeklyTab) => void
  selectedWeekStart: string
  selectedWeekEnd: string
  weekTotal: number
  homeworkWeekTotal: number
  absentTotal: number
  weeklyRetestRows: any[]
  weeklyHomeworkRows: any[]
  absentRows: any[]
  weekDates: { label: string; date: string; display: string }[]
  todayStr: string
  isAllTab: boolean
}) {
  const tabs = [
    { key: 'retest' as const, label: '재시험', count: weekTotal },
    { key: 'homework' as const, label: '숙제', count: homeworkWeekTotal },
    { key: 'absent' as const, label: '결석', count: absentTotal },
  ]
  const problemRetestRows = weeklyRetestRows.filter(row => row.total > 0)
  const problemHomeworkRows = weeklyHomeworkRows.filter(row => row.total > 0)

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-800">주간 현황</h2>
          <p className="text-xs text-slate-400 mt-1">
            {formatDateKo(selectedWeekStart)} ~ {formatDateKo(selectedWeekEnd)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'retest' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] table-fixed text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-4 py-3 w-32">반</th>
                {weekDates.map(day => (
                  <th key={day.date} className={`text-left px-3 py-3 ${day.date === todayStr ? 'bg-yellow-50 text-yellow-700' : ''}`}>
                    <div className="flex items-center gap-1.5"><span className="font-semibold">{day.label}</span><span>{day.date.slice(5).replace('-', '.')}</span></div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 w-20">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {problemRetestRows.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-300">이번 주 미통과 학생이 없습니다</td></tr>
              ) : problemRetestRows.map(row => (
                <tr key={row.classId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top"><div className="font-semibold text-slate-800">{row.className}</div><div className="text-xs text-slate-400 mt-1">{getClassDaysLabel(row.classDays)}</div></td>
                  {row.days.map((day: any) => (
                    <td key={`${row.classId}-${day.date}`} className={`px-3 py-3 align-top ${day.date === todayStr ? 'bg-yellow-50/40' : ''}`}>
                      <WeeklyRetestCell isClassDay={day.isClassDay} vocabNames={day.vocabNames} dailyNames={day.dailyNames} />
                    </td>
                  ))}
                  <td className="px-4 py-3 align-top text-right"><span className="inline-flex min-w-8 justify-center rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">{row.total}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'homework' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] table-fixed text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-4 py-3 w-32">반</th>
                {weekDates.map(day => (
                  <th key={`hw-head-${day.date}`} className={`text-left px-3 py-3 ${day.date === todayStr ? 'bg-yellow-50 text-yellow-700' : ''}`}>
                    <div className="flex items-center gap-1.5"><span className="font-semibold">{day.label}</span><span>{day.date.slice(5).replace('-', '.')}</span></div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 w-20">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {problemHomeworkRows.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-300">이번 주 미흡·미제출 학생이 없습니다</td></tr>
              ) : problemHomeworkRows.map(row => (
                <tr key={`weekly-hw-${row.classId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top"><div className="font-semibold text-slate-800">{row.className}</div><div className="text-xs text-slate-400 mt-1">{getClassDaysLabel(row.classDays)}</div></td>
                  {row.days.map((day: any) => (
                    <td key={`${row.classId}-${day.date}-homework`} className={`px-3 py-3 align-top ${day.date === todayStr ? 'bg-yellow-50/40' : ''}`}>
                      <WeeklyHomeworkCell isClassDay={day.isClassDay} items={day.items} description={day.description} notGoodNames={day.notGoodNames} missingNames={day.missingNames} />
                    </td>
                  ))}
                  <td className="px-4 py-3 align-top text-right"><span className="inline-flex min-w-8 justify-center rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">{row.total}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'absent' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-5 py-3 w-36">날짜</th>
                {isAllTab && <th className="text-left px-4 py-3 w-28">반</th>}
                <th className="text-left px-4 py-3 w-44">결석 학생</th>
                <th className="text-left px-4 py-3">범위</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {absentRows.length === 0 ? (
                <tr><td colSpan={isAllTab ? 4 : 3} className="px-5 py-10 text-center text-sm text-slate-300">결석 학생이 없습니다</td></tr>
              ) : absentRows.map(row => (
                <tr key={`absent-tab-${row.classId}-${row.date}`} className="hover:bg-slate-50">
                  <td className="px-5 py-3 whitespace-nowrap align-top"><span className="font-medium text-slate-700">{formatDateKo(row.date)}</span></td>
                  {isAllTab && <td className="px-4 py-3 whitespace-nowrap align-top text-slate-600">{row.className}</td>}
                  <td className="px-4 py-3 align-top"><div className="flex flex-wrap gap-1">{row.absentNames.map((name: string) => <span key={name} className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">{name}</span>)}</div></td>
                  <td className="px-4 py-3 align-top text-xs text-slate-400">{row.vocabRange || row.dailyRange || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ManagementNeededPanel({ students }: { students: ManagementStudent[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const renderStudent = (student: ManagementStudent) => (
    <div key={student.studentId} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
      <span className={`h-2.5 w-2.5 rounded-full ${student.total >= 5 ? 'bg-red-500' : 'bg-orange-400'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{student.name}</span>
          <span className="text-xs text-slate-400">{student.className}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {student.reasons.map(reason => (
            <span key={reason} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">{reason}</span>
          ))}
        </div>
      </div>
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">{student.total}회</span>
    </div>
  )

  return (
    <section className="h-72 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <AlertTriangle size={15} className="text-orange-500" />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">관리 필요 학생</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${students.length > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {students.length}명
        </span>
        <button type="button" onClick={() => setIsOpen(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          전체 보기
        </button>
      </div>
      {students.length === 0 ? (
        <div className="px-5 py-20 text-center text-xs text-slate-400">관리 기준에 해당하는 학생이 없습니다</div>
      ) : (
        <div className="max-h-[216px] divide-y divide-slate-50 overflow-y-auto">
          {students.map(renderStudent)}
        </div>
      )}
      {isOpen && (
        <DashboardModal title="관리 필요 학생 전체" count={students.length} onClose={() => setIsOpen(false)}>
          {students.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-slate-400">관리 기준에 해당하는 학생이 없습니다</div>
          ) : (
            <div className="divide-y divide-slate-50">{students.map(renderStudent)}</div>
          )}
        </DashboardModal>
      )}
    </section>
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
