import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, Save, CheckCircle, ClipboardList, Calendar, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getWeekStartForSession, getMonthSessions, getClassDate, formatDateKo, getMonthMWFSessions, getMWFClassDate, getWeekStartForMWFSession } from '../utils/helpers'

export default function HomeworkPage() {
  const { state, dispatch, selectedYM, setSelectedYM, selectedSession, setSelectedSession } = useApp()

  const today = new Date()
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
        .sort((a, b) => a.date.localeCompare(b.date))
    }
    return monthSessions
      .map(sNum => ({ date: getClassDate(sNum, selectedCls.days), sessionNum: sNum }))
      .filter(({ date }) => {
        const [y, m] = date.split('-').map(Number)
        return y === selectedMonthInfo.year && m === selectedMonthInfo.month
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedCls, monthSessions, selectedMonthInfo])

  const [description, setDescription] = useState('')
  const [saved, setSaved] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const gotoFirstRef = useRef(false)

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
    const hw = state.homeworks.find(h => h.sessionNum === selectedSession && h.classId === selectedClass)
    setDescription(hw?.description ?? '')
    setSaved(false)
    setConfirmClear(false)
  }, [selectedSession, selectedClass, state.homeworks])

  const handleSave = () => {
    if (!description.trim()) return
    dispatch({
      type: 'SAVE_HOMEWORK',
      payload: {
        classId: selectedClass,
        sessionNum: selectedSession,
        weekStart: selectedCls?.days === 'mon-wed-fri'
          ? getWeekStartForMWFSession(selectedSession)
          : getWeekStartForSession(selectedSession),
        description: description.trim(),
      },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const getClassName = (classId: string) =>
    state.classes.find(c => c.id === classId)?.name ?? classId

  const getClassDays = (classId: string) =>
    state.classes.find(c => c.id === classId)?.days ?? 'mon-fri'

  // 숙제 목록: 날짜 내림차순 정렬
  const allHomeworks = [...state.homeworks]
    .sort((a, b) => {
      const dateA = getClassDate(a.sessionNum, getClassDays(a.classId))
      const dateB = getClassDate(b.sessionNum, getClassDays(b.classId))
      return dateB.localeCompare(dateA) || a.classId.localeCompare(b.classId)
    })

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
              {state.homeworks.some(h => h.sessionNum === selectedSession && h.classId === cls.id && h.description) && (
                <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${selectedClass === cls.id ? 'bg-white/70' : 'bg-blue-400'}`} />
              )}
            </button>
          ))}
        </div>

        {/* 숙제 입력 */}
        <div className="flex gap-3">
          <input
            type="text"
            value={description}
            onChange={e => { setDescription(e.target.value); setSaved(false) }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder={`${getClassName(selectedClass)} 숙제 내용을 입력하세요...`}
            className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
          {confirmClear ? (
            <>
              <span className="self-center text-xs text-slate-500 shrink-0">삭제할까요?</span>
              <button
                onClick={() => {
                  const hw = state.homeworks.find(h => h.sessionNum === selectedSession && h.classId === selectedClass)
                  if (hw) dispatch({ type: 'DELETE_HOMEWORK', payload: hw.id })
                  setDescription('')
                  setConfirmClear(false)
                }}
                className="px-3 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors shrink-0"
              >
                확인
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors shrink-0"
              >
                취소
              </button>
            </>
          ) : (
            <>
              {state.homeworks.some(h => h.sessionNum === selectedSession && h.classId === selectedClass) && (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-slate-400 border border-slate-200 rounded-lg text-sm hover:text-red-500 hover:border-red-200 transition-colors shrink-0"
                  title="이 날짜 숙제 초기화"
                >
                  <RotateCcw size={14} />
                  초기화
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!description.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
              >
                {saved ? <CheckCircle size={15} /> : <Save size={15} />}
                {saved ? '저장됨' : '저장'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 숙제 목록 */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <ClipboardList size={16} className="text-slate-400" />
          <h2 className="font-semibold text-slate-800">숙제 목록</h2>
          <span className="ml-auto text-xs text-slate-400">{allHomeworks.length}건</span>
        </div>
        {allHomeworks.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">등록된 숙제가 없습니다</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50">
                <th className="text-left px-5 py-3 w-36">날짜</th>
                <th className="text-left px-4 py-3 w-32">반</th>
                <th className="text-left px-4 py-3">숙제 내용</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allHomeworks.map(hw => {
                const isSelected = hw.sessionNum === selectedSession && hw.classId === selectedClass
                const isDeleting = deletingId === hw.id
                const hwDate = getClassDate(hw.sessionNum, getClassDays(hw.classId))
                return (
                  <tr
                    key={hw.id}
                    className={`group ${isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-5 py-3 whitespace-nowrap font-medium text-slate-700">
                      {formatDateKo(hwDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {hw.classId ? getClassName(hw.classId) : '전체'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-700">{hw.description}</span>
                      {(() => {
                        if (!hw.classId) return null
                        const missing = state.grades
                          .filter(g =>
                            g.sessionNum === hw.sessionNum + 1 &&
                            g.homeworkDone === '미제출' &&
                            state.students.find(s => s.id === g.studentId)?.classId === hw.classId
                          )
                          .map(g => state.students.find(s => s.id === g.studentId)?.name)
                          .filter(Boolean)
                        if (missing.length === 0) return null
                        return (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            <span className="text-xs text-red-400 shrink-0">미제출</span>
                            {missing.map(name => (
                              <span key={name} className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">{name}</span>
                            ))}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isDeleting ? (
                        <div className="flex items-center gap-1.5 flex-nowrap">
                          <button
                            onClick={() => {
                              dispatch({ type: 'DELETE_HOMEWORK', payload: hw.id })
                              setDeletingId(null)
                              if (isSelected) setDescription('')
                            }}
                            className="text-xs px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                          >
                            삭제
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 justify-end">
                          <button
                            onClick={() => {
                              setSelectedSession(hw.sessionNum)
                              if (hw.classId) setSelectedClass(hw.classId)
                            }}
                            title="수정"
                            className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeletingId(hw.id)}
                            title="삭제"
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
