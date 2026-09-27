import { createHash, randomBytes } from 'node:crypto'

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ACCESS_CODE_LENGTH = 8
export const MASTER_ACCESS_CODE_LENGTH = 12

export function normalizeAccessCode(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidAccessCode(value: string): boolean {
  return value.length === ACCESS_CODE_LENGTH
    && [...value].every(character => ACCESS_CODE_ALPHABET.includes(character))
}

export function isValidMasterAccessCode(value: string): boolean {
  return value.length === MASTER_ACCESS_CODE_LENGTH
    && [...value].every(character => ACCESS_CODE_ALPHABET.includes(character))
}

export function hashAccessCode(value: string): string {
  return createHash('sha256').update(`student-report:${value}`).digest('hex')
}

export function hashTeacherAccessCode(value: string): string {
  return createHash('sha256').update(`teacher-report:${value}`).digest('hex')
}

export function hashViewerAddress(value: string): string {
  return createHash('sha256').update(`student-report-viewer:${value}`).digest('hex')
}

export function createAccessCode(): string {
  const bytes = randomBytes(ACCESS_CODE_LENGTH)
  let code = ''
  for (const byte of bytes) code += ACCESS_CODE_ALPHABET[byte & 31]
  return code
}

export function rankToTopPercent(rank: unknown, cohortSize: unknown): number {
  if (typeof rank !== 'number' || typeof cohortSize !== 'number' || rank < 1 || cohortSize < 1) return 100
  return Math.max(1, Math.min(100, Math.ceil(rank / cohortSize * 100)))
}

const GRADE_TOP_PERCENT_LIMITS = [10, 34, 66, 90, 100] as const

export interface GradeScoreRange {
  grade: 1 | 2 | 3 | 4 | 5
  highest: number | null
  lowest: number | null
}

export function gradeScoreRangesForStudents(students: ReadonlyArray<{ totalScore: number; topPercent: number }>): GradeScoreRange[] {
  const ranges: GradeScoreRange[] = GRADE_TOP_PERCENT_LIMITS.map((_, index) => ({
    grade: (index + 1) as GradeScoreRange['grade'],
    highest: null,
    lowest: null,
  }))

  for (const student of students) {
    if (!Number.isFinite(student.totalScore) || !Number.isFinite(student.topPercent)
      || student.topPercent < 1 || student.topPercent > 100) continue
    const index = GRADE_TOP_PERCENT_LIMITS.findIndex(limit => student.topPercent <= limit)
    const range = ranges[index]
    range.highest = range.highest === null ? student.totalScore : Math.max(range.highest, student.totalScore)
    range.lowest = range.lowest === null ? student.totalScore : Math.min(range.lowest, student.totalScore)
  }

  return ranges
}
