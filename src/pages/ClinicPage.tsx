import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Stethoscope } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate, formatDateKo, getClassDate } from '../utils/helpers'

function buildCalDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const days: (Date | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month - 1, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

interface DayEntry {
  kind: 'retest' | 'homework'
  key: string
  name: string
  className: string
  label: string
  color: string
  scheduledDate?: string
  retestId?: string
  studentId?: string
  assignmentIds?: string[]
}

export default function ClinicPage() {
  const { state, dispatch, loading } = useApp()
  const fixApplied = useRef(false)
  const today = new Date()
  const todayStr = fmtDate(today)

  useEffect(() => {
    if (loading || fixApplied.current) return
    fixApplied.current = true
    for (const r of state.retests) {
      if (r.passed !== null) continue
      const student = state.students.find(s => s.id === r.studentId)
      if (!student?.active) continue
      const cls = state.classes.find(c => c.id === student.classId)
      if (!cls) continue
      const validDows = cls.days === 'mon-fri' ? [1, 5]
        : cls.days === 'tue-thu' ? [2, 4]
        : cls.days === 'wed-sat' ? [3, 6]
        : [1, 3, 5]
      const correctDate = getClassDate(r.sessionNum + 1, cls.days)
      const retestDow = r.retestDate ? new Date(r.retestDate + 'T00:00:00').getDay() : null
      const hasInvalidDay = retestDow !== null && !validDows.includes(retestDow)
      if (!r.retestDate || hasInvalidDay) {
        dispatch({ type: 'UPDATE_RETEST_DATE', payload: { id: r.id, retestDate: correctDate } })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const [calYM, setCalYM] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [confirmingRetestId, setConfirmingRetestId] = useState<string | null>(null)

  const getStudent = (id: string) => state.students.find(s => s.id === id)
  const getClassName = (studentId: string) => {
    const classId = state.students.find(s => s.id === studentId)?.classId
    return state.classes.find(c => c.id === classId)?.name ?? ''
  }
  // 날짜별 방문 예정 (재시험 날짜 기준)
  const retestsByDate = useMemo(() => {
    const map: Record<string, typeof state.retests> = {}
    for (const r of state.retests) {
      if (!r.retestDate || r.passed !== null) continue
      if (!map[r.retestDate]) map[r.retestDate] = []
      map[r.retestDate].push(r)
    }
    return map
  }, [state.retests])

  // 날짜별 숙제 재확인 예정 (미흡/미제출 학생, recheckDate ?? 다음 수업일)
  const homeworkRechecksByDate = useMemo(() => {
    const acc: Record<string, Map<string, { status: '미흡' | '미제출'; assignmentIds: string[] }>> = {}
    for (const hw of state.homeworks) {
      const worst = new Map<string, '미흡' | '미제출'>()
      for (const item of hw.items ?? []) {
        for (const ss of item.studentStatuses ?? []) {
          if (ss.status === '미제출') worst.set(ss.studentId, '미제출')
          else if (ss.status === '미흡' && worst.get(ss.studentId) !== '미제출') worst.set(ss.studentId, '미흡')
        }
      }
      for (const [studentId, status] of worst) {
        const s = state.students.find(st => st.id === studentId)
        if (!s?.active) continue
        const cls = state.classes.find(c => c.id === s.classId)
        if (!cls) continue
        const date = hw.recheckDates?.find(rd => rd.studentId === studentId)?.date
          ?? getClassDate(hw.sessionNum + 2, cls.days)
        if (!acc[date]) acc[date] = new Map()
        const existing = acc[date].get(studentId)
        if (existing) {
          existing.assignmentIds.push(hw.id)
          if (status === '미제출') existing.status = '미제출'
        } else {
          acc[date].set(studentId, { status, assignmentIds: [hw.id] })
        }
      }
    }
    const map: Record<string, { studentId: string; status: '미흡' | '미제출'; assignmentIds: string[] }[]> = {}
    for (const [date, m] of Object.entries(acc)) {
      map[date] = [...m.entries()].map(([studentId, v]) => ({ studentId, ...v }))
    }
    return map
  }, [state.homeworks, state.students, state.classes])

  // 숙제 재확인 완료 처리 — 해당 학생의 미흡/미제출 항목을 재확인완료로
  const completeHomeworkRecheck = (studentId: string, assignmentIds: string[]) => {
    for (const aid of assignmentIds) {
      const hw = state.homeworks.find(h => h.id === aid)
      if (!hw) continue
      for (const item of hw.items ?? []) {
        const st = item.studentStatuses?.find(ss => ss.studentId === studentId)?.status
        if (st === '미흡' || st === '미제출') {
          dispatch({ type: 'SET_ITEM_STUDENT_STATUS', payload: { assignmentId: aid, itemId: item.id, studentId, status: '재확인완료' } })
        }
      }
    }
  }

  const completeEntryWithoutConfirm = (entry: DayEntry) => {
    if (entry.kind === 'retest' && entry.retestId) {
      dispatch({ type: 'SAVE_RETEST', payload: { id: entry.retestId, retestScore: null, passed: true } })
      setConfirmingRetestId(null)
      return
    }
    if (entry.kind === 'homework' && entry.studentId) {
      completeHomeworkRecheck(entry.studentId, entry.assignmentIds ?? [])
    }
  }

  const completeEntry = (entry: DayEntry) => {
    if (!confirm('완료 하겠습니까?')) return
    completeEntryWithoutConfirm(entry)
  }

  const completeAllOverdue = () => {
    if (overdueEntries.length === 0) return
    if (!confirm(`미완료 ${overdueEntries.length}건을 모두 완료 처리하겠습니까?`)) return
    overdueEntries.forEach(completeEntryWithoutConfirm)
  }

  const calDays = useMemo(() => buildCalDays(calYM.year, calYM.month), [calYM])

  // 선택 날짜 방문 예정 목록 (재시험)
  const selectedDayEntries = useMemo((): DayEntry[] => {
    const entries: DayEntry[] = []
    const dayRetests = retestsByDate[selectedDate] ?? []
    for (const r of dayRetests) {
      const s = getStudent(r.studentId)
      if (!s) continue
      entries.push({
        kind: 'retest',
        key: r.id,
        retestId: r.id,
        name: s.name,
        className: getClassName(r.studentId),
        label: r.type === 'vocab' ? '단어재시험' : 'Daily재시험',
        color: r.type === 'vocab' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700',
        scheduledDate: selectedDate,
      })
    }
    for (const e of homeworkRechecksByDate[selectedDate] ?? []) {
      const s = getStudent(e.studentId)
      if (!s) continue
      entries.push({
        kind: 'homework',
        key: `hw-${e.studentId}`,
        studentId: e.studentId,
        assignmentIds: e.assignmentIds,
        name: s.name,
        className: getClassName(e.studentId),
        label: e.status === '미제출' ? '숙제미제출' : '숙제미흡',
        color: e.status === '미제출' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700',
        scheduledDate: selectedDate,
      })
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, retestsByDate, homeworkRechecksByDate, state.students, state.classes])

  const prevMonth = () => setCalYM(({ year, month }) =>
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  )
  const nextMonth = () => setCalYM(({ year, month }) =>
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  )

  // 날짜가 지난 미완료 목록
  const overdueEntries = useMemo((): DayEntry[] => {
    const entries: DayEntry[] = []
    for (const [date, retests] of Object.entries(retestsByDate)) {
      if (date >= todayStr) continue
      for (const r of retests) {
        const s = getStudent(r.studentId)
        if (!s?.active) continue
        entries.push({
          kind: 'retest',
          key: `overdue-${r.id}`,
          retestId: r.id,
          name: s.name,
          className: getClassName(r.studentId),
          label: r.type === 'vocab' ? '단어재시험' : 'Daily재시험',
          color: r.type === 'vocab' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700',
          scheduledDate: date,
        })
      }
    }
    for (const [date, entriesForDate] of Object.entries(homeworkRechecksByDate)) {
      if (date >= todayStr) continue
      for (const e of entriesForDate) {
        const s = getStudent(e.studentId)
        if (!s?.active) continue
        entries.push({
          kind: 'homework',
          key: `overdue-hw-${date}-${e.studentId}`,
          studentId: e.studentId,
          assignmentIds: e.assignmentIds,
          name: s.name,
          className: getClassName(e.studentId),
          label: e.status === '미제출' ? '숙제미제출' : '숙제미흡',
          color: e.status === '미제출' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700',
          scheduledDate: date,
        })
      }
    }
    return entries.sort((a, b) =>
      (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') ||
      a.name.localeCompare(b.name, 'ko')
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retestsByDate, homeworkRechecksByDate, state.students, state.classes, todayStr])

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Stethoscope size={20} className="text-blue-600 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">보충/클리닉 일정</h1>
          <p className="text-sm text-slate-500 mt-0.5">재시험 날짜별 방문 예정 학생 관리</p>
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
              const dayChips = [
                ...(retestsByDate[dateStr] ?? []).map(r => ({
                  key: r.id,
                  name: getStudent(r.studentId)?.name ?? '?',
                  cls: r.type === 'vocab' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
                })),
                ...(homeworkRechecksByDate[dateStr] ?? []).map(e => ({
                  key: `hw-${e.studentId}`,
                  name: getStudent(e.studentId)?.name ?? '?',
                  cls: e.status === '미제출' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700',
                })),
              ].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
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
                    {dayChips.slice(0, 3).map(c => (
                      <div
                        key={c.key}
                        className={`text-xs truncate px-1 py-0.5 rounded font-medium leading-tight ${c.cls}`}
                      >
                        {c.name}
                      </div>
                    ))}
                    {dayChips.length > 3 && (
                      <div className="text-xs text-slate-400 px-0.5">+{dayChips.length - 3}명</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 우측 패널 ── */}
        <div className="space-y-4">

          {/* 선택 날짜 방문 예정 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">{formatDateKo(selectedDate)} 방문 예정</h2>
              {selectedDayEntries.length > 0 && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  {selectedDayEntries.length}명
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
              {selectedDayEntries.length === 0 ? (
                <p className="px-4 py-10 text-xs text-slate-400 text-center">방문 예정 학생이 없습니다</p>
              ) : selectedDayEntries.map((entry, idx) => (
                <div key={idx} className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                      {entry.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-800">{entry.name}</span>
                      <span className="text-xs text-slate-400 ml-1.5">{entry.className}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${entry.color}`}>
                      {entry.label}
                    </span>
                    {entry.kind === 'homework' ? (
                      <button
                        onClick={() => completeEntry(entry)}
                        className="text-xs px-2 py-1 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 font-medium shrink-0 transition-colors"
                      >
                        재확인 완료
                      </button>
                    ) : confirmingRetestId === entry.retestId ? null : (
                      <>
                        <button
                          onClick={() => setConfirmingRetestId(entry.retestId!)}
                          className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium shrink-0 transition-colors"
                        >
                          완료
                        </button>
                        <button
                          onClick={() => dispatch({ type: 'UPDATE_RETEST_DATE', payload: { id: entry.retestId!, retestDate: null } })}
                          className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 font-medium shrink-0 transition-colors"
                        >
                          미응시
                        </button>
                      </>
                    )}
                  </div>
                  {entry.kind === 'retest' && confirmingRetestId === entry.retestId && (
                    <div className="mt-2 flex items-center gap-2 pl-9">
                      <span className="text-xs text-slate-500">재시험 완료 처리할까요?</span>
                      <button
                        onClick={() => {
                          completeEntry(entry)
                        }}
                        className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setConfirmingRetestId(null)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 미완료 목록 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">미완료 목록</h2>
                <div className="flex items-center gap-1.5">
                  {overdueEntries.length > 0 && (
                    <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                      {overdueEntries.length}건
                    </span>
                  )}
                  <button
                    onClick={completeAllOverdue}
                    disabled={overdueEntries.length === 0}
                    className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium disabled:opacity-40 disabled:hover:bg-blue-50 transition-colors"
                  >
                    전체 완료
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">날짜가 지났지만 완료 처리되지 않은 항목</p>
            </div>
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {overdueEntries.length === 0 ? (
                <p className="px-4 py-8 text-xs text-slate-400 text-center">미완료 항목이 없습니다</p>
              ) : overdueEntries.map(entry => (
                <div key={entry.key} className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                      {entry.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{entry.name}</span>
                        <span className="text-xs text-slate-400">{entry.className}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${entry.color}`}>
                          {entry.label}
                        </span>
                        {entry.scheduledDate && (
                          <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                            {formatDateKo(entry.scheduledDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => completeEntry(entry)}
                      className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium shrink-0 transition-colors"
                    >
                      완료
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
