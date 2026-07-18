import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Calendar, Trash2, RotateCcw, Plus, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { genId, getWeekStart, getClassDate, formatDateKo, fmtDate } from '../utils/helpers'
import { buildMonthOptions, getClassDatesForMonth, getCurrentYM, getDefaultClassIdForToday } from '../utils/academic'
import type { HomeworkAssignment, HomeworkItem } from '../types'

export default function HomeworkPage() {
  const { state, dispatch, selectedYM, setSelectedYM, selectedSession, setSelectedSession } = useApp()

  const today = new Date()
  const todayStr = fmtDate(today)
  const currentYM = getCurrentYM(today)

  const [selectedClass, setSelectedClass] = useState(() => {
    return getDefaultClassIdForToday(state.classes, state.classes[0]?.id ?? '')
  })

  const availableMonths = useMemo(() => {
    return buildMonthOptions({ homeworks: state.homeworks, today })
  }, [state.homeworks, currentYM])

  const selectedMonthInfo = availableMonths.find(m => m.ym === selectedYM) ?? availableMonths[0]

  const selectedCls = state.classes.find(c => c.id === selectedClass)

  // 검사일(수업일) 목록 — 각 수업일에서 지난 회차 숙제를 검사한다
  const classDates = useMemo(() => {
    if (!selectedMonthInfo) return []
    return getClassDatesForMonth({
      classInfo: selectedCls,
      year: selectedMonthInfo.year,
      month: selectedMonthInfo.month,
      includeFuture: false,
      today,
    })
  }, [selectedCls, selectedMonthInfo])

  const classStudents = useMemo(
    () => state.students
      .filter(s => s.classId === selectedClass && s.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [state.students, selectedClass]
  )

  const prevDate = (sessionNum: number) =>
    getClassDate(sessionNum - 1, selectedCls?.days ?? 'mon-fri', selectedCls?.weekdays)

  // 재확인 기본 날짜 = 다음 수업일 (검사일 카드 회차 + 1)
  const nextClassDate = (sessionNum: number) =>
    getClassDate(sessionNum + 1, selectedCls?.days ?? 'mon-fri', selectedCls?.weekdays)

  // 드롭다운 옵션: 기준일부터 +6일 (7개)
  const dateRangeOptions = (baseDate: string) => {
    const base = new Date(baseDate + 'T00:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return fmtDate(d)
    })
  }

  // checkHw에서 미흡/미제출 학생 산출 — 재확인완료 제외, 학생별 최악 상태 기준
  const flaggedStudents = (checkHw: HomeworkAssignment) => {
    const statusRank: Record<string, number> = { '미제출': 3, '미흡': 2, '재확인완료': 1 }
    const worstMap = new Map<string, number>()
    for (const item of checkHw.items ?? []) {
      for (const ss of item.studentStatuses ?? []) {
        const rank = statusRank[ss.status] ?? 0
        if (rank > (worstMap.get(ss.studentId) ?? 0)) worstMap.set(ss.studentId, rank)
      }
    }
    return classStudents
      .filter(s => (worstMap.get(s.id) ?? 0) >= 2)
      .map(s => ({ student: s, status: (worstMap.get(s.id) === 3 ? '미제출' : '미흡') as '미흡' | '미제출' }))
  }

  // 검사일별 미제출/미흡 현황 (재확인완료 제외)
  const summary = useMemo(() => {
    const studentName = (id: string) => classStudents.find(s => s.id === id)?.name ?? '?'
    return classDates.map(({ date, sessionNum }) => {
      const checkHw = state.homeworks.find(h => h.sessionNum === sessionNum - 1 && h.classId === selectedClass)
      const entries: { studentId: string; studentName: string; itemId: string; itemText: string; status: '미흡' | '미제출'; assignmentId: string }[] = []
      let resolvedCount = 0
      for (const item of checkHw?.items ?? []) {
        for (const ss of item.studentStatuses ?? []) {
          if (!classStudents.some(s => s.id === ss.studentId)) continue
          if (ss.status === '재확인완료') resolvedCount++
          else if (ss.status === '미흡' || ss.status === '미제출') {
            entries.push({ studentId: ss.studentId, studentName: studentName(ss.studentId), itemId: item.id, itemText: item.text, status: ss.status, assignmentId: checkHw!.id })
          }
        }
      }
      return { date, sessionNum, assignDate: prevDate(sessionNum), entries, resolvedCount }
    }).filter(g => g.entries.length > 0)
  }, [classDates, state.homeworks, selectedClass, classStudents])

  const outstandingTotal = summary.reduce((n, g) => n + g.entries.length, 0)

  // 아코디언 상태
  const [newItemTexts, setNewItemTexts] = useState<Record<number, string>>({})
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemText, setEditingItemText] = useState('')
  const [confirmClearSession, setConfirmClearSession] = useState<number | null>(null)
  const [showSummary, setShowSummary] = useState(true)

  // 반/월 변경 시 편집 상태 초기화
  useEffect(() => {
    setEditingItemId(null)
    setEditingItemText('')
    setNewItemTexts({})
    setConfirmClearSession(null)
  }, [selectedClass, selectedYM])

  useEffect(() => {
    if (classDates.length === 0) return
    if (classDates.some(d => d.sessionNum === selectedSession)) return
    setSelectedSession(classDates[classDates.length - 1].sessionNum)
  }, [classDates, selectedSession, setSelectedSession])

  const handleAddItem = (sessionNum: number) => {
    const text = (newItemTexts[sessionNum] ?? '').trim()
    if (!text) return
    const hw = state.homeworks.find(h => h.sessionNum === sessionNum && h.classId === selectedClass)
    const weekStart = getWeekStart(new Date(getClassDate(sessionNum, selectedCls?.days ?? 'mon-fri', selectedCls?.weekdays) + 'T00:00:00'))
    const newItem: HomeworkItem = { id: genId(), text, done: false }
    dispatch({
      type: 'SAVE_HOMEWORK',
      payload: {
        classId: selectedClass,
        sessionNum,
        weekStart,
        description: hw?.description ?? '',
        items: [...(hw?.items ?? []), newItem],
      },
    })
    setNewItemTexts(prev => ({ ...prev, [sessionNum]: '' }))
  }

  const handleRemoveItem = (hw: HomeworkAssignment, itemId: string) => {
    const updatedItems = (hw.items ?? []).filter(i => i.id !== itemId)
    if (updatedItems.length === 0 && !hw.description) {
      dispatch({ type: 'DELETE_HOMEWORK', payload: hw.id })
    } else {
      dispatch({
        type: 'SAVE_HOMEWORK',
        payload: {
          classId: hw.classId,
          sessionNum: hw.sessionNum,
          weekStart: hw.weekStart,
          description: hw.description,
          items: updatedItems,
        },
      })
    }
  }

  const handleSaveItemEdit = (hw: HomeworkAssignment, itemId: string) => {
    const trimmed = editingItemText.trim()
    if (trimmed) {
      dispatch({
        type: 'SAVE_HOMEWORK',
        payload: {
          classId: hw.classId,
          sessionNum: hw.sessionNum,
          weekStart: hw.weekStart,
          description: hw.description,
          items: (hw.items ?? []).map(item =>
            item.id === itemId ? { ...item, text: trimmed } : item
          ),
        },
      })
    }
    setEditingItemId(null)
    setEditingItemText('')
  }

  const getClassName = (classId: string) =>
    state.classes.find(c => c.id === classId)?.name ?? classId

  const selectedDateInfo = classDates.find(d => d.sessionNum === selectedSession) ?? classDates[classDates.length - 1]
  const selectedDate = selectedDateInfo?.date ?? todayStr
  const selectedSessionNum = selectedDateInfo?.sessionNum ?? selectedSession
  const selectedCheckHw = state.homeworks.find(h => h.sessionNum === selectedSessionNum - 1 && h.classId === selectedClass)
  const selectedAssignHw = state.homeworks.find(h => h.sessionNum === selectedSessionNum && h.classId === selectedClass)
  const selectedCheckItems = selectedCheckHw?.items ?? []
  const selectedAssignItems = selectedAssignHw?.items ?? []
  const selectedSummary = summary.find(group => group.sessionNum === selectedSessionNum)
  const selectedIssueEntries = selectedSummary?.entries ?? []
  const selectedFlaggedStudents = selectedCheckHw ? flaggedStudents(selectedCheckHw) : []
  const selectedIsToday = selectedDate === todayStr

  const markSelectedAllSubmitted = () => {
    if (!selectedCheckHw) return
    for (const item of selectedCheckItems) {
      for (const student of classStudents) {
        dispatch({
          type: 'SET_ITEM_STUDENT_STATUS',
          payload: { assignmentId: selectedCheckHw.id, itemId: item.id, studentId: student.id, status: null },
        })
      }
    }
  }

  // 지난 숙제 검사 — 학생별 제출 상태 그리드
  const renderCheckGrid = (checkHw: HomeworkAssignment, item: HomeworkItem, checkSession: number) => (
    <div className="ml-7 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
      {classStudents.map(student => {
        const checkGrade = state.grades.find(g => g.studentId === student.id && g.sessionNum === checkSession)
        const isAbsent = checkGrade?.attendance === '결석'
        const itemStatus = (item.studentStatuses ?? []).find(ss => ss.studentId === student.id)?.status ?? null
        // 아이템 상태 없이 grade.homeworkDone만 '미흡'인 기존 데이터
        const gradeHwMissed = itemStatus === null && checkGrade?.homeworkDone === '미흡'
        const displayStatus = itemStatus ?? (gradeHwMissed ? '미흡' : '제출')
        const showRecheck = itemStatus === '미흡' || itemStatus === '미제출' || itemStatus === '재확인완료' || gradeHwMissed
        const setStatus = (status: '제출' | '미흡' | '미제출' | '재확인완료' | null) =>
          dispatch({ type: 'SET_ITEM_STUDENT_STATUS', payload: { assignmentId: checkHw.id, itemId: item.id, studentId: student.id, status } })
        return (
          <div key={student.id} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 w-16 shrink-0">
              <span className="text-xs text-slate-600 truncate">{student.name}</span>
              {isAbsent && <span className="text-xs text-red-400 font-medium shrink-0">결석</span>}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setStatus(null)}
                className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors
                  ${displayStatus === '제출'
                    ? 'text-green-700 bg-green-50 border-green-200'
                    : 'text-slate-300 border-slate-200 hover:text-green-600 hover:border-green-300'}`}
              >
                제출
              </button>
              <button
                onClick={() => setStatus(itemStatus === '미흡' ? null : '미흡')}
                className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors
                  ${displayStatus === '미흡'
                    ? 'text-orange-600 bg-orange-50 border-orange-200'
                    : 'text-slate-300 border-slate-200 hover:text-orange-500 hover:border-orange-300'}`}
              >
                미흡
              </button>
              <button
                onClick={() => setStatus(itemStatus === '미제출' ? null : '미제출')}
                className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors
                  ${displayStatus === '미제출'
                    ? 'text-red-600 bg-red-50 border-red-200'
                    : 'text-slate-300 border-slate-200 hover:text-red-500 hover:border-red-300'}`}
              >
                미제출
              </button>
              {showRecheck && (
                <button
                  onClick={() => { if (itemStatus !== '재확인완료') setStatus('재확인완료') }}
                  className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors
                    ${itemStatus === '재확인완료'
                      ? 'text-blue-600 bg-blue-50 border-blue-200 cursor-default'
                      : 'text-slate-300 border-slate-200 hover:text-blue-500 hover:border-blue-300'}`}
                >
                  {itemStatus === '재확인완료' ? '재확인완료' : '재확인'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">숙제관리</h1>
        <p className="text-sm text-slate-500 mt-1">오늘 검사할 숙제와 새로 출제할 숙제를 한 화면에서 관리합니다</p>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-5 py-3.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-slate-400 shrink-0" />
          <select
            value={selectedYM}
            onChange={e => setSelectedYM(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            {availableMonths.map(m => (
              <option key={m.ym} value={m.ym}>
                {m.label}{m.ym === currentYM ? ' (현재)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200" />

        <div className="flex gap-1.5 flex-wrap">
          {state.classes.map(cls => {
            const hasHw = state.homeworks.some(h => h.classId === cls.id)
            return (
              <button
                key={cls.id}
                onClick={() => setSelectedClass(cls.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${selectedClass === cls.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                {cls.name}
                {hasHw && (
                  <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${selectedClass === cls.id ? 'bg-white/70' : 'bg-blue-400'}`} />
                )}
              </button>
            )
          })}
        </div>

        <span className="ml-auto text-xs text-slate-400">{getClassName(selectedClass)}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {classDates.map(({ date, sessionNum }) => {
            const checkHw = state.homeworks.find(h => h.sessionNum === sessionNum - 1 && h.classId === selectedClass)
            const assignHw = state.homeworks.find(h => h.sessionNum === sessionNum && h.classId === selectedClass)
            const issueCount = summary.find(group => group.sessionNum === sessionNum)?.entries.length ?? 0
            const isSelected = sessionNum === selectedSessionNum
            return (
              <button
                key={sessionNum}
                onClick={() => setSelectedSession(sessionNum)}
                className={`min-w-28 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{formatDateKo(date)}</span>
                  {date === todayStr && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">오늘</span>}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                  <span>검사 {checkHw?.items?.length ?? 0}</span>
                  <span>출제 {assignHw?.items?.length ?? 0}</span>
                  {issueCount > 0 && <span className="font-bold text-red-500">미확인 {issueCount}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {classDates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 py-20 text-center text-sm text-slate-400">
          이 달 수업 일정이 없습니다
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-800">오늘 검사</h2>
                    {selectedIsToday && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">오늘</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{formatDateKo(selectedDate)} 검사 · {formatDateKo(prevDate(selectedSessionNum))} 출제분</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedIssueEntries.length > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    미확인 {selectedIssueEntries.length}
                  </span>
                  {selectedCheckItems.length > 0 && (
                    <button
                      onClick={markSelectedAllSubmitted}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-emerald-200 hover:text-emerald-600"
                    >
                      전체 제출
                    </button>
                  )}
                </div>
              </div>

              <div className="px-5 py-5">
                {selectedCheckHw && selectedCheckItems.length > 0 ? (
                  <div className="space-y-5">
                    {selectedCheckItems.map((item, idx) => (
                      <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-400">{idx + 1}</span>
                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{item.text}</span>
                        </div>
                        {classStudents.length > 0 ? renderCheckGrid(selectedCheckHw, item, selectedSessionNum) : (
                          <p className="text-xs text-slate-400">등록된 학생이 없습니다</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
                    <p className="text-sm font-medium text-slate-400">지난 수업에 출제된 숙제가 없습니다</p>
                  </div>
                )}

                {selectedFlaggedStudents.length > 0 && selectedCheckHw && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">재확인 일정</span>
                      <span className="text-xs text-slate-400">미흡·미제출 학생 다시 확인할 날짜</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {selectedFlaggedStudents.map(({ student, status }) => {
                        const fallback = nextClassDate(selectedSessionNum)
                        const recheckDate = selectedCheckHw.recheckDates?.find(rd => rd.studentId === student.id)?.date ?? fallback
                        return (
                          <div key={student.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                            <span className="w-14 shrink-0 truncate text-sm font-semibold text-slate-700">{student.name}</span>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${status === '미제출' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>{status}</span>
                            <select
                              value={recheckDate}
                              onChange={e => dispatch({ type: 'SET_HOMEWORK_RECHECK_DATE', payload: { assignmentId: selectedCheckHw.id, studentId: student.id, date: e.target.value } })}
                              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-300"
                            >
                              {[...new Set([...dateRangeOptions(selectedDate), recheckDate])].sort().map(d => (
                                <option key={d} value={d}>{formatDateKo(d)}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-bold text-slate-800">오늘 출제</h2>
                <p className="mt-1 text-xs text-slate-400">다음 수업에 검사할 숙제를 입력합니다</p>
              </div>
              <div className="px-5 py-5">
                {selectedAssignItems.length > 0 ? (
                  <div className="space-y-2">
                    {selectedAssignItems.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 group">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs font-bold text-slate-400">{idx + 1}</span>
                        {editingItemId === item.id ? (
                          <>
                            <input
                              autoFocus
                              type="text"
                              value={editingItemText}
                              onChange={e => setEditingItemText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveItemEdit(selectedAssignHw!, item.id)
                                if (e.key === 'Escape') { setEditingItemId(null); setEditingItemText('') }
                              }}
                              className="min-w-0 flex-1 rounded-lg border border-blue-300 px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                            />
                            <button onClick={() => handleSaveItemEdit(selectedAssignHw!, item.id)} className="p-1 text-blue-500 hover:text-blue-700 shrink-0">
                              <Check size={14} />
                            </button>
                            <button onClick={() => { setEditingItemId(null); setEditingItemText('') }} className="p-1 text-slate-400 hover:text-slate-600 shrink-0">
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 text-sm text-slate-700">{item.text}</span>
                            <button
                              onClick={() => { setEditingItemId(item.id); setEditingItemText(item.text) }}
                              className="p-1 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleRemoveItem(selectedAssignHw!, item.id)}
                              className="p-1 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">아직 출제된 숙제가 없습니다</p>
                )}

                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={newItemTexts[selectedSessionNum] ?? ''}
                    onChange={e => setNewItemTexts(prev => ({ ...prev, [selectedSessionNum]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem(selectedSessionNum)}
                    placeholder="숙제 항목 추가..."
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    onClick={() => handleAddItem(selectedSessionNum)}
                    disabled={!(newItemTexts[selectedSessionNum] ?? '').trim()}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Plus size={14} />
                    추가
                  </button>
                </div>

                {selectedAssignHw && (
                  <div className="mt-2 flex justify-end">
                    {confirmClearSession === selectedSessionNum ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">삭제할까요?</span>
                        <button
                          onClick={() => { dispatch({ type: 'DELETE_HOMEWORK', payload: selectedAssignHw.id }); setConfirmClearSession(null) }}
                          className="rounded-md bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setConfirmClearSession(null)}
                          className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClearSession(selectedSessionNum)}
                        className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-red-400"
                      >
                        <RotateCcw size={11} />
                        출제분 전체 삭제
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <button
                onClick={() => setShowSummary(v => !v)}
                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className={outstandingTotal > 0 ? 'text-orange-500' : 'text-slate-300'} />
                  <span className="text-sm font-bold text-slate-800">미확인 학생</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${outstandingTotal > 0 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{outstandingTotal}</span>
                </div>
                {showSummary ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
              </button>
              {showSummary && (
                <div className="max-h-[420px] overflow-y-auto px-4 py-3">
                  {summary.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">미제출·미흡 학생이 없습니다</p>
                  ) : (
                    <div className="space-y-4">
                      {summary.map(group => (
                        <div key={group.sessionNum}>
                          <div className="mb-2 flex items-center gap-2">
                            <button
                              onClick={() => setSelectedSession(group.sessionNum)}
                              className="text-xs font-bold text-slate-600 hover:text-blue-600"
                            >
                              {formatDateKo(group.date)}
                            </button>
                            {group.resolvedCount > 0 && <span className="text-[11px] text-blue-500">완료 {group.resolvedCount}</span>}
                          </div>
                          <div className="space-y-1.5">
                            {group.entries.map(e => (
                              <div key={`${e.itemId}-${e.studentId}`} className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{e.studentName}</span>
                                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${e.status === '미제출' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>{e.status}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{e.itemText}</span>
                                  <button
                                    onClick={() => dispatch({ type: 'SET_ITEM_STUDENT_STATUS', payload: { assignmentId: e.assignmentId, itemId: e.itemId, studentId: e.studentId, status: '재확인완료' } })}
                                    className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-500"
                                  >
                                    완료
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

    </div>
  )
}
