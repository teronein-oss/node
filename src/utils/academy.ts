export const DEFAULT_ACADEMY_ID = 'node-default'
export const DEFAULT_ACADEMY_NAME = '세움학원'

export const isDefaultAcademy = (academyId?: string | null) =>
  !academyId || academyId === DEFAULT_ACADEMY_ID

export const normalizeAcademyId = (academyId?: string | null) =>
  academyId || DEFAULT_ACADEMY_ID

export const normalizeAcademyName = (academyName?: string | null) =>
  academyName || DEFAULT_ACADEMY_NAME
