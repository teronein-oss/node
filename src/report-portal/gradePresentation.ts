export const GRADE_CRITERIA = [
  { grade: 1, share: 10, cumulativeTopPercent: 10 },
  { grade: 2, share: 24, cumulativeTopPercent: 34 },
  { grade: 3, share: 32, cumulativeTopPercent: 66 },
  { grade: 4, share: 24, cumulativeTopPercent: 90 },
  { grade: 5, share: 10, cumulativeTopPercent: 100 },
] as const

export type ReportGrade = typeof GRADE_CRITERIA[number]['grade']

export function gradeForTopPercent(topPercent: number | null): ReportGrade | null {
  if (topPercent === null || !Number.isFinite(topPercent) || topPercent <= 0 || topPercent > 100) return null
  return GRADE_CRITERIA.find(criterion => topPercent <= criterion.cumulativeTopPercent)?.grade ?? null
}
