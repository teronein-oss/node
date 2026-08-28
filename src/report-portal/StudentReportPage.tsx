import { FormEvent, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  Check,
  ChevronRight,
  FileText,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Printer,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { functions } from '../firebase'
import StudentCumulativeDashboard from './StudentCumulativeDashboard'
import TeacherReportDashboard from './TeacherReportDashboard'
import type { StudentCumulativeReportData, StudentReportData, StudentReportResponse, TeacherDashboardResponse, TeacherStudentReportResponse } from '../types/studentReport'

const fetchStudentReport = httpsCallable<{ code: string }, StudentReportResponse>(functions, 'getStudentReport')
const fetchTeacherDashboard = httpsCallable<{ code: string }, TeacherDashboardResponse>(functions, 'getTeacherDashboard')
const fetchTeacherStudentReport = httpsCallable<{ code: string; studentId: string }, TeacherStudentReportResponse>(functions, 'getTeacherStudentReport')
const resolveReportPortalAccess = httpsCallable<{ code: string }, { role: 'student' | 'teacher' }>(functions, 'resolveReportPortalAccess')

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

function displayCode(value: string) {
  return value.match(/.{1,4}/g)?.join('-') ?? value
}

function isSubmittableCode(value: string) {
  return value.length === 8 || value.length === 12
}

function getErrorMessage(error: unknown) {
  const data = error as { code?: string; message?: string }
  if (data.code?.includes('resource-exhausted')) return '입력 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.'
  if (data.code?.includes('unavailable')) return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  return '식별 코드가 올바르지 않거나 사용 기간이 만료되었습니다.'
}

function ScoreCard({ label, score, total, average, tone }: {
  label: string
  score: number
  total: number
  average: number
  tone: 'navy' | 'blue' | 'mint'
}) {
  const tones = {
    navy: 'bg-[#10243d] text-white border-[#10243d]',
    blue: 'bg-blue-50 text-blue-950 border-blue-100',
    mint: 'bg-emerald-50 text-emerald-950 border-emerald-100',
  }
  const muted = tone === 'navy' ? 'text-blue-100/75' : 'text-slate-500'
  return (
    <div data-tone={tone} className={`m3-score-card rounded-3xl border p-5 sm:p-6 ${tones[tone]}`}>
      <p className={`text-xs font-semibold tracking-[0.12em] ${muted}`}>{label}</p>
      <div className="mt-3 flex items-end gap-1.5">
        <span className="text-4xl font-black tracking-tight">{score}</span>
        <span className={`pb-1 text-sm font-semibold ${muted}`}>/ {total}</span>
      </div>
      <p className={`mt-3 text-xs ${muted}`}>전체 평균 {average.toFixed(1)}점</p>
    </div>
  )
}

function ReportView({ report, onReset, backLabel = '나가기' }: { report: StudentReportData; onReset: () => void; backLabel?: string }) {
  const hasWritten = report.cohortAverages.written > 0 || report.writtenScore > 0
  const priorityQuestions = useMemo(
    () => report.priorities.map(number => report.questions.find(question => question.number === number)).filter(Boolean),
    [report],
  )

  return (
    <div className="m3-report min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-900 print:bg-white">
      <header className="m3-topbar border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="m3-brand-mark flex h-9 w-9 items-center justify-center rounded-xl bg-[#10243d] text-white">
              <GraduationCap size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black tracking-wide text-[#10243d]">SEUM</p>
              <p className="hidden text-[11px] text-slate-400 sm:block">학생 성적 리포트</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="m3-outlined-button inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <Printer size={15} /> <span className="hidden sm:inline">인쇄</span>
            </button>
            <button onClick={onReset} className="m3-tonal-button inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:px-3">
              <ArrowLeft size={15} /> {backLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-12">
        <section className="m3-hero overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#10243d] via-[#16375c] to-[#1d4f78] p-5 text-white shadow-xl shadow-slate-300/40 sm:rounded-[2rem] sm:p-9">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="m3-chip mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50">
                <ShieldCheck size={14} /> 본인 확인 완료
              </div>
              <p className="text-sm text-blue-100/75">{report.examTitle}</p>
              <h1 className="mt-2 break-keep text-2xl font-black tracking-tight sm:text-4xl">{report.studentName} 학생</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-50/75">문항별 결과와 학급 정답률을 바탕으로 강점과 우선 복습 영역을 정리했습니다.</p>
            </div>
            <div className="m3-hero-meta grid w-full grid-cols-[1fr_auto_1fr] gap-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm sm:w-auto sm:gap-6 sm:px-5">
              <div>
                <p className="text-[11px] text-blue-100/65">객관식 성취</p>
                <p className="mt-1 text-xl font-black">상위 {report.objectiveTopPercent}%</p>
              </div>
              <div className="w-px bg-white/15" />
              <div>
                <p className="text-[11px] text-blue-100/65">전체 점수 성취</p>
                <p className="mt-1 text-xl font-black">상위 {report.totalTopPercent}%</p>
              </div>
            </div>
          </div>
        </section>

        {report.dataWarning && (
          <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div><p className="font-bold">점수 확인이 필요합니다</p><p className="mt-1 text-xs leading-5 text-amber-800">{report.dataWarning}</p></div>
          </div>
        )}

        <section className={`mt-6 grid gap-4 ${hasWritten ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
          <ScoreCard label="전체 점수" score={report.totalScore} total={100} average={report.cohortAverages.total} tone="navy" />
          {hasWritten && <ScoreCard label="객관식" score={report.objectiveScore} total={80} average={report.cohortAverages.objective} tone="blue" />}
          {hasWritten && <ScoreCard label="서술형" score={report.writtenScore} total={20} average={report.cohortAverages.written} tone="mint" />}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="text-blue-600" size={20} />
            <h2 className="text-lg font-black text-slate-900">영역별 성취</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {report.categories.map(category => {
              const rate = category.correct / category.total * 100
              return (
                <article key={category.category} className="m3-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">{category.category}</h3>
                    <span className="text-sm font-black text-blue-700">{category.correct}/{category.total}</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="m3-progress h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${rate}%` }} />
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-slate-400">
                    <span>나 {rate.toFixed(1)}%</span><span>전체 {category.cohortRate.toFixed(1)}%</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">오답 {category.missedQuestions.length ? `${category.missedQuestions.join(', ')}번` : '없음'}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="m3-diagnostic m3-diagnostic-success rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6">
            <div className="flex items-center gap-2 text-emerald-800"><Check size={19} /><h2 className="font-black">강점 영역</h2></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {report.strengths.map(strength => <span key={strength} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm">{strength}</span>)}
            </div>
            <p className="mt-4 text-xs leading-5 text-emerald-800/70">강점 유형도 정답 근거를 말로 설명해 보면 실전 안정성이 높아집니다.</p>
          </div>
          <div className="m3-diagnostic m3-diagnostic-warning rounded-3xl border border-orange-100 bg-orange-50/70 p-6">
            <div className="flex items-center gap-2 text-orange-800"><Target size={19} /><h2 className="font-black">우선 복습 문항</h2></div>
            <div className="mt-4 space-y-3">
              {priorityQuestions.length ? priorityQuestions.map(question => question && (
                <div key={question.number} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-black text-orange-700">{question.number}</span>
                  <div><p className="text-sm font-bold text-slate-800">{question.detailType}</p><p className="mt-1 text-xs leading-5 text-slate-500">{question.topic}</p></div>
                </div>
              )) : <p className="text-sm text-orange-800">{hasWritten ? '객관식 오답이 없습니다. 서술형 표현을 복습하세요.' : '객관식 오답이 없습니다.'}</p>}
            </div>
          </div>
        </section>

        <section className="m3-card mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-5 sm:px-6">
            <FileText className="text-blue-600" size={20} /><h2 className="text-lg font-black">객관식 문항별 결과</h2>
          </div>
          <div className="space-y-3 p-4 sm:hidden">
            {report.questions.map(question => <article key={question.number} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-700">{question.number}</span><p className="truncate font-bold text-slate-700">{question.detailType}</p></div>{question.correct ? <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={15} /></span> : <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"><X size={15} /></span>}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><p className="text-slate-400">학생 답</p><p className="mt-1 font-black text-slate-800">{question.studentAnswer}</p></div><div><p className="text-slate-400">정답</p><p className="mt-1 font-black text-slate-700">{question.correctAnswer}</p></div><div className="text-right"><p className="text-slate-400">전체 정답률</p><p className="mt-1 font-black text-slate-700">{question.cohortRate.toFixed(1)}%</p></div></div>
            </article>)}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-6 py-3">번호</th><th className="px-3 py-3">유형</th><th className="px-3 py-3">학생 답</th><th className="px-3 py-3">정답</th><th className="px-3 py-3">결과</th><th className="px-6 py-3 text-right">전체 정답률</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {report.questions.map(question => (
                  <tr key={question.number} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3 font-black text-slate-700">{question.number}</td>
                    <td className="px-3 py-3 text-slate-600">{question.detailType}</td>
                    <td className="px-3 py-3 font-semibold">{question.studentAnswer}</td>
                    <td className="px-3 py-3 text-slate-500">{question.correctAnswer}</td>
                    <td className="px-3 py-3">{question.correct ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={15} /></span> : <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700"><X size={15} /></span>}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{question.cohortRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {hasWritten && <section className="m3-card mt-6 rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2"><BookOpenCheck className="text-indigo-600" size={20} /><h2 className="font-black">서술형 안내</h2></div>
          <p className="mt-3 text-sm leading-6 text-slate-600">서술형은 21~24번 총 20점이며, 현재 채점표에는 문항별 점수가 아닌 합계 <strong>{report.writtenScore}점</strong>만 제공되어 있습니다.</p>
        </section>}
      </main>

      <footer className="m3-footer border-t border-slate-200 bg-white py-7 text-center text-xs text-slate-400 print:hidden">SEUM 학생 성적 리포트 · 본 자료는 개인 열람용입니다.</footer>
    </div>
  )
}

export default function StudentReportPage() {
  const [code, setCode] = useState('')
  const [report, setReport] = useState<StudentReportData | null>(null)
  const [cumulative, setCumulative] = useState<StudentCumulativeReportData | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [teacherDashboard, setTeacherDashboard] = useState<TeacherDashboardResponse | null>(null)
  const [teacherStudentCumulative, setTeacherStudentCumulative] = useState<StudentCumulativeReportData | null>(null)
  const [teacherStudentLoadingId, setTeacherStudentLoadingId] = useState('')
  const [teacherStudentError, setTeacherStudentError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isSubmittableCode(code) || loading) return
    setLoading(true)
    setError('')
    try {
      const access = await resolveReportPortalAccess({ code })
      if (access.data.role === 'teacher') {
        const result = await fetchTeacherDashboard({ code })
        setTeacherDashboard(result.data)
      } else {
        const result = await fetchStudentReport({ code })
        if (!result.data.report && !result.data.cumulative) throw new Error('성적 데이터가 없습니다.')
        setReport(result.data.report)
        setCumulative(result.data.cumulative)
        setShowDetail(false)
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  const openTeacherStudentReport = async (studentId: string) => {
    if (teacherStudentLoadingId) return
    setTeacherStudentLoadingId(studentId)
    setTeacherStudentError('')
    try {
      const result = await fetchTeacherStudentReport({ code, studentId })
      setTeacherStudentCumulative(result.data.cumulative)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (requestError) {
      setTeacherStudentError(getErrorMessage(requestError))
    } finally {
      setTeacherStudentLoadingId('')
    }
  }

  if (teacherStudentCumulative) return <StudentCumulativeDashboard data={teacherStudentCumulative} detailReport={null} onOpenDetail={() => undefined} backLabel="교사 화면" onReset={() => setTeacherStudentCumulative(null)} />
  if (cumulative && !showDetail) return <StudentCumulativeDashboard data={cumulative} detailReport={report} onOpenDetail={() => setShowDetail(true)} onReset={() => { setCumulative(null); setReport(null); setCode(''); setError('') }} />
  if (report) return <ReportView report={report} backLabel={cumulative ? '누적 리포트' : '나가기'} onReset={() => { if (cumulative) setShowDetail(false); else { setReport(null); setCode(''); setError('') } }} />
  if (teacherDashboard) return <TeacherReportDashboard data={teacherDashboard} loadingStudentId={teacherStudentLoadingId} studentError={teacherStudentError} onSelectStudent={openTeacherStudentReport} onReset={() => { setTeacherDashboard(null); setTeacherStudentCumulative(null); setTeacherStudentError(''); setCode(''); setError('') }} />

  return (
    <div className="m3-report m3-login relative min-h-screen overflow-x-hidden bg-[#eef3f8] text-slate-900">
      <div className="m3-login-backdrop absolute inset-x-0 top-0 h-[43vh] min-h-[360px] bg-gradient-to-br from-[#0d2037] via-[#153b61] to-[#1f6683]" />
      <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="absolute -right-20 top-0 h-96 w-96 rounded-full bg-blue-300/10 blur-3xl" />

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-7 sm:px-6 sm:py-10">
        <header className="m3-login-brand flex items-center gap-3 text-white">
          <div className="m3-brand-mark flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur"><GraduationCap size={24} /></div>
          <div><p className="text-lg font-black tracking-[0.12em]">SEUM</p><p className="text-[11px] text-blue-100/65">RESULT PORTAL</p></div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-16">
          <div className="grid min-w-0 w-full items-stretch gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="m3-login-copy min-w-0 flex flex-col justify-center px-2 py-8 text-white sm:px-8 lg:py-14">
              <div className="m3-chip inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50"><LockKeyhole size={14} />코드 기반 안전 열람</div>
              <h1 className="mt-6 text-3xl font-black leading-[1.15] tracking-tight sm:text-5xl">SEUM 내신모의고사<br /><span className="text-cyan-300">성적확인 시스템</span></h1>
              <div className="mt-8 hidden gap-5 text-xs text-blue-100/65 sm:flex"><span className="flex items-center gap-2"><ShieldCheck size={15} />권한별 암호화 코드</span><span className="flex items-center gap-2"><FileText size={15} />회차·누적 성적 분석</span></div>
            </section>

            <section className="m3-login-panel min-w-0 rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-2xl shadow-slate-950/20 sm:rounded-[2rem] sm:p-9">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><KeyRound size={23} /></div>
              <h2 className="mt-5 text-2xl font-black tracking-tight">성적 결과 열람</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">발급받은 식별 코드를 입력해 주세요. 코드에 맞는 화면으로 자동 연결됩니다.</p>

              <form onSubmit={submit} className="mt-8">
                <label htmlFor="report-code" className="text-xs font-bold text-slate-600">식별 코드</label>
                <div className={`m3-text-field mt-2 flex items-center rounded-2xl border bg-slate-50 px-4 transition ${error ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50'}`}>
                  <KeyRound size={19} className="shrink-0 text-slate-400" />
                  <input id="report-code" autoFocus autoComplete="one-time-code" inputMode="text" value={displayCode(code)} onChange={event => { setCode(normalizeCode(event.target.value)); setError('') }} placeholder="ABCD-2345" className="min-w-0 flex-1 bg-transparent px-3 py-4 text-center text-xl font-black tracking-[0.16em] text-slate-800 outline-none placeholder:text-slate-300" aria-describedby={error ? 'report-code-error' : 'report-code-help'} />
                </div>
                {error ? (
                  <p id="report-code-error" role="alert" className="mt-3 flex items-start gap-2 text-xs leading-5 text-rose-600"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{error}</p>
                ) : code.length > 0 && code.length < 8 ? (
                  <p id="report-code-help" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-600">
                    <AlertTriangle size={14} />현재 {code.length}/8자리 · {8 - code.length}자리 더 입력해 주세요.
                  </p>
                ) : code.length > 8 && code.length < 12 ? (
                  <p id="report-code-help" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-600">
                    <AlertTriangle size={14} />현재 {code.length}/12자리 · {12 - code.length}자리 더 입력해 주세요.
                  </p>
                ) : (
                  <p id="report-code-help" className="mt-3 text-xs text-slate-400">영문 대소문자와 하이픈은 구분하지 않습니다.</p>
                )}
                <button type="submit" disabled={!isSubmittableCode(code) || loading} className="m3-primary-button mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#10243d] px-5 py-4 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-[#173a61] disabled:cursor-not-allowed disabled:opacity-40">
                  {loading ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />확인 중...</>
                  ) : code.length > 0 && code.length < 8 ? (
                    <>코드 {8 - code.length}자리 더 입력</>
                  ) : code.length > 8 && code.length < 12 ? (
                    <>코드 {12 - code.length}자리 더 입력</>
                  ) : (
                    <>성적 결과 확인하기 <ChevronRight size={17} /></>
                  )}
                </button>
              </form>

              <div className="m3-info-card mt-7 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500"><p className="flex items-center gap-2 font-bold text-slate-700"><ShieldCheck size={15} className="text-emerald-600" />안전한 열람 안내</p><p className="mt-2">연속으로 코드를 잘못 입력하면 개인정보 보호를 위해 잠시 조회가 제한됩니다.</p></div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
