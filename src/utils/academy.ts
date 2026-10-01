export const DEFAULT_ACADEMY_ID = 'node-default'
export const DEFAULT_ACADEMY_NAME = '세움학원'
// 조교 가입 시 입력하는 기본 학원 코드 (functions/src/signup.ts와 동일하게 유지)
export const DEFAULT_ACADEMY_JOIN_CODE = 'seum6898'

export const academyJoinCode = (academyId?: string | null) =>
  isDefaultAcademy(academyId) ? DEFAULT_ACADEMY_JOIN_CODE : academyId!

export const isDefaultAcademy = (academyId?: string | null) =>
  !academyId || academyId === DEFAULT_ACADEMY_ID

export const normalizeAcademyId = (academyId?: string | null) =>
  academyId || DEFAULT_ACADEMY_ID

export const normalizeAcademyName = (academyName?: string | null) =>
  academyName || DEFAULT_ACADEMY_NAME
