import { RETEST_THRESHOLD } from '../data/initialData'
import type { WeekdayKey } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY_TO_DOW: Record<WeekdayKey, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const LEGACY_CLASS_DAYS: Record<string, WeekdayKey[]> = {
  'mon-fri': ['mon', 'fri'],
  'tue-thu': ['tue', 'thu'],
  'wed-sat': ['wed', 'sat'],
  'mon-wed-fri': ['mon', 'wed', 'fri'],
}

/** 로컬 Date → YYYY-MM-DD */
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 오늘 날짜 기준으로 해당 주 월요일 (YYYY-MM-DD) 반환 */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay() // 0=일, 1=월 ... 6=토
  const diff = day === 0 ? -6 : 1 - day // 월요일로
  d.setDate(d.getDate() + diff)
  return fmtDate(d) // 로컬 날짜 기준 (toISOString은 UTC라 타임존 오차 발생)
}

/** 앱 시작 기준 (2025-01-06 월요일 = 1주차) */
const BASE_WEEK = '2025-01-06'

/**
 * weekStart(월요일)에 해당하는 주의 첫 번째 회차(홀수) 반환
 * 주당 2회차: 홀수 = 첫 수업, 짝수 = 둘째 수업
 */
export function getSessionNum(weekStart: string): number {
  const base = new Date(BASE_WEEK).getTime()
  const target = new Date(weekStart + 'T00:00:00').getTime()
  const weekDiff = Math.round((target - base) / (7 * 24 * 60 * 60 * 1000))
  return Math.max(1, weekDiff * 2 + 1)
}

/** 현재 주의 마지막 회차(짝수) = 탐색 가능한 최대 회차 */
export function getCurrentSessionNum(): number {
  const weekStart = getWeekStart()
  return getSessionNum(weekStart) + 1
}

/** sessionNum에 해당하는 주 시작일(월요일) YYYY-MM-DD 반환 */
export function getWeekStartForSession(sessionNum: number): string {
  const weekIndex = Math.floor((sessionNum - 1) / 2)
  const base = new Date(2025, 0, 6)
  const d = new Date(base.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000)
  return fmtDate(d)
}

export function normalizeClassWeekdays(days?: string, weekdays?: WeekdayKey[]): WeekdayKey[] {
  const raw = weekdays?.length ? weekdays : (LEGACY_CLASS_DAYS[days ?? ''] ?? (days ?? '').split('-'))
  const normalized = raw
    .filter((day): day is WeekdayKey => WEEKDAY_ORDER.includes(day as WeekdayKey))
    .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
  return normalized.length > 0 ? normalized : ['mon', 'fri']
}

export function getClassFrequency(days?: string, weekdays?: WeekdayKey[]): 1 | 2 | 3 {
  const count = normalizeClassWeekdays(days, weekdays).length
  return count <= 1 ? 1 : count >= 3 ? 3 : 2
}

export function getClassDaysLabel(days?: string, weekdays?: WeekdayKey[]): string {
  const labels: Record<WeekdayKey, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토' }
  const normalized = normalizeClassWeekdays(days, weekdays)
  return `주 ${getClassFrequency(days, weekdays)}회 · ${normalized.map(day => labels[day]).join('·')}`
}

function getWeekStartForClassSession(sessionNum: number, frequency: number): string {
  const safeFrequency = Math.max(1, frequency)
  const weekIndex = Math.floor((sessionNum - 1) / safeFrequency)
  const base = new Date(2025, 0, 6)
  const d = new Date(base.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000)
  return fmtDate(d)
}

/**
 * 해당 월의 모든 주 시작일(월요일) 반환
 * 주 소속 월은 목요일 기준으로 결정 (예: 3/30 시작 주 → 4/2 목요일 → 4월 소속)
 */
export function getMonthWeekStarts(year: number, month: number): string[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const dow = firstOfMonth.getDay()
  const firstMon = new Date(year, month - 1, 1 - (dow === 0 ? 6 : dow - 1))

  const weeks: string[] = []
  const cur = new Date(firstMon)
  cur.setDate(cur.getDate() - 7) // 엣지케이스 대비 한 주 앞부터 탐색

  for (let i = 0; i < 8; i++) {
    const thu = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 3)
    if (thu.getFullYear() === year && thu.getMonth() + 1 === month) {
      weeks.push(fmtDate(cur))
    }
    cur.setDate(cur.getDate() + 7)
    if (thu.getFullYear() > year || thu.getMonth() + 1 > month) break
  }
  return weeks
}

/** 해당 월의 첫 회차부터 count개 회차 번호 배열 반환 */
export function getMonthSessions(year: number, month: number, count: number): number[] {
  const weekStarts = getMonthWeekStarts(year, month)
  if (weekStarts.length === 0) return []
  const firstSession = getSessionNum(weekStarts[0])
  return Array.from({ length: count }, (_, i) => firstSession + i)
}

/** sessionNum → "N월 M회차" 라벨 (주당 2회차, 월 최대 8회차) */
export function getSessionLabel(sessionNum: number): string {
  const ws = getWeekStartForSession(sessionNum)
  const d = new Date(ws + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3)
  const year = thu.getFullYear()
  const month = thu.getMonth() + 1
  const monthWeeks = getMonthWeekStarts(year, month)
  const weekIdx = monthWeeks.indexOf(ws)
  const slot = ((sessionNum - 1) % 2) + 1 // 1 = 첫수업, 2 = 둘째수업
  const classNum = weekIdx >= 0 ? weekIdx * 2 + slot : slot
  return `${month}월 ${classNum}회차`
}

/** 점수가 재시험 기준 미달인지 */
export function needsRetest(score: number | null, threshold = RETEST_THRESHOLD): boolean {
  if (score === null) return false
  return score < threshold
}

/** 날짜 문자열을 한국어 형식으로 표시 (MM.DD) */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}.${String(day).padStart(2, '0')}`
}

/** YYYY-MM-DD → M월 D일 (요일) */
export function formatDateKo(iso: string): string {
  const d = new Date(iso)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = days[d.getDay()]
  return `${m}월 ${day}일 (${dow})`
}

// ─── 월수금반 전용 (주 3회차) ─────────────────────────────────────────────────

/**
 * mon-wed-fri 반의 sessionNum에 해당하는 주 시작일(월요일) 반환
 * 주당 3회차: slot 0=월, 1=수, 2=금
 */
export function getWeekStartForMWFSession(sessionNum: number): string {
  return getWeekStartForClassSession(sessionNum, 3)
}

/** mon-wed-fri sessionNum → 실제 수업 날짜 (월/수/금) */
export function getMWFClassDate(sessionNum: number): string {
  return getClassDate(sessionNum, 'mon-wed-fri')
}

/**
 * 해당 월의 mon-wed-fri 회차 번호 목록 반환 (목요일 기준 월 소속, 주당 3회차)
 */
export function getMonthMWFSessions(year: number, month: number): number[] {
  return getMonthClassDates(year, month, 'mon-wed-fri').map(({ sessionNum }) => sessionNum)
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * sessionNum과 반 수업 요일에서 실제 수업 날짜(YYYY-MM-DD) 반환
 * - mon-wed-fri: 주 3회차 전용 스킴 (getMWFClassDate 사용)
 * - 나머지: 주 2회차 (odd=첫수업, even=둘째수업)
 */
export function getClassDate(sessionNum: number, days: string, weekdays?: WeekdayKey[]): string {
  const normalized = normalizeClassWeekdays(days, weekdays)
  const weekStart = getWeekStartForClassSession(sessionNum, normalized.length)
  const mon = new Date(weekStart + 'T00:00:00')
  const slot = (sessionNum - 1) % normalized.length
  const offset = WEEKDAY_TO_DOW[normalized[slot]] - 1
  mon.setDate(mon.getDate() + offset)
  return fmtDate(mon)
}

/**
 * 해당 월의 실제 수업 날짜와 회차 번호를 반환 (목요일 기준 주 배정이 아닌 실제 날짜 기준)
 * 월 경계에서 목요일-기준 배정과 실제 날짜가 엇갈리는 버그를 방지함
 */
export function getMonthClassDates(
  year: number,
  month: number,
  days: string,
  weekdays?: WeekdayKey[]
): { date: string; sessionNum: number }[] {
  const normalized = normalizeClassWeekdays(days, weekdays)
  const validDows = new Set(normalized.map(day => WEEKDAY_TO_DOW[day]))
  const result: { date: string; sessionNum: number }[] = []
  const cur = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  while (cur <= end) {
    const dow = cur.getDay()
    if (validDows.has(dow)) {
      const weekStart = getWeekStart(cur)
      const weekDiff = Math.round((new Date(weekStart + 'T00:00:00').getTime() - new Date(BASE_WEEK).getTime()) / (7 * 24 * 60 * 60 * 1000))
      const slot = normalized.findIndex(day => WEEKDAY_TO_DOW[day] === dow)
      result.push({ date: fmtDate(cur), sessionNum: Math.max(1, weekDiff * normalized.length + slot + 1) })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

/** 고유 ID 생성 */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
