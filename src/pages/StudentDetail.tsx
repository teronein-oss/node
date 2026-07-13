import { useState, useRef, useMemo } from 'react'
import { X, RotateCcw, Trash2, ArrowRightLeft, BookOpen, Download, Pencil, Check } from 'lucide-react'
import type { Student, HomeworkStatus, ScoreColumn, WithdrawalReason, WeekdayKey } from '../types'
import { useApp } from '../context/AppContext'
import { getClassDate, formatDateKo, fmtDate, normalizeClassWeekdays, getCurrentClassSessionNum } from '../utils/helpers'
import { toPng } from 'html-to-image'

interface Props {
  student: Student
  onClose: () => void
  initialFromDate?: string
}

const WITHDRAWAL_REASONS: WithdrawalReason[] = [
  '방학 휴원',
  '성적불만',
  '개인학습',
  '관리부족',
  '성적상승 후 퇴원',
  '알 수 없음',
]

export default function StudentDetail({ student, onClose, initialFromDate = '' }: Props) {
  const { state, dispatch } = useApp()
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState<WithdrawalReason>('알 수 없음')
  const [transferClassId, setTransferClassId] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(student.name)
  const [fromDate, setFromDate] = useState<string>(initialFromDate)
  const [toDate, setToDate] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const studentCls = state.classes.find(c => c.id === student.classId)
  const className = studentCls?.name ?? ''
  const classDays = studentCls?.days ?? 'tue-thu'
  const classWeekdays = normalizeClassWeekdays(classDays, studentCls?.weekdays)
  const currentSessionNum = getCurrentClassSessionNum(classDays, classWeekdays)
  const todayStr = fmtDate(new Date())

  const grades = state.grades
    .filter(g => g.studentId === student.id)
    .filter(g => {
      const date = getClassDate(g.sessionNum, classDays, classWeekdays)
      if (date > todayStr) return false
      if (fromDate && date < fromDate) return false
      if (toDate && date > toDate) return false
      return true
    })
    .sort((a, b) => b.sessionNum - a.sessionNum)

  const retests = state.retests
    .filter(r => r.studentId === student.id)
    .filter(r => {
      const date = getClassDate(r.sessionNum, classDays, classWeekdays)
      if (date > todayStr) return false
      if (fromDate && date < fromDate) return false
      if (toDate && date > toDate) return false
      return true
    })
    .sort((a, b) => b.sessionNum - a.sessionNum)

  // 이 학생의 성적에 실제로 데이터가 있는 추가 항목 컬럼 (세션별 설정 기반)
  const allSessionCols = useMemo<ScoreColumn[]>(() => {
    const colMap = new Map<string, ScoreColumn>()
    for (const cfg of state.sessionTestConfigs) {
      for (const col of cfg.scoreColumns ?? []) {
        if (!colMap.has(col.id)) colMap.set(col.id, col)
      }
    }
    for (const g of grades) {
      for (const colId of Object.keys(g.extras ?? {})) {
        if (!colMap.has(colId)) {
          const globalCol = state.scoreColumns.find(c => c.id === colId)
          if (globalCol) colMap.set(colId, globalCol)
        }
      }
    }
    return [...colMap.values()].filter(col => grades.some(g => g.extras?.[col.id] != null))
  }, [state.sessionTestConfigs, state.scoreColumns, grades])

  // 날짜별 성적 테이블의 숙제 컬럼용 (출제 세션 기준)
  const homeworkStatusForSession = (sessionNum: number): HomeworkStatus => {
    const grade = grades.find(g => g.sessionNum === sessionNum)
    if (grade?.attendance === '결석') return '결석'
    const hw = state.homeworks.find(h => h.sessionNum === sessionNum && (h.classId === student.classId || h.classId === ''))
    const items = hw?.items ?? []
    if (items.length > 0) {
      const myStatuses = items.map(item =>
        (item.studentStatuses ?? []).find(ss => ss.studentId === student.id)?.status
      )
      if (myStatuses.some(s => s === '미흡' || s === '미제출')) return '미흡'
      if (myStatuses.some(s => s === '재확인완료')) return '재확인완료'
      if (getClassDate(sessionNum + 1, classDays, classWeekdays) <= todayStr) return '제출'
    }
    return grade?.homeworkDone ?? null
  }

  // 숙제현황 테이블용 (검사 세션 기준 — 세션 N에서 세션 N-1 숙제를 검사)
  type DetailedHwStatus = HomeworkStatus | '미제출'
  const homeworkStatusForCheckSession = (checkSessionNum: number): DetailedHwStatus => {
    const checkGrade = state.grades.find(g => g.studentId === student.id && g.sessionNum === checkSessionNum)
    if (checkGrade?.attendance === '결석') return '결석'
    const hw = state.homeworks.find(h => h.sessionNum === checkSessionNum - 1 && (h.classId === student.classId || h.classId === ''))
    const items = hw?.items ?? []
    if (items.length > 0) {
      const rankMap: Record<string, number> = { '미제출': 3, '미흡': 2, '재확인완료': 1 }
      const worstRank = Math.max(...items.map(item => {
        const s = (item.studentStatuses ?? []).find(ss => ss.studentId === student.id)?.status
        return rankMap[s ?? ''] ?? 0
      }))
      if (worstRank === 3) return '미제출'
      if (worstRank === 2) return '미흡'
      if (worstRank === 1) return '재확인완료'
      if (getClassDate(checkSessionNum, classDays, classWeekdays) <= todayStr) return '제출'
      return null
    }
    const assignGrade = state.grades.find(g => g.studentId === student.id && g.sessionNum === checkSessionNum - 1)
    return assignGrade?.homeworkDone ?? checkGrade?.homeworkDone ?? null
  }

  const homeworkRows = state.homeworks
    .filter(hw => hw.classId === student.classId || hw.classId === '')
    .filter(hw => {
      const checkDate = getClassDate(hw.sessionNum + 1, classDays, classWeekdays)
      if (checkDate > todayStr) return false
      if (fromDate && checkDate < fromDate) return false
      if (toDate && checkDate > toDate) return false
      return true
    })
    .slice()
    .sort((a, b) => b.sessionNum - a.sessionNum)
    .map(hw => ({
      hw,
      checkDate: getClassDate(hw.sessionNum + 1, classDays, classWeekdays),
      status: homeworkStatusForCheckSession(hw.sessionNum + 1),
    }))

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

  const handleWithdraw = () => {
    dispatch({
      type: 'UPDATE_STUDENT',
      payload: {
        ...student,
        active: false,
        withdrawalReason,
        withdrawnAt: new Date().toISOString(),
      },
    })
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
    const wideTables = Array.from(card.querySelectorAll<HTMLElement>('[data-wide-table]'))
    const prevCardWidth = card.style.width
    card.style.maxHeight = 'none'
    card.style.overflow = 'visible'
    if (scrollDiv) {
      scrollDiv.style.overflow = 'visible'
      scrollDiv.style.flex = 'none'
      scrollDiv.style.maxHeight = 'none'
    }
    wideTables.forEach(el => { el.style.overflow = 'visible' })
    card.style.width = `${Math.max(card.scrollWidth, card.getBoundingClientRect().width)}px`
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
      card.style.width = prevCardWidth
      card.style.maxHeight = ''
      card.style.overflow = ''
      if (scrollDiv) {
        scrollDiv.style.overflow = ''
        scrollDiv.style.flex = ''
        scrollDiv.style.maxHeight = ''
      }
      wideTables.forEach(el => { el.style.overflow = '' })
      setDownloading(false)
    }
  }

  const otherClasses = state.classes.filter(c => c.id !== student.classId)

  const periodLabel = (() => {
    if (fromDate && toDate) return `${formatDateKo(fromDate)} ~ ${formatDateKo(toDate)}`
    if (fromDate) return `${formatDateKo(fromDate)} 이후`
    if (toDate) return `${formatDateKo(toDate)}까지`
    return '전체 기간'
  })()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={cardRef}
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
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
                {editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && nameValue.trim()) {
                          dispatch({ type: 'UPDATE_STUDENT', payload: { ...student, name: nameValue.trim() } })
                          setEditingName(false)
                        }
                        if (e.key === 'Escape') { setNameValue(student.name); setEditingName(false) }
                      }}
                      onBlur={() => {
                        if (nameValue.trim() && nameValue.trim() !== student.name) {
                          dispatch({ type: 'UPDATE_STUDENT', payload: { ...student, name: nameValue.trim() } })
                        } else {
                          setNameValue(student.name)
                        }
                        setEditingName(false)
                      }}
                      className="font-bold text-slate-800 text-lg border-b-2 border-blue-400 outline-none bg-transparent w-32"
                    />
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (nameValue.trim()) {
                          dispatch({ type: 'UPDATE_STUDENT', payload: { ...student, name: nameValue.trim() } })
                        }
                        setEditingName(false)
                      }}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 group">
                    <h2 className="font-bold text-slate-800 text-lg">{student.name}</h2>
                    <button
                      onClick={() => { setNameValue(student.name); setEditingName(true) }}
                      className="text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                      data-no-capture="true"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
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
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <span className="text-xs text-slate-400 shrink-0">기간</span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                max={toDate || todayStr}
                onChange={e => {
                  const value = e.target.value
                  setFromDate(value)
                  if (value && toDate && value > toDate) setToDate(value)
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white text-slate-700 w-32"
                aria-label="시작일"
              />
              <span className="text-xs text-slate-300">~</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={todayStr}
                onChange={e => {
                  const value = e.target.value
                  setToDate(value)
                  if (value && fromDate && value < fromDate) setFromDate(value)
                }}
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200 bg-white text-slate-700 w-32"
                aria-label="종료일"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate('') }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                초기화
              </button>
            )}
          </div>
          {/* 선택된 기간 표시 (PNG 포함용) */}
          {(fromDate || toDate) && (
            <p className="text-xs text-blue-600 mt-1">{periodLabel} 현황</p>
          )}
        </div>

        <div data-scroll-area className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* 날짜별 성적 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">날짜별 성적</h3>
            {grades.length === 0 ? (
              <p className="text-sm text-slate-400">입력된 성적이 없습니다</p>
            ) : (
              <div data-wide-table className="border border-slate-100 rounded-xl overflow-x-auto">
                <table className="min-w-max w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-2.5 min-w-32 w-32 whitespace-nowrap">날짜</th>
                      <th className="text-center px-4 py-2.5 min-w-28 w-28 break-keep">단어시험</th>
                      <th className="text-center px-4 py-2.5 min-w-28 w-28 break-keep">Daily Test</th>
                      {allSessionCols.map(col => (
                        <th key={col.id} className="text-center px-4 py-2.5 min-w-28 w-28 break-keep" title={col.name}>{col.name}</th>
                      ))}
                      <th className="text-center px-4 py-2.5 min-w-24 w-24 break-keep">숙제</th>
                      <th className="text-center px-4 py-2.5 min-w-20 w-20 break-keep">재시험</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {grades.map(g => {
                      const hasRetest = retests.some(r => r.sessionNum === g.sessionNum)
                      const sCfg = state.sessionTestConfigs.find(
                        c => c.sessionNum === g.sessionNum && c.classId === student.classId
                      ) ?? state.sessionTestConfigs.find(
                        c => c.sessionNum === g.sessionNum && !c.classId
                      )
                      const vThresh = sCfg?.vocabThreshold ?? state.vocabThreshold
                      const vTotal = sCfg?.vocabTotal ?? state.vocabTotal
                      const vMode = sCfg?.vocabMode ?? state.vocabMode
                      const dThresh = sCfg?.dailyThreshold ?? state.dailyThreshold
                      const dTotal = sCfg?.dailyTotal ?? state.dailyTotal
                      const dMode = sCfg?.dailyMode ?? state.dailyMode
                      return (
                        <tr key={g.id} className="group hover:bg-slate-50">
                          <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap group-hover:bg-slate-50">
                            {formatDateKo(getClassDate(g.sessionNum, classDays, classWeekdays))}
                          </td>
                          <td className="text-center px-4 py-2.5 whitespace-nowrap">
                            {g.vocabScore !== null ? (
                              <span className={`font-medium ${g.vocabScore < vThresh ? 'text-orange-500' : 'text-slate-700'}`}>
                                {g.vocabScore}
                                <span className="text-slate-400 font-normal text-xs">/{vTotal}{vMode === '개수' ? '개' : '점'}</span>
                              </span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="text-center px-4 py-2.5 whitespace-nowrap">
                            {g.dailyTestScore !== null ? (
                              <span className={`font-medium ${g.dailyTestScore < dThresh ? 'text-orange-500' : 'text-slate-700'}`}>
                                {g.dailyTestScore}
                                <span className="text-slate-400 font-normal text-xs">/{dTotal}{dMode === '개수' ? '개' : '점'}</span>
                              </span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                          {allSessionCols.map(col => {
                            const eScore = g.extras?.[col.id]
                            const eTotal = col.total ?? 100
                            const eThresh = col.threshold ?? 0
                            const eMode = col.mode ?? '점수'
                            const eFail = eThresh > 0 && eScore != null && eScore < eThresh
                            return (
                              <td key={col.id} className="text-center px-4 py-2.5 whitespace-nowrap">
                                {eScore !== null && eScore !== undefined
                                  ? <span className={`font-medium ${eFail ? 'text-orange-500' : 'text-slate-700'}`}>
                                      {eScore}
                                      <span className="text-slate-400 font-normal text-xs">/{eTotal}{eMode === '개수' ? '개' : '점'}</span>
                                    </span>
                                  : <span className="text-slate-300">-</span>
                                }
                              </td>
                            )
                          })}
                          <td className="text-center px-4 py-2.5 whitespace-nowrap">
                            {(() => {
                              const hwStatus = homeworkStatusForSession(g.sessionNum)
                              if (hwStatus === '제출') return <span className="text-xs text-green-600 font-medium">제출</span>
                              if (hwStatus === '미흡') return <span className="text-xs text-orange-500 font-medium">미흡</span>
                              if (hwStatus === '재확인완료') return <span className="text-xs text-blue-600 font-medium">재확인완료</span>
                              if (hwStatus === '결석') return <span className="text-xs text-slate-400">결석</span>
                              return <span className="text-slate-300 text-xs">-</span>
                            })()}
                          </td>
                          <td className="text-center px-4 py-2.5 whitespace-nowrap">
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
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="text-left px-4 py-2.5 w-32">검사일</th>
                        <th className="text-left px-4 py-2.5">숙제 내용</th>
                        <th className="text-center px-4 py-2.5 w-24">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {homeworkRows.map(({ hw, checkDate, status }) => (
                        <tr key={hw.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-700">
                            {formatDateKo(checkDate)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {(hw.items?.length ?? 0) > 0 ? (
                              <ul className="space-y-0.5">
                                {hw.items!.map(item => (
                                  <li key={item.id} className="flex items-start gap-1.5">
                                    <span className="text-slate-300 shrink-0">·</span>
                                    <span>{item.text}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : hw.description ? (
                              <span>{hw.description}</span>
                            ) : (
                              <span className="text-slate-300 text-xs">미입력</span>
                            )}
                          </td>
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
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateKo(getClassDate(r.sessionNum, classDays, classWeekdays))}</span>
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
            classWeekdays={classWeekdays}
            currentSessionNum={currentSessionNum}
            fromDate={fromDate}
            toDate={toDate}
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

          {showWithdraw ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">퇴원 유형</span>
              <select
                value={withdrawalReason}
                onChange={e => setWithdrawalReason(e.target.value as WithdrawalReason)}
                className="border border-red-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-100 bg-white"
              >
                {WITHDRAWAL_REASONS.map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <button
                onClick={() => setShowWithdraw(false)}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleWithdraw}
                className="px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600"
              >
                퇴원 등록
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWithdraw(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              퇴원
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
  classWeekdays,
  currentSessionNum,
  fromDate,
  toDate,
}: {
  classId: string
  classDays: string
  classWeekdays: WeekdayKey[]
  currentSessionNum: number
  fromDate: string
  toDate: string
}) {
  const { state } = useApp()

  const progressRows = (state.weeklyProgress ?? [])
    .filter(p => {
      if (p.classId !== classId) return false
      if (p.sessionNum > currentSessionNum) return false
      const date = getClassDate(p.sessionNum, classDays, classWeekdays)
      if (fromDate && date < fromDate) return false
      if (toDate && date > toDate) return false
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
                  {formatDateKo(getClassDate(p.sessionNum, classDays, classWeekdays))}
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
