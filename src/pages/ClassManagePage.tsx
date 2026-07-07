import { useMemo, useState } from 'react'
import { BookOpenCheck, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { Class, WeekdayKey, WeeklyFrequency } from '../types'
import { getClassDaysLabel, normalizeClassWeekdays } from '../utils/helpers'

const WEEKDAY_OPTIONS: { value: WeekdayKey; label: string }[] = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
]

const FREQUENCY_OPTIONS: WeeklyFrequency[] = [1, 2, 3]

function buildDays(weekdays: WeekdayKey[]) {
  const order = WEEKDAY_OPTIONS.map(day => day.value)
  return [...weekdays].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('-')
}

function pickDefaultWeekdays(frequency: WeeklyFrequency): WeekdayKey[] {
  if (frequency === 1) return ['mon']
  if (frequency === 2) return ['mon', 'fri']
  return ['mon', 'wed', 'fri']
}

function syncWeekdaysToFrequency(current: WeekdayKey[], frequency: WeeklyFrequency) {
  const unique = current.filter((day, idx) => current.indexOf(day) === idx)
  if (unique.length === frequency) return unique
  if (unique.length > frequency) return unique.slice(0, frequency)
  const defaults = pickDefaultWeekdays(frequency)
  return [...unique, ...defaults.filter(day => !unique.includes(day))].slice(0, frequency)
}

export default function ClassManagePage() {
  const { state, dispatch } = useApp()
  const [newName, setNewName] = useState('')
  const [newFrequency, setNewFrequency] = useState<WeeklyFrequency>(2)
  const [newWeekdays, setNewWeekdays] = useState<WeekdayKey[]>(pickDefaultWeekdays(2))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingFrequency, setEditingFrequency] = useState<WeeklyFrequency>(2)
  const [editingWeekdays, setEditingWeekdays] = useState<WeekdayKey[]>(pickDefaultWeekdays(2))

  const studentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    state.students.filter(student => student.active).forEach(student => {
      counts.set(student.classId, (counts.get(student.classId) ?? 0) + 1)
    })
    return counts
  }, [state.students])

  const toggleDay = (
    day: WeekdayKey,
    selected: WeekdayKey[],
    frequency: WeeklyFrequency,
    setter: (days: WeekdayKey[]) => void
  ) => {
    if (selected.includes(day)) {
      if (selected.length === 1) return
      setter(selected.filter(value => value !== day))
      return
    }
    if (selected.length >= frequency) return
    setter(syncWeekdaysToFrequency([...selected, day], frequency))
  }

  const changeNewFrequency = (frequency: WeeklyFrequency) => {
    setNewFrequency(frequency)
    setNewWeekdays(days => syncWeekdaysToFrequency(days, frequency))
  }

  const changeEditingFrequency = (frequency: WeeklyFrequency) => {
    setEditingFrequency(frequency)
    setEditingWeekdays(days => syncWeekdaysToFrequency(days, frequency))
  }

  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed || newWeekdays.length !== newFrequency) return
    dispatch({
      type: 'ADD_CLASS',
      payload: {
        name: trimmed,
        days: buildDays(newWeekdays),
        weeklyFrequency: newFrequency,
        weekdays: syncWeekdaysToFrequency(newWeekdays, newFrequency),
      },
    })
    setNewName('')
    setNewFrequency(2)
    setNewWeekdays(pickDefaultWeekdays(2))
  }

  const startEdit = (cls: Class) => {
    const weekdays = normalizeClassWeekdays(cls.days, cls.weekdays)
    const frequency = (cls.weeklyFrequency ?? Math.min(3, Math.max(1, weekdays.length))) as WeeklyFrequency
    setEditingId(cls.id)
    setEditingName(cls.name)
    setEditingFrequency(frequency)
    setEditingWeekdays(syncWeekdaysToFrequency(weekdays, frequency))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingFrequency(2)
    setEditingWeekdays(pickDefaultWeekdays(2))
  }

  const saveEdit = (cls: Class) => {
    const trimmed = editingName.trim()
    if (!trimmed || editingWeekdays.length !== editingFrequency) return
    dispatch({
      type: 'UPDATE_CLASS',
      payload: {
        ...cls,
        name: trimmed,
        days: buildDays(editingWeekdays),
        weeklyFrequency: editingFrequency,
        weekdays: syncWeekdaysToFrequency(editingWeekdays, editingFrequency),
      },
    })
    cancelEdit()
  }

  const deleteClass = (cls: Class) => {
    const count = studentCounts.get(cls.id) ?? 0
    const message = count > 0
      ? `"${cls.name}" 반을 삭제하면 소속 학생 ${count}명이 비활성화됩니다. 삭제하시겠습니까?`
      : `"${cls.name}" 반을 삭제하시겠습니까?`
    if (!confirm(message)) return
    dispatch({ type: 'DELETE_CLASS', payload: cls.id })
  }

  const renderFrequencyButtons = (
    value: WeeklyFrequency,
    onChange: (frequency: WeeklyFrequency) => void
  ) => (
    <div className="flex gap-2">
      {FREQUENCY_OPTIONS.map(frequency => (
        <button
          key={frequency}
          type="button"
          onClick={() => onChange(frequency)}
          className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors
            ${value === frequency
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}
        >
          주{frequency}회
        </button>
      ))}
    </div>
  )

  const renderWeekdayButtons = (
    selected: WeekdayKey[],
    frequency: WeeklyFrequency,
    setter: (days: WeekdayKey[]) => void
  ) => (
    <div className="flex flex-wrap gap-2">
      {WEEKDAY_OPTIONS.map(day => {
        const checked = selected.includes(day.value)
        const disabled = !checked && selected.length >= frequency
        return (
          <button
            key={day.value}
            type="button"
            disabled={disabled}
            onClick={() => toggleDay(day.value, selected, frequency, setter)}
            className={`w-10 h-10 rounded-full border text-sm font-bold transition-colors
              ${checked
                ? 'bg-slate-800 text-white border-slate-800'
                : disabled
                  ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
          >
            {day.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BookOpenCheck size={24} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-800">반관리</h1>
        </div>
        <p className="text-sm text-slate-500 mt-2">반별 주 회차와 수업 요일을 정하면 성적관리, 숙제관리, 학생관리, 대시보드의 회차 날짜가 같은 기준으로 연결됩니다.</p>
      </div>

      <section className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
        <h2 className="text-base font-bold text-slate-800 mb-4">새 반 생성</h2>
        <div className="grid grid-cols-1 xl:grid-cols-[220px_240px_1fr_auto] gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">반 이름</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="예: 청덕2 S1"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">주 회차</label>
            {renderFrequencyButtons(newFrequency, changeNewFrequency)}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">수업 요일</label>
            {renderWeekdayButtons(newWeekdays, newFrequency, setNewWeekdays)}
          </div>
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || newWeekdays.length !== newFrequency}
            className="h-10 inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
          >
            <Plus size={16} />
            생성
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">등록된 반</h2>
          <span className="text-xs text-slate-400">{state.classes.length}개</span>
        </div>
        {state.classes.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">등록된 반이 없습니다.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.classes.map(cls => {
              const isEditing = editingId === cls.id
              return (
                <div key={cls.id} className="p-5">
                  {isEditing ? (
                    <div className="grid grid-cols-1 xl:grid-cols-[220px_240px_1fr_auto] gap-4 items-end">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1.5 block">반 이름</label>
                        <input
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(cls)}
                          className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1.5 block">주 회차</label>
                        {renderFrequencyButtons(editingFrequency, changeEditingFrequency)}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1.5 block">수업 요일</label>
                        {renderWeekdayButtons(editingWeekdays, editingFrequency, setEditingWeekdays)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(cls)}
                          className="h-10 w-10 rounded-lg bg-blue-600 text-white inline-flex items-center justify-center hover:bg-blue-700"
                          aria-label="저장"
                        >
                          <Check size={17} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="h-10 w-10 rounded-lg bg-slate-100 text-slate-500 inline-flex items-center justify-center hover:bg-slate-200"
                          aria-label="취소"
                        >
                          <X size={17} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-800">{cls.name}</h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold">
                            {getClassDaysLabel(cls.days, cls.weekdays)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">학생 {studentCounts.get(cls.id) ?? 0}명</p>
                      </div>
                      <button
                        onClick={() => startEdit(cls)}
                        className="h-9 w-9 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center"
                        aria-label="반 수정"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => deleteClass(cls)}
                        className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"
                        aria-label="반 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
