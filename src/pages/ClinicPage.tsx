import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, Stethoscope } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate, formatDateKo } from '../utils/helpers'

function buildCalDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const days: (Date | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month - 1, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

const REASON_COLORS: Record<string, string> = {
  '단어재시험':  'bg-purple-100 text-purple-700',
  'Daily재시험': 'bg-blue-100 text-blue-700',
  '숙제미흡':    'bg-orange-100 text-orange-700',
  '숙제미제출':  'bg-red-100 text-red-700',
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function ClinicPage() {
  const { state, dispatch } = useApp()
  const today = new Date()
  const todayStr = fmtDate(today)

  const [calYM, setCalYM] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [selectedClass, setSelectedClass] = useState('all')
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, { date: string; time: string }>>({})

  // 클리닉 필요 학생 계산 (재시험 미통과 + 숙제 미흡/미제출)
  const needsClinicMap = useMemo(() => {
    const map: Record<string, Set<string>> = {}

    for (const r of state.retests) {
      if (r.passed !== null) continue
      const s = state.students.find(st => st.id === r.studentId)
      if (!s?.active) continue
      if (!map[r.studentId]) map[r.studentId] = new Set()
      map[r.studentId].add(r.type === 'vocab' ? '단어재시험' : 'Daily재시험')
    }

    for (const hw of state.homeworks) {
      for (const item of hw.items ?? []) {
        for (const ss of item.studentStatuses ?? []) {
          if (ss.status !== '미흡' && ss.status !== '미제출') continue
          const s = state.students.find(st => st.id === ss.studentId)
          if (!s?.active) continue
          if (!map[ss.studentId]) map[ss.studentId] = new Set()
          map[ss.studentId].add(ss.status === '미흡' ? '숙제미흡' : '숙제미제출')
        }
      }
    }

    return map
  }, [state.retests, state.homeworks, state.students])

  const filteredStudents = useMemo(() =>
    Object.entries(needsClinicMap)
      .filter(([studentId]) => {
        const s = state.students.find(st => st.id === studentId)
        return selectedClass === 'all' || s?.classId === selectedClass
      })
      .map(([studentId, reasonSet]) => ({ studentId, reasons: [...reasonSet] }))
      .sort((a, b) => {
        const na = state.students.find(s => s.id === a.studentId)?.name ?? ''
        const nb = state.students.find(s => s.id === b.studentId)?.name ?? ''
        return na.localeCompare(nb, 'ko')
      }),
    [needsClinicMap, selectedClass, state.students]
  )

  const calDays = useMemo(() => buildCalDays(calYM.year, calYM.month), [calYM])

  const schedulesByDate = useMemo(() => {
    const map: Record<string, typeof state.clinicSchedules> = {}
    for (const s of state.clinicSchedules ?? []) {
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    }
    return map
  }, [state.clinicSchedules])

  const selectedDaySchedules = useMemo(() =>
    (schedulesByDate[selectedDate] ?? []).sort((a, b) => a.time.localeCompare(b.time)),
    [selectedDate, schedulesByDate]
  )

  const getStudent = (id: string) => state.students.find(s => s.id === id)
  const getClassName = (studentId: string) => {
    const classId = state.students.find(s => s.id === studentId)?.classId
    return state.classes.find(c => c.id === classId)?.name ?? ''
  }

  const handleAddSchedule = (studentId: string) => {
    const input = scheduleInputs[studentId]
    if (!input?.date || !input?.time) return
    dispatch({ type: 'ADD_CLINIC_SCHEDULE', payload: { studentId, date: input.date, time: input.time } })
    setScheduleInputs(prev => ({ ...prev, [studentId]: { date: '', time: '' } }))
    const [y, m] = input.date.split('-').map(Number)
    setCalYM({ year: y, month: m })
    setSelectedDate(input.date)
  }

  const prevMonth = () => setCalYM(({ year, month }) =>
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  )
  const nextMonth = () => setCalYM(({ year, month }) =>
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  )

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Stethoscope size={20} className="text-blue-600 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">보충/클리닉 일정</h1>
          <p className="text-sm text-slate-500 mt-0.5">재시험·숙제 미흡/미제출 학생 보충 일정 관리</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* ── 달력 (좌 2/3) ── */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-base font-bold text-slate-800">{calYM.year}년 {calYM.month}월</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
            {DOW.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium py-2
                ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-l border-slate-100">
            {calDays.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} className="min-h-[90px] border-r border-b border-slate-100" />
              const dateStr = fmtDate(date)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const daySchs = (schedulesByDate[dateStr] ?? []).sort((a, b) => a.time.localeCompare(b.time))
              const dow = date.getDay()
              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`min-h-[90px] p-1.5 border-r border-b border-slate-100 cursor-pointer transition-colors
                    ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1
                    ${isToday ? 'bg-slate-800 text-white'
                      : isSelected ? 'bg-blue-600 text-white'
                      : dow === 0 ? 'text-red-400'
                      : dow === 6 ? 'text-blue-400'
                      : 'text-slate-700'}`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {daySchs.slice(0, 3).map(sch => (
                      <div key={sch.id} className="text-xs truncate px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-medium leading-tight">
                        {sch.time} {getStudent(sch.studentId)?.name ?? '?'}
                      </div>
                    ))}
                    {daySchs.length > 3 && (
                      <div className="text-xs text-slate-400 px-0.5">+{daySchs.length - 3}명</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 우측 패널 ── */}
        <div className="space-y-4">

          {/* 클리닉 필요 학생 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">클리닉 필요 학생</h2>
              <p className="text-xs text-slate-400 mt-0.5">재시험 미통과 / 숙제 미흡·미제출</p>
            </div>

            <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-slate-100">
              {[{ id: 'all', name: '전체' }, ...state.classes].map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${selectedClass === cls.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {cls.name}
                </button>
              ))}
            </div>

            <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <p className="px-4 py-8 text-xs text-slate-400 text-center">클리닉 필요 학생이 없습니다</p>
              ) : filteredStudents.map(({ studentId, reasons }) => {
                const student = getStudent(studentId)
                const input = scheduleInputs[studentId] ?? { date: '', time: '' }
                return (
                  <div key={studentId} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{student?.name}</span>
                      <span className="text-xs text-slate-400">{getClassName(studentId)}</span>
                      {reasons.map(r => (
                        <span key={r} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${REASON_COLORS[r] ?? 'bg-slate-100 text-slate-600'}`}>
                          {r}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={input.date}
                        onChange={e => setScheduleInputs(prev => ({ ...prev, [studentId]: { ...input, date: e.target.value } }))}
                        className="flex-1 min-w-0 border border-slate-200 rounded-md px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <input
                        type="time"
                        value={input.time}
                        onChange={e => setScheduleInputs(prev => ({ ...prev, [studentId]: { ...input, time: e.target.value } }))}
                        className="w-[68px] border border-slate-200 rounded-md px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <button
                        onClick={() => handleAddSchedule(studentId)}
                        disabled={!input.date || !input.time}
                        className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 선택 날짜 일정 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">{formatDateKo(selectedDate)} 일정</h2>
              {selectedDaySchedules.length > 0 && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  {selectedDaySchedules.length}명
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {selectedDaySchedules.length === 0 ? (
                <p className="px-4 py-8 text-xs text-slate-400 text-center">예정된 일정이 없습니다</p>
              ) : selectedDaySchedules.map(sch => (
                <div key={sch.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 w-14 shrink-0">
                    <Clock size={12} className="shrink-0" />
                    {sch.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{getStudent(sch.studentId)?.name ?? '?'}</span>
                    <span className="text-xs text-slate-400 ml-2">{getClassName(sch.studentId)}</span>
                  </div>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_CLINIC_SCHEDULE', payload: sch.id })}
                    className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
