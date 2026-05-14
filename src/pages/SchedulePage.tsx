import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, Pencil } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate } from '../utils/helpers'
import type { ScheduleEvent } from '../types'

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

export default function SchedulePage() {
  const { state, dispatch } = useApp()
  const todayStr = fmtDate(new Date())
  const todayDate = new Date()

  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalId, setModalId] = useState<string | null>(null)
  const [modalTitle, setModalTitle] = useState('')
  const [modalType, setModalType] = useState<'personal' | 'all'>('personal')
  const [modalStartDate, setModalStartDate] = useState(todayStr)
  const [modalEndDate, setModalEndDate] = useState(todayStr)
  const [modalTime, setModalTime] = useState('')

  const dateGroupRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const calDays = useMemo(
    () => buildCalDays(displayYear, displayMonth),
    [displayYear, displayMonth]
  )

  const weeks = useMemo(() => {
    const rows: (Date | null)[][] = []
    for (let i = 0; i < calDays.length; i += 7) rows.push(calDays.slice(i, i + 7))
    return rows
  }, [calDays])

  // Events for current month grouped by date (for list panel)
  const monthEventGroups = useMemo(() => {
    const ms = `${displayYear}-${String(displayMonth).padStart(2, '0')}-01`
    const me = `${displayYear}-${String(displayMonth).padStart(2, '0')}-${String(new Date(displayYear, displayMonth, 0).getDate()).padStart(2, '0')}`

    const relevant = (state.scheduleEvents ?? []).filter(
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
  }, [state.scheduleEvents, displayYear, displayMonth])

  const totalMonthEvents = monthEventGroups.reduce((acc, [, evs]) => acc + evs.length, 0)

  // Scroll list to selected date
  useEffect(() => {
    dateGroupRefs.current[selectedDate]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedDate])

  const prevMonth = () => {
    if (displayMonth === 1) { setDisplayYear(y => y - 1); setDisplayMonth(12) }
    else setDisplayMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (displayMonth === 12) { setDisplayYear(y => y + 1); setDisplayMonth(1) }
    else setDisplayMonth(m => m + 1)
  }
  const goToday = () => {
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
    setModalOpen(true)
  }

  const openEditModal = (e: ScheduleEvent) => {
    setModalMode('edit')
    setModalId(e.id)
    setModalTitle(e.title)
    setModalType(e.type)
    setModalStartDate(e.startDate)
    setModalEndDate(e.endDate)
    setModalTime(e.time ?? '')
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
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />개인
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />전체
              </span>
            </div>
          </div>

          {/* DOW header */}
          <div className="grid grid-cols-7 border-b border-slate-200 shrink-0 bg-slate-50/60">
            {DOW_LABELS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-semibold py-2
                  ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="flex-1 overflow-y-auto">
            {weeks.map((week, wi) => {
              const placements = computePlacements(week, state.scheduleEvents ?? [])
              const maxLane = placements.length > 0 ? Math.max(...placements.map(p => p.lane)) : -1
              const visibleLanes = Math.min(maxLane + 1, MAX_LANES)

              const overflowByCol: number[] = Array(7).fill(0)
              for (const p of placements) {
                if (p.lane >= MAX_LANES) {
                  for (let c = p.startCol; c <= p.endCol; c++) overflowByCol[c]++
                }
              }

              return (
                <div key={wi} className="border-b border-slate-100 last:border-b-0">
                  {/* Date number row */}
                  <div className="grid grid-cols-7">
                    {week.map((date, di) => {
                      const dateStr = date ? fmtDate(date) : null
                      const isToday = dateStr === todayStr
                      const isSelected = dateStr === selectedDate
                      const holiday = dateStr ? ACADEMY_HOLIDAYS[dateStr] : undefined
                      const dow = di

                      return (
                        <div
                          key={di}
                          className={`
                            border-r border-slate-100 last:border-r-0 pt-2 pb-1 px-1
                            transition-colors select-none
                            ${!date
                              ? 'bg-slate-50/40 cursor-default'
                              : isSelected
                                ? 'bg-blue-50/70 cursor-pointer'
                                : 'hover:bg-slate-50 cursor-pointer'}
                          `}
                          onClick={() => {
                            if (!date) return
                            setSelectedDate(fmtDate(date))
                            openAddModal(fmtDate(date))
                          }}
                        >
                          <div className="flex justify-center">
                            <span
                              className={`
                                w-6 h-6 flex items-center justify-center rounded-full
                                text-[11px] font-semibold transition-colors
                                ${isToday
                                  ? 'bg-blue-600 text-white'
                                  : !date
                                    ? 'text-slate-300'
                                    : holiday
                                      ? 'text-red-500'
                                      : dow === 0
                                        ? 'text-red-400'
                                        : dow === 6
                                          ? 'text-blue-400'
                                          : 'text-slate-700'
                                }
                              `}
                            >
                              {date?.getDate()}
                            </span>
                          </div>
                          {holiday && (
                            <p className="text-[9px] text-red-400 text-center truncate leading-tight mt-0.5">
                              {holiday}
                            </p>
                          )}
                          {overflowByCol[di] > 0 && (
                            <p className="text-[10px] text-slate-400 text-center font-medium mt-0.5">
                              +{overflowByCol[di]}개
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Event lanes */}
                  {Array.from({ length: visibleLanes }, (_, lane) => (
                    <div key={lane} className="grid grid-cols-7 h-[22px]">
                      {placements
                        .filter(p => p.lane === lane)
                        .map(p => (
                          <div
                            key={p.event.id}
                            style={{ gridColumn: `${p.startCol + 1} / ${p.endCol + 2}` }}
                            className={`
                              my-[1px] h-5 flex items-center px-1.5 text-[10px] font-medium
                              text-white cursor-pointer overflow-hidden whitespace-nowrap
                              transition-colors
                              ${p.event.type === 'personal'
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-red-500 hover:bg-red-600'}
                              ${p.continuesLeft ? 'ml-0 rounded-l-none' : 'ml-0.5 rounded-l'}
                              ${p.continuesRight ? 'mr-0 rounded-r-none' : 'mr-0.5 rounded-r'}
                            `}
                            onClick={e => { e.stopPropagation(); openEditModal(p.event) }}
                            title={`${fmtTime(p.event.time)}${p.event.time ? ' ' : ''}${p.event.title}`}
                          >
                            {p.event.time && (
                              <span className="opacity-80 mr-0.5 shrink-0">{fmtTime(p.event.time)}</span>
                            )}
                            <span className="truncate">{p.event.title}</span>
                          </div>
                        ))}
                    </div>
                  ))}

                  <div className="h-1.5" />
                </div>
              )
            })}
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
                            cursor-pointer transition-colors
                            ${isSelected ? 'bg-blue-50/30' : ''}
                          `}
                          onClick={() => openEditModal(event)}
                        >
                          <span
                            className={`w-2 h-2 rounded-sm shrink-0 mt-1
                              ${event.type === 'personal' ? 'bg-green-500' : 'bg-red-500'}`}
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
                          <button
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-500 transition-all shrink-0 mt-0.5"
                            onClick={e => { e.stopPropagation(); openEditModal(event) }}
                          >
                            <Pencil size={11} />
                          </button>
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

              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                <button
                  onClick={() => setModalType('personal')}
                  className={`flex-1 py-2 transition-colors ${modalType === 'personal' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >개인</button>
                <button
                  onClick={() => setModalType('all')}
                  className={`flex-1 py-2 border-l border-slate-200 transition-colors ${modalType === 'all' ? 'bg-red-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >전체</button>
              </div>
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
