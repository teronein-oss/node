import { useState, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Save, X, BookMarked, ChevronLeft, ChevronRight,
  Calendar, CheckCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getMonthSessions, getWeekStartForSession, getClassDate, formatDateKo, getMonthMWFSessions, getMWFClassDate } from '../utils/helpers'

const SEMESTERS = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'] as const
type Semester = typeof SEMESTERS[number]
const SEMESTER_KEY = 'academy-selected-semester'

const EMPTY_INFO = { subject: '', examDate: '', examScope: '' }

export default function ExamPage() {
  const { state, dispatch, selectedYM, setSelectedYM } = useApp()

  const today = new Date()
  const currentYM = `${today.getFullYear()}-${today.getMonth() + 1}`

  // 학기 선택 — localStorage에서 복원
  const [selectedSemester, setSelectedSemester] = useState<Semester>(() => {
    const saved = localStorage.getItem(SEMESTER_KEY)
    return (SEMESTERS.includes(saved as Semester) ? saved : '1학기 중간') as Semester
  })
  const [semesterSaved, setSemesterSaved] = useState(false)

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    const dow = new Date().getDay()
    const todayDays = (dow === 1 || dow === 5) ? 'mon-fri' : (dow === 2 || dow === 4) ? 'tue-thu' : dow === 3 ? 'mon-wed-fri' : null
    const matched = todayDays ? state.classes.find(c => c.days === todayDays) : null
    return matched?.id ?? state.classes[0]?.id ?? ''
  })

  // 시험 정보 수정 폼
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState(EMPTY_INFO)

  // 진도 편집
  const [editingSession, setEditingSession] = useState<number | null>(null)
  const [progressForm, setProgressForm] = useState({ content: '', memo: '' })

  const availableMonths = useMemo(() => {
    const ymSet = new Set<string>([currentYM])
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      ymSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    ymSet.add(`${next.getFullYear()}-${next.getMonth() + 1}`)
    for (const p of (state.weeklyProgress ?? [])) {
      const ws = getWeekStartForSession(p.sessionNum)
      const d = new Date(ws + 'T00:00:00')
      const thu = new Date(d); thu.setDate(d.getDate() + 3)
      ymSet.add(`${thu.getFullYear()}-${thu.getMonth() + 1}`)
    }
    return [...ymSet].sort().map(ym => {
      const [y, m] = ym.split('-').map(Number)
      return { ym, year: y, month: m, label: `${y}년 ${m}월` }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.weeklyProgress, currentYM])

  const [year, month] = selectedYM.split('-').map(Number)
  const sessionNums = getMonthSessions(year, month, 12)
  const currentIdx = availableMonths.findIndex(m => m.ym === selectedYM)

  const selectedClass = state.classes.find(c => c.id === selectedClassId)

  // 선택된 반의 수업 날짜 목록 (월/금 또는 화/목)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const classDates = useMemo(() => {
    if (!selectedClass) return []
    if (selectedClass.days === 'mon-wed-fri') {
      return getMonthMWFSessions(year, month)
        .map(sNum => ({ date: getMWFClassDate(sNum), sessionNum: sNum }))
        .filter(({ date }) => date <= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
    }
    return sessionNums
      .map(sNum => ({ date: getClassDate(sNum, selectedClass.days), sessionNum: sNum }))
      .filter(({ date }) => {
        const [y, m] = date.split('-').map(Number)
        return y === year && m === month && date <= todayStr
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedClass, sessionNums, year, month, todayStr])

  const examInfo = (state.examInfo ?? []).find(
    e => e.classId === selectedClassId && e.semester === selectedSemester
  )
  const classProgress = (state.weeklyProgress ?? []).filter(p => p.classId === selectedClassId)
  const getProgress = (sessionNum: number) => classProgress.find(p => p.sessionNum === sessionNum)

  // 학기 저장
  const handleSaveSemester = () => {
    localStorage.setItem(SEMESTER_KEY, selectedSemester)
    setSemesterSaved(true)
    setTimeout(() => setSemesterSaved(false), 2000)
  }

  const handleSelectClass = (id: string) => {
    setSelectedClassId(id)
    setEditingInfo(false)
    setEditingSession(null)
  }
  const handleSelectSemester = (s: Semester) => {
    setSelectedSemester(s)
    setEditingInfo(false)
    setEditingSession(null)
    setSemesterSaved(false)
  }

  // ── 시험 정보 핸들러 ──
  const openEditInfo = () => {
    setInfoForm({
      subject: examInfo?.subject ?? '',
      examDate: examInfo?.examDate ?? '',
      examScope: examInfo?.examScope ?? '',
    })
    setEditingInfo(true)
  }

  const handleSaveInfo = () => {
    dispatch({
      type: 'SAVE_EXAM_INFO',
      payload: {
        classId: selectedClassId,
        semester: selectedSemester,
        ...infoForm,
        updatedAt: new Date().toISOString(),
      },
    })
    setEditingInfo(false)
  }

  // ── 진도 핸들러 ──
  const openEditProgress = (sessionNum: number) => {
    const existing = getProgress(sessionNum)
    setProgressForm({ content: existing?.content ?? '', memo: existing?.memo ?? '' })
    setEditingSession(sessionNum)
  }

  const handleSaveProgress = () => {
    if (editingSession === null || !selectedClassId) return
    if (!progressForm.content.trim()) {
      const existing = getProgress(editingSession)
      if (existing) dispatch({ type: 'DELETE_WEEKLY_PROGRESS', payload: existing.id })
    } else {
      dispatch({
        type: 'SAVE_WEEKLY_PROGRESS',
        payload: {
          classId: selectedClassId,
          sessionNum: editingSession,
          content: progressForm.content.trim(),
          memo: progressForm.memo.trim(),
        },
      })
    }
    setEditingSession(null)
  }

  const handleDeleteProgress = (sessionNum: number) => {
    const existing = getProgress(sessionNum)
    if (existing) dispatch({ type: 'DELETE_WEEKLY_PROGRESS', payload: existing.id })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">내신관리</h1>
        <p className="text-sm text-slate-500 mt-1">반별 시험범위 및 날짜별 진도 기록</p>
      </div>

      {/* 학기 선택 + 저장 버튼 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-slate-600 shrink-0">학기 선택</span>
        <div className="flex gap-2 flex-wrap">
          {SEMESTERS.map(s => (
            <button
              key={s}
              onClick={() => handleSelectSemester(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border
                ${selectedSemester === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={handleSaveSemester}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
            ${semesterSaved
              ? 'bg-green-50 text-green-600 border-green-200'
              : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}
        >
          {semesterSaved ? <CheckCircle size={13} /> : <Save size={13} />}
          {semesterSaved ? '저장됨' : '저장'}
        </button>
      </div>

      {/* 반 없음 */}
      {state.classes.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-16 text-center">
          <p className="text-slate-400 text-sm">등록된 반이 없습니다</p>
        </div>
      )}

      {state.classes.length > 0 && (
        <>
          {/* 반 탭 */}
          <div className="flex gap-2 flex-wrap">
            {state.classes.map(cls => (
              <button
                key={cls.id}
                onClick={() => handleSelectClass(cls.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                  ${selectedClassId === cls.id
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
                  }`}
              >
                {cls.name}
              </button>
            ))}
          </div>

          {selectedClass && (
            <>
              {/* 시험 정보 카드 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BookMarked size={16} className="text-blue-500" />
                    <h2 className="font-semibold text-slate-800">
                      {selectedClass.name} · {selectedSemester} 시험 정보
                    </h2>
                  </div>
                  {!editingInfo && (
                    <button
                      onClick={openEditInfo}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50"
                    >
                      <Pencil size={13} />{examInfo ? '수정' : '입력'}
                    </button>
                  )}
                </div>

                {editingInfo ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">과목</label>
                        <input
                          type="text"
                          value={infoForm.subject}
                          onChange={e => setInfoForm(f => ({ ...f, subject: e.target.value }))}
                          placeholder="예) 영어"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">시험일</label>
                        <input
                          type="date"
                          value={infoForm.examDate}
                          onChange={e => setInfoForm(f => ({ ...f, examDate: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">시험범위</label>
                      <textarea
                        value={infoForm.examScope}
                        onChange={e => setInfoForm(f => ({ ...f, examScope: e.target.value }))}
                        placeholder="예) 교과서 1~5단원, 워크북 p.10~45"
                        rows={3}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveInfo}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Save size={14} />저장
                      </button>
                      <button
                        onClick={() => setEditingInfo(false)}
                        className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : examInfo ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">반</p>
                        <p className="text-sm font-medium text-slate-800">{selectedClass.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">과목</p>
                        <p className="text-sm font-medium text-slate-800">{examInfo.subject || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">시험일</p>
                        <p className="text-sm font-medium text-slate-800">
                          {examInfo.examDate
                            ? (() => {
                                const [y, m, d] = examInfo.examDate.split('-').map(Number)
                                return `${y}년 ${m}월 ${d}일`
                              })()
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-2">시험범위</p>
                      {examInfo.examScope
                        ? <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg px-4 py-3">{examInfo.examScope}</p>
                        : <p className="text-sm text-slate-300">미입력</p>
                      }
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-300 mb-3">시험 정보가 없습니다</p>
                    <button
                      onClick={openEditInfo}
                      className="flex items-center gap-1.5 mx-auto text-sm text-blue-600 hover:underline"
                    >
                      <Plus size={14} />시험 정보 입력
                    </button>
                  </div>
                )}
              </div>

              {/* 날짜별 진도 */}
              <section className="bg-white rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
                  <div className="flex items-center gap-2 flex-1">
                    <Calendar size={15} className="text-slate-400" />
                    <h2 className="font-semibold text-slate-800">날짜별 진도 기록</h2>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => currentIdx > 0 && setSelectedYM(availableMonths[currentIdx - 1].ym)}
                      disabled={currentIdx <= 0}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <select
                      value={selectedYM}
                      onChange={e => setSelectedYM(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                    >
                      {availableMonths.map(m => (
                        <option key={m.ym} value={m.ym}>
                          {m.label}{m.ym === currentYM ? ' (현재)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => currentIdx < availableMonths.length - 1 && setSelectedYM(availableMonths[currentIdx + 1].ym)}
                      disabled={currentIdx >= availableMonths.length - 1}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 bg-slate-50">
                      <th className="text-left px-5 py-3 w-36">날짜</th>
                      <th className="text-left px-4 py-3">진도 내용</th>
                      <th className="text-left px-4 py-3 w-48">메모</th>
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classDates.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-10 text-slate-300 text-sm">
                          해당 월 수업 일정이 없습니다
                        </td>
                      </tr>
                    ) : classDates.map(({ date, sessionNum: sNum }) => {
                      const progress = getProgress(sNum)
                      const isEditing = editingSession === sNum

                      return (
                        <tr key={sNum} className={`group ${isEditing ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-5 py-3 whitespace-nowrap font-medium text-slate-700 align-top pt-4">
                            {formatDateKo(date)}
                          </td>

                          {isEditing ? (
                            <>
                              <td className="px-4 py-3" colSpan={2}>
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={progressForm.content}
                                    onChange={e => setProgressForm(f => ({ ...f, content: e.target.value }))}
                                    placeholder="진도 내용 입력..."
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveProgress(); if (e.key === 'Escape') setEditingSession(null) }}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                  />
                                  <input
                                    type="text"
                                    value={progressForm.memo}
                                    onChange={e => setProgressForm(f => ({ ...f, memo: e.target.value }))}
                                    placeholder="메모 (선택)"
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveProgress(); if (e.key === 'Escape') setEditingSession(null) }}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top pt-4">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={handleSaveProgress}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                  >
                                    <CheckCircle size={12} />저장
                                  </button>
                                  <button
                                    onClick={() => setEditingSession(null)}
                                    className="text-slate-400 hover:text-slate-600"
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 align-top">
                                {progress?.content
                                  ? <span className="text-slate-700">{progress.content}</span>
                                  : <span className="text-slate-300 text-xs">미입력</span>
                                }
                              </td>
                              <td className="px-4 py-3 align-top">
                                {progress?.memo
                                  ? <span className="text-slate-500 text-xs">{progress.memo}</span>
                                  : null
                                }
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 justify-end transition-opacity">
                                  <button
                                    onClick={() => openEditProgress(sNum)}
                                    title="편집"
                                    className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-slate-100"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  {progress && (
                                    <button
                                      onClick={() => handleDeleteProgress(sNum)}
                                      title="삭제"
                                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-slate-100"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
