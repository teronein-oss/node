import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  GraduationCap,
  Printer,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { StudentCumulativeExam, StudentCumulativeReportData, StudentReportData } from '../types/studentReport'

function score(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function isAttendedExam(exam: StudentCumulativeExam): exam is StudentCumulativeExam & { attended: true; result: NonNullable<StudentCumulativeExam['result']> } {
  return exam.attended && exam.result !== null
}

function SummaryCard({ label, value, total, average, caption, tone }: {
  label: string
  value: number
  total: number
  average?: number
  caption?: string
  tone: 'navy' | 'blue' | 'mint' | 'actual'
}) {
  const styles = {
    navy: 'border-[#10243d] bg-[#10243d] text-white',
    blue: 'border-blue-100 bg-blue-50 text-blue-950',
    mint: 'border-emerald-100 bg-emerald-50 text-emerald-950',
    actual: 'border-violet-100 bg-violet-50 text-violet-950',
  }
  const muted = tone === 'navy' ? 'text-blue-100/70' : 'text-slate-500'
  return (
    <article data-tone={tone} className={`m3-score-card rounded-3xl border p-5 sm:p-6 ${styles[tone]}`}>
      <p className={`text-xs font-bold ${muted}`}>{label}</p>
      <div className="mt-3 flex items-end gap-1.5"><span className="text-4xl font-black tracking-tight">{score(value)}</span><span className={`pb-1 text-sm font-semibold ${muted}`}>/ {total}</span></div>
      <p className={`mt-3 text-xs ${muted}`}>{caption ?? `전체 회차 평균 ${(average ?? 0).toFixed(1)}점`}</p>
    </article>
  )
}

export default function StudentCumulativeDashboard({
  data,
  detailReport,
  onOpenDetail,
  onReset,
  backLabel = '나가기',
}: {
  data: StudentCumulativeReportData
  detailReport: StudentReportData | null
  onOpenDetail: () => void
  onReset: () => void
  backLabel?: string
}) {
  const [selectedTermId, setSelectedTermId] = useState(data.terms[0]?.termId ?? '')
  const [analysisRound, setAnalysisRound] = useState<number | 'all'>('all')
  const term = data.terms.find(item => item.termId === selectedTermId) ?? data.terms[0]
  const exams = useMemo(
    () => data.exams.filter(exam => exam.termId === term?.termId).sort((first, second) => first.round - second.round),
    [data.exams, term?.termId],
  )
  const attendedExams = exams.filter(isAttendedExam)
  const hasWritten = exams.some(exam => exam.averages.written > 0 || (exam.result?.writtenScore ?? 0) > 0)
  const actualScore = (data.actualScores ?? []).find(item => item.termId === term?.termId)
  const studentAverages = {
    total: attendedExams.reduce((sum, exam) => sum + exam.result.totalScore, 0) / Math.max(attendedExams.length, 1),
    objective: attendedExams.reduce((sum, exam) => sum + exam.result.objectiveScore, 0) / Math.max(attendedExams.length, 1),
    written: attendedExams.reduce((sum, exam) => sum + exam.result.writtenScore, 0) / Math.max(attendedExams.length, 1),
  }
  const cohortAverages = {
    total: attendedExams.reduce((sum, exam) => sum + exam.averages.total, 0) / Math.max(attendedExams.length, 1),
    objective: attendedExams.reduce((sum, exam) => sum + exam.averages.objective, 0) / Math.max(attendedExams.length, 1),
    written: attendedExams.reduce((sum, exam) => sum + exam.averages.written, 0) / Math.max(attendedExams.length, 1),
  }
  const scoreChange = attendedExams.length > 1
    ? attendedExams[attendedExams.length - 1].result.totalScore - attendedExams[0].result.totalScore
    : 0
  const changePositive = scoreChange >= 0
  const bestExam = attendedExams.length
    ? attendedExams.reduce((best, exam) => exam.result.totalScore > best.result.totalScore ? exam : best)
    : null
  const cumulativeTopPercent = attendedExams.length
    ? Math.max(1, Math.round(attendedExams.reduce((sum, exam) => sum + exam.result.topPercent, 0) / attendedExams.length))
    : 0
  const selectedRoundExam = analysisRound === 'all' ? null : exams.find(exam => exam.round === analysisRound)
  const selectedRoundAbsent = selectedRoundExam?.attended === false
  const selectedAnalysis = analysisRound === 'all'
    ? data.typeAnalysis
    : selectedRoundExam?.typeAnalysis ?? []
  const normalizedAnalysis = selectedAnalysis.map(type => ({
    ...type,
    accuracy: type.accuracy ?? Math.round(type.correct / Math.max(type.total, 1) * 1000) / 10,
    missedCount: type.missedCount ?? type.total - type.correct,
  }))
  const strengths = [...normalizedAnalysis]
    .sort((first, second) => second.accuracy - first.accuracy || second.total - first.total || first.detailType.localeCompare(second.detailType, 'ko'))
    .slice(0, 3)
  const improvements = [...normalizedAnalysis]
    .filter(type => type.missedCount > 0)
    .sort((first, second) => second.missedCount - first.missedCount || first.accuracy - second.accuracy || first.detailType.localeCompare(second.detailType, 'ko'))
    .slice(0, 3)

  return (
    <div className="m3-report min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-900 print:bg-white">
      <header className="m3-topbar border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="m3-brand-mark flex h-9 w-9 items-center justify-center rounded-xl bg-[#10243d] text-white"><GraduationCap size={20} /></div>
            <div><p className="text-sm font-black tracking-wide text-[#10243d]">SEUM</p><p className="hidden text-[11px] text-slate-400 sm:block">학생 누적 성적 리포트</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="m3-outlined-button inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Printer size={15} /><span className="hidden sm:inline">인쇄</span></button>
            <button onClick={onReset} className="m3-tonal-button inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:px-3"><ArrowLeft size={15} />{backLabel}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-12">
        <section className="m3-hero overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#10243d] via-[#173d63] to-[#236b84] p-5 text-white shadow-xl shadow-slate-300/40 sm:rounded-[2rem] sm:p-9">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="m3-chip inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50"><ShieldCheck size={14} />본인 확인 완료</div>
              <p className="mt-5 text-sm text-blue-100/70">{data.school} {data.grade}학년</p>
              <h1 className="mt-1 break-keep text-2xl font-black tracking-tight sm:text-4xl">{data.studentName} 학생 누적 리포트</h1>
              <p className="mt-3 text-sm leading-6 text-blue-50/70">1~4차 점수 변화와 누적 성취를 한 번에 확인할 수 있습니다.</p>
            </div>
            <div className="m3-hero-meta grid w-full grid-cols-[1fr_auto_1fr] gap-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm sm:w-auto sm:gap-6 sm:px-5">
              <div><p className="text-[11px] text-blue-100/65">누적 성취</p><p className="mt-1 text-xl font-black">{attendedExams.length ? `상위 ${cumulativeTopPercent}%` : '미응시'}</p></div>
              <div className="w-px bg-white/15" />
              <div><p className="text-[11px] text-blue-100/65">응시 회차</p><p className="mt-1 text-xl font-black">{attendedExams.length}회</p></div>
            </div>
          </div>
        </section>

        <section className="m3-card mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="student-term" className="text-xs font-bold text-slate-500">시험 대분류</label>
          <select id="student-term" value={selectedTermId} onChange={event => { setSelectedTermId(event.target.value); setAnalysisRound('all') }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
            {data.terms.map(item => <option key={item.termId} value={item.termId}>{item.label}</option>)}
          </select>
        </section>

        <section className={`mt-5 grid gap-4 ${hasWritten && actualScore ? 'sm:grid-cols-2 lg:grid-cols-4' : hasWritten ? 'sm:grid-cols-3' : actualScore ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
          <SummaryCard label="누적 전체 평균" value={studentAverages.total} total={100} average={cohortAverages.total} tone="navy" />
          {hasWritten && <SummaryCard label="객관식 평균" value={studentAverages.objective} total={80} average={cohortAverages.objective} tone="blue" />}
          {hasWritten && <SummaryCard label="서술형 평균" value={studentAverages.written} total={20} average={cohortAverages.written} tone="mint" />}
          {actualScore && <SummaryCard label="실제 내신 점수" value={actualScore.score} total={100} caption="분석파일과 함께 저장된 실제 점수" tone="actual" />}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="m3-card min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><BarChart3 className="text-blue-600" size={20} /><h2 className="font-black">회차별 전체 점수 추이</h2></div>
            <div className="mt-8 flex h-52 items-end justify-around gap-2 border-b border-slate-200 px-1 sm:h-56 sm:gap-3 sm:px-6">
              {exams.map(exam => (
                <div key={exam.examId} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className={`whitespace-nowrap text-xs font-black sm:text-sm ${exam.result ? 'text-blue-900' : 'text-slate-400'}`}>{exam.result ? score(exam.result.totalScore) : '미응시'}</span>
                  {exam.result ? <div className="m3-chart-bar w-full max-w-16 rounded-t-xl bg-gradient-to-t from-blue-700 to-cyan-400 shadow-lg shadow-blue-100 sm:rounded-t-2xl" style={{ height: `${Math.max(8, exam.result.totalScore)}%` }} aria-label={`${exam.round}차 ${score(exam.result.totalScore)}점`} /> : <div className="m3-chart-absent flex h-16 w-full max-w-16 items-center justify-center rounded-t-xl border-2 border-dashed border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400" aria-label={`${exam.round}차 미응시`}>—</div>}
                  <span className="pb-3 text-xs font-bold text-slate-500">{exam.round}차</span>
                </div>
              ))}
            </div>
          </article>

          <article data-positive={changePositive} className={`m3-change-card rounded-3xl border p-6 ${changePositive ? 'border-emerald-100 bg-emerald-50/70' : 'border-orange-100 bg-orange-50/70'}`}>
            <div className={`flex items-center gap-2 ${changePositive ? 'text-emerald-800' : 'text-orange-800'}`}>{changePositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}<h2 className="font-black">학습 변화</h2></div>
            <p className={`mt-6 text-4xl font-black ${changePositive ? 'text-emerald-900' : 'text-orange-900'}`}>{changePositive ? '+' : ''}{score(scoreChange)}점</p>
            <p className={`mt-2 text-xs leading-5 ${changePositive ? 'text-emerald-800/70' : 'text-orange-800/70'}`}>첫 응시 대비 최근 응시의 전체 점수 변화입니다.</p>
            <div className="m3-inner-card mt-6 rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-amber-700"><Award size={17} /><p className="text-xs font-bold">최고 성적</p></div><p className="mt-2 text-xl font-black text-slate-900">{bestExam ? `${bestExam.round}차 · ${score(bestExam.result.totalScore)}점` : '응시 데이터 없음'}</p></div>
          </article>
        </section>

        <section className="m3-card mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-2"><BarChart3 className="text-blue-600" size={20} /><h2 className="text-lg font-black">전체 인원 점수 분포</h2></div>
            <p className="mt-1 text-xs text-slate-400">회차별 최고·최저 점수와 점수 구간 비율을 비교하고, 본인의 위치를 확인할 수 있습니다.</p>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="m3-distribution-matrix w-full min-w-[820px] table-fixed text-center text-sm">
              <thead>
                <tr>
                  <th className="w-40 px-5 py-4 text-left">점수 구간</th>
                  {exams.map(exam => <th key={exam.examId} className="px-3 py-4"><p className="text-base font-black text-slate-900">{exam.round}차</p><p className="mt-1 text-xs font-bold"><span className="text-rose-600">최고 {score(exam.scoreDistribution.highest)}</span><span className="mx-1 text-slate-300">·</span><span className="text-emerald-700">최저 {score(exam.scoreDistribution.lowest)}</span></p>{!exam.attended && <span className="mt-1 inline-flex rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">미응시</span>}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...(exams[0]?.scoreDistribution.bins ?? [])].reverse().map(referenceBin => (
                  <tr key={referenceBin.label}>
                    <th className="px-5 py-4 text-left font-black text-slate-700">{referenceBin.label}점</th>
                    {exams.map(exam => {
                      const bin = exam.scoreDistribution.bins.find(item => item.label === referenceBin.label)
                      const isStudentBand = exam.scoreDistribution.studentBand === referenceBin.label
                      return <td key={exam.examId} data-student={isStudentBand} className="m3-distribution-cell px-3 py-4"><p className="text-base font-black text-slate-700">{(bin?.percent ?? 0).toFixed(1)}%</p>{isStudentBand && <span className="mt-1 inline-flex rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">내 위치 · {score(exam.result!.totalScore)}점</span>}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 p-4 md:hidden">
            {exams.map(exam => <article key={exam.examId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3"><div><p className="font-black text-slate-900">{exam.round}차</p><p className="mt-1 text-[11px] font-bold"><span className="text-rose-600">최고 {score(exam.scoreDistribution.highest)}</span><span className="mx-1 text-slate-300">·</span><span className="text-emerald-700">최저 {score(exam.scoreDistribution.lowest)}</span></p></div><span className={`rounded-md px-2 py-1 text-[10px] font-black ${exam.attended ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>{exam.result ? `내 점수 ${score(exam.result.totalScore)}` : '미응시'}</span></div>
              <div className="divide-y divide-slate-100">
                {[...exam.scoreDistribution.bins].reverse().map(bin => {
                  const isStudentBand = exam.scoreDistribution.studentBand === bin.label
                  return <div key={bin.label} data-student={isStudentBand} className="m3-distribution-cell flex items-center justify-between gap-3 px-4 py-3"><p className="text-xs font-bold text-slate-600">{bin.label}점</p><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-800">{bin.percent.toFixed(1)}%</p>{isStudentBand && <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[9px] font-black text-white">내 위치</span>}</div></div>
                })}
              </div>
            </article>)}
          </div>
          <p className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-400 sm:px-6">전체 인원 수와 학생별 순위는 공개하지 않으며, 구간별 비율만 표시합니다.</p>
        </section>

        <section className="m3-card mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div><div className="flex items-center gap-2"><Target className="text-orange-600" size={20} /><h2 className="text-lg font-black">유형별 학습 진단</h2></div><p className="mt-1 text-xs text-slate-400">객관식 정오표를 기준으로 강점과 보완이 필요한 유형을 분석했습니다.</p></div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAnalysisRound('all')} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${analysisRound === 'all' ? 'bg-[#10243d] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>누적</button>
              {exams.map(exam => <button key={exam.examId} onClick={() => setAnalysisRound(exam.round)} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${analysisRound === exam.round ? 'bg-blue-600 text-white' : exam.attended ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'border border-dashed border-slate-300 bg-white text-slate-400'}`}>{exam.round}차{exam.attended ? '' : ' 미응시'}</button>)}
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
            <article className="m3-diagnostic m3-diagnostic-warning rounded-3xl border border-orange-100 bg-orange-50/70 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-orange-800"><Target size={18} /><h3 className="font-black">보완이 필요한 유형</h3></div>
              <p className="mt-2 text-xs leading-5 text-orange-800/65">오답 수가 많은 유형부터 정리했습니다.</p>
              <div className="mt-5 space-y-3">
                {selectedRoundAbsent ? <p className="rounded-2xl border border-dashed border-orange-200 bg-white p-5 text-center text-sm font-bold text-slate-500 shadow-sm">{analysisRound}차는 미응시하여 분석 결과가 없습니다.</p> : improvements.length ? improvements.map((type, index) => (
                  <div key={type.detailType} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-orange-500">{index === 0 ? '최다 오답 유형' : type.category}</p><p className="mt-1 font-black text-slate-800">{type.detailType}</p></div><span className="shrink-0 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-black text-orange-700">오답 {type.missedCount}개</span></div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-400" style={{ width: `${type.accuracy}%` }} /></div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>나 {type.correct}/{type.total} · {type.accuracy.toFixed(1)}%</span><span>전체 {type.cohortRate.toFixed(1)}%</span></div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">오답: {type.missedQuestions.length ? type.missedQuestions.map(value => typeof value === 'number' ? `${value}번` : value).join(', ') : '없음'}</p>
                  </div>
                )) : <p className="rounded-2xl bg-white p-4 text-sm font-bold text-emerald-700 shadow-sm">이 회차에서는 객관식 오답이 없습니다.</p>}
              </div>
            </article>

            <article className="m3-diagnostic m3-diagnostic-success rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 size={18} /><h3 className="font-black">잘한 유형</h3></div>
              <p className="mt-2 text-xs leading-5 text-emerald-800/65">정답률이 높은 유형을 학습 강점으로 표시했습니다.</p>
              <div className="mt-5 space-y-3">
                {selectedRoundAbsent ? <p className="rounded-2xl border border-dashed border-emerald-200 bg-white p-5 text-center text-sm font-bold text-slate-500 shadow-sm">{analysisRound}차는 미응시하여 분석 결과가 없습니다.</p> : strengths.length ? strengths.map((type, index) => (
                  <div key={type.detailType} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-emerald-500">{index === 0 ? '대표 강점 유형' : type.category}</p><p className="mt-1 font-black text-slate-800">{type.detailType}</p></div><span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">{type.accuracy.toFixed(1)}%</span></div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${type.accuracy}%` }} /></div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>나 {type.correct}/{type.total}</span><span>전체 {type.cohortRate.toFixed(1)}%</span></div>
                  </div>
                )) : <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-500 shadow-sm">분석할 객관식 응시 데이터가 없습니다.</p>}
              </div>
            </article>
          </div>
          <p className="border-t border-slate-100 px-6 py-4 text-xs leading-5 text-slate-400">{hasWritten ? '서술형은 일부 채점표에서 문항별 점수 대신 합계만 제공되어, 유형별 강약점은 객관식 문항을 기준으로 계산했습니다.' : '유형별 강약점은 객관식 문항별 정오 결과를 기준으로 계산했습니다.'}</p>
        </section>

        <section className="m3-card mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-5 sm:px-6"><BookOpenCheck className="text-indigo-600" size={20} /><h2 className="text-lg font-black">회차별 성적</h2></div>
          <div className="space-y-3 p-4 sm:hidden">
            {exams.map(exam => <article key={exam.examId} className={`rounded-2xl border p-4 ${exam.result ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-3"><p className="font-black text-slate-800">{exam.round}차</p>{exam.result ? <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">상위 {exam.result.topPercent}%</span> : <span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">미응시</span>}</div>
              {exam.result ? <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-400">전체</p><p className="mt-1 text-lg font-black text-blue-950">{score(exam.result.totalScore)}점</p></div><div><p className="text-slate-400">전체 평균</p><p className="mt-1 text-lg font-black text-slate-700">{exam.averages.total.toFixed(1)}점</p></div><div><p className="text-slate-400">객관식</p><p className="mt-1 font-bold text-slate-700">{score(exam.result.objectiveScore)}점</p></div>{hasWritten && <div><p className="text-slate-400">서술형</p><p className="mt-1 font-bold text-slate-700">{score(exam.result.writtenScore)}점</p></div>}</div> : <p className="mt-3 text-xs leading-5 text-slate-500">채점 결과에 학생 이름이 없어 미응시로 표시했습니다.</p>}
            </article>)}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className={`w-full text-left text-sm ${hasWritten ? 'min-w-[720px]' : 'min-w-[620px]'}`}>
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-6 py-3">회차</th><th className="px-4 py-3 text-right">전체</th><th className="px-4 py-3 text-right">객관식</th>{hasWritten && <th className="px-4 py-3 text-right">서술형</th>}<th className="px-4 py-3 text-right">전체 평균</th><th className="px-6 py-3 text-right">성취 구간</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map(exam => <tr key={exam.examId} className="hover:bg-slate-50/70"><td className="px-6 py-4 font-black text-slate-800">{exam.round}차</td>{exam.result ? <><td className="px-4 py-4 text-right font-black text-blue-950">{score(exam.result.totalScore)}</td><td className="px-4 py-4 text-right text-slate-600">{score(exam.result.objectiveScore)}</td>{hasWritten && <td className="px-4 py-4 text-right text-slate-600">{score(exam.result.writtenScore)}</td>}<td className="px-4 py-4 text-right text-slate-500">{exam.averages.total.toFixed(1)}</td><td className="px-6 py-4 text-right"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">상위 {exam.result.topPercent}%</span></td></> : <td colSpan={hasWritten ? 5 : 4} className="px-4 py-4 text-center"><span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500">미응시</span></td>}</tr>)}
              </tbody>
            </table>
          </div>
        </section>

        {detailReport && (
          <section className="m3-callout mt-6 flex flex-col gap-4 rounded-3xl border border-indigo-100 bg-indigo-50/70 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2 text-indigo-800"><Sparkles size={19} /><h2 className="font-black">최근 시험 문항별 분석</h2></div><p className="mt-2 text-sm text-indigo-700/70">기존에 제공하던 {detailReport.examTitle} 문항별 상세 분석도 계속 확인할 수 있습니다.</p></div>
            <button onClick={onOpenDetail} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-800">상세 분석 보기 <ArrowRight size={16} /></button>
          </section>
        )}
      </main>
      <footer className="m3-footer border-t border-slate-200 bg-white py-7 text-center text-xs text-slate-400 print:hidden">SEUM 학생 누적 성적 리포트 · 본 자료는 개인 열람용입니다.</footer>
    </div>
  )
}
