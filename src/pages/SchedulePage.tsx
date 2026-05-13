import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Save } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate } from '../utils/helpers'

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']

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
  const [, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  return `${m}월 ${d}일 (${DOW_KO[dow]})`
}

export default function SchedulePage() {
  const { state, dispatch } = useApp()
  const todayStr = fmtDate(new Date())
  const todayDate = new Date()

  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr)

  // 추가 폼
  const [showAdd, setShowAdd] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addType, setAddType] = useState<'personal' | 'all'>('personal')
  const [addStartDate, setAddStartDate] = useState(todayStr)
  const [addEndDate, setAddEndDate] = useState(todayStr)
  const inputRef = useRef<HTMLInputElement>(null)

  // 수정 폼
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'personal' | 'all'>('personal')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')

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
    return map
  }, [state.scheduleEvents])

  const monthStart = `${displayYear}-${String(displayMonth).padStart(2, '0')}-01`
  const monthLastDay = new Date(displayYear, displayMonth, 0).getDate()
  const monthEnd = `${displayYear}-${String(displayMonth).padStart(2, '0')}-${String(monthLastDay).padStart(2, '0')}`

  const monthGroups = useMemo(() => {
    const events = (state.scheduleEvents ?? [])
      .filter(e => e.startDate <= monthEnd && e.endDate >= monthStart)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt))

    const groups: { date: string; events: typeof events }[] = []
    for (const e of events) {
      const groupDate = e.startDate < monthStart ? monthStart : e.startDate
      const last = groups[groups.length - 1]
      if (last && last.date === groupDate) {
        last.events.push(e)
      } else {
        groups.push({ date: groupDate, events: [e] })
      }
    }
    return groups
  }, [state.scheduleEvents, monthStart, monthEnd])

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
      payload: { startDate: addStartDate, endDate: end, title: addTitle.trim(), type: addType, completed: false },
    })
    setAddTitle('')
    setShowAdd(false)
  }

  const handleCancel = () => { setShowAdd(false); setAddTitle('') }

  const handleStartEdit = (e: NonNullable<typeof state.scheduleEvents>[number]) => {
    setEditingId(e.id)
    setEditTitle(e.title)
    setEditType(e.type)
    setEditStartDate(e.startDate)
    setEditEndDate(e.endDate)
    setShowAdd(false)
  }

  const handleSaveEdit = () => {
    if (!editTitle.trim() || !editingId) return
    const end = editEndDate < editStartDate ? editStartDate : editEndDate
    dispatch({
      type: 'UPDATE_SCHEDULE_EVENT',
      payload: { id: editingId, title: editTitle.trim(), startDate: editStartDate, endDate: end, type: editType },
    })
    setEditingId(null)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">업무 일정표</h1>
        <p className="text-sm text-slate-500 mt-1">날짜별 일정 관리</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex min-h-[520px]">

        {/* ── 달력 ── */}
        <div className="flex-1 border-r border-slate-100 flex flex-col">
          {/* 월 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-lg">{displayYear}년 {displayMonth}월</h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => { setDisplayYear(todayDate.getFullYear()); setDisplayMonth(todayDate.getMonth() + 1) }}
                className="px-2.5 py-1 text-xs text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                오늘
              </button>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <ChevronRight size={17} />
              </button>
            </div>
          </div>

          {/* 요일 라벨 */}
          <div className="grid grid-cols-7 px-3 pt-3">
            {DOW_LABELS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-semibold py-1
                  ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 px-3 pb-3 flex-1">
            {calDays.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} />
              const dateStr = fmtDate(date)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const events = eventsByDate[dateStr] ?? []
              const hasPersonal = events.some(e => e.type === 'personal')
              const hasAll = events.some(e => e.type === 'all')
              const dow = date.getDay()
              const holiday = ACADEMY_HOLIDAYS[dateStr]

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className="flex flex-col items-center py-0.5 cursor-pointer select-none"
                >
                  <div
                    className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium transition-colors
                      ${isSelected || isToday
                        ? isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-white'
                        : holiday
                          ? 'text-red-500 hover:bg-red-50'
                          : dow === 0
                            ? 'text-red-400 hover:bg-red-50'
                            : dow === 6
                              ? 'text-blue-400 hover:bg-blue-50'
                              : 'text-slate-700 hover:bg-slate-100'
                      }`}
                  >
                    {date.getDate()}
                  </div>
                  {(hasAll || hasPersonal) && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasAll && <span className="w-1.5 h-1.5 rounded-sm bg-red-400" />}
                      {hasPersonal && <span className="w-1.5 h-1.5 rounded-sm bg-green-500" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div className="px-6 py-3 border-t border-slate-50 flex gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-500 shrink-0" />개인
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400 shrink-0" />전체
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-4 h-4 rounded-md bg-slate-800 shrink-0" />오늘
            </div>
          </div>
        </div>

        {/* ── 월별 일정 리스트 패널 ── */}
        <div className="w-80 flex flex-col">
          {/* 패널 헤더 */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-semibold text-slate-800">{displayMonth}월 일정 목록</p>
            <button
              onClick={() => { setShowAdd(v => !v); setEditingId(null) }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50"
            >
              <Plus size={13} />추가
            </button>
          </div>

          {/* 추가 폼 */}
          {showAdd && (
            <div className="px-5 py-3 border-b border-slate-100 space-y-2 bg-slate-50/80">
              <input
                ref={inputRef}
                type="text"
                value={addTitle}
                onChange={e => setAddTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') handleCancel() }}
                placeholder="일정 내용 입력..."
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />
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

          {/* 월별 날짜 그룹 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {monthGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <p className="text-sm text-slate-300">{displayMonth}월 일정이 없습니다</p>
              </div>
            ) : (
              <div className="py-2">
                {monthGroups.map(({ date, events }) => (
                  <div key={date} className="mb-1">
                    <div className={`px-5 py-1.5 text-xs font-semibold
                      ${date === todayStr ? 'text-blue-600' : 'text-slate-400'}`}>
                      {dateLabel(date)}
                      {date === todayStr && <span className="ml-1.5 text-blue-400 font-normal">오늘</span>}
                    </div>
                    {events.map(e => {
                      const isEditing = editingId === e.id
                      const span = diffDays(e.startDate, e.endDate)
                      const startsEarlier = e.startDate < monthStart

                      if (isEditing) {
                        return (
                          <div key={e.id} className="px-4 py-2.5 bg-blue-50/60 border-l-2 border-blue-300 mx-2 rounded-r-lg mb-1 space-y-2">
                            <input
                              autoFocus
                              type="text"
                              value={editTitle}
                              onChange={ev => setEditTitle(ev.target.value)}
                              onKeyDown={ev => { if (ev.key === 'Enter') handleSaveEdit(); if (ev.key === 'Escape') setEditingId(null) }}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                            />
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
                          className="flex items-start gap-2.5 px-5 py-2 group hover:bg-slate-50"
                        >
                          <span className={`w-2 h-2 rounded-sm shrink-0 mt-1.5
                            ${e.type === 'personal' ? 'bg-green-500' : 'bg-red-500'}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 break-words leading-snug">{e.title}</p>
                            {span > 0 && (
                              <p className="text-xs text-slate-400 mt-0.5">
                                {startsEarlier ? `(${e.startDate}~) ` : ''}{e.endDate}까지 · {span + 1}일
                              </p>
                            )}
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0
                            ${e.type === 'personal' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {e.type === 'personal' ? '개인' : '전체'}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                            <button
                              onClick={() => handleStartEdit(e)}
                              className="text-slate-300 hover:text-blue-500 transition-colors"
                              title="수정"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => dispatch({ type: 'DELETE_SCHEDULE_EVENT', payload: e.id })}
                              className="text-slate-300 hover:text-red-400 transition-colors"
                              title="삭제"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
