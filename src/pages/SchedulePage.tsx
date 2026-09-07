import { useState, useMemo, useRef, useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, X, Clock, Pencil } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../utils/helpers'
import type { ScheduleEvent, ScheduleEventColor } from '../types'

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const ACADEMY_HOLIDAYS: Record<string, string> = {
  '2025-05-05': '어린이날',
  '2026-05-05': '어린이날',
}

function buildCalDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const startPad = first.getDay()
  const days: (Date | null)[] = Array(startPad).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month - 1, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function diffDays(start: string, end: string): number {
  return Math.round(
    (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000
  )
}

function fmtTime(time?: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h < 12 ? '오전' : '오후'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${period} ${hour}시` : `${period} ${hour}:${String(m).padStart(2, '0')}`
}

function parseScheduleDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime()) || fmtDate(date) !== value) return null
  return { date: value, year: date.getFullYear(), month: date.getMonth() + 1 }
}

function weekColDate(week: (Date | null)[], col: number): string {
  const idx = week.findIndex(d => d !== null)
  if (idx === -1) return ''
  const ref = new Date(week[idx]!)
  ref.setDate(ref.getDate() + (col - idx))
  return fmtDate(ref)
}

interface EventPlacement {
  event: ScheduleEvent
  startCol: number
  endCol: number
  lane: number
  continuesLeft: boolean
  continuesRight: boolean
}

function computePlacements(week: (Date | null)[], events: ScheduleEvent[]): EventPlacement[] {
  const weekDates = Array.from({ length: 7 }, (_, i) => weekColDate(week, i))
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const relevant = (events ?? []).filter(e => e.endDate >= weekStart && e.startDate <= weekEnd)

  relevant.sort((a, b) => {
    const aSpan = diffDays(a.startDate, a.endDate)
    const bSpan = diffDays(b.startDate, b.endDate)
    if (bSpan !== aSpan) return bSpan - aSpan
    return a.startDate.localeCompare(b.startDate)
  })

  const placements: EventPlacement[] = []
  const laneOccupancy: Array<Array<[number, number]>> = []

  for (const event of relevant) {
    let startCol = 0
    for (let i = 0; i < 7; i++) {
      if (weekDates[i] >= event.startDate) { startCol = i; break }
    }
    let endCol = 6
    for (let i = 6; i >= 0; i--) {
      if (weekDates[i] <= event.endDate) { endCol = i; break }
    }

    const continuesLeft = event.startDate < weekStart
    const continuesRight = event.endDate > weekEnd

    let lane = 0
    while (true) {
      if (!laneOccupancy[lane]) laneOccupancy[lane] = []
      const hasConflict = laneOccupancy[lane].some(([s, e]) => !(endCol < s || startCol > e))
      if (!hasConflict) break
      lane++
    }
    laneOccupancy[lane].push([startCol, endCol])
    placements.push({ event, startCol, endCol, lane, continuesLeft, continuesRight })
  }

  return placements
}

const MAX_LANES = 3

const SCHEDULE_COLORS: Array<{
  value: ScheduleEventColor
  label: string
  tabClass: string
  swatchClass: string
}> = [
  { value: 'green', label: '초록', tabClass: 'bg-green-500 hover:bg-green-600', swatchClass: 'bg-green-500' },
  { value: 'blue', label: '파랑', tabClass: 'bg-blue-500 hover:bg-blue-600', swatchClass: 'bg-blue-500' },
  { value: 'indigo', label: '남색', tabClass: 'bg-indigo-500 hover:bg-indigo-600', swatchClass: 'bg-indigo-500' },
  { value: 'purple', label: '보라', tabClass: 'bg-purple-500 hover:bg-purple-600', swatchClass: 'bg-purple-500' },
  { value: 'pink', label: '분홍', tabClass: 'bg-pink-500 hover:bg-pink-600', swatchClass: 'bg-pink-500' },
  { value: 'orange', label: '주황', tabClass: 'bg-orange-500 hover:bg-orange-600', swatchClass: 'bg-orange-500' },
  { value: 'red', label: '빨강', tabClass: 'bg-red-500 hover:bg-red-600', swatchClass: 'bg-red-500' },
  { value: 'slate', label: '회색', tabClass: 'bg-slate-500 hover:bg-slate-600', swatchClass: 'bg-slate-500' },
]

const DEFAULT_SCHEDULE_COLOR: Record<ScheduleEvent['type'], ScheduleEventColor> = {
  personal: 'green',
  all: 'red',
}

function getScheduleColor(event: Pick<ScheduleEvent, 'type' | 'color'>) {
  const fallback = DEFAULT_SCHEDULE_COLOR[event.type]
  return SCHEDULE_COLORS.find(option => option.value === (event.color ?? fallback))
    ?? SCHEDULE_COLORS.find(option => option.value === fallback)!
}

function DayOfWeekHeader() {
  return (
    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
      {DOW_LABELS.map((day, index) => (
        <div
          key={day}
          className={`py-2 text-center text-xs font-semibold ${
            index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-slate-500'
          }`}
        >
          {day}
        </div>
      ))}
    </div>
  )
}

function CalendarMonthGrid({
  weeks,
  events,
  todayStr,
  selectedDate,
  globalIds,
  onSelectDate,
  onEditEvent,
}: {
  weeks: (Date | null)[][]
  events: ScheduleEvent[]
  todayStr: string
  selectedDate: string
  globalIds: Set<string>
  onSelectDate: (date: string) => void
  onEditEvent: (event: ScheduleEvent) => void
}) {
  return (
    <>
      {weeks.map((week, weekIndex) => {
        const placements = computePlacements(week, events)
        const maxLane = placements.length > 0 ? Math.max(...placements.map(placement => placement.lane)) : -1
        const visibleLanes = Math.min(maxLane + 1, MAX_LANES)

        const overflowByCol: number[] = Array(7).fill(0)
        for (const placement of placements) {
          if (placement.lane >= MAX_LANES) {
            for (let col = placement.startCol; col <= placement.endCol; col++) overflowByCol[col]++
          }
        }

        return (
          <div key={weekIndex} className="border-b border-slate-100 last:border-b-0">
            <div className="grid grid-cols-7">
              {week.map((date, dayIndex) => {
                const dateStr = date ? fmtDate(date) : null
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const holiday = dateStr ? ACADEMY_HOLIDAYS[dateStr] : undefined

                return (
                  <div
                    key={dayIndex}
                    className={`
                      min-h-[40px] select-none border-r border-slate-100 px-1 pb-1 pt-2
                      transition-colors last:border-r-0
                      ${!date
                        ? 'cursor-default bg-slate-50/40'
                        : isSelected
                          ? 'cursor-pointer bg-blue-50/70'
                          : 'cursor-pointer hover:bg-slate-50'}
                    `}
                    onClick={() => { if (dateStr) onSelectDate(dateStr) }}
                  >
                    <div className="flex justify-center">
                      <span
                        className={`
                          flex h-6 w-6 items-center justify-center rounded-full text-[11px]
                          font-semibold transition-colors
                          ${isToday
                            ? 'bg-blue-600 text-white'
                            : !date
                              ? 'text-slate-300'
                              : holiday
                                ? 'text-red-500'
                                : dayIndex === 0
                                  ? 'text-red-400'
                                  : dayIndex === 6
                                    ? 'text-blue-400'
                                    : 'text-slate-700'}
                        `}
                      >
                        {date?.getDate()}
                      </span>
                    </div>
                    {holiday && (
                      <p className="mt-0.5 truncate text-center text-[9px] leading-tight text-red-400">
                        {holiday}
                      </p>
                    )}
                    {overflowByCol[dayIndex] > 0 && (
                      <p className="mt-0.5 text-center text-[10px] font-medium text-slate-400">
                        +{overflowByCol[dayIndex]}개
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {Array.from({ length: visibleLanes }, (_, lane) => (
              <div key={lane} className="grid h-[22px] grid-cols-7">
                {placements
                  .filter(placement => placement.lane === lane)
                  .map(placement => (
                    <div
                      key={placement.event.id}
                      style={{ gridColumn: `${placement.startCol + 1} / ${placement.endCol + 2}` }}
                      className={`
                        my-[1px] flex h-5 cursor-pointer items-center overflow-hidden whitespace-nowrap
                        px-1.5 text-[10px] font-medium text-white transition-colors
                        ${getScheduleColor(placement.event).tabClass}
                        ${placement.continuesLeft ? 'ml-0 rounded-l-none' : 'ml-0.5 rounded-l'}
                        ${placement.continuesRight ? 'mr-0 rounded-r-none' : 'mr-0.5 rounded-r'}
                      `}
                      onClick={event => {
                        event.stopPropagation()
                        if (!globalIds.has(placement.event.id)) onEditEvent(placement.event)
                      }}
                      title={`${fmtTime(placement.event.time)}${placement.event.time ? ' ' : ''}${placement.event.title}${globalIds.has(placement.event.id) ? ' (전체공지)' : ''}`}
                    >
                      {placement.event.time && (
                        <span className="mr-0.5 shrink-0 opacity-80">{fmtTime(placement.event.time)}</span>
                      )}
                      <span className="truncate">{placement.event.title}</span>
                    </div>
                  ))}
              </div>
            ))}

            <div className="h-1.5" />
          </div>
        )
      })}
    </>
  )
}

export default function SchedulePage() {
  const { state, dispatch, globalScheduleEvents } = useApp()
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const todayStr = fmtDate(new Date())
  const todayDate = new Date()
  const initialLinkedDate = parseScheduleDate(searchParams.get('date'))

  const [displayYear, setDisplayYear] = useState(initialLinkedDate?.year ?? todayDate.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(initialLinkedDate?.month ?? todayDate.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(initialLinkedDate?.date ?? todayStr)
  const [showNextMonth, setShowNextMonth] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalId, setModalId] = useState<string | null>(null)
  const [modalTitle, setModalTitle] = useState('')
  const [modalType, setModalType] = useState<'personal' | 'all'>('personal')
  const [modalStartDate, setModalStartDate] = useState(todayStr)
  const [modalEndDate, setModalEndDate] = useState(todayStr)
  const [modalTime, setModalTime] = useState('')
  const [modalColor, setModalColor] = useState<ScheduleEventColor>('green')

  const dateGroupRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const linkedDate = parseScheduleDate(searchParams.get('date'))
    if (!linkedDate) return
    setDisplayYear(linkedDate.year)
    setDisplayMonth(linkedDate.month)
    setSelectedDate(linkedDate.date)
    setShowNextMonth(false)
  }, [location.key, searchParams])

  // 로컬 일정 + 관리자 전체 공지 일정 병합 (중복 방지)
  const allScheduleEvents = useMemo(() => {
    const local = state.scheduleEvents ?? []
    if (globalScheduleEvents.length === 0) return local
    const globalIds = new Set(globalScheduleEvents.map(e => e.id))
    return [...local.filter(e => !globalIds.has(e.id)), ...globalScheduleEvents]
  }, [state.scheduleEvents, globalScheduleEvents])

  const globalIds = useMemo(() => new Set(globalScheduleEvents.map(e => e.id)), [globalScheduleEvents])

  const calDays = useMemo(
    () => buildCalDays(displayYear, displayMonth),
    [displayYear, displayMonth]
  )

  const weeks = useMemo(() => {
    const rows: (Date | null)[][] = []
    for (let i = 0; i < calDays.length; i += 7) rows.push(calDays.slice(i, i + 7))
    return rows
  }, [calDays])

  const nextCalendar = useMemo(() => (
    displayMonth === 12
      ? { year: displayYear + 1, month: 1 }
      : { year: displayYear, month: displayMonth + 1 }
  ), [displayMonth, displayYear])

  const nextWeeks = useMemo(() => {
    const days = buildCalDays(nextCalendar.year, nextCalendar.month)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
    return rows
  }, [nextCalendar])

  // Events for current month grouped by date (for list panel)
  const monthEventGroups = useMemo(() => {
    const ms = `${displayYear}-${String(displayMonth).padStart(2, '0')}-01`
    const me = `${displayYear}-${String(displayMonth).padStart(2, '0')}-${String(new Date(displayYear, displayMonth, 0).getDate()).padStart(2, '0')}`

    const relevant = allScheduleEvents.filter(
      e => e.endDate >= ms && e.startDate <= me
    )
    const groups: Record<string, ScheduleEvent[]> = {}
    for (const event of relevant) {
      const listDate = event.startDate < ms ? ms : event.startDate
      if (!groups[listDate]) groups[listDate] = []
      groups[listDate].push(event)
    }
    for (const date of Object.keys(groups)) {
      groups[date].sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return 0
      })
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [allScheduleEvents, displayYear, displayMonth])

  const totalMonthEvents = monthEventGroups.reduce((acc, [, evs]) => acc + evs.length, 0)

  // Scroll list to selected date
  useEffect(() => {
    dateGroupRefs.current[selectedDate]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedDate])

  const prevMonth = () => {
    setShowNextMonth(false)
    if (displayMonth === 1) { setDisplayYear(y => y - 1); setDisplayMonth(12) }
    else setDisplayMonth(m => m - 1)
  }
  const nextMonth = () => {
    setShowNextMonth(false)
    if (displayMonth === 12) { setDisplayYear(y => y + 1); setDisplayMonth(1) }
    else setDisplayMonth(m => m + 1)
  }
  const goToday = () => {
    setShowNextMonth(false)
    setDisplayYear(todayDate.getFullYear())
    setDisplayMonth(todayDate.getMonth() + 1)
    setSelectedDate(todayStr)
  }

  const openAddModal = (dateStr: string) => {
    setModalMode('add')
    setModalId(null)
    setModalTitle('')
    setModalType('personal')
    setModalStartDate(dateStr)
    setModalEndDate(dateStr)
    setModalTime('')
    setModalColor('green')
    setModalOpen(true)
  }

  const openEditModal = (e: ScheduleEvent) => {
    if (!isAdmin && e.type === 'all') return  // 비관리자는 전체 공지 편집 불가
    setModalMode('edit')
    setModalId(e.id)
    setModalTitle(e.title)
    setModalType(isAdmin ? e.type : 'personal')
    setModalStartDate(e.startDate)
    setModalEndDate(e.endDate)
    setModalTime(e.time ?? '')
    setModalColor(e.color ?? DEFAULT_SCHEDULE_COLOR[e.type])
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!modalTitle.trim()) return
    const end = modalEndDate < modalStartDate ? modalStartDate : modalEndDate
    if (modalMode === 'add') {
      dispatch({
        type: 'ADD_SCHEDULE_EVENT',
        payload: {
          startDate: modalStartDate,
          endDate: end,
          time: modalTime || undefined,
          title: modalTitle.trim(),
          type: modalType,
          color: modalColor,
          completed: false,
        },
      })
    } else if (modalMode === 'edit' && modalId) {
      dispatch({
        type: 'UPDATE_SCHEDULE_EVENT',
        payload: {
          id: modalId,
          title: modalTitle.trim(),
          startDate: modalStartDate,
          endDate: end,
          time: modalTime || undefined,
          type: modalType,
          color: modalColor,
        },
      })
    }
    setModalOpen(false)
  }

  return (
    <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">업무 일정표</h1>
        <p className="text-sm text-slate-500 mt-1">날짜별 일정 관리</p>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── Calendar (2/3) ── */}
        <div className="flex-[2] bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden min-w-0">

          {/* Calendar nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-1.5">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={goToday}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-blue-600 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors font-medium"
              >
                오늘
              </button>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <ChevronRight size={15} />
              </button>
              <h2 className="font-bold text-slate-800 text-sm ml-1">
                {displayYear}년 {displayMonth}월
              </h2>
            </div>
            <p className="text-xs text-slate-400">일정별 탭 색상</p>
          </div>

          {/* DOW header */}
          <div className="shrink-0">
            <DayOfWeekHeader />
          </div>

          {/* Calendar grid */}
          <div className="flex-1 overflow-y-auto">
            <CalendarMonthGrid
              weeks={weeks}
              events={allScheduleEvents}
              todayStr={todayStr}
              selectedDate={selectedDate}
              globalIds={globalIds}
              onSelectDate={date => { setSelectedDate(date); openAddModal(date) }}
              onEditEvent={openEditModal}
            />

            {showNextMonth && (
              <section className="border-t-4 border-slate-100">
                <div className="flex items-center justify-center border-b border-slate-100 bg-white px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-700">
                    {nextCalendar.year}년 {nextCalendar.month}월
                  </h3>
                </div>
                <DayOfWeekHeader />
                <CalendarMonthGrid
                  weeks={nextWeeks}
                  events={allScheduleEvents}
                  todayStr={todayStr}
                  selectedDate={selectedDate}
                  globalIds={globalIds}
                  onSelectDate={date => { setSelectedDate(date); openAddModal(date) }}
                  onEditEvent={openEditModal}
                />
              </section>
            )}

            <div className="border-t border-slate-100 bg-slate-50/70 p-3">
              <button
                type="button"
                onClick={() => setShowNextMonth(show => !show)}
                aria-expanded={showNextMonth}
                className="mx-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                {showNextMonth ? <X size={13} /> : <ChevronDown size={14} />}
                {showNextMonth ? '다음 달 닫기' : `${nextCalendar.month}월 달력 보기`}
              </button>
            </div>
          </div>
        </div>

        {/* ── List panel (1/3) ── */}
        <div className="flex-[1] bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden min-w-0">

          {/* List header */}
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">일정 목록</p>
              <button
                onClick={() => openAddModal(selectedDate)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={12} />추가
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {displayYear}년 {displayMonth}월 · {totalMonthEvents}개 일정
            </p>
          </div>

          {/* Event list */}
          <div className="flex-1 overflow-y-auto">
            {monthEventGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="text-xs text-slate-300">이번 달 일정이 없습니다</p>
              </div>
            ) : (
              <div>
                {monthEventGroups.map(([dateStr, events]) => {
                  const [, m, d] = dateStr.split('-').map(Number)
                  const dowNum = new Date(dateStr + 'T00:00:00').getDay()
                  const dow = DOW_LABELS[dowNum]
                  const isSelected = dateStr === selectedDate
                  const isToday = dateStr === todayStr

                  return (
                    <div
                      key={dateStr}
                      ref={el => { dateGroupRefs.current[dateStr] = el }}
                    >
                      {/* Date group header */}
                      <div
                        className={`
                          flex items-center justify-between px-4 py-2 sticky top-0 z-10 border-b border-slate-100
                          ${isSelected ? 'bg-blue-50' : 'bg-white'}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`
                              w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0
                              ${isToday
                                ? 'bg-blue-600 text-white'
                                : isSelected
                                  ? 'bg-blue-100 text-blue-700'
                                  : dowNum === 0
                                    ? 'text-red-400'
                                    : dowNum === 6
                                      ? 'text-blue-400'
                                      : 'text-slate-600'}
                            `}
                          >
                            {d}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              isToday ? 'text-blue-600' :
                              isSelected ? 'text-blue-500' :
                              'text-slate-600'
                            }`}
                          >
                            {m}월 {d}일 ({dow})
                          </span>
                        </div>
                        <button
                          onClick={() => { setSelectedDate(dateStr); openAddModal(dateStr) }}
                          className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Events */}
                      {events.map(event => (
                        <div
                          key={event.id}
                          className={`
                            flex items-start gap-2.5 px-4 py-2 group hover:bg-slate-50
                            transition-colors
                            ${isSelected ? 'bg-blue-50/30' : ''}
                            ${globalIds.has(event.id) ? 'cursor-default' : 'cursor-pointer'}
                          `}
                          onClick={() => { if (!globalIds.has(event.id)) openEditModal(event) }}
                        >
                          <span
                            className={`w-2 h-2 rounded-sm shrink-0 mt-1 ${getScheduleColor(event).swatchClass}`}
                          />
                          <div className="flex-1 min-w-0">
                            {event.time && (
                              <p className="text-[10px] text-slate-400 leading-none mb-0.5">
                                {fmtTime(event.time)}
                              </p>
                            )}
                            <p className="text-xs text-slate-700 leading-snug truncate">{event.title}</p>
                            {event.startDate !== event.endDate && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                ~ {event.endDate.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1/$2')}까지
                              </p>
                            )}
                          </div>
                          {globalIds.has(event.id) ? (
                            <span className="text-[9px] text-red-400 font-medium shrink-0 mt-1">전체공지</span>
                          ) : (
                            <button
                              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-500 transition-all shrink-0 mt-0.5"
                              onClick={e => { e.stopPropagation(); openEditModal(event) }}
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-96 max-w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">
                {modalMode === 'add' ? '일정 추가' : '일정 수정'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                autoFocus
                type="text"
                value={modalTitle}
                onChange={e => setModalTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setModalOpen(false)
                }}
                placeholder="일정 내용 입력..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 block mb-1">시작</label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={e => {
                      setModalStartDate(e.target.value)
                      if (e.target.value > modalEndDate) setModalEndDate(e.target.value)
                    }}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 block mb-1">종료</label>
                  <input
                    type="date"
                    value={modalEndDate}
                    min={modalStartDate}
                    onChange={e => setModalEndDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              {modalEndDate > modalStartDate && (
                <p className="text-xs text-blue-500 text-right">
                  총 {diffDays(modalStartDate, modalEndDate) + 1}일
                </p>
              )}

              <div className="flex items-center gap-2">
                <Clock size={13} className="text-slate-400 shrink-0" />
                <input
                  type="time"
                  value={modalTime}
                  onChange={e => setModalTime(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-200 text-slate-600"
                />
                {modalTime && (
                  <button onClick={() => setModalTime('')} className="text-slate-300 hover:text-slate-500 transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-2">탭 색상</label>
                <div className="flex items-center justify-between gap-2" role="radiogroup" aria-label="일정 탭 색상">
                  {SCHEDULE_COLORS.map(option => {
                    const selected = modalColor === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={option.label}
                        title={option.label}
                        onClick={() => setModalColor(option.value)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all ${option.swatchClass} ${selected ? 'ring-2 ring-offset-2 ring-blue-500 scale-105' : 'hover:scale-110'}`}
                      >
                        {selected && <Check size={14} strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {isAdmin ? (
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                  <button
                    onClick={() => {
                      if (modalColor === DEFAULT_SCHEDULE_COLOR[modalType]) setModalColor(DEFAULT_SCHEDULE_COLOR.personal)
                      setModalType('personal')
                    }}
                    className={`flex-1 py-2 transition-colors ${modalType === 'personal' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >개인</button>
                  <button
                    onClick={() => {
                      if (modalColor === DEFAULT_SCHEDULE_COLOR[modalType]) setModalColor(DEFAULT_SCHEDULE_COLOR.all)
                      setModalType('all')
                    }}
                    className={`flex-1 py-2 border-l border-slate-200 transition-colors ${modalType === 'all' ? 'bg-red-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >전체 공지</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                  <span className="w-2 h-2 rounded-sm bg-green-500 shrink-0" />
                  <span className="text-xs text-green-700 font-medium">개인 일정</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-5">
              {modalMode === 'edit' ? (
                <button
                  onClick={() => {
                    if (modalId) dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: modalId })
                    setModalOpen(false)
                  }}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium"
                >
                  삭제
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={!modalTitle.trim()}
                  className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {modalMode === 'add' ? '추가' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
