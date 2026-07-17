import { useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock, ListChecks, Pencil, Plus, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { ScheduleEvent, TodoItem } from '../types'
import { fmtDate } from '../utils/helpers'

type ViewMode = 'day' | 'week' | 'month'

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function isImportantTodo(todo: TodoItem) {
  return todo.priority === 'important' || todo.priority === 'important-urgent'
}

function ImportantDot() {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-label="중요" />
}

function addDays(dateStr: string, amount: number) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return fmtDate(date)
}

function monthStart(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  return fmtDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

function monthEnd(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  return fmtDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

function weekStartSunday(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() - date.getDay())
  return fmtDate(date)
}

function buildMonthDays(dateStr: string) {
  const start = monthStart(dateStr)
  const end = monthEnd(dateStr)
  const first = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - cursor.getDay())
  const days: string[] = []
  while (days.length < 42) {
    days.push(fmtDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  const lastVisible = days[days.length - 1]
  if (lastVisible < fmtDate(last)) {
    while (days[days.length - 1] < fmtDate(last)) {
      days.push(addDays(days[days.length - 1], 1))
    }
  }
  return days
}

function formatKo(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEK_LABELS[date.getDay()]}요일`
}

function eventTouchesDate(event: ScheduleEvent, date: string) {
  return event.startDate <= date && event.endDate >= date
}

function sortTodos(a: TodoItem, b: TodoItem) {
  return Number(!isImportantTodo(a)) - Number(!isImportantTodo(b)) || a.createdAt.localeCompare(b.createdAt)
}

export default function TodoPage() {
  const { state, dispatch, globalScheduleEvents } = useApp()
  const today = fmtDate(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedDate, setSelectedDate] = useState(today)
  const [title, setTitle] = useState('')
  const [important, setImportant] = useState(false)
  const [showMemo, setShowMemo] = useState(false)
  const [memo, setMemo] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)

  const allScheduleEvents = useMemo(() => {
    const local = state.scheduleEvents ?? []
    if (globalScheduleEvents.length === 0) return local
    const globalIds = new Set(globalScheduleEvents.map(event => event.id))
    return [...local.filter(event => !globalIds.has(event.id)), ...globalScheduleEvents]
  }, [globalScheduleEvents, state.scheduleEvents])

  const todos = useMemo(() => [...(state.todos ?? [])].sort(sortTodos), [state.todos])
  const activeTodos = todos.filter(todo => !todo.completed)

  const selectedDayTodos = todos.filter(todo => todo.date === selectedDate)
  const selectedDayActive = selectedDayTodos.filter(todo => !todo.completed)
  const selectedDayDone = selectedDayTodos.filter(todo => todo.completed)

  const weekStart = weekStartSunday(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const monthDays = buildMonthDays(selectedDate)
  const currentMonth = selectedDate.slice(0, 7)

  const submitTodo = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    dispatch({ type: 'ADD_TODO', payload: { title: trimmed, date: selectedDate, priority: important ? 'important' : 'none', memo: memo.trim() || undefined } })
    setTitle('')
    setMemo('')
    setShowMemo(false)
    setImportant(false)
  }

  const move = (direction: -1 | 1) => {
    if (viewMode === 'day') setSelectedDate(addDays(selectedDate, direction))
    if (viewMode === 'week') setSelectedDate(addDays(selectedDate, direction * 7))
    if (viewMode === 'month') {
      const date = new Date(`${selectedDate}T00:00:00`)
      date.setMonth(date.getMonth() + direction)
      setSelectedDate(fmtDate(date))
    }
  }

  const visibleTitle = viewMode === 'day'
    ? formatKo(selectedDate)
    : viewMode === 'week'
      ? `${formatKo(weekDays[0])} - ${formatKo(weekDays[6])}`
      : `${new Date(`${selectedDate}T00:00:00`).getFullYear()}년 ${new Date(`${selectedDate}T00:00:00`).getMonth() + 1}월`

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ToDo</h1>
          <p className="text-sm text-slate-500 mt-1">개인 할 일을 일·주·월 단위로 정리합니다</p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showSchedule}
            onChange={e => setShowSchedule(e.target.checked)}
            className="rounded border-slate-300"
          />
          업무 일정 겹쳐보기
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <main className="space-y-4">
          <section className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <ListChecks size={17} className="text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{visibleTitle}</h2>
                  <p className="text-xs text-slate-400">미완료 {selectedDayActive.length} · 완료 {selectedDayDone.length}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-lg bg-slate-100 p-1">
                  {(['day', 'week', 'month'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === mode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {mode === 'day' ? '일' : mode === 'week' ? '주' : '월'}
                    </button>
                  ))}
                </div>
                <button onClick={() => move(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                  <ChevronLeft size={15} />
                </button>
                <button onClick={() => setSelectedDate(today)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  오늘
                </button>
                <button onClick={() => move(1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="p-5">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitTodo()}
                    placeholder="할 일을 입력하세요"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setImportant(v => !v)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${important ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                    title="중요 표시"
                  >
                    중요
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMemo(v => !v)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    메모추가
                  </button>
                  <button
                    type="button"
                    onClick={submitTodo}
                    disabled={!title.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Plus size={14} /> 할일 추가
                  </button>
                </div>
                {showMemo && (
                  <textarea
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    placeholder="필요한 경우 간단한 메모를 남기세요"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                    rows={2}
                  />
                )}
              </div>

              <div className="mt-5">
                {viewMode === 'day' && (
                  <DayList
                    date={selectedDate}
                    todos={selectedDayActive}
                    doneTodos={selectedDayDone}
                    scheduleEvents={showSchedule ? allScheduleEvents.filter(event => eventTouchesDate(event, selectedDate)) : []}
                    doneOpen={doneOpen}
                    setDoneOpen={setDoneOpen}
                  />
                )}
                {viewMode === 'week' && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
                    {weekDays.map(date => (
                      <DayColumn
                        key={date}
                        date={date}
                        selected={date === selectedDate}
                        todos={todos.filter(todo => todo.date === date)}
                        scheduleEvents={showSchedule ? allScheduleEvents.filter(event => eventTouchesDate(event, date)) : []}
                        onSelect={() => setSelectedDate(date)}
                      />
                    ))}
                  </div>
                )}
                {viewMode === 'month' && (
                  <div>
                    <div className="grid grid-cols-7 border-y border-slate-100 bg-slate-50 text-center text-xs font-semibold text-slate-400">
                      {WEEK_LABELS.map(day => <div key={day} className="py-2">{day}</div>)}
                    </div>
                    <div className="grid grid-cols-1 gap-2 pt-3 md:grid-cols-7">
                      {monthDays.map(date => (
                        <MonthCell
                          key={date}
                          date={date}
                          muted={!date.startsWith(currentMonth)}
                          selected={date === selectedDate}
                          todos={todos.filter(todo => todo.date === date)}
                          scheduleEvents={showSchedule ? allScheduleEvents.filter(event => eventTouchesDate(event, date)) : []}
                          onSelect={() => setSelectedDate(date)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>

        <aside className="rounded-xl border border-slate-100 bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Unfinished</h2>
            <p className="text-xs text-slate-400 mt-1">완료되지 않은 일 {activeTodos.length}개</p>
          </div>
          <div className="max-h-[720px] overflow-y-auto p-3">
            {activeTodos.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">미완료 할 일이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {activeTodos.map(todo => (
                  <TodoRow key={todo.id} todo={todo} compact />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function TodoRow({ todo, compact = false, showDate = true }: { todo: TodoItem; compact?: boolean; showDate?: boolean }) {
  const { dispatch } = useApp()
  const important = isImportantTodo(todo)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(todo.title)
  const [editDate, setEditDate] = useState(todo.date)
  const [editImportant, setEditImportant] = useState(important)
  const [editMemo, setEditMemo] = useState(todo.memo ?? '')

  const startEdit = () => {
    setEditTitle(todo.title)
    setEditDate(todo.date)
    setEditImportant(isImportantTodo(todo))
    setEditMemo(todo.memo ?? '')
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditTitle(todo.title)
    setEditDate(todo.date)
    setEditImportant(isImportantTodo(todo))
    setEditMemo(todo.memo ?? '')
    setEditing(false)
  }

  const saveEdit = () => {
    const trimmed = editTitle.trim()
    if (!trimmed) return
    dispatch({
      type: 'UPDATE_TODO',
      payload: {
        id: todo.id,
        title: trimmed,
        date: editDate,
        priority: editImportant ? 'important' : 'none',
        memo: editMemo.trim() || undefined,
      },
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className={`rounded-lg border px-3 py-2 ${editImportant ? 'border-red-100 bg-red-50/30' : 'border-slate-100 bg-white'}`}>
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="할 일을 입력하세요"
            />
            <input
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <textarea
            value={editMemo}
            onChange={e => setEditMemo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="메모"
            rows={compact ? 2 : 3}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setEditImportant(v => !v)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${editImportant ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              중요
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={saveEdit}
                disabled={!editTitle.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                저장
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'REMOVE_TODO', payload: todo.id })}
                className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${important ? 'border-red-100 bg-red-50/30' : 'border-slate-100 bg-white'}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_TODO', payload: todo.id })}
          className={`mt-0.5 shrink-0 rounded border ${todo.completed ? 'border-blue-300 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent hover:border-blue-400'}`}
          aria-label="완료"
        >
          <Check size={13} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {important && <ImportantDot />}
            <span className={`truncate text-sm font-medium ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{todo.title}</span>
          </div>
          {!compact && todo.memo && <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{todo.memo}</p>}
          {showDate && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <CalendarDays size={11} /> {formatKo(todo.date)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startEdit}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-50 hover:text-slate-600"
            aria-label="수정"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'REMOVE_TODO', payload: todo.id })}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
            aria-label="삭제"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function DayList({
  date,
  todos,
  doneTodos,
  scheduleEvents,
  doneOpen,
  setDoneOpen,
}: {
  date: string
  todos: TodoItem[]
  doneTodos: TodoItem[]
  scheduleEvents: ScheduleEvent[]
  doneOpen: boolean
  setDoneOpen: (open: boolean) => void
}) {
  return (
    <div className="space-y-3">
      {scheduleEvents.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Clock size={13} /> 업무 일정
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scheduleEvents.map(event => (
              <span key={event.id} className="rounded bg-white px-2 py-1 text-xs text-slate-600 border border-slate-200">
                {event.time ? `${event.time} ` : ''}{event.title}
              </span>
            ))}
          </div>
        </div>
      )}
      {todos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
          {formatKo(date)}에 등록된 미완료 할 일이 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {todos.map(todo => <TodoRow key={todo.id} todo={todo} showDate={false} />)}
        </div>
      )}
      <div className="rounded-xl border border-slate-100 bg-white">
        <button
          onClick={() => setDoneOpen(!doneOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-500"
        >
          <span>Done {doneTodos.length}</span>
          <span>{doneOpen ? '접기' : '펼치기'}</span>
        </button>
        {doneOpen && (
          <div className="space-y-2 border-t border-slate-100 p-3">
            {doneTodos.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">완료된 일이 없습니다</p>
            ) : doneTodos.map(todo => <TodoRow key={todo.id} todo={todo} showDate={false} compact />)}
          </div>
        )}
      </div>
    </div>
  )
}

function DayColumn({
  date,
  selected,
  todos,
  scheduleEvents,
  onSelect,
}: {
  date: string
  selected: boolean
  todos: TodoItem[]
  scheduleEvents: ScheduleEvent[]
  onSelect: () => void
}) {
  const active = todos.filter(todo => !todo.completed)
  const done = todos.filter(todo => todo.completed)
  const dateObj = new Date(`${date}T00:00:00`)
  return (
    <button
      onClick={onSelect}
      className={`flex min-h-52 flex-col items-stretch justify-start rounded-xl border p-3 text-left align-top transition-colors ${selected ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-400">{WEEK_LABELS[dateObj.getDay()]}</div>
          <div className="text-sm font-bold text-slate-700">{dateObj.getMonth() + 1}.{dateObj.getDate()}</div>
        </div>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{active.length}</span>
      </div>
      <div className="space-y-1.5">
        {active.slice(0, 4).map(todo => <MiniTodo key={todo.id} todo={todo} />)}
        {done.slice(0, 2).map(todo => <MiniTodo key={todo.id} todo={todo} />)}
        {scheduleEvents.slice(0, 2).map(event => <MiniSchedule key={event.id} event={event} />)}
        {active.length + done.length + scheduleEvents.length === 0 && <span className="text-xs text-slate-300">비어 있음</span>}
      </div>
    </button>
  )
}

function MonthCell({
  date,
  muted,
  selected,
  todos,
  scheduleEvents,
  onSelect,
}: {
  date: string
  muted: boolean
  selected: boolean
  todos: TodoItem[]
  scheduleEvents: ScheduleEvent[]
  onSelect: () => void
}) {
  const dateObj = new Date(`${date}T00:00:00`)
  return (
    <button
      onClick={onSelect}
      className={`flex min-h-32 flex-col items-stretch justify-start rounded-lg border p-2 text-left align-top transition-colors ${selected ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100 bg-white hover:bg-slate-50'} ${muted ? 'opacity-50' : ''}`}
    >
      <div className="mb-2 text-right text-xs font-semibold text-slate-400">{dateObj.getDate()}</div>
      <div className="space-y-1">
        {todos.slice(0, 4).map(todo => <MiniTodo key={todo.id} todo={todo} />)}
        {scheduleEvents.slice(0, 2).map(event => <MiniSchedule key={event.id} event={event} />)}
        {todos.length + scheduleEvents.length > 6 && <div className="text-[11px] text-slate-400">+{todos.length + scheduleEvents.length - 6}</div>}
      </div>
    </button>
  )
}

function MiniTodo({ todo }: { todo: TodoItem }) {
  const important = isImportantTodo(todo)
  return (
    <div className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] ${todo.completed ? 'bg-slate-50 text-slate-400 line-through' : 'bg-white text-slate-700 border border-slate-100'}`}>
      {important ? (
        <ImportantDot />
      ) : (
        <Circle size={8} className={todo.completed ? 'fill-slate-300 text-slate-300' : 'text-slate-300'} />
      )}
      <span className="truncate">{todo.title}</span>
    </div>
  )
}

function MiniSchedule({ event }: { event: ScheduleEvent }) {
  return (
    <div className="truncate rounded bg-slate-100 px-1.5 py-1 text-[11px] text-slate-500">
      업무 · {event.title}
    </div>
  )
}
