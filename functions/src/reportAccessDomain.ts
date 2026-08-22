import { createHash, randomBytes } from 'node:crypto'

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ACCESS_CODE_LENGTH = 8

export function normalizeAccessCode(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidAccessCode(value: string): boolean {
  return value.length === ACCESS_CODE_LENGTH
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
