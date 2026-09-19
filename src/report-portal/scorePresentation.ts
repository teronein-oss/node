import type { StudentCumulativeExam } from '../types/studentReport'

export const SCORE_BANDS_DESC = ['100–90', '89–80', '79–70', '69–60', '59–0'] as const
export type ScoreBand = typeof SCORE_BANDS_DESC[number]

export function scoreBandFor(totalScore: number | null): ScoreBand | null {
  if (totalScore === null || !Number.isFinite(totalScore) || totalScore < 0 || totalScore > 100) return null
  if (totalScore >= 90) return '100–90'
  if (totalScore >= 80) return '89–80'
  if (totalScore >= 70) return '79–70'
  if (totalScore >= 60) return '69–60'
  return '59–0'
}

function displayBand(label: string): ScoreBand | null {
  const normalized = label.replace(/[‐‑‒–—−~]/g, '-').replace(/\s+/g, '').replace(/점$/, '')
  if (['90-99', '90-100', '100-90', '100'].includes(normalized)) return '100–90'
  if (['80-89', '89-80'].includes(normalized)) return '89–80'
  if (['70-79', '79-70'].includes(normalized)) return '79–70'
  if (['60-69', '69-60'].includes(normalized)) return '69–60'
  if (['0-49', '50-59', '0-59', '59-0'].includes(normalized)) return '59–0'
  return null
}

export function displayDistribution(exam: StudentCumulativeExam) {
  const bins = new Map<ScoreBand, number>()
  exam.scoreDistribution.bins.forEach(bin => {
    const label = displayBand(bin.label)
    if (label) bins.set(label, (bins.get(label) ?? 0) + bin.percent)
  })
  return {
    bins: SCORE_BANDS_DESC.map(label => ({ label, percent: Math.round((bins.get(label) ?? 0) * 10) / 10 })),
    studentBand: exam.result ? scoreBandFor(exam.result.totalScore) : null,
  }
}
