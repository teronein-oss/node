import type { Class, GradeRecord, HomeworkAssignment, WeeklyProgress } from '../types'
import {
  fmtDate,
  getMonthClassDates,
  getWeekStartForSession,
  normalizeClassWeekdays,
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
  const matched = classes.find(c => normalizeClassWeekdays(c.days, c.weekdays).some(day => {
    const map = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const
    return map[day] === dow
  }))
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
  const dates = getMonthClassDates(year, month, classInfo.days, classInfo.weekdays)

  return dates
    .filter(({ date }) => includeFuture || date <= todayStr)
    .filter(({ date }) => {
      if (!filterMWFToCalendarMonth) return true
      const [dateYear, dateMonth] = date.split('-').map(Number)
      return dateYear === year && dateMonth === month
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
