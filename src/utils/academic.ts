import type { Class, GradeRecord, HomeworkAssignment, WeeklyProgress } from '../types'
import {
  fmtDate,
  getMonthClassDates,
  getMonthMWFSessions,
  getMWFClassDate,
  getWeekStartForSession,
} from './helpers'

export interface MonthOption {
  ym: string
  year: number
  month: number
  label: string
}

type MonthSort = 'asc' | 'desc'

const toYM = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}`

const addThursdayMonth = (ymSet: Set<string>, weekStart: string) => {
  const d = new Date(weekStart + 'T00:00:00')
  const thu = new Date(d)
  thu.setDate(d.getDate() + 3)
  ymSet.add(toYM(thu))
}

export function getCurrentYM(date = new Date()): string {
  return toYM(date)
}

export function getDefaultClassIdForToday(classes: Class[], fallback = ''): string {
  const dow = new Date().getDay()
  const todayDays = dow === 1 || dow === 5
    ? 'mon-fri'
    : dow === 2 || dow === 4
      ? 'tue-thu'
      : dow === 3
        ? 'mon-wed-fri'
        : null
  const matched = todayDays ? classes.find(c => c.days === todayDays) : null
  return matched?.id ?? fallback
}

export function buildMonthOptions({
  grades = [],
  homeworks = [],
  weeklyProgress = [],
  includeNextMonth = false,
  sort = 'desc',
  today = new Date(),
}: {
  grades?: GradeRecord[]
  homeworks?: HomeworkAssignment[]
  weeklyProgress?: WeeklyProgress[]
  includeNextMonth?: boolean
  sort?: MonthSort
  today?: Date
}): MonthOption[] {
  const ymSet = new Set<string>([toYM(today)])
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    ymSet.add(toYM(d))
  }
  if (includeNextMonth) {
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    ymSet.add(toYM(next))
  }
  for (const g of grades) addThursdayMonth(ymSet, g.weekStart)
  for (const hw of homeworks) addThursdayMonth(ymSet, hw.weekStart)
  for (const p of weeklyProgress) addThursdayMonth(ymSet, getWeekStartForSession(p.sessionNum))

  const sorted = [...ymSet].sort()
  if (sort === 'desc') sorted.reverse()
  return sorted.map(ym => {
    const [year, month] = ym.split('-').map(Number)
    return { ym, year, month, label: `${year}년 ${month}월` }
  })
}

export function getClassDatesForMonth({
  classInfo,
  year,
  month,
  includeFuture = true,
  today = new Date(),
  filterMWFToCalendarMonth = false,
}: {
  classInfo?: Class
  year: number
  month: number
  includeFuture?: boolean
  today?: Date
  filterMWFToCalendarMonth?: boolean
}): { date: string; sessionNum: number }[] {
  if (!classInfo) return []
  const todayStr = fmtDate(today)
  const dates = classInfo.days === 'mon-wed-fri'
    ? getMonthMWFSessions(year, month).map(sessionNum => ({
        date: getMWFClassDate(sessionNum),
        sessionNum,
      }))
    : getMonthClassDates(year, month, classInfo.days)

  return dates
    .filter(({ date }) => includeFuture || date <= todayStr)
    .filter(({ date }) => {
      if (classInfo.days !== 'mon-wed-fri' || !filterMWFToCalendarMonth) return true
      const [dateYear, dateMonth] = date.split('-').map(Number)
      return dateYear === year && dateMonth === month
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
