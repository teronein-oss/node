import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { Check, Clipboard, Database, Download, ExternalLink, FileUp, KeyRound, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { functions } from '../firebase'
import { useAuth } from '../context/AuthContext'

interface IssuedCode {
  reportId: string
  studentName: string
  accessCode: string
}

interface PublishResponse {
  examId: string
  examTitle: string
  publishedCount: number
  existingCount: number
  issuedCodes: IssuedCode[]
  expiresAt: number
}

interface ActualScoreAdminData {
  retentionDays: number
  terms: Array<{
    termId: string
    year: number
    semester: number
    examType: string
    label: string
  }>
  cohorts: Array<{
    cohortId: string
    school: string
    grade: number
    termIds: string[]
    students: Array<{ studentId: string; studentName: string }>
  }>
  scores: Array<{
    id: string
    cohortId: string
    studentId: string
    termId: string
    year: number
    semester: number
    examType: '중간고사' | '기말고사'
    score: number
    updatedAt: number | null
  }>
}

interface SaveActualScoresResponse {
  savedCount: number
  deletedCount: number
  expiresAt: number
}

const publishReports = httpsCallable<{ academyId: string; rotateCodes: boolean }, PublishResponse>(functions, 'publishBaekhyeonStudentReports')
const fetchActualScoreAdminData = httpsCallable<{ academyId: string }, ActualScoreAdminData>(functions, 'getActualExamScoreAdminData')
const saveActualScores = httpsCallable<{
  academyId: string
  cohortId: string
  termId: string
  scores: Array<{ studentId: string; score: number | null }>
}, SaveActualScoresResponse>(functions, 'saveActualExamScores')

function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export default function ReportAdminPage() {
  const { user } = useAuth()
  const [result, setResult] = useState<PublishResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [actualData, setActualData] = useState<ActualScoreAdminData | null>(null)
  const [actualLoading, setActualLoading] = useState(true)
  const [actualSaving, setActualSaving] = useState(false)
  const [actualError, setActualError] = useState('')
  const [actualMessage, setActualMessage] = useState('')
  const [selectedCohortId, setSelectedCohortId] = useState('')
  const [selectedActualTermId, setSelectedActualTermId] = useState('')
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({})

  const reportUrl = `${window.location.origin}/report`

  const selectedCohort = useMemo(
    () => actualData?.cohorts.find(cohort => cohort.cohortId === selectedCohortId) ?? null,
    [actualData, selectedCohortId],
  )
  const availableActualTerms = useMemo(
    () => actualData?.terms.filter(term => selectedCohort?.termIds.includes(term.termId)) ?? [],
    [actualData, selectedCohort],
  )
  const selectedActualTerm = useMemo(
    () => availableActualTerms.find(term => term.termId === selectedActualTermId) ?? null,
    [availableActualTerms, selectedActualTermId],
  )

  const loadActualScoreData = async () => {
    if (!user?.academyId) return
    setActualLoading(true)
    setActualError('')
    try {
      const response = await fetchActualScoreAdminData({ academyId: user.academyId })
      setActualData(response.data)
      setSelectedCohortId(current => current || response.data.cohorts[0]?.cohortId || '')
      setSelectedActualTermId(current => current || response.data.terms[0]?.termId || '')
    } catch (loadError) {
      setActualError((loadError as Error).message || '실제 성적 데이터를 불러오지 못했습니다.')
    } finally {
      setActualLoading(false)
    }
  }

  useEffect(() => {
    void loadActualScoreData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.academyId])

  useEffect(() => {
    if (!selectedCohort) return
    const nextDraft: Record<string, string> = {}
    for (const student of selectedCohort.students) {
      const existing = actualData?.scores.find(score =>
        score.cohortId === selectedCohort.cohortId
        && score.studentId === student.studentId
        && score.termId === selectedActualTermId)
      nextDraft[student.studentId] = existing ? String(existing.score) : ''
    }
    setScoreDraft(nextDraft)
  }, [actualData, selectedCohort, selectedActualTermId])

  useEffect(() => {
    if (!availableActualTerms.some(term => term.termId === selectedActualTermId)) {
      setSelectedActualTermId(availableActualTerms[0]?.termId ?? '')
    }
  }, [availableActualTerms, selectedActualTermId])

  const saveActualExamResults = async () => {
    if (!user?.academyId || !selectedCohort || !selectedActualTerm || actualSaving) return
    setActualSaving(true)
    setActualError('')
    setActualMessage('')
    try {
      const scores = selectedCohort.students.map(student => {
        const raw = scoreDraft[student.studentId]?.trim() ?? ''
        return { studentId: student.studentId, score: raw === '' ? null : Number(raw) }
      })
      if (scores.some(item => item.score !== null && (!Number.isFinite(item.score) || item.score < 0 || item.score > 100))) {
        setActualError('점수는 0점부터 100점까지 입력해 주세요.')
        return
      }
      const response = await saveActualScores({
        academyId: user.academyId,
        cohortId: selectedCohort.cohortId,
        termId: selectedActualTerm.termId,
        scores,
      })
      setActualMessage(`${selectedActualTerm.label} 실제 점수 ${response.data.savedCount}명 저장 완료`)
      await loadActualScoreData()
    } catch (saveError) {
      setActualError((saveError as Error).message || '실제 성적 저장 중 오류가 발생했습니다.')
    } finally {
      setActualSaving(false)
    }
  }

  const runPublish = async (rotateCodes: boolean) => {
    if (!user?.academyId || loading) return
    if (rotateCodes && !confirm('기존 식별 코드는 즉시 사용할 수 없게 됩니다. 전체 코드를 재발급할까요?')) return
    setLoading(true)
    setError('')
    try {
      const response = await publishReports({ academyId: user.academyId, rotateCodes })
      setResult(response.data)
    } catch (publishError) {
      setError((publishError as Error).message || '리포트 게시 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const smsText = (item: IssuedCode) => `[NODE] ${item.studentName} 학생 성적표\n${reportUrl}\n식별코드: ${formatCode(item.accessCode)}`

  const copy = async (item: IssuedCode) => {
    await navigator.clipboard.writeText(smsText(item))
    setCopied(item.reportId)
    window.setTimeout(() => setCopied(''), 1500)
  }

  const downloadCsv = () => {
    if (!result?.issuedCodes.length) return
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = [
      ['학생명', '식별코드', '성적표 링크', '문자 내용'],
      ...result.issuedCodes.map(item => [item.studentName, formatCode(item.accessCode), reportUrl, smsText(item)]),
    ]
    const csv = `\ufeff${rows.map(row => row.map(escape).join(',')).join('\n')}`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `${result.examId}-access-codes.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold tracking-wider text-blue-600">STUDENT REPORTS</p><h1 className="mt-1 text-2xl font-black text-slate-900">학생 성적표 관리</h1><p className="mt-2 text-sm text-slate-500">모의고사 리포트를 게시하고 실제 중간·기말 성적을 함께 관리합니다.</p></div>
          <Link to="/report" target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">학생 페이지 열기 <ExternalLink size={15} /></Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Database size={20} /></div><div><h2 className="font-black text-slate-800">실제 내신 점수 입력</h2><p className="mt-1 text-xs text-slate-500">분석파일이 등록된 시험 대분류에 연결해 저장하며, 해당 누적 성적표에만 표시됩니다.</p></div></div>
          <button onClick={saveActualExamResults} disabled={actualLoading || actualSaving || !selectedCohort || !selectedActualTerm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-40">{actualSaving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}실제 점수 저장</button>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-2 sm:px-7">
          <label className="text-xs font-bold text-slate-500">학교·학년<select value={selectedCohortId} onChange={event => setSelectedCohortId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">{actualData?.cohorts.map(cohort => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.school} {cohort.grade}학년</option>)}</select></label>
          <label className="text-xs font-bold text-slate-500">시험 대분류<select value={selectedActualTermId} onChange={event => setSelectedActualTermId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">{availableActualTerms.map(term => <option key={term.termId} value={term.termId}>{term.label}</option>)}</select></label>
        </div>

        {actualError && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 sm:px-7">{actualError}</p>}
        {actualMessage && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 sm:px-7"><Check className="mr-1.5 inline" size={15} />{actualMessage}</p>}

        {actualLoading ? <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-slate-400"><RefreshCw className="animate-spin" size={16} />학생 목록을 불러오는 중...</div> : selectedCohort ? <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-6 py-3">번호</th><th className="px-4 py-3">학생</th><th className="px-6 py-3 text-right">실제 점수</th></tr></thead><tbody className="divide-y divide-slate-100">{selectedCohort.students.map((student, index) => <tr key={student.studentId}><td className="px-6 py-3 text-slate-400">{index + 1}</td><td className="px-4 py-3 font-semibold text-slate-800">{student.studentName}</td><td className="px-6 py-2 text-right"><div className="ml-auto flex w-32 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-indigo-400"><input aria-label={`${student.studentName} 실제 점수`} inputMode="decimal" type="number" min={0} max={100} step={0.1} value={scoreDraft[student.studentId] ?? ''} onChange={event => setScoreDraft(current => ({ ...current, [student.studentId]: event.target.value }))} placeholder="미입력" className="min-w-0 flex-1 border-0 bg-transparent py-2 text-right font-bold text-slate-800 outline-none" /><span className="ml-1 text-xs text-slate-400">점</span></div></td></tr>)}</tbody></table></div> : <div className="px-6 py-12 text-center text-sm text-slate-400">입력할 학생 데이터가 없습니다.</div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><FileUp size={22} /></div><div><h2 className="font-black text-slate-800">백현고2 모의시험 4차</h2><p className="mt-1 text-sm text-slate-500">43명의 문항별 성적표 · 코드 및 성적 데이터 보관기간 2년</p></div></div>
          <button onClick={() => runPublish(false)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10243d] px-5 py-3 text-sm font-bold text-white hover:bg-[#173a61] disabled:opacity-50">{loading ? <RefreshCw className="animate-spin" size={16} /> : <FileUp size={16} />}게시 및 신규 코드 발급</button>
        </div>
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><ShieldAlert className="mt-0.5 shrink-0" size={17} /><p>식별 코드는 원문으로 저장되지 않으며 발급 직후에만 확인할 수 있습니다. 발급 결과를 바로 CSV로 저장하세요.</p></div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      </section>

      {result && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div><p className="flex items-center gap-2 font-black text-emerald-700"><Check size={18} />{result.publishedCount}명 게시 완료</p><p className="mt-1 text-xs text-slate-400">만료일 {new Date(result.expiresAt).toLocaleDateString('ko-KR')}</p></div>
            <div className="flex gap-2"><button onClick={downloadCsv} disabled={!result.issuedCodes.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Download size={15} />코드 CSV 저장</button><button onClick={() => runPublish(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={14} />전체 재발급</button></div>
          </div>
          {result.issuedCodes.length ? (
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-6 py-3">학생</th><th className="px-4 py-3">식별 코드</th><th className="px-6 py-3 text-right">문자 내용</th></tr></thead><tbody className="divide-y divide-slate-100">{result.issuedCodes.map(item => <tr key={item.reportId}><td className="px-6 py-3 font-semibold text-slate-800">{item.studentName}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 font-mono font-bold tracking-wider text-slate-700"><KeyRound size={14} />{formatCode(item.accessCode)}</span></td><td className="px-6 py-3 text-right"><button onClick={() => copy(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">{copied === item.reportId ? <Check size={14} className="text-emerald-600" /> : <Clipboard size={14} />}{copied === item.reportId ? '복사됨' : '문자 복사'}</button></td></tr>)}</tbody></table>
            </div>
          ) : (
            <div className="p-8 text-center"><p className="text-sm font-semibold text-slate-700">이미 게시된 리포트입니다.</p><p className="mt-2 text-xs text-slate-500">기존 코드를 보관하지 않았다면 ‘전체 재발급’을 눌러 새 코드를 발급하세요.</p></div>
          )}
        </section>
      )}
    </div>
  )
}
