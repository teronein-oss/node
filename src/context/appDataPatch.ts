import type { AppState } from './AppContext'

export type AppData = Omit<AppState, 'homeworks'>
export type AppDataPatch = Partial<AppData>

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const nextValue = (value as Record<string, unknown>)[key]
        if (nextValue !== undefined) result[key] = canonicalize(nextValue)
        return result
      }, {})
  }
  return value
}

export const valuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))

export const buildAppDataPatch = (previous: AppState, next: AppState): AppDataPatch => {
  const before = previous as unknown as Record<string, unknown>
  const after = next as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of keys) {
    if (key === 'homeworks' || valuesEqual(before[key], after[key])) continue
    patch[key] = after[key]
  }

  return JSON.parse(JSON.stringify(patch)) as AppDataPatch
}
