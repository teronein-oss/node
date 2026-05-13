import { useState, useMemo } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar, Megaphone, X, ListTodo } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { ScheduleEvent } from '../types'
import { getMonthSessions, getWeekStartForSession, formatDateKo, fmtDate, getClassDate } from '../utils/helpers'

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

// ─── 일정 패널 ────────────────────────────────────────────────────────────────
function SchedulePanel({
  title, icon: Icon, iconColor, events, onToggle, onRemove,
}: {
  title: string
  icon: React.ElementType
  iconColor: string
  events: ScheduleEvent[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
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
              <button
                onClick={() => onRemove(e.id)}
                className="text-slate-300 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100 pt-0.5"
              >
                <X size={13} />
              </button>
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
  const { state, dispatch, getCurrentSession, selectedYM, setSelectedYM } = useApp()
  const { weekStart } = getCurrentSession()
  const [activeTab, setActiveTab] = useState<string>(() => state.classes[0]?.id ?? 'all')

  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDate = today.getDate()
  const todayStr = fmtDate(today)

  const [selectedYear, selectedMonth] = selectedYM.split('-').map(Number)
  const currentYM = `${todayYear}-${todayMonth}`

  const scheduleEvents = state.scheduleEvents ?? []
  const personalEvents = useMemo(
    () => scheduleEvents.filter(e => e.type === 'personal').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [scheduleEvents]
  )
  const allEvents = useMemo(
    () => scheduleEvents.filter(e => e.type === 'all').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [scheduleEvents]
  )

  // 월 목록
  const availableMonths = useMemo(() => {
    const ymSet = new Set<string>([currentYM])
    for (let i = 1; i <= 3; i++) {
      const d = new Date(todayYear, todayMonth - 1 - i, 1)
      ymSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
    for (const g of state.grades) {
      const ws = getWeekStartForSession(g.sessionNum)
      const d = new Date(ws + 'T00:00:00')
      const thu = new Date(d); thu.setDate(d.getDate() + 3)
      ymSet.add(`${thu.getFullYear()}-${thu.getMonth() + 1}`)
    }
    for (const h of state.homeworks) {
      const ws = getWeekStartForSession(h.sessionNum)
      const d = new Date(ws + 'T00:00:00')
      const thu = new Date(d); thu.setDate(d.getDate() + 3)
      ymSet.add(`${thu.getFullYear()}-${thu.getMonth() + 1}`)
    }
    return [...ymSet].sort().map(ym => {
      const [y, m] = ym.split('-').map(Number)
      return { ym, year: y, month: m }
    })
  }, [state.grades, state.homeworks, currentYM])

  const currentIdx = availableMonths.findIndex(m => m.ym === selectedYM)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < availableMonths.length - 1

  // 학생 이름 조회
  const getStudentName = (id: string) => state.students.find(s => s.id === id)?.name ?? '?'

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

      return monthSessions
        .map(sNum => {
          const date = getClassDate(sNum, cls.days)
          const [y, m] = date.split('-').map(Number)
          if (y !== selectedYear || m !== selectedMonth) return null

          const retests = state.retests.filter(
            r => r.sessionNum === sNum && r.passed === null && studentIds.has(r.studentId)
          )
          const scope = state.scopes.find(s => s.sessionNum === sNum)
          const hw = state.homeworks.find(
            h => h.sessionNum === sNum && (h.classId === classId || h.classId === '')
          )
          const noHw = state.grades.filter(
            g => g.sessionNum === sNum + 1 &&
              g.homeworkDone === '미제출' &&
              studentIds.has(g.studentId)
          )

          return {
            date,
            sessionNum: sNum,
            classId: cls.id,
            className: cls.name,
            isCurrent: getWeekStartForSession(sNum) === weekStart,
            vocabRange: scope?.vocabRange ?? '',
            dailyRange: scope?.dailyRange ?? '',
            vocabNames: retests.filter(r => r.type === 'vocab').map(r => getStudentName(r.studentId)),
            dailyNames: retests.filter(r => r.type === 'daily').map(r => getStudentName(r.studentId)),
            hwDescription: hw?.description ?? '',
            hwNoSubmitNames: noHw.map(g => getStudentName(g.studentId)),
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    }
  }, [state, monthSessions, selectedYear, selectedMonth, weekStart])

  // 현재 탭에 따라 표시할 행들 (오늘 이후 날짜 제외)
  const displayRows = useMemo(() => {
    const rows = activeTab === 'all'
      ? state.classes
          .flatMap(cls => buildRows(cls.id))
          .sort((a, b) => a.date.localeCompare(b.date) || a.classId.localeCompare(b.classId))
      : buildRows(activeTab)
    return rows.filter(r => r.date <= todayStr)
  }, [activeTab, buildRows, state.classes, todayStr])

  const isAllTab = activeTab === 'all'

  return (
    <div className="max-w-5xl mx-auto space-y-6">

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
          />
          <SchedulePanel
            title="To Do List"
            icon={ListTodo}
            iconColor="text-blue-500"
            events={personalEvents}
            onToggle={id => dispatch({ type: 'TOGGLE_SCHEDULE_EVENT', payload: id })}
            onRemove={id => dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: id })}
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

      {/* 반별 탭 */}
      <div className="flex gap-2 flex-wrap">
        {[...state.classes, { id: 'all', name: '전체' }].map(cls => (
          <button
            key={cls.id}
            onClick={() => setActiveTab(cls.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${activeTab === cls.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
              }`}
          >
            {cls.name}
          </button>
        ))}
      </div>

      {/* 월별 현황 테이블 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{selectedYear}년 {selectedMonth}월 현황</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-5 py-3 w-36">날짜</th>
                {isAllTab && <th className="text-left px-4 py-3 w-28">반</th>}
                <th className="text-left px-4 py-3 w-32">단어</th>
                <th className="text-left px-4 py-3 w-32">Daily</th>
                <th className="text-left px-4 py-3 w-40">단어 재시험</th>
                <th className="text-left px-4 py-3 w-40">Daily 재시험</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={isAllTab ? 6 : 5} className="px-5 py-8 text-center text-sm text-slate-300">
                    해당 월 수업 일정이 없습니다
                  </td>
                </tr>
              ) : displayRows.map(row => (
                <tr
                  key={`${row.classId}-${row.date}`}
                  className={`hover:bg-slate-50 ${row.isCurrent ? 'bg-blue-50/50' : ''} ${row.date === todayStr ? 'bg-yellow-50/40' : ''}`}
                >
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{formatDateKo(row.date)}</span>
                      {row.date === todayStr && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">오늘</span>
                      )}
                    </div>
                  </td>
                  {isAllTab && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium">{row.className}</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm align-top">
                    {row.vocabRange
                      ? <span className="text-slate-700 break-words">{row.vocabRange}</span>
                      : <span className="text-slate-300 text-xs">미입력</span>}
                  </td>
                  <td className="px-4 py-3 text-sm align-top">
                    {row.dailyRange
                      ? <span className="text-slate-700 break-words">{row.dailyRange}</span>
                      : <span className="text-slate-300 text-xs">미입력</span>}
                  </td>
                  <td className="px-4 py-3 align-top"><NameTags names={row.vocabNames} color="purple" limit={3} /></td>
                  <td className="px-4 py-3 align-top"><NameTags names={row.dailyNames} color="blue" limit={3} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 숙제 현황 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{selectedYear}년 {selectedMonth}월 숙제 현황</h2>
          <a href="/homework" className="text-xs text-blue-600 hover:underline">숙제관리 →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-5 py-3 w-36">날짜</th>
                {isAllTab && <th className="text-left px-4 py-3 w-28">반</th>}
                <th className="text-left px-4 py-3">숙제 내용</th>
                <th className="text-left px-4 py-3 w-40">미제출</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={isAllTab ? 4 : 3} className="px-5 py-8 text-center text-sm text-slate-300">
                    해당 월 수업 일정이 없습니다
                  </td>
                </tr>
              ) : displayRows.map(row => (
                <tr
                  key={`hw-${row.classId}-${row.date}`}
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
                    {row.hwDescription
                      ? <span className="text-slate-700">{row.hwDescription}</span>
                      : <span className="text-slate-300 text-xs">미입력</span>}
                  </td>
                  <td className="px-4 py-3 align-top"><NameTags names={row.hwNoSubmitNames} color="red" limit={3} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
