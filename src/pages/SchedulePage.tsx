import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Save, Clock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate } from '../utils/helpers'

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

function dateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  return `${y}년 ${m}월 ${d}일 (${DOW_LABELS[dow]})`
}

function fmtTime(time?: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h < 12 ? '오전' : '오후'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${period} ${hour}시` : `${period} ${hour}:${String(m).padStart(2, '0')}`
}

export default function SchedulePage() {
  const { state, dispatch } = useApp()
  const todayStr = fmtDate(new Date())
  const todayDate = new Date()

  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [showAdd, setShowAdd] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addType, setAddType] = useState<'personal' | 'all'>('personal')
  const [addStartDate, setAddStartDate] = useState(todayStr)
  const [addEndDate, setAddEndDate] = useState(todayStr)
  const [addTime, setAddTime] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'personal' | 'all'>('personal')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editTime, setEditTime] = useState('')

  useEffect(() => {
    if (showAdd) {
      setAddStartDate(selectedDate)
      setAddEndDate(selectedDate)
      inputRef.current?.focus()
    }
  }, [showAdd, selectedDate])

  const calDays = useMemo(
    () => buildCalDays(displayYear, displayMonth),
    [displayYear, displayMonth]
  )

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof state.scheduleEvents> = {}
    for (const e of state.scheduleEvents ?? []) {
      const start = e.startDate ?? ''
      const end = e.endDate ?? start
      for (const d of daysBetween(start, end)) {
        if (!map[d]) map[d] = []
        map[d].push(e)
      }
    }
    // sort each day's events by time
    for (const d of Object.keys(map)) {
      map[d].sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return 0
      })
    }
    return map
  }, [state.scheduleEvents])

  const selectedEvents = eventsByDate[selectedDate] ?? []

  const prevMonth = () => {
    if (displayMonth === 1) { setDisplayYear(y => y - 1); setDisplayMonth(12) }
    else setDisplayMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (displayMonth === 12) { setDisplayYear(y => y + 1); setDisplayMonth(1) }
    else setDisplayMonth(m => m + 1)
  }

  const handleAdd = () => {
    if (!addTitle.trim()) return
    const end = addEndDate < addStartDate ? addStartDate : addEndDate
    dispatch({
      type: 'ADD_SCHEDULE_EVENT',
      payload: {
        startDate: addStartDate,
        endDate: end,
        time: addTime || undefined,
        title: addTitle.trim(),
        type: addType,
        completed: false,
      },
    })
    setAddTitle('')
    setAddTime('')
    setShowAdd(false)
  }

  const handleCancel = () => { setShowAdd(false); setAddTitle(''); setAddTime('') }

  const handleStartEdit = (e: NonNullable<typeof state.scheduleEvents>[number]) => {
    setEditingId(e.id)
    setEditTitle(e.title)
    setEditType(e.type)
    setEditStartDate(e.startDate)
    setEditEndDate(e.endDate)
    setEditTime(e.time ?? '')
    setShowAdd(false)
  }

  const handleSaveEdit = () => {
    if (!editTitle.trim() || !editingId) return
    const end = editEndDate < editStartDate ? editStartDate : editEndDate
    dispatch({
      type: 'UPDATE_SCHEDULE_EVENT',
      payload: {
        id: editingId,
        title: editTitle.trim(),
        startDate: editStartDate,
        endDate: end,
        time: editTime || undefined,
        type: editType,
      },
    })
    setEditingId(null)
  }

  const weeks = useMemo(() => {
    const rows: (Date | null)[][] = []
    for (let i = 0; i < calDays.length; i += 7) rows.push(calDays.slice(i, i + 7))
    return rows
  }, [calDays])

  return (
    <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* Page header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">업무 일정표</h1>
        <p className="text-sm text-slate-500 mt-1">날짜별 일정 관리</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-1" style={{ minHeight: 0 }}>

        {/* ── Calendar ── */}
        <div className="flex-1 flex flex-col border-r border-slate-100 min-w-0">

          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <h2 className="font-bold text-slate-800 text-base">
              {displayYear}년 {displayMonth}월
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => { setDisplayYear(todayDate.getFullYear()); setDisplayMonth(todayDate.getMonth() + 1) }}
                className="px-2.5 py-1 text-xs text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors font-medium"
              >
                오늘
              </button>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-slate-100 shrink-0">
            {DOW_LABELS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-semibold py-2
                  ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
            {weeks.map((week, wi) => (
              <div
                key={wi}
                className="grid grid-cols-7 flex-1 border-b border-slate-100 last:border-b-0"
                style={{ minHeight: '88px' }}
              >
                {week.map((date, di) => {
                  if (!date) {
                    return (
                      <div
                        key={`pad-${wi}-${di}`}
                        className={`border-r border-slate-100 last:border-r-0 bg-slate-50/40`}
                      />
                    )
                  }
                  const dateStr = fmtDate(date)
                  const isToday = dateStr === todayStr
                  const isSelected = dateStr === selectedDate
                  const events = eventsByDate[dateStr] ?? []
                  const dow = date.getDay()
                  const holiday = ACADEMY_HOLIDAYS[dateStr]
                  const MAX_VISIBLE = 3
                  const visibleEvents = events.slice(0, MAX_VISIBLE)
                  const overflow = events.length - MAX_VISIBLE

                  return (
                    <div
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`border-r border-slate-100 last:border-r-0 p-1 cursor-pointer group transition-colors
                        ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'}`}
                    >
                      {/* Date number */}
                      <div className="flex justify-center mb-0.5">
                        <span
                          className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold transition-colors
                            ${isToday
                              ? 'bg-slate-800 text-white'
                              : isSelected
                                ? 'bg-blue-600 text-white'
                                : holiday
                                  ? 'text-red-500'
                                  : dow === 0
                                    ? 'text-red-400'
                                    : dow === 6
                                      ? 'text-blue-400'
                                      : 'text-slate-700'
                            }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>

                      {/* Event pills */}
                      <div className="space-y-0.5">
                        {visibleEvents.map(e => (
                          <div
                            key={e.id}
                            className={`rounded px-1 py-0.5 text-[10px] leading-tight truncate font-medium
                              ${e.type === 'personal'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'}`}
                            title={`${fmtTime(e.time)} ${e.title}`}
                          >
                            {e.time && (
                              <span className="opacity-70 mr-0.5">{fmtTime(e.time)}</span>
                            )}
                            {e.title}
                          </div>
                        ))}
                        {overflow > 0 && (
                          <div className="text-[10px] text-slate-400 px-1 font-medium">
                            +{overflow}개
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="px-5 py-2.5 border-t border-slate-100 flex gap-4 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-400 shrink-0" />개인
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400 shrink-0" />전체
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-5 h-5 rounded-full bg-slate-800 shrink-0" />오늘
            </div>
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="w-72 flex flex-col shrink-0">

          {/* Panel header */}
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between mb-0.5">
              <p className="font-semibold text-slate-800 text-sm">{dateLabel(selectedDate)}</p>
              <button
                onClick={() => { setShowAdd(v => !v); setEditingId(null) }}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors font-medium
                  ${showAdd ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
              >
                <Plus size={12} />추가
              </button>
            </div>
            <p className="text-xs text-slate-400">{selectedEvents.length}개 일정</p>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="px-4 py-3 border-b border-slate-100 space-y-2.5 bg-slate-50/80 shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={addTitle}
                onChange={e => setAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') handleCancel() }}
                placeholder="일정 내용 입력..."
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />

              {/* Time */}
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-slate-400 shrink-0" />
                <input
                  type="time"
                  value={addTime}
                  onChange={e => setAddTime(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white text-slate-600"
                />
                {addTime && (
                  <button onClick={() => setAddTime('')} className="text-slate-300 hover:text-slate-500 shrink-0">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Date range */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 w-8 shrink-0">시작</label>
                  <input
                    type="date"
                    value={addStartDate}
                    onChange={e => { setAddStartDate(e.target.value); if (e.target.value > addEndDate) setAddEndDate(e.target.value) }}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 w-8 shrink-0">종료</label>
                  <input
                    type="date"
                    value={addEndDate}
                    min={addStartDate}
                    onChange={e => setAddEndDate(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                  />
                </div>
                {addEndDate > addStartDate && (
                  <p className="text-xs text-blue-500 text-right">총 {diffDays(addStartDate, addEndDate) + 1}일</p>
                )}
              </div>

              {/* Type + submit */}
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-1 text-xs font-medium">
                  <button
                    onClick={() => setAddType('personal')}
                    className={`flex-1 py-1.5 transition-colors ${addType === 'personal' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >개인</button>
                  <button
                    onClick={() => setAddType('all')}
                    className={`flex-1 py-1.5 border-l border-slate-200 transition-colors ${addType === 'all' ? 'bg-red-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >전체</button>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={!addTitle.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
                >추가</button>
                <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 shrink-0">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Event list for selected date */}
          <div className="flex-1 overflow-y-auto">
            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <Plus size={14} className="text-slate-400" />
                </div>
                <p className="text-xs text-slate-300">일정이 없습니다</p>
              </div>
            ) : (
              <div className="py-2 space-y-0.5">
                {selectedEvents.map(e => {
                  const isEditing = editingId === e.id
                  const span = diffDays(e.startDate, e.endDate)

                  if (isEditing) {
                    return (
                      <div key={e.id} className="px-3 py-3 bg-blue-50/60 border-l-2 border-blue-300 mx-2 rounded-r-lg space-y-2">
                        <input
                          autoFocus
                          type="text"
                          value={editTitle}
                          onChange={ev => setEditTitle(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === 'Enter') handleSaveEdit(); if (ev.key === 'Escape') setEditingId(null) }}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                        />
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <input
                            type="time"
                            value={editTime}
                            onChange={ev => setEditTime(ev.target.value)}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                          />
                          {editTime && (
                            <button onClick={() => setEditTime('')} className="text-slate-300 hover:text-slate-500 shrink-0">
                              <X size={11} />
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500 w-8 shrink-0">시작</label>
                            <input
                              type="date"
                              value={editStartDate}
                              onChange={ev => { setEditStartDate(ev.target.value); if (ev.target.value > editEndDate) setEditEndDate(ev.target.value) }}
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500 w-8 shrink-0">종료</label>
                            <input
                              type="date"
                              value={editEndDate}
                              min={editStartDate}
                              onChange={ev => setEditEndDate(ev.target.value)}
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-1 text-xs font-medium">
                            <button
                              onClick={() => setEditType('personal')}
                              className={`flex-1 py-1 transition-colors ${editType === 'personal' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                            >개인</button>
                            <button
                              onClick={() => setEditType('all')}
                              className={`flex-1 py-1 border-l border-slate-200 transition-colors ${editType === 'all' ? 'bg-red-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                            >전체</button>
                          </div>
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editTitle.trim()}
                            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 shrink-0"
                          >
                            <Save size={11} />저장
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-2.5 px-4 py-2.5 group hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
                        <span className={`w-2 h-2 rounded-sm
                          ${e.type === 'personal' ? 'bg-green-500' : 'bg-red-500'}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        {e.time && (
                          <p className="text-[11px] text-slate-400 font-medium leading-none mb-0.5 flex items-center gap-1">
                            <Clock size={10} />
                            {fmtTime(e.time)}
                          </p>
                        )}
                        <p className="text-sm text-slate-700 break-words leading-snug">{e.title}</p>
                        {span > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {e.startDate} ~ {e.endDate} · {span + 1}일
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5
                        ${e.type === 'personal' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {e.type === 'personal' ? '개인' : '전체'}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                        <button
                          onClick={() => handleStartEdit(e)}
                          className="text-slate-300 hover:text-blue-500 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: e.id })}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
