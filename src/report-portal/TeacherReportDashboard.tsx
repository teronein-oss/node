import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  GraduationCap,
  Printer,
  Search,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import type { TeacherDashboardResponse, TeacherReportStudent } from '../types/studentReport'

interface CumulativeStudent extends TeacherReportStudent {
  attempts: number
}

function score(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function cumulativeStudents(exams: TeacherDashboardResponse['exams']): CumulativeStudent[] {
  const students = new Map<string, { name: string; total: number; objective: number; written: number; attempts: number }>()
  for (const exam of exams) {
    for (const student of exam.students) {
      const current = students.get(student.studentId) ?? { name: student.studentName, total: 0, objective: 0, written: 0, attempts: 0 }
      current.name = student.studentName
      current.total += student.totalScore
      current.objective += student.objectiveScore
      current.written += student.writtenScore
      current.attempts += 1
      students.set(student.studentId, current)
    }
  }

  const rows = [...students.entries()].map(([studentId, value]) => ({
    studentId,
    studentName: value.name,
    totalScore: value.total / value.attempts,
    objectiveScore: value.objective / value.attempts,
    writtenScore: value.written / value.attempts,
    rank: 0,
    topPercent: 0,
    attempts: value.attempts,
  }))
  rows.sort((first, second) => second.totalScore - first.totalScore || first.studentName.localeCompare(second.studentName, 'ko'))
  rows.forEach(row => {
    row.rank = 1 + rows.filter(candidate => candidate.totalScore > row.totalScore).length
    row.topPercent = Math.max(1, Math.ceil(row.rank / rows.length * 100))
  })
  return rows
}

export default function TeacherReportDashboard({ data, onReset, onSelectStudent, loadingStudentId, studentError }: {
  data: TeacherDashboardResponse
  onReset: () => void
  onSelectStudent: (studentId: string) => void
  loadingStudentId: string
  studentError: string
}) {
  const cohorts = data.cohorts?.length ? data.cohorts : [{
    cohortId: data.teacher.cohortId,
    school: data.teacher.school,
    grade: data.teacher.grade,
    teacherLabel: data.teacher.label,
    exams: data.exams,
  }]
  const [selectedCohortId, setSelectedCohortId] = useState(cohorts[0]?.cohortId ?? '')
  const [selectedTermId, setSelectedTermId] = useState(data.terms[0]?.termId ?? '')
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')

  const cohort = cohorts.find(item => item.cohortId === selectedCohortId) ?? cohorts[0]
  const term = data.terms.find(item => item.termId === selectedTermId) ?? data.terms[0]
  const termExams = useMemo(
    () => (cohort?.exams ?? []).filter(exam => exam.termId === term?.termId).sort((first, second) => first.round - second.round),
    [cohort?.exams, term?.termId],
  )
  const selectedExam = selectedRound === 'all' ? null : termExams.find(exam => exam.round === selectedRound) ?? null
  const hasWritten = termExams.some(exam => exam.averages.written > 0 || exam.students.some(student => student.writtenScore > 0))
  const allStudents = useMemo(() => cumulativeStudents(termExams), [termExams])
  const rows = useMemo<CumulativeStudent[]>(() => {
    if (!selectedExam) return allStudents
    return selectedExam.students.map(student => ({ ...student, attempts: 1 }))
  }, [allStudents, selectedExam])
  const filteredRows = rows.filter(row => row.studentName.toLocaleLowerCase('ko').includes(query.trim().toLocaleLowerCase('ko')))
  const averages = selectedExam?.averages ?? {
    total: rows.reduce((sum, row) => sum + row.totalScore, 0) / Math.max(rows.length, 1),
    objective: rows.reduce((sum, row) => sum + row.objectiveScore, 0) / Math.max(rows.length, 1),
    written: rows.reduce((sum, row) => sum + row.writtenScore, 0) / Math.max(rows.length, 1),
  }

  return (
    <div className="m3-report min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-900 print:bg-white">
      <header className="m3-topbar border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="m3-brand-mark flex h-9 w-9 items-center justify-center rounded-xl bg-[#10243d] text-white"><GraduationCap size={20} /></div>
            <div><p className="text-sm font-black tracking-wide text-[#10243d]">SEUM</p><p className="hidden text-[11px] text-slate-400 sm:block">교사용 성적 관리</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="m3-outlined-button inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Printer size={15} /><span className="hidden sm:inline">인쇄</span></button>
            <button onClick={onReset} className="m3-tonal-button inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:px-3"><ArrowLeft size={15} />나가기</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-10">
        <section className="m3-hero overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#10243d] via-[#183d63] to-[#236b84] p-5 text-white shadow-xl shadow-slate-300/40 sm:rounded-[2rem] sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="m3-chip inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50"><ShieldCheck size={14} />담당 반 접근 확인</div>
              <p className="mt-5 text-sm text-blue-100/70">{data.teacher.label}</p>
              <h1 className="mt-1 break-keep text-2xl font-black tracking-tight sm:text-4xl">{cohort?.school} {cohort?.grade}학년 성적 현황</h1>
              <p className="mt-3 text-sm leading-6 text-blue-50/70">담당 학교·학년의 회차별 성적과 누적 평균 석차를 확인할 수 있습니다.</p>
            </div>
            <div className="m3-hero-meta grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/10 p-2 backdrop-blur-sm sm:gap-2">
              <div className="min-w-0 rounded-xl px-2 py-3 sm:px-4"><p className="text-[10px] text-blue-100/60 sm:text-[11px]">연도</p><p className="mt-1 truncate text-xs font-black sm:text-base">{term?.year}학년도</p></div>
              <div className="min-w-0 rounded-xl px-2 py-3 sm:px-4"><p className="text-[10px] text-blue-100/60 sm:text-[11px]">학기</p><p className="mt-1 truncate text-xs font-black sm:text-base">{term?.semester}학기</p></div>
              <div className="min-w-0 rounded-xl px-2 py-3 sm:px-4"><p className="text-[10px] text-blue-100/60 sm:text-[11px]">시험</p><p className="mt-1 truncate text-xs font-black sm:text-base">{term?.examType}</p></div>
            </div>
          </div>
        </section>

        <section className="m3-card mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 md:items-end">
            <div>
              <label htmlFor="teacher-cohort" className="text-xs font-bold text-slate-500">학교·학년</label>
              <select id="teacher-cohort" value={selectedCohortId} onChange={event => { setSelectedCohortId(event.target.value); setSelectedRound('all'); setQuery('') }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
                {cohorts.map(item => <option key={item.cohortId} value={item.cohortId}>{item.school} {item.grade}학년</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="teacher-term" className="text-xs font-bold text-slate-500">시험 대분류</label>
              <select id="teacher-term" value={selectedTermId} onChange={event => { setSelectedTermId(event.target.value); setSelectedRound('all') }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
                {data.terms.map(item => <option key={item.termId} value={item.termId}>{item.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button onClick={() => setSelectedRound('all')} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${selectedRound === 'all' ? 'bg-[#10243d] text-white shadow-lg shadow-slate-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>누적</button>
              {termExams.map(exam => <button key={exam.examId} onClick={() => setSelectedRound(exam.round)} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${selectedRound === exam.round ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{exam.round}차</button>)}
            </div>
          </div>
        </section>

        <section className={`mt-5 grid gap-4 sm:grid-cols-2 ${hasWritten ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
          <div className="m3-metric-card rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-slate-500"><UsersRound size={17} /><p className="text-xs font-bold">전체 인원</p></div><p className="mt-3 text-3xl font-black text-slate-900">{allStudents.length}<span className="ml-1 text-sm text-slate-400">명</span></p></div>
          <div className="m3-metric-card rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-blue-600"><TrendingUp size={17} /><p className="text-xs font-bold">전체 평균</p></div><p className="mt-3 text-3xl font-black text-blue-950">{score(averages.total)}<span className="ml-1 text-sm text-slate-400">점</span></p></div>
          {hasWritten && <div className="m3-metric-card rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-indigo-600"><BarChart3 size={17} /><p className="text-xs font-bold">객관식 평균</p></div><p className="mt-3 text-3xl font-black text-indigo-950">{score(averages.objective)}<span className="ml-1 text-sm text-slate-400">점</span></p></div>}
          {hasWritten && <div className="m3-metric-card rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-emerald-600"><BookOpenCheck size={17} /><p className="text-xs font-bold">서술형 평균</p></div><p className="mt-3 text-3xl font-black text-emerald-950">{score(averages.written)}<span className="ml-1 text-sm text-slate-400">점</span></p></div>}
        </section>

        <section className="m3-card mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div><h2 className="text-lg font-black">{selectedExam ? `${selectedExam.round}차 전체 순위` : '전체 인원 누적 순위'}</h2><p className="mt-1 text-xs text-slate-400">{selectedExam ? selectedExam.title : `${termExams.length}개 회차 응시 결과의 개인별 평균 · 학생을 선택하면 학생용 상세 성적표가 열립니다.`}</p></div>
            <label className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50"><Search size={16} className="text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="학생 이름 검색" className="w-full bg-transparent px-2 py-2.5 text-sm outline-none sm:w-44" /></label>
          </div>
          {studentError && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs font-bold text-rose-700 sm:px-6">{studentError}</p>}
          <div className="space-y-3 p-4 sm:hidden">
            {filteredRows.map(row => <article key={row.studentId} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl px-2 font-black ${row.rank <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{row.rank}</span><p className="truncate font-bold text-slate-800">{row.studentName}</p></div><span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">상위 {row.topPercent}%</span></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-400">전체</p><p className="mt-1 text-lg font-black text-blue-950">{score(row.totalScore)}점</p></div><div><p className="text-slate-400">응시</p><p className="mt-1 text-lg font-black text-slate-700">{selectedExam ? '1회' : `${row.attempts}회`}</p></div><div><p className="text-slate-400">객관식</p><p className="mt-1 font-bold text-slate-700">{score(row.objectiveScore)}점</p></div>{hasWritten && <div><p className="text-slate-400">서술형</p><p className="mt-1 font-bold text-slate-700">{score(row.writtenScore)}점</p></div>}</div>
              <button onClick={() => onSelectStudent(row.studentId)} disabled={Boolean(loadingStudentId)} className="m3-tonal-button mt-4 flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-black disabled:opacity-50">{loadingStudentId === row.studentId ? '불러오는 중...' : '학생 성적표 보기'} <ChevronRight size={15} /></button>
            </article>)}
            {filteredRows.length === 0 && <p className="py-10 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className={`w-full text-left text-sm ${hasWritten ? 'min-w-[760px]' : 'min-w-[680px]'}`}>
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-6 py-3">석차</th><th className="px-4 py-3">학생</th><th className="px-4 py-3 text-right">전체</th><th className="px-4 py-3 text-right">객관식</th>{hasWritten && <th className="px-4 py-3 text-right">서술형</th>}<th className="px-4 py-3 text-right">성취 구간</th><th className="px-4 py-3 text-right">응시</th><th className="px-6 py-3 text-right">상세</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map(row => <tr key={row.studentId} className="hover:bg-slate-50/70"><td className="px-6 py-3.5"><span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-xl px-2 font-black ${row.rank <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{row.rank}</span></td><td className="px-4 py-3.5 font-bold text-slate-800">{row.studentName}</td><td className="px-4 py-3.5 text-right font-black text-blue-950">{score(row.totalScore)}</td><td className="px-4 py-3.5 text-right text-slate-600">{score(row.objectiveScore)}</td>{hasWritten && <td className="px-4 py-3.5 text-right text-slate-600">{score(row.writtenScore)}</td>}<td className="px-4 py-3.5 text-right"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">상위 {row.topPercent}%</span></td><td className="px-4 py-3.5 text-right text-xs text-slate-400">{selectedExam ? '1회' : `${row.attempts}회`}</td><td className="px-6 py-3.5 text-right"><button onClick={() => onSelectStudent(row.studentId)} disabled={Boolean(loadingStudentId)} className="m3-tonal-button inline-flex items-center gap-1 px-3 py-2 text-xs font-black disabled:opacity-50">{loadingStudentId === row.studentId ? '불러오는 중' : '성적표'} <ChevronRight size={14} /></button></td></tr>)}
              </tbody>
            </table>
            {filteredRows.length === 0 && <p className="py-14 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>}
          </div>
        </section>
      </main>
      <footer className="m3-footer border-t border-slate-200 bg-white py-7 text-center text-xs text-slate-400 print:hidden">SEUM 교사용 성적 관리 · 담당 학교·학년 전용</footer>
    </div>
  )
}
