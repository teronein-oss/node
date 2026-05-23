import { useState, useRef, useMemo } from 'react'
import { X, RotateCcw, Trash2, ArrowRightLeft, BookOpen, Download } from 'lucide-react'
import type { Student } from '../types'
import { useApp } from '../context/AppContext'
import { getClassDate, getMWFClassDate, formatDateKo, fmtDate, getMonthClassDates, getMonthMWFSessions } from '../utils/helpers'
import { toPng } from 'html-to-image'

interface Props {
  student: Student
  onClose: () => void
}

/** 해당 반 유형의 과거 수업 날짜를 최신순으로 반환 (3개월 이내) */
function buildClassDateList(classDays: string, todayStr: string): string[] {
  const result: string[] = []
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 3)
  let y = cutoff.getFullYear(), m = cutoff.getMonth() + 1

  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    const cutoffStr = fmtDate(cutoff)
    if (classDays === 'mon-wed-fri') {
      for (const sNum of getMonthMWFSessions(y, m)) {
        const d = getMWFClassDate(sNum)
        if (d <= todayStr && d >= cutoffStr) result.push(d)
      }
    } else {
      for (const { date } of getMonthClassDates(y, m, classDays as 'mon-fri' | 'tue-thu' | 'wed-sat')) {
        if (date <= todayStr && date >= cutoffStr) result.push(date)
      }
    }
    m++
    if (m > 12) { m = 1; y++ }
  }

  return [...new Set(result)].sort().reverse()
}

export default function StudentDetail({ student, onClose }: Props) {
  const { state, dispatch, getCurrentSession } = useApp()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [transferClassId, setTransferClassId] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [fromDate, setFromDate] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const studentCls = state.classes.find(c => c.id === student.classId)
  const className = studentCls?.name ?? ''
  const { sessionNum: currentSessionNum } = getCurrentSession()
  const classDays = studentCls?.days ?? 'tue-thu'
  const todayStr = fmtDate(new Date())

  /** 드롭다운용 수업 날짜 목록 (최신순), 월별 그룹 */
  const classDatesGrouped = useMemo(() => {
    const all = buildClassDateList(classDays, todayStr)
    const groups: { label: string; dates: string[] }[] = []
    const map = new Map<string, string[]>()
    for (const date of all) {
      const [y, mo] = date.split('-').map(Number)
      const key = `${y}년 ${mo}월`
      if (!map.has(key)) {
        const arr: string[] = []
        map.set(key, arr)
        groups.push({ label: key, dates: arr })
      }
      map.get(key)!.push(date)
    }
    return groups
  }, [classDays, todayStr])

  const grades = state.grades
    .filter(g => g.studentId === student.id)
    .filter(g => {
      const date = getClassDate(g.sessionNum, classDays)
      if (date > todayStr) return false
      if (fromDate && date < fromDate) return false
      return true
    })
    .sort((a, b) => b.sessionNum - a.sessionNum)

  const retests = state.retests
    .filter(r => r.studentId === student.id)
    .filter(r => {
      const date = getClassDate(r.sessionNum, classDays)
      if (date > todayStr) return false
      if (fromDate && date < fromDate) return false
      return true
    })
    .sort((a, b) => b.sessionNum - a.sessionNum)

  const homeworkRows = state.homeworks
    .filter(hw => hw.classId === student.classId || hw.classId === '')
    .filter(hw => {
      const date = getClassDate(hw.sessionNum, classDays)
      if (date > todayStr) return false
      if (fromDate && date < fromDate) return false
      return true
    })
    .slice()
    .sort((a, b) => b.sessionNum - a.sessionNum)
    .map(hw => {
      const grade = grades.find(g => g.sessionNum === hw.sessionNum)
      return { hw, status: grade?.homeworkDone ?? null }
    })

  const hwCounts = homeworkRows.reduce(
    (acc, { status }) => {
      if (status === '제출') acc.submitted++
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

  const handleDownloadPng = async () => {
    if (!cardRef.current || downloading) return
    setDownloading(true)
    const card = cardRef.current
    const scrollDiv = card.querySelector<HTMLElement>('[data-scroll-area]')
    card.style.maxHeight = 'none'
    card.style.overflow = 'visible'
    if (scrollDiv) {
      scrollDiv.style.overflow = 'visible'
      scrollDiv.style.flex = 'none'
      scrollDiv.style.maxHeight = 'none'
    }
    try {
      const dataUrl = await toPng(card, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: (n) => !(n instanceof Element && n.getAttribute('data-no-capture') === 'true'),
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${student.name}_현황_${fmtDate(new Date())}.png`
      a.click()
    } catch (e) {
      console.error('PNG 다운로드 실패:', e)
    } finally {
      card.style.maxHeight = ''
      card.style.overflow = ''
      if (scrollDiv) {
        scrollDiv.style.overflow = ''
        scrollDiv.style.flex = ''
        scrollDiv.style.maxHeight = ''
      }
      setDownloading(false)
    }
  }

  const otherClasses = state.classes.filter(c => c.id !== student.classId)

  const fromDateLabel = fromDate ? `${formatDateKo(fromDate)} 이후` : '전체 기간'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={cardRef}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
                {student.name[0]}
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-lg">{student.name}</h2>
                <p className="text-sm text-slate-500">{className}</p>
              </div>
            </div>
            <div className="flex items-center gap-2" data-no-capture="true">
              <button
                onClick={handleDownloadPng}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Download size={14} />
                {downloading ? '저장 중...' : 'PNG'}
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* 기간 선택 */}
          <div className="flex items-center gap-2 mt-2.5">
            <span className="text-xs text-slate-400 shrink-0">기간</span>
            <select
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white text-slate-700 max-w-xs"
            >
              <option value="">전체 기간</option>
              {classDatesGrouped.map(({ label, dates }) => (
                <optgroup key={label} label={label}>
                  {dates.map(date => (
                    <option key={date} value={date}>
                      {formatDateKo(date)} 이후
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {fromDate && (
              <button
                onClick={() => setFromDate('')}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                초기화
              </button>
            )}
          </div>
          {/* 선택된 기간 표시 (PNG 포함용) */}
          {fromDate && (
            <p className="text-xs text-blue-600 mt-1">{fromDateLabel} 현황</p>
          )}
        </div>

        <div data-scroll-area className="overflow-y-auto flex-1 p-6 space-y-6">
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
                      const sCfg = state.sessionTestConfigs.find(c => c.sessionNum === g.sessionNum)
                      const vThresh = sCfg?.vocabThreshold ?? state.vocabThreshold
                      const vTotal = sCfg?.vocabTotal ?? state.vocabTotal
                      const vMode = sCfg?.vocabMode ?? state.vocabMode
                      const dThresh = sCfg?.dailyThreshold ?? state.dailyThreshold
                      const dTotal = sCfg?.dailyTotal ?? state.dailyTotal
                      const dMode = sCfg?.dailyMode ?? state.dailyMode
                      return (
                        <tr key={g.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                            {formatDateKo(getClassDate(g.sessionNum, classDays))}
                          </td>
                          <td className="text-center px-4 py-2.5">
                            {g.vocabScore !== null ? (
                              <span className={`font-medium ${g.vocabScore < vThresh ? 'text-orange-500' : 'text-slate-700'}`}>
                                {g.vocabScore}
                                <span className="text-slate-400 font-normal text-xs">/{vTotal}{vMode === '개수' ? '개' : '점'}</span>
                              </span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="text-center px-4 py-2.5">
                            {g.dailyTestScore !== null ? (
                              <span className={`font-medium ${g.dailyTestScore < dThresh ? 'text-orange-500' : 'text-slate-700'}`}>
                                {g.dailyTestScore}
                                <span className="text-slate-400 font-normal text-xs">/{dTotal}{dMode === '개수' ? '개' : '점'}</span>
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
                <div className="flex flex-wrap gap-2 mb-3">
                  {hwCounts.submitted > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
                      제출 {hwCounts.submitted}회
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
            fromDate={fromDate}
          />
        </div>

        {/* 하단 액션 */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3" data-no-capture="true">
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
  fromDate,
}: {
  classId: string
  classDays: 'mon-fri' | 'tue-thu' | 'wed-sat' | 'mon-wed-fri'
  currentSessionNum: number
  fromDate: string
}) {
  const { state } = useApp()

  const progressRows = (state.weeklyProgress ?? [])
    .filter(p => {
      if (p.classId !== classId) return false
      if (p.sessionNum > currentSessionNum) return false
      if (fromDate && getClassDate(p.sessionNum, classDays) < fromDate) return false
      return true
    })
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
