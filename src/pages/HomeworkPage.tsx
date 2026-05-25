import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Calendar, Trash2, RotateCcw, Plus, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { genId, getWeekStartForSession, getMonthSessions, getClassDate, formatDateKo, getMonthMWFSessions, getMWFClassDate, getWeekStartForMWFSession, fmtDate } from '../utils/helpers'
import type { HomeworkAssignment, HomeworkItem } from '../types'

export default function HomeworkPage() {
  const { state, dispatch, selectedYM, setSelectedYM, selectedSession, setSelectedSession } = useApp()

  const today = new Date()
  const todayStr = fmtDate(today)
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentYM = `${currentYear}-${currentMonth}`

  const [selectedClass, setSelectedClass] = useState(() => {
    const dow = new Date().getDay()
    const todayDays = (dow === 1 || dow === 5) ? 'mon-fri' : (dow === 2 || dow === 4) ? 'tue-thu' : dow === 3 ? 'mon-wed-fri' : null
    const matched = todayDays ? state.classes.find(c => c.days === todayDays) : null
    return matched?.id ?? state.classes[0]?.id ?? ''
  })

  const availableMonths = useMemo(() => {
    const ymSet = new Set<string>([currentYM])
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1)
      ymSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
    for (const hw of state.homeworks) {
      const d = new Date(hw.weekStart + 'T00:00:00')
      const thu = new Date(d); thu.setDate(d.getDate() + 3)
      ymSet.add(`${thu.getFullYear()}-${thu.getMonth() + 1}`)
    }
    return [...ymSet].sort().reverse().map(ym => {
      const [y, m] = ym.split('-').map(Number)
      return { ym, year: y, month: m, label: `${y}년 ${m}월` }
    })
  }, [state.homeworks, currentYM])

  const selectedMonthInfo = availableMonths.find(m => m.ym === selectedYM) ?? availableMonths[0]

  const monthSessions = useMemo(() => {
    if (!selectedMonthInfo) return []
    return getMonthSessions(selectedMonthInfo.year, selectedMonthInfo.month, 12)
  }, [selectedMonthInfo])

  const selectedCls = state.classes.find(c => c.id === selectedClass)

  // 검사일(수업일) 목록 — 각 수업일에서 지난 회차 숙제를 검사한다
  const classDates = useMemo(() => {
    if (!selectedCls || !selectedMonthInfo) return []
    if (selectedCls.days === 'mon-wed-fri') {
      return getMonthMWFSessions(selectedMonthInfo.year, selectedMonthInfo.month)
        .map(sNum => ({ date: getMWFClassDate(sNum), sessionNum: sNum }))
        .filter(({ date }) => date <= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
    }
    return monthSessions
      .map(sNum => ({ date: getClassDate(sNum, selectedCls.days), sessionNum: sNum }))
      .filter(({ date }) => {
        const [y, m] = date.split('-').map(Number)
        return y === selectedMonthInfo.year && m === selectedMonthInfo.month
      })
      .filter(({ date }) => date <= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedCls, monthSessions, selectedMonthInfo, todayStr])

  const classStudents = useMemo(
    () => state.students
      .filter(s => s.classId === selectedClass && s.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [state.students, selectedClass]
  )

  const prevDate = (sessionNum: number) =>
    selectedCls?.days === 'mon-wed-fri'
      ? getMWFClassDate(sessionNum - 1)
      : getClassDate(sessionNum - 1, selectedCls?.days ?? 'mon-fri')

  // 검사일별 미제출/미흡 현황 (재확인완료 제외)
  const summary = useMemo(() => {
    const studentName = (id: string) => classStudents.find(s => s.id === id)?.name ?? '?'
    return [...classDates].reverse().map(({ date, sessionNum }) => {
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
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(() => new Set([selectedSession]))
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

  const toggleSession = (sessionNum: number) => {
    setExpandedSessions(prev => {
      const next = new Set(prev)
      if (next.has(sessionNum)) next.delete(sessionNum)
      else next.add(sessionNum)
      return next
    })
    setSelectedSession(sessionNum)
  }

  const handleAddItem = (sessionNum: number) => {
    const text = (newItemTexts[sessionNum] ?? '').trim()
    if (!text) return
    const hw = state.homeworks.find(h => h.sessionNum === sessionNum && h.classId === selectedClass)
    const weekStart = selectedCls?.days === 'mon-wed-fri'
      ? getWeekStartForMWFSession(sessionNum)
      : getWeekStartForSession(sessionNum)
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

  // 지난 숙제 검사 — 학생별 제출 상태 그리드
  const renderCheckGrid = (checkHw: HomeworkAssignment, item: HomeworkItem, checkSession: number) => (
    <div className="ml-7 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
      {classStudents.map(student => {
        const checkGrade = state.grades.find(g => g.studentId === student.id && g.sessionNum === checkSession)
        const isAbsent = checkGrade?.attendance === '결석'
        const itemStatus = (item.studentStatuses ?? []).find(ss => ss.studentId === student.id)?.status ?? null
        const displayStatus = itemStatus ?? '제출'
        const showRecheck = itemStatus === '미흡' || itemStatus === '미제출' || itemStatus === '재확인완료'
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
                  ${itemStatus === '미흡'
                    ? 'text-orange-600 bg-orange-50 border-orange-200'
                    : 'text-slate-300 border-slate-200 hover:text-orange-500 hover:border-orange-300'}`}
              >
                미흡
              </button>
              <button
                onClick={() => setStatus(itemStatus === '미제출' ? null : '미제출')}
                className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors
                  ${itemStatus === '미제출'
                    ? 'text-red-600 bg-red-50 border-red-200'
                    : 'text-slate-300 border-slate-200 hover:text-red-500 hover:border-red-300'}`}
              >
                미제출
              </button>
              {showRecheck && (
                <button
                  onClick={() => setStatus(itemStatus === '재확인완료' ? null : '재확인완료')}
                  className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors
                    ${itemStatus === '재확인완료'
                      ? 'text-blue-600 bg-blue-50 border-blue-200'
                      : 'text-slate-300 border-slate-200 hover:text-blue-500 hover:border-blue-300'}`}
                >
                  재확인
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">숙제관리</h1>
        <p className="text-sm text-slate-500 mt-1">검사일 기준 숙제 검사·출제 및 미제출 현황</p>
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

      {/* 미제출 현황 요약 패널 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <button
          onClick={() => setShowSummary(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className={outstandingTotal > 0 ? 'text-orange-500' : 'text-slate-300'} />
            <span className="text-sm font-semibold text-slate-700">미제출 현황</span>
            {outstandingTotal > 0 ? (
              <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium">{outstandingTotal}건 미확인</span>
            ) : (
              <span className="text-xs text-slate-400">모두 확인됨</span>
            )}
          </div>
          {showSummary
            ? <ChevronUp size={15} className="text-slate-400 shrink-0" />
            : <ChevronDown size={15} className="text-slate-400 shrink-0" />
          }
        </button>
        {showSummary && (
          <div className="px-5 pb-4 border-t border-slate-100">
            {summary.length === 0 ? (
              <p className="text-center py-6 text-slate-400 text-sm">미제출·미흡 학생이 없습니다</p>
            ) : (
              <div className="space-y-4 pt-4">
                {summary.map(group => (
                  <div key={group.sessionNum}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-slate-700">{formatDateKo(group.date)} 검사</span>
                      <span className="text-xs text-slate-400">{formatDateKo(group.assignDate)} 출제분</span>
                      {group.resolvedCount > 0 && (
                        <span className="text-xs text-blue-500">· 재확인완료 {group.resolvedCount}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 ml-1">
                      {group.entries.map(e => (
                        <div key={`${e.itemId}-${e.studentId}`} className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-slate-700 w-14 shrink-0 truncate">{e.studentName}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${e.status === '미제출' ? 'text-red-600 bg-red-50' : 'text-orange-600 bg-orange-50'}`}>{e.status}</span>
                          <span className="text-xs text-slate-500 truncate flex-1">{e.itemText}</span>
                          <button
                            onClick={() => dispatch({ type: 'SET_ITEM_STUDENT_STATUS', payload: { assignmentId: e.assignmentId, itemId: e.itemId, studentId: e.studentId, status: '재확인완료' } })}
                            className="text-xs px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-300 font-medium shrink-0 transition-colors"
                          >
                            재확인완료
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 검사일별 아코디언 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 divide-y divide-slate-100 overflow-hidden">
        {classDates.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">이 달 수업 일정이 없습니다</p>
        ) : (
          [...classDates].reverse().map(({ date, sessionNum }) => {
            const checkHw = state.homeworks.find(h => h.sessionNum === sessionNum - 1 && h.classId === selectedClass)
            const assignHw = state.homeworks.find(h => h.sessionNum === sessionNum && h.classId === selectedClass)
            const checkItems = checkHw?.items ?? []
            const assignItems = assignHw?.items ?? []
            const isExpanded = expandedSessions.has(sessionNum)
            const isToday = date === todayStr

            return (
              <div key={sessionNum}>
                {/* 날짜 헤더 */}
                <button
                  onClick={() => toggleSession(sessionNum)}
                  className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left
                    ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
                      {formatDateKo(date)}
                    </span>
                    {isToday && (
                      <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full font-medium">오늘</span>
                    )}
                    {checkItems.length > 0 && (
                      <span className="text-xs text-slate-400">검사 {checkItems.length}</span>
                    )}
                    {assignItems.length > 0 && (
                      <span className="text-xs text-slate-400">출제 {assignItems.length}</span>
                    )}
                    {checkItems.length === 0 && assignItems.length === 0 && (
                      <span className="text-xs text-slate-300">숙제 없음</span>
                    )}
                  </div>
                  {isExpanded
                    ? <ChevronUp size={15} className="text-slate-400 shrink-0" />
                    : <ChevronDown size={15} className="text-slate-400 shrink-0" />
                  }
                </button>

                {/* 펼쳐진 내용 */}
                {isExpanded && (
                  <div className="border-t border-slate-100">

                    {/* 지난 숙제 검사 */}
                    <div className="px-5 py-4 bg-slate-50/40">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">지난 숙제 검사</span>
                        <span className="text-xs text-slate-400">{formatDateKo(prevDate(sessionNum))} 출제분</span>
                      </div>
                      {checkHw && checkItems.length > 0 ? (
                        <div className="space-y-5">
                          {checkItems.map((item, idx) => (
                            <div key={item.id}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold text-slate-400 w-5 shrink-0 text-right">{idx + 1}</span>
                                <span className="flex-1 text-sm font-semibold text-slate-700">{item.text}</span>
                              </div>
                              {classStudents.length > 0 && renderCheckGrid(checkHw, item, sessionNum)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">지난 수업에 출제된 숙제가 없습니다</p>
                      )}
                    </div>

                    {/* 오늘 출제 */}
                    <div className="px-5 py-4 border-t border-slate-100">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">오늘 출제</span>
                        <span className="text-xs text-slate-400">다음 수업에 검사</span>
                      </div>

                      {assignItems.length > 0 ? (
                        <div className="space-y-2">
                          {assignItems.map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-2 group">
                              <span className="text-xs font-bold text-slate-400 w-5 shrink-0 text-right">{idx + 1}</span>
                              {editingItemId === item.id ? (
                                <>
                                  <input
                                    autoFocus
                                    type="text"
                                    value={editingItemText}
                                    onChange={e => setEditingItemText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveItemEdit(assignHw!, item.id)
                                      if (e.key === 'Escape') { setEditingItemId(null); setEditingItemText('') }
                                    }}
                                    className="flex-1 border border-blue-300 rounded-lg px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                  />
                                  <button onClick={() => handleSaveItemEdit(assignHw!, item.id)} className="p-1 text-blue-500 hover:text-blue-700 shrink-0">
                                    <Check size={14} />
                                  </button>
                                  <button onClick={() => { setEditingItemId(null); setEditingItemText('') }} className="p-1 text-slate-400 hover:text-slate-600 shrink-0">
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                                  <button
                                    onClick={() => { setEditingItemId(item.id); setEditingItemText(item.text) }}
                                    className="p-1 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveItem(assignHw!, item.id)}
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
                        <p className="text-xs text-slate-400">항목을 추가해주세요</p>
                      )}

                      {/* 항목 추가 입력 */}
                      <div className="flex gap-2 mt-4">
                        <input
                          type="text"
                          value={newItemTexts[sessionNum] ?? ''}
                          onChange={e => setNewItemTexts(prev => ({ ...prev, [sessionNum]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddItem(sessionNum)}
                          placeholder="숙제 항목 추가..."
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />
                        <button
                          onClick={() => handleAddItem(sessionNum)}
                          disabled={!(newItemTexts[sessionNum] ?? '').trim()}
                          className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
                        >
                          <Plus size={14} />
                          추가
                        </button>
                      </div>

                      {/* 출제분 전체 삭제 */}
                      {assignHw && (
                        <div className="flex justify-end mt-2">
                          {confirmClearSession === sessionNum ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">삭제할까요?</span>
                              <button
                                onClick={() => { dispatch({ type: 'DELETE_HOMEWORK', payload: assignHw.id }); setConfirmClearSession(null) }}
                                className="text-xs px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                              >
                                확인
                              </button>
                              <button
                                onClick={() => setConfirmClearSession(null)}
                                className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmClearSession(sessionNum)}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <RotateCcw size={11} />
                              출제분 전체 삭제
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
