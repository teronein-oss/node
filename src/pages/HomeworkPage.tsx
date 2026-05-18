import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, Calendar, Trash2, RotateCcw, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { genId, getWeekStartForSession, getMonthSessions, getClassDate, formatDateKo, getMonthMWFSessions, getMWFClassDate, getWeekStartForMWFSession, fmtDate } from '../utils/helpers'
import type { HomeworkItem, HomeworkStatus } from '../types'

const HW_STATUS_OPTIONS: { value: HomeworkStatus; label: string; activeColor: string }[] = [
  { value: '제출',      label: '제출',      activeColor: 'text-green-700 bg-green-50 border-green-200' },
  { value: '미흡',      label: '미흡',      activeColor: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: '재확인완료', label: '재확인완료', activeColor: 'text-blue-600 bg-blue-50 border-blue-200' },
]

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

  // 선택된 반의 수업 날짜 목록
  const selectedCls = state.classes.find(c => c.id === selectedClass)
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

  const [newItemText, setNewItemText] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const gotoFirstRef = useRef(false)
  const newItemRef = useRef<HTMLInputElement>(null)

  const currentHw = state.homeworks.find(h => h.sessionNum === selectedSession && h.classId === selectedClass)

  const classStudents = useMemo(
    () => state.students
      .filter(s => s.classId === selectedClass && s.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [state.students, selectedClass]
  )

  // 반/월 변경 시 선택 날짜를 해당 반의 마지막 수업일로 동기화
  useEffect(() => {
    if (classDates.length === 0) return
    const valid = classDates.find(d => d.sessionNum === selectedSession)
    if (!valid) {
      setSelectedSession(gotoFirstRef.current ? classDates[0].sessionNum : classDates[classDates.length - 1].sessionNum)
      gotoFirstRef.current = false
    }
  }, [classDates])

  useEffect(() => {
    setConfirmClear(false)
    setNewItemText('')
  }, [selectedSession, selectedClass])

  const handleAddItem = () => {
    if (!newItemText.trim()) return
    const newItem: HomeworkItem = { id: genId(), text: newItemText.trim(), done: false }
    dispatch({
      type: 'SAVE_HOMEWORK',
      payload: {
        classId: selectedClass,
        sessionNum: selectedSession,
        weekStart: selectedCls?.days === 'mon-wed-fri'
          ? getWeekStartForMWFSession(selectedSession)
          : getWeekStartForSession(selectedSession),
        description: currentHw?.description ?? '',
        items: [...(currentHw?.items ?? []), newItem],
      },
    })
    setNewItemText('')
  }

  const handleRemoveItem = (itemId: string) => {
    if (!currentHw) return
    const updatedItems = (currentHw.items ?? []).filter(i => i.id !== itemId)
    if (updatedItems.length === 0 && !currentHw.description) {
      dispatch({ type: 'DELETE_HOMEWORK', payload: currentHw.id })
    } else {
      dispatch({
        type: 'SAVE_HOMEWORK',
        payload: {
          classId: currentHw.classId,
          sessionNum: currentHw.sessionNum,
          weekStart: currentHw.weekStart,
          description: currentHw.description,
          items: updatedItems,
        },
      })
    }
  }

  const getClassName = (classId: string) =>
    state.classes.find(c => c.id === classId)?.name ?? classId

  const dateIdx = classDates.findIndex(d => d.sessionNum === selectedSession)
  const currentEntry = classDates[dateIdx]
  const currentMonthIdx = availableMonths.findIndex(m => m.ym === selectedYM)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">숙제관리</h1>
        <p className="text-sm text-slate-500 mt-1">반·날짜별 숙제 내용 기록</p>
      </div>

      {/* 날짜 선택 + 숙제 입력 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
        {/* 월 + 날짜 선택 */}
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (dateIdx > 0) {
                  setSelectedSession(classDates[dateIdx - 1].sessionNum)
                } else if (currentMonthIdx < availableMonths.length - 1) {
                  setSelectedYM(availableMonths[currentMonthIdx + 1].ym)
                }
              }}
              disabled={dateIdx <= 0 && currentMonthIdx >= availableMonths.length - 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-base font-semibold text-slate-700 w-32 text-center">
              {currentEntry ? formatDateKo(currentEntry.date) : '-'}
            </span>
            <button
              onClick={() => {
                if (dateIdx < classDates.length - 1) {
                  setSelectedSession(classDates[dateIdx + 1].sessionNum)
                } else if (currentMonthIdx > 0) {
                  gotoFirstRef.current = true
                  setSelectedYM(availableMonths[currentMonthIdx - 1].ym)
                }
              }}
              disabled={dateIdx >= classDates.length - 1 && currentMonthIdx <= 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* 반 선택 탭 */}
        <div className="flex gap-1.5 flex-wrap">
          {state.classes.map(cls => (
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
              {state.homeworks.some(h => h.sessionNum === selectedSession && h.classId === cls.id && (h.description || (h.items && h.items.length > 0))) && (
                <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${selectedClass === cls.id ? 'bg-white/70' : 'bg-blue-400'}`} />
              )}
            </button>
          ))}
        </div>

        {/* 숙제 항목 */}
        <div className="space-y-1.5">
          {/* Legacy description (기존 텍스트 표시) */}
          {currentHw?.description && !(currentHw.items && currentHw.items.length > 0) && (
            <div className="text-sm text-slate-500 italic px-1 pb-1">{currentHw.description}</div>
          )}

          {/* 항목 목록 */}
          {(currentHw?.items ?? []).map(item => (
            <div key={item.id} className="flex items-center gap-2 group py-0.5 px-1">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => dispatch({ type: 'TOGGLE_HOMEWORK_ITEM', payload: { assignmentId: currentHw!.id, itemId: item.id } })}
                className="w-4 h-4 rounded accent-blue-500 cursor-pointer shrink-0"
              />
              <span className={`flex-1 text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                {item.text}
              </span>
              <button
                onClick={() => handleRemoveItem(item.id)}
                className="p-1 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {/* 항목 추가 입력 */}
          <div className="flex gap-2 pt-1">
            <input
              ref={newItemRef}
              type="text"
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem()}
              placeholder={`${getClassName(selectedClass)} 숙제 항목을 입력하세요...`}
              className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemText.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
            >
              <Plus size={15} />
              추가
            </button>
          </div>

          {/* 전체 삭제 */}
          {currentHw && (
            <div className="flex justify-end pt-1">
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">삭제할까요?</span>
                  <button
                    onClick={() => { dispatch({ type: 'DELETE_HOMEWORK', payload: currentHw.id }); setConfirmClear(false) }}
                    className="text-xs px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                  >
                    확인
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors"
                >
                  <RotateCcw size={12} />
                  전체 삭제
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 학생별 제출현황 */}
      {classStudents.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-700 text-sm mb-3">학생별 제출현황</h2>
          {currentHw?.items && currentHw.items.length > 0 ? (
            // 항목별 체크 모드
            <div className="space-y-4">
              {classStudents.map(student => {
                const grade = state.grades.find(g => g.studentId === student.id && g.sessionNum === selectedSession)
                const overallStatus = grade?.homeworkDone ?? null
                const isAbsent = overallStatus === '결석'
                return (
                  <div key={student.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-slate-700">{student.name}</span>
                      {overallStatus && !isAbsent && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${overallStatus === '제출' ? 'bg-green-50 text-green-700'
                          : overallStatus === '미흡' ? 'bg-orange-50 text-orange-600'
                          : 'bg-blue-50 text-blue-600'}`}>
                          {overallStatus}
                        </span>
                      )}
                      {!isAbsent && overallStatus !== '재확인완료' && (
                        <button
                          onClick={() => dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: student.id, sessionNum: selectedSession, status: '재확인완료' } })}
                          className="ml-auto text-xs text-blue-400 hover:text-blue-600 border border-blue-200 px-2 py-0.5 rounded-lg transition-colors"
                        >
                          재확인완료
                        </button>
                      )}
                      {!isAbsent && overallStatus === '재확인완료' && (
                        <button
                          onClick={() => dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: student.id, sessionNum: selectedSession, status: null } })}
                          className="ml-auto text-xs text-slate-300 hover:text-slate-500 transition-colors"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                    {isAbsent ? (
                      <span className="text-xs px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-400 border-slate-200">결석</span>
                    ) : (
                      <div className="space-y-1 pl-3 border-l-2 border-slate-100">
                        {currentHw.items!.map(item => {
                          const itemStatus = (item.studentStatuses ?? []).find(ss => ss.studentId === student.id)?.status ?? null
                          return (
                            <div key={item.id} className="flex items-center gap-2">
                              <span className="flex-1 text-sm text-slate-600 truncate">{item.text}</span>
                              <button
                                onClick={() => dispatch({ type: 'SET_ITEM_STUDENT_STATUS', payload: { assignmentId: currentHw!.id, itemId: item.id, studentId: student.id, status: itemStatus === '제출' ? null : '제출' } })}
                                className={`text-xs px-2.5 py-0.5 rounded-lg border font-medium transition-colors shrink-0
                                  ${itemStatus === '제출' ? 'text-green-700 bg-green-50 border-green-200' : 'text-slate-400 bg-white border-slate-200 hover:bg-slate-50'}`}
                              >
                                제출
                              </button>
                              <button
                                onClick={() => dispatch({ type: 'SET_ITEM_STUDENT_STATUS', payload: { assignmentId: currentHw!.id, itemId: item.id, studentId: student.id, status: itemStatus === '미흡' ? null : '미흡' } })}
                                className={`text-xs px-2.5 py-0.5 rounded-lg border font-medium transition-colors shrink-0
                                  ${itemStatus === '미흡' ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-slate-400 bg-white border-slate-200 hover:bg-slate-50'}`}
                              >
                                미흡
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            // 전체 상태 모드 (항목 없음)
            <div className="space-y-2">
              {classStudents.map(student => {
                const grade = state.grades.find(g => g.studentId === student.id && g.sessionNum === selectedSession)
                const status = grade?.homeworkDone ?? null
                const isAbsent = status === '결석'
                return (
                  <div key={student.id} className="flex items-center gap-3 min-h-[32px]">
                    <span className="w-20 text-sm font-medium text-slate-700 shrink-0">{student.name}</span>
                    {isAbsent ? (
                      <span className="text-xs px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-400 border-slate-200">결석</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {HW_STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value as string}
                            onClick={() => dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: student.id, sessionNum: selectedSession, status: opt.value } })}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors
                              ${status === opt.value ? opt.activeColor : 'text-slate-400 bg-white border-slate-200 hover:bg-slate-50'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        {status !== null && (
                          <button
                            onClick={() => dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: student.id, sessionNum: selectedSession, status: null } })}
                            className="text-xs px-2 py-1 text-slate-300 hover:text-slate-500 transition-colors"
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* 날짜별 숙제 현황 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <ClipboardList size={16} className="text-slate-400" />
          <h2 className="font-semibold text-slate-800">날짜별 숙제</h2>
          <span className="text-xs text-slate-400 ml-0.5">— {getClassName(selectedClass)}</span>
        </div>
        {classDates.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">이 달 수업 일정이 없습니다</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...classDates].reverse().map(({ date, sessionNum }) => {
              const hw = state.homeworks.find(h => h.sessionNum === sessionNum && h.classId === selectedClass)
              const isSelected = sessionNum === selectedSession
              const notGoodNames = hw ? state.grades
                .filter(g => g.sessionNum === sessionNum && g.homeworkDone === '미흡' &&
                  state.students.find(s => s.id === g.studentId)?.classId === selectedClass)
                .map(g => state.students.find(s => s.id === g.studentId)?.name)
                .filter(Boolean) : []
              return (
                <div
                  key={sessionNum}
                  className={`flex items-start gap-4 px-5 py-3 group transition-colors
                    ${isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
                >
                  {/* 날짜 */}
                  <div className="w-28 shrink-0 pt-0.5">
                    <span className={`text-sm font-medium ${isSelected ? 'text-blue-600' : 'text-slate-700'}`}>
                      {formatDateKo(date)}
                    </span>
                  </div>

                  {/* 숙제 내용 */}
                  <div className="flex-1 min-w-0">
                    {hw ? (
                      <>
                        {hw.items && hw.items.length > 0 ? (
                          <div className="space-y-0.5">
                            {hw.items.map(item => (
                              <div key={item.id} className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  onChange={() => dispatch({ type: 'TOGGLE_HOMEWORK_ITEM', payload: { assignmentId: hw.id, itemId: item.id } })}
                                  className="w-3.5 h-3.5 accent-blue-500 cursor-pointer shrink-0"
                                />
                                <span className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                                  {item.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : hw.description ? (
                          <span className="text-sm text-slate-600">{hw.description}</span>
                        ) : null}
                        {notGoodNames.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            <span className="text-xs text-orange-400 shrink-0">미흡</span>
                            {notGoodNames.map(name => (
                              <span key={name} className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full">{name}</span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-300">숙제 없음</span>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {hw ? (
                      <>
                        <button
                          onClick={() => {
                            setSelectedSession(sessionNum)
                            setTimeout(() => newItemRef.current?.focus(), 50)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="opacity-0 group-hover:opacity-100 text-xs px-2.5 py-1 text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-50 transition-all"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm('이 날짜 숙제를 삭제할까요?')) return
                            dispatch({ type: 'DELETE_HOMEWORK', payload: hw.id })
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedSession(sessionNum)
                          setTimeout(() => newItemRef.current?.focus(), 50)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Plus size={12} />
                        추가
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
