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

export function gradeScoreRangeLabel(range: { highest: number | null; lowest: number | null } | undefined): string {
  if (!range) return '점수 범위 정보 없음'
  if (range.highest === null || range.lowest === null) return '해당 등급 응시자 없음'
  const displayScore = (value: number) => Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
  return range.highest === range.lowest
    ? `${displayScore(range.highest)}점`
    : `${displayScore(range.highest)}–${displayScore(range.lowest)}점`
}
