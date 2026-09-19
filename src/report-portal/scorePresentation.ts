import type { StudentCumulativeExam } from '../types/studentReport'

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
