export const DEFAULT_ACADEMY_ID = 'node-default'
export const DEFAULT_ACADEMY_NAME = 'NODE'

export const isDefaultAcademy = (academyId?: string | null) =>
  !academyId || academyId === DEFAULT_ACADEMY_ID

export const normalizeAcademyId = (academyId?: string | null) =>
  academyId || DEFAULT_ACADEMY_ID

export const normalizeAcademyName = (academyName?: string | null) =>
  academyName || DEFAULT_ACADEMY_NAME

export const createInviteCode = (academyName: string) => {
  const prefix = academyName
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'ACD'
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${random}`
}
