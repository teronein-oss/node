import { RETEST_THRESHOLD } from '../data/initialData'

const pad = (n: number) => String(n).padStart(2, '0')

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
  const weekIndex = Math.floor((sessionNum - 1) / 3)
  const base = new Date(2025, 0, 6)
  const d = new Date(base.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000)
  return fmtDate(d)
}

/** mon-wed-fri sessionNum → 실제 수업 날짜 (월/수/금) */
export function getMWFClassDate(sessionNum: number): string {
  const weekStart = getWeekStartForMWFSession(sessionNum)
  const mon = new Date(weekStart + 'T00:00:00')
  const slot = (sessionNum - 1) % 3  // 0=월, 1=수, 2=금
  const offset = slot === 0 ? 0 : slot === 1 ? 2 : 4
  mon.setDate(mon.getDate() + offset)
  return fmtDate(mon)
}

/**
 * 해당 월의 mon-wed-fri 회차 번호 목록 반환 (목요일 기준 월 소속, 주당 3회차)
 */
export function getMonthMWFSessions(year: number, month: number): number[] {
  const base = new Date(BASE_WEEK).getTime()
  const weekStarts = getMonthWeekStarts(year, month)
  const sessions: number[] = []
  for (const ws of weekStarts) {
    const weekDiff = Math.round((new Date(ws + 'T00:00:00').getTime() - base) / (7 * 24 * 60 * 60 * 1000))
    sessions.push(weekDiff * 3 + 1)  // 월요일
    sessions.push(weekDiff * 3 + 2)  // 수요일
    sessions.push(weekDiff * 3 + 3)  // 금요일
  }
  return sessions
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * sessionNum과 반 수업 요일에서 실제 수업 날짜(YYYY-MM-DD) 반환
 * - mon-wed-fri: 주 3회차 전용 스킴 (getMWFClassDate 사용)
 * - 나머지: 주 2회차 (odd=첫수업, even=둘째수업)
 */
export function getClassDate(sessionNum: number, days: 'mon-fri' | 'tue-thu' | 'wed-sat' | 'mon-wed-fri'): string {
  if (days === 'mon-wed-fri') return getMWFClassDate(sessionNum)
  const weekStart = getWeekStartForSession(sessionNum)
  const mon = new Date(weekStart + 'T00:00:00')
  const isFirst = sessionNum % 2 === 1
  const offset = days === 'mon-fri' ? (isFirst ? 0 : 4)
               : days === 'tue-thu' ? (isFirst ? 1 : 3)
               : (isFirst ? 2 : 5)  // wed-sat
  mon.setDate(mon.getDate() + offset)
  return fmtDate(mon)
}

/** 고유 ID 생성 */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
