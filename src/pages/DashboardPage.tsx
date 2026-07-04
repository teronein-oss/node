import { useState, useMemo } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar, Megaphone, X, Trash2, UserX } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { Class, ScheduleEvent } from '../types'
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
  title, icon: Icon, iconColor, events, onToggle, onRemove, readOnly,
}: {
  title: string
  icon: React.ElementType
  iconColor: string
  events: ScheduleEvent[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  readOnly?: boolean
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
        <Icon size={15} className={iconColor} />
        <h2 className="font-semibold text-slate-800 text-sm flex-1">{title}</h2>
      </div>
      <ul className="divide-y divide-slate-50">
        {events.length === 0 && (
          <li className="px-5 py-3 text-xs text-slate-400 text-center">등록된 항목이 없습니다</li>
        )}
        {events.map(e => {
          const span = diffDays(e.startDate, e.endDate)
          return (
            <li key={e.id} className="flex items-start gap-2 px-5 py-2.5 hover:bg-slate-50 group">
              <div className="flex-1 min-w-0 pt-0.5">
                <p className={`text-sm break-words ${e.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {e.title}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
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

  const weekTotal = weeklyRetestRows.reduce((sum, row) => sum + row.total, 0)
  const selectedWeekEnd = weekDates[weekDates.length - 1]?.date ?? selectedWeekStart
  const isCurrentWeek = selectedWeekStart === getWeekStart()

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

  // 숙제현황 테이블: 오늘 이전은 데이터 있는 행만
  const hwRows = useMemo(
    () => displayRows.filter(r => r.date >= todayStr || r.hasHwData),
    [displayRows, todayStr]
  )

  // 결석생 현황: 결석 데이터 있는 행만
  const absentRows = useMemo(
    () => displayRows.filter(r => r.hasAbsentData),
    [displayRows]
  )

  const isAllTab = true

  const handleDeleteHw = (row: ReturnType<typeof buildRows>[number]) => {
    const hw = state.homeworks.find(h => h.sessionNum === row.sessionNum - 1 && (h.classId === row.classId || h.classId === ''))
    if (!hw) return
    if (!confirm(`${formatDateKo(row.date)} ${row.className} 숙제를 삭제하시겠습니까?`)) return
    dispatch({ type: 'DELETE_HOMEWORK', payload: hw.id })
  }

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
            onToggle={id => dispatch({ type: 'TOGGLE_SCHEDULE_EVENT', payload: id })}
            onRemove={id => dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: id })}
            readOnly={isJogyo}
          />
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

      {/* 숙제 제출현황 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{selectedYear}년 {selectedMonth}월 숙제 제출현황</h2>
          <a href="/homework" className="text-xs text-blue-600 hover:underline">숙제관리 →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-5 py-3 w-36">날짜</th>
                {isAllTab && <th className="text-left px-4 py-3 w-28">반</th>}
                <th className="text-left px-4 py-3">숙제 내용</th>
                <th className="text-left px-4 py-3 w-36">미흡</th>
                <th className="text-left px-4 py-3 w-36">미제출</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hwRows.length === 0 ? (
                <tr>
                  <td colSpan={isAllTab ? 5 : 4} className="px-5 py-8 text-center text-sm text-slate-300">
                    해당 월 수업 일정이 없습니다
                  </td>
                </tr>
              ) : hwRows.map(row => (
                <tr
                  key={`hw-${row.classId}-${row.date}`}
                  className={`group hover:bg-slate-50 ${row.isCurrent ? 'bg-blue-50/50' : ''} ${row.date === todayStr ? 'bg-yellow-50/40' : ''}`}
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
                    {row.hwItems.length > 0 ? (
                      <ul className="space-y-0.5">
                        {row.hwItems.map((item, i) => (
                          <li key={i} className={`text-sm flex items-center gap-1 ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                            <span className="shrink-0">{item.done ? '✓' : '·'}</span>{item.text}
                          </li>
                        ))}
                      </ul>
                    ) : row.hwDescription ? (
                      <span className="text-slate-700">{row.hwDescription}</span>
                    ) : (
                      <span className="text-slate-300 text-xs">미입력</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top"><NameTags names={row.hwNotGoodNames} color="orange" limit={3} /></td>
                  <td className="px-4 py-3 align-top"><NameTags names={row.hwMissNames} color="red" limit={3} /></td>
                  <td className="px-2 py-3 align-top">
                    {!isJogyo && (row.hwDescription || row.hwItems.length > 0) && (
                      <button
                        onClick={() => handleDeleteHw(row)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
