import { useState, useEffect, useMemo, useRef } from 'react'
import { Save, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Plus, Calendar, RotateCcw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { needsRetest, getWeekStartForSession, getMonthSessions, getClassDate, formatDateKo, getMonthMWFSessions, getMWFClassDate, getWeekStartForMWFSession, fmtDate } from '../utils/helpers'
import { Pencil, Trash2, X } from 'lucide-react'

interface GradeRow {
  studentId: string
  name: string
  vocabScore: string
  dailyScore: string
  extras: Record<string, string>
  attendance: '출석' | '결석'
}

export default function GradePage() {
  const { state, dispatch, getScope, selectedYM, setSelectedYM, selectedSession, setSelectedSession } = useApp()

  const today = new Date()
  const todayStr = fmtDate(today)
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentYM = `${currentYear}-${currentMonth}`

  const availableMonths = useMemo(() => {
    const ymSet = new Set<string>([currentYM])
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1)
      ymSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
    for (const g of state.grades) {
      const d = new Date(g.weekStart + 'T00:00:00')
      const thu = new Date(d); thu.setDate(d.getDate() + 3)
      ymSet.add(`${thu.getFullYear()}-${thu.getMonth() + 1}`)
    }
    return [...ymSet].sort().reverse().map(ym => {
      const [y, m] = ym.split('-').map(Number)
      return { ym, year: y, month: m, label: `${y}년 ${m}월` }
    })
  }, [state.grades, currentYM])

  const selectedMonthInfo = availableMonths.find(m => m.ym === selectedYM) ?? availableMonths[0]

  const monthSessions = useMemo(() => {
    if (!selectedMonthInfo) return []
    return getMonthSessions(selectedMonthInfo.year, selectedMonthInfo.month, 12)
  }, [selectedMonthInfo])

  const [selectedClass, setSelectedClass] = useState(() => {
    const dow = new Date().getDay()
    const todayDays = (dow === 1 || dow === 5) ? 'mon-fri' : (dow === 2 || dow === 4) ? 'tue-thu' : dow === 3 ? 'mon-wed-fri' : null
    const matched = todayDays ? state.classes.find(c => c.days === todayDays) : null
    return matched?.id ?? state.classes[0]?.id ?? ''
  })

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

  const [rows, setRows] = useState<GradeRow[]>([])
  const [saved, setSaved] = useState(false)
  const isDirtyRef = useRef(false)

  const [showAddCol, setShowAddCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editingColName, setEditingColName] = useState('')

  const [editingVocabName, setEditingVocabName] = useState(false)
  const [vocabNameStr, setVocabNameStr] = useState('')
  const [editingDailyName, setEditingDailyName] = useState(false)
  const [dailyNameStr, setDailyNameStr] = useState('')

  const [vocabRange, setVocabRange] = useState('')
  const [dailyRange, setDailyRange] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [retestDateSelections, setRetestDateSelections] = useState<Record<string, string>>({})

  const sessionConfig = state.sessionTestConfigs.find(
    c => c.sessionNum === selectedSession && c.classId === selectedClass
  ) ?? state.sessionTestConfigs.find(
    c => c.sessionNum === selectedSession && !c.classId
  )
  const vocabMode = sessionConfig?.vocabMode ?? state.vocabMode
  const vocabTotal = sessionConfig?.vocabTotal ?? state.vocabTotal
  const vocabThreshold = sessionConfig?.vocabThreshold ?? state.vocabThreshold
  const dailyMode = sessionConfig?.dailyMode ?? state.dailyMode
  const dailyTotal = sessionConfig?.dailyTotal ?? state.dailyTotal
  const dailyThreshold = sessionConfig?.dailyThreshold ?? state.dailyThreshold
  const vocabName = sessionConfig?.vocabName ?? '단어시험'
  const dailyName = sessionConfig?.dailyName ?? 'Daily Test'

  const [vocabThreshStr, setVocabThreshStr] = useState(vocabThreshold.toString())
  const [dailyThreshStr, setDailyThreshStr] = useState(dailyThreshold.toString())
  const [vocabTotalStr, setVocabTotalStr] = useState(vocabTotal.toString())
  const [dailyTotalStr, setDailyTotalStr] = useState(dailyTotal.toString())

  useEffect(() => {
    if (classDates.length === 0) return
    const valid = classDates.find(d => d.sessionNum === selectedSession)
    if (!valid) setSelectedSession(classDates[classDates.length - 1].sessionNum)
  }, [classDates])

  useEffect(() => {
    const scope = getScope(selectedSession, selectedClass)
    setVocabRange(scope?.vocabRange ?? '')
    setDailyRange(scope?.dailyRange ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, selectedClass])

  useEffect(() => {
    const cfg = state.sessionTestConfigs.find(
      c => c.sessionNum === selectedSession && c.classId === selectedClass
    ) ?? state.sessionTestConfigs.find(
      c => c.sessionNum === selectedSession && !c.classId
    )
    setVocabThreshStr((cfg?.vocabThreshold ?? state.vocabThreshold).toString())
    setDailyThreshStr((cfg?.dailyThreshold ?? state.dailyThreshold).toString())
    setVocabTotalStr((cfg?.vocabTotal ?? state.vocabTotal).toString())
    setDailyTotalStr((cfg?.dailyTotal ?? state.dailyTotal).toString())
    setEditingVocabName(false)
    setEditingDailyName(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, selectedClass])

  const saveScope = () => {
    dispatch({
      type: 'SAVE_SCOPE',
      payload: { classId: selectedClass, sessionNum: selectedSession, vocabRange: vocabRange.trim(), dailyRange: dailyRange.trim() },
    })
  }

  useEffect(() => {
    const students = state.students
      .filter(s => s.classId === selectedClass && s.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

    isDirtyRef.current = false
    const newRows = students.map(s => {
      const existing = state.grades.find(
        g => g.studentId === s.id && g.sessionNum === selectedSession
      )
      return {
        studentId: s.id,
        name: s.name,
        vocabScore: existing?.vocabScore?.toString() ?? '',
        dailyScore: existing?.dailyTestScore?.toString() ?? '',
        extras: Object.fromEntries(
          state.scoreColumns.map(col => [
            col.id,
            existing?.extras?.[col.id]?.toString() ?? '',
          ])
        ),
        attendance: (existing?.attendance === '결석' ? '결석' : '출석') as '출석' | '결석',
      }
    })
    setRows(newRows)
    setSaved(false)
    setConfirmClear(false)
    setRetestDateSelections({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSession, state.students, state.scoreColumns])

  const buildPayload = (currentRows: GradeRow[], sessionNum: number) => {
    const weekStart = selectedCls?.days === 'mon-wed-fri'
      ? getWeekStartForMWFSession(sessionNum)
      : getWeekStartForSession(sessionNum)
    return currentRows.map(r => ({
      studentId: r.studentId,
      sessionNum,
      weekStart,
      vocabScore: r.vocabScore !== '' ? Number(r.vocabScore) : null,
      dailyTestScore: r.dailyScore !== '' ? Number(r.dailyScore) : null,
      extras: Object.fromEntries(
        state.scoreColumns.map(col => [
          col.id,
          r.extras[col.id] !== '' ? Number(r.extras[col.id]) : null,
        ])
      ),
      homeworkDone: state.grades.find(g => g.studentId === r.studentId && g.sessionNum === sessionNum)?.homeworkDone ?? null,
      attendance: r.attendance === '결석' ? '결석' as const : null,
    }))
  }

  const handleSave = () => {
    dispatch({ type: 'SAVE_GRADES', payload: buildPayload(rows, selectedSession) })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  useEffect(() => {
    if (!isDirtyRef.current) return
    const timer = setTimeout(() => {
      if (!isDirtyRef.current) return
      dispatch({ type: 'SAVE_GRADES', payload: buildPayload(rows, selectedSession) })
      setSaved(true)
      isDirtyRef.current = false
      setTimeout(() => setSaved(false), 3000)
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const updateRow = (idx: number, field: keyof GradeRow, value: string) => {
    isDirtyRef.current = true
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
    setSaved(false)
  }

  const toggleAttendance = (idx: number) => {
    isDirtyRef.current = true
    setRows(prev => prev.map((r, i) =>
      i !== idx ? r : { ...r, attendance: r.attendance === '출석' ? '결석' : '출석' }
    ))
    setSaved(false)
  }

  const updateExtra = (idx: number, colId: string, value: string) => {
    isDirtyRef.current = true
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, extras: { ...r.extras, [colId]: value } } : r
    ))
    setSaved(false)
  }

  const handleAddCol = () => {
    if (!newColName.trim()) return
    dispatch({ type: 'ADD_SCORE_COLUMN', payload: { name: newColName.trim() } })
    setNewColName('')
    setShowAddCol(false)
  }

  const handleSaveColName = (id: string) => {
    if (editingColName.trim()) {
      dispatch({ type: 'UPDATE_SCORE_COLUMN', payload: { id, name: editingColName.trim() } })
    }
    setEditingColId(null)
    setEditingColName('')
  }

  const handleDeleteCol = (id: string) => {
    dispatch({ type: 'DELETE_SCORE_COLUMN', payload: id })
  }

  const handleRetestDateChange = (studentId: string, type: 'vocab' | 'daily', date: string, retestId?: string, originalScore?: number | null) => {
    const key = `${studentId}-${type}`
    setRetestDateSelections(prev => ({ ...prev, [key]: date }))
    if (retestId) {
      dispatch({ type: 'UPDATE_RETEST_DATE', payload: { id: retestId, retestDate: date || null } })
    } else if (date && originalScore != null) {
      // RetestRecord 없는 구 세션 → 날짜 포함해서 바로 생성
      dispatch({
        type: 'ADD_RETEST',
        payload: {
          studentId,
          sessionNum: selectedSession,
          type,
          originalScore,
          retestScore: null,
          passed: null,
          scheduledNote: '',
          retestDate: date,
        },
      })
    } else {
      const records = state.retests.filter(
        r => r.studentId === studentId && r.sessionNum === selectedSession && r.passed === null && r.type === type
      )
      for (const r of records) {
        dispatch({ type: 'UPDATE_RETEST_DATE', payload: { id: r.id, retestDate: date || null } })
      }
    }
  }

  const saveVocabName = (name: string) => {
    dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, vocabName: name.trim() || '단어시험' } })
    setEditingVocabName(false)
  }

  const saveDailyName = (name: string) => {
    dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, dailyName: name.trim() || 'Daily Test' } })
    setEditingDailyName(false)
  }

  const nextClassDate = useMemo(() => {
    if (!selectedCls) return ''
    return getClassDate(selectedSession + 1, selectedCls.days)
  }, [selectedSession, selectedCls])

  const retestDateOptions = useMemo(() => {
    const today = new Date()
    const opts = Array.from({ length: 8 }, (_, i) => {
      const opt = new Date(today)
      opt.setDate(today.getDate() + i)
      return fmtDate(opt)
    })
    if (nextClassDate && !opts.includes(nextClassDate)) {
      const insertIdx = opts.findIndex(d => d > nextClassDate)
      if (insertIdx === -1) opts.push(nextClassDate)
      else opts.splice(insertIdx, 0, nextClassDate)
    }
    return opts
  }, [nextClassDate])

  useEffect(() => {
    if (!nextClassDate) return
    for (const r of state.retests) {
      if (r.passed !== null || r.sessionNum !== selectedSession || r.retestDate) continue
      const key = `${r.studentId}-${r.type}`
      const dateToSet = retestDateSelections[key] ?? nextClassDate
      if (dateToSet) dispatch({ type: 'UPDATE_RETEST_DATE', payload: { id: r.id, retestDate: dateToSet } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.retests, selectedSession, nextClassDate])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">성적관리</h1>
        <p className="text-sm text-slate-500 mt-1">성적 입력</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        {/* 필터 바 */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
          {/* 월 선택 */}
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

          {/* 날짜 선택 */}
          {(() => {
            const dateIdx = classDates.findIndex(d => d.sessionNum === selectedSession)
            const currentEntry = classDates[dateIdx]
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => dateIdx > 0 && setSelectedSession(classDates[dateIdx - 1].sessionNum)}
                  disabled={dateIdx <= 0}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-slate-700 w-32 text-center">
                  {currentEntry ? formatDateKo(currentEntry.date) : '-'}
                </span>
                <button
                  onClick={() => dateIdx < classDates.length - 1 && setSelectedSession(classDates[dateIdx + 1].sessionNum)}
                  disabled={dateIdx >= classDates.length - 1}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )
          })()}

          <div className="w-px h-5 bg-slate-200" />

          {/* 반 선택 */}
          <div className="flex gap-1.5">
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
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {confirmClear ? (
              <>
                <span className="text-xs text-slate-500">이 날짜 성적을 모두 초기화?</span>
                <button
                  onClick={() => {
                    const studentIds = state.students
                      .filter(s => s.classId === selectedClass && s.active)
                      .map(s => s.id)
                    dispatch({ type: 'CLEAR_SESSION_GRADES', payload: { sessionNum: selectedSession, studentIds } })
                    setConfirmClear(false)
                    isDirtyRef.current = false
                  }}
                  className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  확인
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-slate-400 border border-slate-200 rounded-lg text-sm hover:text-red-500 hover:border-red-200 transition-colors"
                title="이 날짜 성적 초기화"
              >
                <RotateCcw size={14} />
                초기화
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {saved ? <CheckCircle size={16} /> : <Save size={16} />}
              {saved ? '저장됨' : '저장'}
            </button>
          </div>
        </div>

        {/* 범위 입력 */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <span className="text-xs text-slate-400 shrink-0">범위</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">단어</span>
            <input
              type="text"
              value={vocabRange}
              onChange={e => setVocabRange(e.target.value)}
              onBlur={saveScope}
              onKeyDown={e => e.key === 'Enter' && saveScope()}
              placeholder="예) Day 1~5"
              className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 w-36 bg-white"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">Daily Test</span>
            <input
              type="text"
              value={dailyRange}
              onChange={e => setDailyRange(e.target.value)}
              onBlur={saveScope}
              onKeyDown={e => e.key === 'Enter' && saveScope()}
              placeholder="예) Unit 1 p.12~15"
              className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 w-40 bg-white"
            />
          </div>
        </div>

        {/* 성적 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm break-words">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="text-left px-5 py-3 w-44">이름</th>

                {/* 단어시험 */}
                <th className="text-center px-4 py-3 min-w-[13rem]">
                  {editingVocabName ? (
                    <input
                      autoFocus
                      value={vocabNameStr}
                      onChange={e => setVocabNameStr(e.target.value)}
                      onBlur={() => saveVocabName(vocabNameStr)}
                      onKeyDown={e => e.key === 'Enter' && saveVocabName(vocabNameStr)}
                      className="w-20 text-center border border-blue-300 rounded px-1 py-0.5 text-xs outline-none bg-white text-slate-700"
                    />
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <span>{vocabName}</span>
                      <button
                        onClick={() => { setEditingVocabName(true); setVocabNameStr(vocabName) }}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                        title="이름 수정"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <button onClick={() => dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, vocabMode: '점수' } })}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${vocabMode === '점수' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>점수</button>
                    <span className="text-slate-300 text-xs">|</span>
                    <button onClick={() => dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, vocabMode: '개수' } })}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${vocabMode === '개수' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>개수</button>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-slate-400 font-normal mt-0.5 text-xs">
                    <span>총</span>
                    <input type="number" value={vocabTotalStr}
                      onChange={e => { setVocabTotalStr(e.target.value); const v = Number(e.target.value); if (v > 0) dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, vocabTotal: v } }) }}
                      onBlur={() => { if (!Number(vocabTotalStr)) setVocabTotalStr(vocabTotal.toString()) }}
                      className="w-10 text-center border-b border-slate-300 focus:border-blue-400 outline-none bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span>{vocabMode === '점수' ? '점' : '개'}</span>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-slate-400 font-normal mt-0.5 text-xs">
                    <input type="number" value={vocabThreshStr}
                      onChange={e => { setVocabThreshStr(e.target.value); const v = Number(e.target.value); if (v > 0 && v <= vocabTotal) dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, vocabThreshold: v } }) }}
                      onBlur={() => { if (!Number(vocabThreshStr)) setVocabThreshStr(vocabThreshold.toString()) }}
                      className="w-8 text-center border-b border-slate-300 focus:border-blue-400 outline-none bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span>이상 통과</span>
                  </div>
                </th>

                {/* Daily Test */}
                <th className="text-center px-4 py-3 min-w-[13rem]">
                  {editingDailyName ? (
                    <input
                      autoFocus
                      value={dailyNameStr}
                      onChange={e => setDailyNameStr(e.target.value)}
                      onBlur={() => saveDailyName(dailyNameStr)}
                      onKeyDown={e => e.key === 'Enter' && saveDailyName(dailyNameStr)}
                      className="w-20 text-center border border-blue-300 rounded px-1 py-0.5 text-xs outline-none bg-white text-slate-700"
                    />
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <span>{dailyName}</span>
                      <button
                        onClick={() => { setEditingDailyName(true); setDailyNameStr(dailyName) }}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                        title="이름 수정"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <button onClick={() => dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, dailyMode: '점수' } })}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${dailyMode === '점수' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>점수</button>
                    <span className="text-slate-300 text-xs">|</span>
                    <button onClick={() => dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, dailyMode: '개수' } })}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${dailyMode === '개수' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>개수</button>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-slate-400 font-normal mt-0.5 text-xs">
                    <span>총</span>
                    <input type="number" value={dailyTotalStr}
                      onChange={e => { setDailyTotalStr(e.target.value); const v = Number(e.target.value); if (v > 0) dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, dailyTotal: v } }) }}
                      onBlur={() => { if (!Number(dailyTotalStr)) setDailyTotalStr(dailyTotal.toString()) }}
                      className="w-10 text-center border-b border-slate-300 focus:border-blue-400 outline-none bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span>{dailyMode === '점수' ? '점' : '개'}</span>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-slate-400 font-normal mt-0.5 text-xs">
                    <input type="number" value={dailyThreshStr}
                      onChange={e => { setDailyThreshStr(e.target.value); const v = Number(e.target.value); if (v > 0 && v <= dailyTotal) dispatch({ type: 'SET_SESSION_TEST_CONFIG', payload: { sessionNum: selectedSession, classId: selectedClass, dailyThreshold: v } }) }}
                      onBlur={() => { if (!Number(dailyThreshStr)) setDailyThreshStr(dailyThreshold.toString()) }}
                      className="w-8 text-center border-b border-slate-300 focus:border-blue-400 outline-none bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span>이상 통과</span>
                  </div>
                </th>

                {/* 추가 항목 컬럼들 */}
                {state.scoreColumns.map(col => (
                  <th key={col.id} className="text-center px-4 py-3 w-28">
                    {editingColId === col.id ? (
                      <input
                        autoFocus
                        value={editingColName}
                        onChange={e => setEditingColName(e.target.value)}
                        onBlur={() => handleSaveColName(col.id)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveColName(col.id)}
                        className="w-20 text-center border border-blue-300 rounded px-1 py-0.5 text-xs outline-none bg-white text-slate-700"
                      />
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <span>{col.name}</span>
                        <button
                          onClick={() => { setEditingColId(col.id); setEditingColName(col.name) }}
                          className="text-slate-300 hover:text-blue-500 transition-colors"
                          title="이름 수정"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => handleDeleteCol(col.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                          title="항목 삭제"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </th>
                ))}

                {/* 상태 */}
                <th className="text-center px-4 py-3 w-28">상태</th>

                {/* 항목 추가 (마지막 컬럼) */}
                <th className="text-center px-4 py-3 w-32">
                  {showAddCol ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={newColName}
                        onChange={e => setNewColName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddCol()}
                        placeholder="항목 이름"
                        className="border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 w-20"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={handleAddCol}
                          disabled={!newColName.trim()}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                        >
                          추가
                        </button>
                        <button
                          onClick={() => { setShowAddCol(false); setNewColName('') }}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddCol(true)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors mx-auto"
                    >
                      <Plus size={13} />
                      항목 추가
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5 + state.scoreColumns.length} className="text-center py-10 text-slate-400">
                    이 반에 등록된 학생이 없습니다
                  </td>
                </tr>
              ) : rows.map((row, idx) => {
                const isAbsent = row.attendance === '결석'
                const vocabNum = row.vocabScore !== '' ? Number(row.vocabScore) : null
                const dailyNum = row.dailyScore !== '' ? Number(row.dailyScore) : null
                const isVocabRetest = !isAbsent && needsRetest(vocabNum, vocabThreshold)
                const isDailyRetest = !isAbsent && needsRetest(dailyNum, dailyThreshold)

                const studentRetests = state.retests.filter(
                  r => r.studentId === row.studentId && r.sessionNum === selectedSession
                )
                const vocabRetest = studentRetests.find(r => r.type === 'vocab' && r.passed === null)
                const dailyRetest = studentRetests.find(r => r.type === 'daily' && r.passed === null)
                const vocabRetestPassed = studentRetests.some(r => r.type === 'vocab' && r.passed === true)
                const dailyRetestPassed = studentRetests.some(r => r.type === 'daily' && r.passed === true)
                const hasPendingRetest = !isAbsent && (vocabRetest !== undefined || dailyRetest !== undefined)
                const allRetestsPassed = !isAbsent && studentRetests.length > 0 && studentRetests.every(r => r.passed === true)

                return (
                  <tr key={row.studentId} className={`hover:bg-slate-50 ${isAbsent ? 'bg-slate-100/60' : (isVocabRetest || isDailyRetest) ? 'bg-orange-50/40' : ''}`}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isAbsent ? 'bg-slate-200 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                          {row.name[0]}
                        </div>
                        <span className={`font-medium whitespace-nowrap ${isAbsent ? 'text-slate-400' : 'text-slate-800'}`}>{row.name}</span>
                        <button
                          onClick={() => toggleAttendance(idx)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors shrink-0 whitespace-nowrap
                            ${isAbsent
                              ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                            }`}
                        >
                          {isAbsent ? '결석' : '출석'}
                        </button>
                      </div>
                    </td>

                    {/* 단어시험 점수 + 재시험 날짜 */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 justify-center flex-wrap">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={vocabTotal}
                            value={row.vocabScore}
                            onChange={e => updateRow(idx, 'vocabScore', e.target.value)}
                            placeholder="-"
                            className={`w-14 text-center border rounded-lg py-1.5 text-sm outline-none focus:ring-2
                              ${needsRetest(vocabNum, vocabThreshold)
                                ? 'border-orange-300 focus:ring-orange-200 text-orange-600'
                                : 'border-slate-200 focus:ring-blue-200'
                              }`}
                          />
                          <span className="text-slate-300 text-xs shrink-0">/{vocabTotal}</span>
                          {needsRetest(vocabNum, vocabThreshold) && (
                            <AlertCircle size={14} className="text-orange-400 shrink-0" />
                          )}
                        </div>
                        {(isVocabRetest || vocabRetest) && !vocabRetestPassed && (
                          <select
                            value={retestDateSelections[`${row.studentId}-vocab`] ?? vocabRetest?.retestDate ?? nextClassDate}
                            onChange={e => handleRetestDateChange(row.studentId, 'vocab', e.target.value, vocabRetest?.id, vocabNum)}
                            className="border border-purple-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-purple-300 bg-white text-purple-700"
                          >
                            <option value="">날짜 선택</option>
                            {retestDateOptions.map(d => <option key={d} value={d}>{formatDateKo(d)}</option>)}
                          </select>
                        )}
                      </div>
                    </td>

                    {/* Daily Test 점수 + 재시험 날짜 */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 justify-center flex-wrap">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={dailyTotal}
                            value={row.dailyScore}
                            onChange={e => updateRow(idx, 'dailyScore', e.target.value)}
                            placeholder="-"
                            className={`w-14 text-center border rounded-lg py-1.5 text-sm outline-none focus:ring-2
                              ${needsRetest(dailyNum, dailyThreshold)
                                ? 'border-orange-300 focus:ring-orange-200 text-orange-600'
                                : 'border-slate-200 focus:ring-blue-200'
                              }`}
                          />
                          <span className="text-slate-300 text-xs shrink-0">/{dailyTotal}</span>
                          {needsRetest(dailyNum, dailyThreshold) && (
                            <AlertCircle size={14} className="text-orange-400 shrink-0" />
                          )}
                        </div>
                        {(isDailyRetest || dailyRetest) && !dailyRetestPassed && (
                          <select
                            value={retestDateSelections[`${row.studentId}-daily`] ?? dailyRetest?.retestDate ?? nextClassDate}
                            onChange={e => handleRetestDateChange(row.studentId, 'daily', e.target.value, dailyRetest?.id, dailyNum)}
                            className="border border-blue-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300 bg-white text-blue-700"
                          >
                            <option value="">날짜 선택</option>
                            {retestDateOptions.map(d => <option key={d} value={d}>{formatDateKo(d)}</option>)}
                          </select>
                        )}
                      </div>
                    </td>

                    {/* 추가 항목들 */}
                    {state.scoreColumns.map(col => (
                      <td key={col.id} className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.extras[col.id] ?? ''}
                          onChange={e => updateExtra(idx, col.id, e.target.value)}
                          placeholder="-"
                          className="w-16 text-center border border-slate-200 rounded-lg py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 mx-auto block"
                        />
                      </td>
                    ))}

                    {/* 상태 */}
                    <td className="px-4 py-2.5 text-center">
                      {isAbsent ? (
                        <span className="text-xs text-slate-400">-</span>
                      ) : hasPendingRetest ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-600 font-medium whitespace-nowrap">재시험 대상자</span>
                      ) : allRetestsPassed ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium whitespace-nowrap">재시험 완료</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-600 font-medium">완료</span>
                      )}
                    </td>

                    {/* 항목 추가 컬럼 빈 셀 */}
                    <td className="px-4 py-2.5"></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
          * {vocabName} {vocabThreshold}{vocabMode === '개수' ? '개' : '점'} 미만,
          {' '}{dailyName} {dailyThreshold}{dailyMode === '개수' ? '개' : '점'} 미만 입력 시 자동으로 재시험 대상에 추가됩니다
        </div>
      </div>
    </div>
  )
}
