import { useState, useEffect, useMemo, useRef } from 'react'
import { Save, CheckCircle, ClipboardList, AlertCircle, ChevronLeft, ChevronRight, Plus, Calendar, RotateCcw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { needsRetest, getWeekStartForSession, getMonthSessions, getClassDate, formatDateKo } from '../utils/helpers'
import type { HomeworkStatus } from '../types'
import { Pencil, Trash2, X } from 'lucide-react'

type Tab = 'input' | 'retest'

const HW_OPTIONS: { value: HomeworkStatus; label: string; color: string }[] = [
  { value: '제출',      label: '제출',      color: 'text-green-700 bg-green-50 border-green-200' },
  { value: '미제출',    label: '미제출',    color: 'text-red-600 bg-red-50 border-red-200' },
  { value: '미흡',      label: '미흡',      color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { value: '재확인완료', label: '재확인완료', color: 'text-blue-600 bg-blue-50 border-blue-200' },
]

interface GradeRow {
  studentId: string
  name: string
  vocabScore: string
  dailyScore: string
  extras: Record<string, string>
  homeworkDone: HomeworkStatus
  attendance: '출석' | '결석'
}

export default function GradePage() {
  const { state, dispatch, getScope, selectedYM, setSelectedYM, selectedSession, setSelectedSession } = useApp()
  const [tab, setTab] = useState<Tab>('input')

  // 현재 월
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentYM = `${currentYear}-${currentMonth}`

  // 성적 입력 탭 상태
  const availableMonths = useMemo(() => {
    const ymSet = new Set<string>([currentYM])
    // 최근 3개월 항상 포함
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1)
      ymSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
    for (const g of state.grades) {
      const ws = getWeekStartForSession(g.sessionNum)
      const d = new Date(ws + 'T00:00:00')
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

  const [selectedClass, setSelectedClass] = useState(state.classes[0]?.id ?? '')

  // 선택된 반의 수업 날짜 목록 (월/금 또는 화/목)
  const selectedCls = state.classes.find(c => c.id === selectedClass)
  const classDates = useMemo(() => {
    if (!selectedCls || !selectedMonthInfo) return []
    return monthSessions
      .map(sNum => ({ date: getClassDate(sNum, selectedCls.days), sessionNum: sNum }))
      .filter(({ date }) => {
        const [y, m] = date.split('-').map(Number)
        return y === selectedMonthInfo.year && m === selectedMonthInfo.month
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedCls, monthSessions, selectedMonthInfo])
  const [rows, setRows] = useState<GradeRow[]>([])
  const [saved, setSaved] = useState(false)
  const isDirtyRef = useRef(false)

  // 항목 추가 상태
  const [showAddCol, setShowAddCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editingColName, setEditingColName] = useState('')

  // 범위 입력 상태
  const [vocabRange, setVocabRange] = useState('')
  const [dailyRange, setDailyRange] = useState('')

  // 초기화 확인 상태
  const [confirmClear, setConfirmClear] = useState(false)

  // 재시험 처리 탭 상태
  const [retestClass, setRetestClass] = useState('all')
  const [retestPassed, setRetestPassed] = useState<Record<string, boolean>>({})
  const [retestSaveDone, setRetestSaveDone] = useState(false)

  // 반/월 변경 시 선택 날짜를 해당 반의 마지막 수업일로 동기화
  useEffect(() => {
    if (classDates.length === 0) return
    const valid = classDates.find(d => d.sessionNum === selectedSession)
    if (!valid) setSelectedSession(classDates[classDates.length - 1].sessionNum)
  }, [classDates])

  // 회차/반 변경 시 범위 불러오기
  useEffect(() => {
    const scope = getScope(selectedSession, selectedClass)
    setVocabRange(scope?.vocabRange ?? '')
    setDailyRange(scope?.dailyRange ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, selectedClass])

  const saveScope = () => {
    dispatch({
      type: 'SAVE_SCOPE',
      payload: { classId: selectedClass, sessionNum: selectedSession, vocabRange: vocabRange.trim(), dailyRange: dailyRange.trim() },
    })
  }

  // 클래스/회차/커스텀 항목 변경 시 rows 초기화
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
        homeworkDone: existing?.homeworkDone ?? '제출',
        attendance: (existing?.attendance === '결석' ? '결석' : '출석') as '출석' | '결석',
      }
    })
    setRows(newRows)
    setSaved(false)
    setConfirmClear(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSession, state.students, state.scoreColumns])

  const buildPayload = (currentRows: GradeRow[], sessionNum: number) => {
    const weekStart = getWeekStartForSession(sessionNum)
    return currentRows.map(r => ({
      studentId: r.studentId,
      sessionNum,
      weekStart,
      vocabScore: r.attendance === '결석' ? null : (r.vocabScore !== '' ? Number(r.vocabScore) : null),
      dailyTestScore: r.attendance === '결석' ? null : (r.dailyScore !== '' ? Number(r.dailyScore) : null),
      extras: Object.fromEntries(
        state.scoreColumns.map(col => [
          col.id,
          r.attendance === '결석' ? null : (r.extras[col.id] !== '' ? Number(r.extras[col.id]) : null),
        ])
      ),
      homeworkDone: r.homeworkDone,
      attendance: r.attendance === '결석' ? '결석' as const : null,
    }))
  }

  const handleSave = () => {
    dispatch({ type: 'SAVE_GRADES', payload: buildPayload(rows, selectedSession) })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // 800ms 디바운스 자동저장
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

  const updateRow = (idx: number, field: keyof GradeRow, value: string | HomeworkStatus) => {
    isDirtyRef.current = true
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
    setSaved(false)
  }

  const toggleAttendance = (idx: number) => {
    isDirtyRef.current = true
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      if (r.attendance === '출석') {
        return {
          ...r,
          attendance: '결석',
          vocabScore: '',
          dailyScore: '',
          extras: Object.fromEntries(Object.keys(r.extras).map(k => [k, ''])),
          homeworkDone: '결석',
        }
      } else {
        return { ...r, attendance: '출석', homeworkDone: '제출' }
      }
    }))
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

  // 재시험 대상 목록
  const pendingRetests = state.retests.filter(r => r.passed === null)
  const filteredRetests = retestClass === 'all'
    ? pendingRetests
    : pendingRetests.filter(r =>
        state.students.find(s => s.id === r.studentId)?.classId === retestClass
      )

  const getStudentName = (id: string) => state.students.find(s => s.id === id)?.name ?? ''
  const getClassName = (studentId: string) => {
    const cid = state.students.find(s => s.id === studentId)?.classId
    return state.classes.find(c => c.id === cid)?.name ?? ''
  }
  const getStudentClassDays = (studentId: string): 'mon-fri' | 'tue-thu' | 'wed-sat' => {
    const cid = state.students.find(s => s.id === studentId)?.classId
    return state.classes.find(c => c.id === cid)?.days ?? 'mon-fri'
  }

  const toggleRetestPassed = (id: string) => {
    setRetestPassed(prev => ({ ...prev, [id]: !prev[id] }))
    setRetestSaveDone(false)
  }

  const handleRetestBatchSave = () => {
    const toSave = filteredRetests.filter(r => retestPassed[r.id])
    if (toSave.length === 0) return
    for (const r of toSave) {
      dispatch({ type: 'SAVE_RETEST', payload: { id: r.id, retestScore: null, passed: true } })
    }
    setRetestPassed({})
    setRetestSaveDone(true)
    setTimeout(() => setRetestSaveDone(false), 2500)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">성적관리</h1>
        <p className="text-sm text-slate-500 mt-1">성적 입력 및 재시험 처리</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('input')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${tab === 'input' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <ClipboardList size={16} />
          성적 입력
        </button>
        <button
          onClick={() => setTab('retest')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${tab === 'retest' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <AlertCircle size={16} />
          재시험 처리
          {pendingRetests.length > 0 && (
            <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {pendingRetests.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── 성적 입력 탭 ─── */}
      {tab === 'input' && (
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

            {/* 항목 추가 */}
            {showAddCol ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCol()}
                  placeholder="항목 이름"
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 w-28"
                />
                <button
                  onClick={handleAddCol}
                  disabled={!newColName.trim()}
                  className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  추가
                </button>
                <button
                  onClick={() => { setShowAddCol(false); setNewColName('') }}
                  className="p-1.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddCol(true)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={13} />
                항목 추가
              </button>
            )}

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
                  <th className="text-left px-5 py-3 w-36">이름</th>
                  <th className="text-center px-4 py-3 w-28">
                    단어시험
                    <div className="flex items-center justify-center gap-0.5 text-slate-400 font-normal mt-0.5">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={state.vocabThreshold}
                        onChange={e => {
                          const v = Number(e.target.value)
                          if (v > 0 && v <= 100) dispatch({ type: 'SET_THRESHOLD', payload: { key: 'vocabThreshold', value: v } })
                        }}
                        className="w-8 text-center border-b border-slate-300 focus:border-blue-400 outline-none bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span>이상 통과</span>
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 w-28">
                    Daily Test
                    <div className="flex items-center justify-center gap-0.5 text-slate-400 font-normal mt-0.5">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={state.dailyThreshold}
                        onChange={e => {
                          const v = Number(e.target.value)
                          if (v > 0 && v <= 100) dispatch({ type: 'SET_THRESHOLD', payload: { key: 'dailyThreshold', value: v } })
                        }}
                        className="w-8 text-center border-b border-slate-300 focus:border-blue-400 outline-none bg-transparent text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span>이상 통과</span>
                    </div>
                  </th>
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
                  <th className="text-center px-4 py-3 w-24">숙제</th>
                  <th className="text-center px-4 py-3 w-20">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5 + state.scoreColumns.length} className="text-center py-10 text-slate-400">
                      이 반에 등록된 학생이 없습니다
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const isAbsent = row.attendance === '결석'
                    const vocabNum = row.vocabScore !== '' ? Number(row.vocabScore) : null
                    const dailyNum = row.dailyScore !== '' ? Number(row.dailyScore) : null
                    const isRetestNeeded = !isAbsent && (needsRetest(vocabNum, state.vocabThreshold) || needsRetest(dailyNum, state.dailyThreshold))

                    const studentRetests = state.retests.filter(
                      r => r.studentId === row.studentId && r.sessionNum === selectedSession
                    )
                    const allPassed = studentRetests.length > 0 && studentRetests.every(r => r.passed === true)
                    const anyFailed = studentRetests.some(r => r.passed === false)

                    return (
                      <tr key={row.studentId} className={`hover:bg-slate-50 ${isAbsent ? 'bg-slate-100/60' : isRetestNeeded && !allPassed ? 'bg-orange-50/40' : ''}`}>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isAbsent ? 'bg-slate-200 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                              {row.name[0]}
                            </div>
                            <span className={`font-medium ${isAbsent ? 'text-slate-400' : 'text-slate-800'}`}>{row.name}</span>
                            <button
                              onClick={() => toggleAttendance(idx)}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors
                                ${isAbsent
                                  ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                                  : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                                }`}
                            >
                              {isAbsent ? '결석' : '출석'}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {isAbsent ? (
                            <span className="block text-center text-xs text-slate-300">-</span>
                          ) : (
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={row.vocabScore}
                                onChange={e => updateRow(idx, 'vocabScore', e.target.value)}
                                placeholder="-"
                                className={`w-16 text-center border rounded-lg py-1.5 text-sm outline-none focus:ring-2
                                  ${needsRetest(vocabNum, state.vocabThreshold)
                                    ? 'border-orange-300 focus:ring-orange-200 text-orange-600'
                                    : 'border-slate-200 focus:ring-blue-200'
                                  }`}
                              />
                              {needsRetest(vocabNum, state.vocabThreshold) && (
                                <AlertCircle size={14} className="text-orange-400 shrink-0" />
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isAbsent ? (
                            <span className="block text-center text-xs text-slate-300">-</span>
                          ) : (
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={row.dailyScore}
                                onChange={e => updateRow(idx, 'dailyScore', e.target.value)}
                                placeholder="-"
                                className={`w-16 text-center border rounded-lg py-1.5 text-sm outline-none focus:ring-2
                                  ${needsRetest(dailyNum, state.dailyThreshold)
                                    ? 'border-orange-300 focus:ring-orange-200 text-orange-600'
                                    : 'border-slate-200 focus:ring-blue-200'
                                  }`}
                              />
                              {needsRetest(dailyNum, state.dailyThreshold) && (
                                <AlertCircle size={14} className="text-orange-400 shrink-0" />
                              )}
                            </div>
                          )}
                        </td>
                        {state.scoreColumns.map(col => (
                          <td key={col.id} className="px-4 py-2.5">
                            {isAbsent ? (
                              <span className="block text-center text-xs text-slate-300">-</span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={row.extras[col.id] ?? ''}
                                onChange={e => updateExtra(idx, col.id, e.target.value)}
                                placeholder="-"
                                className="w-16 text-center border border-slate-200 rounded-lg py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 mx-auto block"
                              />
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-center">
                          {isAbsent ? (
                            <span className="text-xs font-medium rounded-lg px-2.5 py-1.5 border bg-slate-50 text-slate-400 border-slate-200">결석</span>
                          ) : (
                            <button
                              onClick={() => {
                                const idx2 = HW_OPTIONS.findIndex(o => o.value === row.homeworkDone)
                                const next = HW_OPTIONS[(idx2 + 1) % HW_OPTIONS.length]
                                updateRow(idx, 'homeworkDone', next.value as HomeworkStatus)
                              }}
                              className={`text-xs font-medium rounded-lg px-2.5 py-1.5 border cursor-pointer transition-colors
                                ${HW_OPTIONS.find(o => o.value === row.homeworkDone)?.color ?? 'text-slate-500 bg-slate-50 border-slate-200'}`}
                            >
                              {HW_OPTIONS.find(o => o.value === row.homeworkDone)?.label ?? '제출'}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {isAbsent ? (
                            <span className="text-xs text-slate-400">결석</span>
                          ) : allPassed ? (
                            <span className="text-xs text-blue-600 font-medium">재시험 통과</span>
                          ) : anyFailed ? (
                            <span className="text-xs text-red-500 font-medium">재시험 불통과</span>
                          ) : isRetestNeeded ? (
                            <span className="text-xs text-orange-500 font-medium">재시험</span>
                          ) : (
                            <span className="text-xs text-green-500">정상</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
            * 단어시험·Daily Test 80점 미만 입력 시 자동으로 재시험 대상에 추가됩니다
          </div>
        </div>
      )}

      {/* ─── 재시험 처리 탭 ─── */}
      {tab === 'retest' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100">
          {/* 반 필터 + 저장 */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-slate-100">
            <span className="text-sm text-slate-500 mr-1">반 필터:</span>
            {[{ id: 'all', name: '전체' }, ...state.classes].map(cls => (
              <button
                key={cls.id}
                onClick={() => setRetestClass(cls.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${retestClass === cls.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                {cls.name}
              </button>
            ))}
            <button
              onClick={handleRetestBatchSave}
              disabled={!filteredRetests.some(r => retestPassed[r.id])}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {retestSaveDone ? <CheckCircle size={16} /> : <Save size={16} />}
              {retestSaveDone ? '저장됨' : '저장'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-5 py-3">이름</th>
                  <th className="text-center px-4 py-3">반</th>
                  <th className="text-center px-4 py-3">날짜</th>
                  <th className="text-left px-4 py-3">종류 / 범위</th>
                  <th className="text-center px-4 py-3">원점수</th>
                  <th className="text-center px-4 py-3">통과 여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRetests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      미처리 재시험이 없습니다
                    </td>
                  </tr>
                ) : (
                  filteredRetests.map(r => {
                    const passed = retestPassed[r.id] ?? false
                    return (
                      <tr key={r.id} className={`hover:bg-slate-50 ${passed ? 'bg-green-50/40' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 text-xs font-bold">
                              {getStudentName(r.studentId)[0]}
                            </div>
                            <span className="font-medium text-slate-800">{getStudentName(r.studentId)}</span>
                          </div>
                        </td>
                        <td className="text-center px-4 py-3 text-slate-500 text-xs">{getClassName(r.studentId)}</td>
                        <td className="text-center px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDateKo(getClassDate(r.sessionNum, getStudentClassDays(r.studentId)))}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0
                              ${r.type === 'vocab' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                              {r.type === 'vocab' ? '단어' : 'Daily'}
                            </span>
                            {(() => {
                              const studentClassId = state.students.find(s => s.id === r.studentId)?.classId ?? ''
                              const scope = getScope(r.sessionNum, studentClassId)
                              const range = r.type === 'vocab' ? scope?.vocabRange : scope?.dailyRange
                              return range ? (
                                <span className="text-xs text-slate-400 truncate">{range}</span>
                              ) : null
                            })()}
                          </div>
                        </td>
                        <td className="text-center px-4 py-3">
                          <span className="text-orange-600 font-medium">{r.originalScore}점</span>
                        </td>
                        <td className="text-center px-4 py-3">
                          <button
                            onClick={() => toggleRetestPassed(r.id)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors
                              ${passed
                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                              }`}
                          >
                            {passed ? '통과' : '미통과'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
