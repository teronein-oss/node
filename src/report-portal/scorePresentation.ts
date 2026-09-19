import type { StudentCumulativeExam } from '../types/studentReport'

export type ScoreBand = '0–59' | '60–69' | '70–79' | '80–89' | '90–99' | '100'

export function scoreBandFor(totalScore: number | null): ScoreBand | null {
  if (totalScore === null || !Number.isFinite(totalScore) || totalScore < 0 || totalScore > 100) return null
  if (totalScore === 100) return '100'
  if (totalScore >= 90) return '90–99'
  if (totalScore >= 80) return '80–89'
  if (totalScore >= 70) return '70–79'
  if (totalScore >= 60) return '60–69'
  return '0–59'
}

function displayBand(label: string) {
  const normalized = label.replace(/[‐‑‒–—−~]/g, '-').replace(/\s+/g, '')
  if (['0-49', '50-59', '0-59'].includes(normalized)) return '0–59'
  return normalized.replace('-', '–')
}

export function displayDistribution(exam: StudentCumulativeExam) {
  const bins = new Map<string, number>()
  exam.scoreDistribution.bins.forEach(bin => {
    const label = displayBand(bin.label)
    bins.set(label, (bins.get(label) ?? 0) + bin.percent)
  })
  return {
    bins: [...bins].map(([label, percent]) => ({ label, percent: Math.round(percent * 10) / 10 })),
    studentBand: exam.result ? displayBand(exam.scoreDistribution.studentBand ?? '') : null,
  }
}
