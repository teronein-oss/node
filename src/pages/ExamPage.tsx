import { useState, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Save, X, BookMarked, ChevronLeft, ChevronRight,
  Calendar, CheckCircle, Link2,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate, formatDateKo } from '../utils/helpers'
import { buildMonthOptions, getClassDatesForMonth, getCurrentYM, getDefaultClassIdForToday } from '../utils/academic'

const SEMESTERS = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'] as const
type Semester = typeof SEMESTERS[number]
const SEMESTER_KEY = 'academy-selected-semester'

const EMPTY_INFO = { subject: '', examDate: '', examScope: '' }

export default function ExamPage() {
  const { state, dispatch, selectedYM, setSelectedYM } = useApp()

  const today = new Date()
  const todayStr = fmtDate(today)
  const currentYM = getCurrentYM(today)

  // 학기 선택 — localStorage에서 복원
  const [selectedSemester, setSelectedSemester] = useState<Semester>(() => {
    const saved = localStorage.getItem(SEMESTER_KEY)
    return (SEMESTERS.includes(saved as Semester) ? saved : '1학기 중간') as Semester
  })
  const [semesterSaved, setSemesterSaved] = useState(false)

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return getDefaultClassIdForToday(state.classes, state.classes[0]?.id ?? '')
  })

  // 시험 정보 수정 폼
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState(EMPTY_INFO)

  // 진도 편집
  const [editingSession, setEditingSession] = useState<number | null>(null)
  const [progressForm, setProgressForm] = useState({ content: '', memo: '' })

  // 업무일정 연동
  const [syncModalOpen, setSyncModalOpen] = useState(false)

  const availableMonths = useMemo(() => {
    return buildMonthOptions({
      weeklyProgress: state.weeklyProgress ?? [],
      includeNextMonth: true,
      sort: 'asc',
      today,
    })
  }, [state.weeklyProgress, currentYM])

  const [year, month] = selectedYM.split('-').map(Number)
  const currentIdx = availableMonths.findIndex(m => m.ym === selectedYM)

  const selectedClass = state.classes.find(c => c.id === selectedClassId)

  const classDates = useMemo(() => {
    return getClassDatesForMonth({
      classInfo: selectedClass,
      year,
      month,
      filterMWFToCalendarMonth: true,
    })
  }, [selectedClass, year, month])

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
                    <h2 className="font-semibold text-slate-800">날짜별 진도 계획표</h2>
                  </div>
                  <button
                    onClick={() => setSyncModalOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200"
                  >
                    <Link2 size={12} />
                    업무일정 연동
                  </button>
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
                      const isFuture = date > todayStr

                      return (
                        <tr key={sNum} className={`group ${isEditing ? 'bg-blue-50/40' : isFuture ? 'bg-indigo-50/20 hover:bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                          <td className="px-5 py-3 whitespace-nowrap align-top pt-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isFuture ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {formatDateKo(date)}
                              </span>
                              {isFuture && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-500 font-medium shrink-0">계획</span>
                              )}
                            </div>
                          </td>

                          {isEditing ? (
                            <>
                              <td className="px-4 py-3" colSpan={2}>
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={progressForm.content}
                                    onChange={e => setProgressForm(f => ({ ...f, content: e.target.value }))}
                                    placeholder={isFuture ? '진도 계획 입력...' : '진도 내용 입력...'}
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
                                  ? <span className={isFuture ? 'text-indigo-700' : 'text-slate-700'}>{progress.content}</span>
                                  : isFuture
                                    ? <span className="text-indigo-300 text-xs">계획 미작성</span>
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
      {/* 업무일정 연동 모달 */}
      {syncModalOpen && selectedClass && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setSyncModalOpen(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-[420px] max-w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-indigo-500" />
                <h3 className="text-base font-semibold text-slate-800">업무일정 연동</h3>
              </div>
              <button onClick={() => setSyncModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {(() => {
              const entries = classDates
                .map(({ date, sessionNum }) => ({ date, progress: getProgress(sessionNum) }))
                .filter(({ progress }) => !!progress?.content)
              return entries.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-400">연동할 진도 항목이 없습니다.</p>
                  <p className="text-xs text-slate-300 mt-1">진도 내용을 먼저 입력해주세요.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    <span className="font-semibold text-slate-700">{selectedClass.name}</span>의
                    진도 항목 <span className="font-semibold text-indigo-600">{entries.length}개</span>를
                    업무일정표에 추가합니다.
                  </p>
                  <div className="border border-slate-100 rounded-lg overflow-hidden mb-4 max-h-60 overflow-y-auto">
                    {entries.map(({ date, progress }) => (
                      <div key={date} className="flex items-start gap-3 px-3 py-2.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50">
                        <span className={`text-xs shrink-0 mt-0.5 font-medium ${date > todayStr ? 'text-indigo-500' : 'text-slate-500'}`}>
                          {formatDateKo(date)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 truncate">{progress!.content}</p>
                          {progress!.memo && <p className="text-[11px] text-slate-400 truncate">{progress!.memo}</p>}
                        </div>
                        {date > todayStr && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-500 font-medium shrink-0">계획</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mb-4">* 업무일정표에 개인 일정으로 추가됩니다. 이미 연동된 항목이 있으면 중복 추가될 수 있습니다.</p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setSyncModalOpen(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        for (const { date, progress } of entries) {
                          if (!progress?.content) continue
                          dispatch({
                            type: 'ADD_SCHEDULE_EVENT',
                            payload: {
                              startDate: date,
                              endDate: date,
                              title: `[${selectedClass.name}] ${progress.content}`,
                              type: 'personal',
                              completed: false,
                            },
                          })
                        }
                        setSyncModalOpen(false)
                      }}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Link2 size={12} />
                      연동하기
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
