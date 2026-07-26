import { useMemo } from 'react'
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { needsRetest } from '../utils/helpers'

type IssueKind = 'duplicate' | 'stale'

interface IssueRow {
  key: string
  kind: IssueKind
  studentId: string
  studentName: string
  className: string
  sessionNum: number
  type: string
  retestDate?: string
  recordIds: string[]
  message: string
}

export default function RetestDiagnosticsPage() {
  const { state, dispatch } = useApp()

  const issues = useMemo<IssueRow[]>(() => {
    const rows: IssueRow[] = []
    const pending = state.retests.filter(r => r.passed === null)
    const groups = new Map<string, typeof pending>()

    for (const retest of pending) {
      const key = `${retest.studentId}-${retest.sessionNum}-${retest.type}-${retest.retestDate ?? 'no-date'}`
      groups.set(key, [...(groups.get(key) ?? []), retest])
    }

    for (const [key, records] of groups) {
      if (records.length < 2) continue
      const first = records[0]
      const student = state.students.find(s => s.id === first.studentId)
      const cls = state.classes.find(c => c.id === student?.classId)
      rows.push({
        key: `duplicate-${key}`,
        kind: 'duplicate',
        studentId: first.studentId,
        studentName: student?.name ?? '?',
        className: cls?.name ?? '',
        sessionNum: first.sessionNum,
        type: first.type,
        retestDate: first.retestDate,
        recordIds: records.map(r => r.id),
        message: `같은 날짜에 같은 항목이 ${records.length}개 남아있습니다.`,
      })
    }

    for (const retest of pending) {
      const student = state.students.find(s => s.id === retest.studentId)
      if (!student?.active) continue
      const grade = state.grades.find(g => g.studentId === retest.studentId && g.sessionNum === retest.sessionNum)
      if (!grade) continue
      const cls = state.classes.find(c => c.id === student.classId)
      const sessionCfg = state.sessionTestConfigs.find(
        c => c.sessionNum === retest.sessionNum && c.classId === student.classId
      ) ?? state.sessionTestConfigs.find(c => c.sessionNum === retest.sessionNum)

      let stillNeedsRetest = true
      if (retest.type === 'vocab') {
        stillNeedsRetest = needsRetest(grade.vocabScore, sessionCfg?.vocabThreshold ?? state.vocabThreshold)
      } else if (retest.type === 'daily') {
        stillNeedsRetest = needsRetest(grade.dailyTestScore, sessionCfg?.dailyThreshold ?? state.dailyThreshold)
      } else {
        const score = grade.extras?.[retest.type] ?? null
        const col = (sessionCfg?.scoreColumns ?? []).find(c => c.id === retest.type)
          ?? state.scoreColumns.find(c => c.id === retest.type)
        stillNeedsRetest = col?.threshold ? needsRetest(score, col.threshold) : true
      }

      if (!stillNeedsRetest) {
        rows.push({
          key: `stale-${retest.id}`,
          kind: 'stale',
          studentId: retest.studentId,
          studentName: student.name,
          className: cls?.name ?? '',
          sessionNum: retest.sessionNum,
          type: retest.type,
          retestDate: retest.retestDate,
          recordIds: [retest.id],
          message: '현재 성적 기준으로는 통과인데 미완료 재시험으로 남아있습니다.',
        })
      }
    }

    return rows.sort((a, b) =>
      a.className.localeCompare(b.className, 'ko') ||
      a.studentName.localeCompare(b.studentName, 'ko') ||
      a.sessionNum - b.sessionNum ||
      a.type.localeCompare(b.type)
    )
  }, [state])

  const cleanupIssues = () => {
    if (issues.length === 0) return
    if (!confirm(`불일치 재시험 기록 ${issues.length}건을 정리할까요?`)) return
    const ids = new Set<string>()
    for (const issue of issues) {
      if (issue.kind === 'duplicate') {
        issue.recordIds.slice(1).forEach(id => ids.add(id))
      } else {
        issue.recordIds.forEach(id => ids.add(id))
      }
    }
    for (const id of ids) {
      dispatch({ type: 'SAVE_RETEST', payload: { id, retestScore: null, passed: true } })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">재시험 데이터 진단</h1>
          <p className="mt-1 text-sm text-slate-500">Firestore에서 로드된 현재 앱 원본 상태 기준입니다.</p>
        </div>
        <button
          type="button"
          onClick={cleanupIssues}
          disabled={issues.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          <RefreshCw size={15} />
          자동 정리
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          {issues.length > 0 ? <AlertTriangle size={18} className="text-orange-500" /> : <CheckCircle size={18} className="text-emerald-500" />}
          <h2 className="flex-1 text-sm font-bold text-slate-800">불일치 항목</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${issues.length > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {issues.length}건
          </span>
        </div>
        {issues.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">중복 또는 성적 기준 불일치 재시험이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">학생</th>
                  <th className="px-4 py-3 text-left">반</th>
                  <th className="px-4 py-3 text-left">회차</th>
                  <th className="px-4 py-3 text-left">항목</th>
                  <th className="px-4 py-3 text-left">날짜</th>
                  <th className="px-4 py-3 text-left">원인</th>
                  <th className="px-4 py-3 text-right">레코드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map(issue => (
                  <tr key={issue.key}>
                    <td className="px-4 py-3 font-semibold text-slate-800">{issue.studentName}</td>
                    <td className="px-4 py-3 text-slate-500">{issue.className}</td>
                    <td className="px-4 py-3 text-slate-600">{issue.sessionNum}회</td>
                    <td className="px-4 py-3 text-slate-600">{issue.type === 'vocab' ? '단어' : issue.type === 'daily' ? 'Daily' : issue.type}</td>
                    <td className="px-4 py-3 text-slate-500">{issue.retestDate ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{issue.message}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">{issue.recordIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
