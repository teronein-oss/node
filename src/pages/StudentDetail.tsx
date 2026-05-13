import { useState } from 'react'
import { X, RotateCcw, Trash2, ArrowRightLeft, BookOpen } from 'lucide-react'
import type { Student } from '../types'
import { useApp } from '../context/AppContext'
import { getClassDate, formatDateKo } from '../utils/helpers'

interface Props {
  student: Student
  onClose: () => void
}

export default function StudentDetail({ student, onClose }: Props) {
  const { state, dispatch, getCurrentSession } = useApp()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [transferClassId, setTransferClassId] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)

  const studentCls = state.classes.find(c => c.id === student.classId)
  const className = studentCls?.name ?? ''
  const { sessionNum: currentSessionNum } = getCurrentSession()
  const classDays = studentCls?.days ?? 'mon-fri'

  const grades = state.grades
    .filter(g => g.studentId === student.id)
    .sort((a, b) => b.sessionNum - a.sessionNum)

  const retests = state.retests
    .filter(r => r.studentId === student.id)
    .sort((a, b) => b.sessionNum - a.sessionNum)

  const homeworkRows = state.homeworks
    .filter(hw => hw.classId === student.classId || hw.classId === '')
    .slice()
    .sort((a, b) => b.sessionNum - a.sessionNum)
    .map(hw => {
      const grade = grades.find(g => g.sessionNum === hw.sessionNum)
      return { hw, status: grade?.homeworkDone ?? null }
    })

  const hwCounts = homeworkRows.reduce(
    (acc, { status }) => {
      if (status === '제출') acc.submitted++
      else if (status === '미제출') acc.missing++
      else if (status === '미흡') acc.incomplete++
      else if (status === '결석') acc.absent++
      return acc
    },
    { submitted: 0, missing: 0, incomplete: 0, absent: 0 }
  )

  const handleRemove = () => {
    dispatch({ type: 'DEACTIVATE_STUDENT', payload: student.id })
    onClose()
  }

  const handleTransfer = () => {
    if (!transferClassId) return
    dispatch({ type: 'UPDATE_STUDENT', payload: { ...student, classId: transferClassId } })
    setShowTransfer(false)
    setTransferClassId('')
  }

  const otherClasses = state.classes.filter(c => c.id !== student.classId)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
              {student.name[0]}
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">{student.name}</h2>
              <p className="text-sm text-slate-500">{className}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* 날짜별 성적 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">날짜별 성적</h3>
            {grades.length === 0 ? (
              <p className="text-sm text-slate-400">입력된 성적이 없습니다</p>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="text-left px-4 py-2.5">날짜</th>
                      <th className="text-center px-4 py-2.5">단어시험</th>
                      <th className="text-center px-4 py-2.5">Daily Test</th>
                      {state.scoreColumns.map(col => (
                        <th key={col.id} className="text-center px-4 py-2.5">{col.name}</th>
                      ))}
                      <th className="text-center px-4 py-2.5">숙제</th>
                      <th className="text-center px-4 py-2.5">재시험</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {grades.map(g => {
                      const hasRetest = retests.some(r => r.sessionNum === g.sessionNum)
                      return (
                        <tr key={g.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                            {formatDateKo(getClassDate(g.sessionNum, classDays))}
                          </td>
                          <td className="text-center px-4 py-2.5">
                            {g.vocabScore !== null ? (
                              <span className={`font-medium ${g.vocabScore < 80 ? 'text-orange-500' : 'text-slate-700'}`}>
                                {g.vocabScore}점
                              </span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="text-center px-4 py-2.5">
                            {g.dailyTestScore !== null ? (
                              <span className={`font-medium ${g.dailyTestScore < 80 ? 'text-orange-500' : 'text-slate-700'}`}>
                                {g.dailyTestScore}점
                              </span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                          {state.scoreColumns.map(col => (
                            <td key={col.id} className="text-center px-4 py-2.5">
                              {g.extras?.[col.id] !== null && g.extras?.[col.id] !== undefined
                                ? <span className="font-medium text-slate-700">{g.extras[col.id]}점</span>
                                : <span className="text-slate-300">-</span>
                              }
                            </td>
                          ))}
                          <td className="text-center px-4 py-2.5">
                            {g.homeworkDone === '제출' && <span className="text-xs text-green-600 font-medium">제출</span>}
                            {g.homeworkDone === '미제출' && <span className="text-xs text-red-500 font-medium">미제출</span>}
                            {g.homeworkDone === '미흡' && <span className="text-xs text-orange-500 font-medium">미흡</span>}
                            {g.homeworkDone === '재확인완료' && <span className="text-xs text-blue-600 font-medium">재확인완료</span>}
                            {g.homeworkDone === null && <span className="text-slate-300 text-xs">-</span>}
                          </td>
                          <td className="text-center px-4 py-2.5">
                            {hasRetest
                              ? <RotateCcw size={15} className="text-orange-400 mx-auto" />
                              : <span className="text-slate-300 text-xs">-</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 숙제 현황 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">숙제 현황</h3>
            {homeworkRows.length === 0 ? (
              <p className="text-sm text-slate-400">등록된 숙제가 없습니다</p>
            ) : (
              <>
                {/* 요약 */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {hwCounts.submitted > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                      제출 {hwCounts.submitted}회
                    </span>
                  )}
                  {hwCounts.missing > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium">
                      미제출 {hwCounts.missing}회
                    </span>
                  )}
                  {hwCounts.incomplete > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 font-medium">
                      미흡 {hwCounts.incomplete}회
                    </span>
                  )}
                  {hwCounts.absent > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">
                      결석 {hwCounts.absent}회
                    </span>
                  )}
                </div>
                {/* 목록 */}
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="text-left px-4 py-2.5 w-32">날짜</th>
                        <th className="text-left px-4 py-2.5">숙제 내용</th>
                        <th className="text-center px-4 py-2.5 w-24">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {homeworkRows.map(({ hw, status }) => (
                        <tr key={hw.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-700">
                            {formatDateKo(getClassDate(hw.sessionNum, classDays))}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{hw.description}</td>
                          <td className="px-4 py-2.5 text-center">
                            {status === '제출' && <span className="text-xs text-green-600 font-medium">제출</span>}
                            {status === '미제출' && <span className="text-xs text-red-500 font-medium">미제출</span>}
                            {status === '미흡' && <span className="text-xs text-orange-500 font-medium">미흡</span>}
                            {status === '재확인완료' && <span className="text-xs text-blue-600 font-medium">재확인완료</span>}
                            {status === '결석' && <span className="text-xs text-slate-400">결석</span>}
                            {status === null && <span className="text-slate-300 text-xs">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* 재시험 이력 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">재시험 이력</h3>
            {retests.length === 0 ? (
              <p className="text-sm text-slate-400">재시험 이력이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {retests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateKo(getClassDate(r.sessionNum, classDays))}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${r.type === 'vocab' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                      {r.type === 'vocab' ? '단어' : 'Daily'}
                    </span>
                    <span className="text-sm text-slate-600">
                      {r.originalScore}점
                      {r.retestScore !== null && (
                        <>
                          {' → '}
                          <span className={`font-medium ${r.passed ? 'text-green-600' : 'text-red-500'}`}>
                            {r.retestScore}점
                          </span>
                        </>
                      )}
                    </span>
                    <div className="ml-auto">
                      {r.passed === null && (
                        <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">미처리</span>
                      )}
                      {r.passed === true && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">통과</span>
                      )}
                      {r.passed === false && (
                        <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">불통과</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 내신 진도 */}
          <WeeklyProgressSection
            classId={student.classId}
            classDays={classDays}
            currentSessionNum={currentSessionNum}
          />
        </div>

        {/* 하단 액션 - 스크롤 영역 밖 */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          {/* 반 이동 */}
          <div>
            {showTransfer ? (
              <div className="flex items-center gap-2">
                <select
                  value={transferClassId}
                  onChange={e => setTransferClassId(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">반 선택</option>
                  {otherClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleTransfer}
                  disabled={!transferClassId}
                  className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  이동
                </button>
                <button
                  onClick={() => { setShowTransfer(false); setTransferClassId('') }}
                  className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowTransfer(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <ArrowRightLeft size={14} />
                반 이동
              </button>
            )}
          </div>

          {/* 학생 제거 */}
          {confirmRemove ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">정말 제거하시겠습니까?</span>
              <button
                onClick={() => setConfirmRemove(false)}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleRemove}
                className="px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600"
              >
                제거 확인
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              학생 제거
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function WeeklyProgressSection({
  classId,
  classDays,
  currentSessionNum,
}: {
  classId: string
  classDays: 'mon-fri' | 'tue-thu' | 'wed-sat'
  currentSessionNum: number
}) {
  const { state } = useApp()

  const progressRows = (state.weeklyProgress ?? [])
    .filter(p => p.classId === classId && p.sessionNum <= currentSessionNum)
    .sort((a, b) => a.sessionNum - b.sessionNum)

  if (progressRows.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={14} className="text-emerald-500" />
        <h3 className="text-sm font-semibold text-slate-600">내신 진도 기록</h3>
      </div>
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="text-left px-4 py-2.5 w-32">날짜</th>
              <th className="text-left px-4 py-2.5">진도 내용</th>
              <th className="text-left px-4 py-2.5 w-36">메모</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {progressRows.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-700">
                  {formatDateKo(getClassDate(p.sessionNum, classDays))}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{p.content}</td>
                <td className="px-4 py-2.5 text-slate-400 text-xs">{p.memo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
