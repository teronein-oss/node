import { useEffect, useMemo, useState } from 'react'
import { getDoc, getDocs, query, where } from 'firebase/firestore'
import { BarChart3, Loader2, PieChart, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Class, Student } from '../types'
import { appDataDoc, registrationsCollection } from '../utils/firestorePaths'
import { displayName } from '../utils/displayName'
import { fmtDate, getClassDaysLabel } from '../utils/helpers'

interface TeacherMetric {
  uid: string
  name: string
  role: string
  active: number
  withdrawn: number
  registeredInPeriod: number
  withdrawnInPeriod: number
}

interface TeacherClassPopulation {
  teacherUid: string
  teacherName: string
  classId: string
  className: string
  classDays: string
  active: number
  withdrawnInPeriod: number
}

interface TeacherInfo {
  uid: string
  name: string
  role: string
  academyId?: string
}

interface TeacherAppData {
  students: Student[]
  classes: Class[]
}

function monthLabel(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return `${year}년 ${month}월`
}

function monthBounds(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: fmtDate(new Date(year, month, 0)),
  }
}

function inRange(date: string | undefined, start: string, end: string) {
  if (!date) return false
  const day = date.slice(0, 10)
  return day >= start && day <= end
}

function percent(part: number, total: number) {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}

function shortMonthLabel(ym: string) {
  return `${Number(ym.slice(5, 7))}월`
}

function yearMonthsUntil(year: number) {
  const now = new Date()
  const lastMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12
  return Array.from({ length: lastMonth }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}

export default function PrincipalDashboardPage() {
  const { user } = useAuth()
  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [dataByTeacher, setDataByTeacher] = useState<Record<string, TeacherAppData>>({})
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [selectedTeacherUid, setSelectedTeacherUid] = useState<'all' | string>('all')

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const academyId = user.academyId
      if (!academyId) {
        if (!cancelled) setLoading(false)
        return
      }
      const regQuery = query(registrationsCollection(), where('academyId', '==', academyId))
      const regSnap = await getDocs(regQuery)
      const teacherList: TeacherInfo[] = []
      regSnap.forEach(docSnap => {
        const data = docSnap.data()
        if (data.status !== 'approved') return
        if (!['선생님', '관리자', '원장'].includes(data.role)) return
        if ((data.academyId ?? academyId) !== academyId) return
        teacherList.push({
          uid: data.uid ?? docSnap.id,
          name: displayName(data.displayName),
          role: data.role,
          academyId,
        })
      })

      const entries = await Promise.all(teacherList.map(async teacher => {
        // 원장 대시보드는 로그인한 원장의 academyId 문서만 읽는다.
        // 다른 학원 academyId로 fallback하거나 교차 조회하지 않는다.
        const snap = await getDoc(appDataDoc(teacher.uid, academyId))
        const data = snap.exists() ? snap.data() : {}
        return [teacher.uid, {
          students: (data.students ?? []) as Student[],
          classes: (data.classes ?? []) as Class[],
        }] as const
      }))

      if (cancelled) return
      setTeachers(teacherList.sort((a, b) => a.name.localeCompare(b.name, 'ko')))
      setDataByTeacher(Object.fromEntries(entries))
      setLoading(false)
    }

    load().catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [user])

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()])
    Object.values(dataByTeacher).flatMap(data => data.students).forEach(student => {
      const registered = student.registeredAt ? Number(student.registeredAt.slice(0, 4)) : null
      const withdrawn = student.withdrawnAt ? Number(student.withdrawnAt.slice(0, 4)) : null
      if (registered) years.add(registered)
      if (withdrawn) years.add(withdrawn)
    })
    return [...years].sort((a, b) => b - a)
  }, [dataByTeacher])

  const scopedTeachers = useMemo(
    () => selectedTeacherUid === 'all' ? teachers : teachers.filter(teacher => teacher.uid === selectedTeacherUid),
    [selectedTeacherUid, teachers]
  )

  const selectedYM = `${selectedYear}-${String(selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12).padStart(2, '0')}`
  const { start, end } = monthBounds(selectedYM)
  const yearStart = `${selectedYear}-01-01`
  const yearEnd = fmtDate(new Date(selectedYear, selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12, 0))

  const withdrawalReasons = useMemo(() => {
    const counts = new Map<string, number>()
    const students = scopedTeachers.flatMap(teacher => dataByTeacher[teacher.uid]?.students ?? [])
    for (const student of students) {
      if (!inRange(student.withdrawnAt, yearStart, yearEnd)) continue
      const reason = student.withdrawalReason ?? '알 수 없음'
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count, rate: percent(count, total) }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'ko'))
  }, [dataByTeacher, scopedTeachers, yearEnd, yearStart])

  const metrics = useMemo<TeacherMetric[]>(() => scopedTeachers.map(teacher => {
    const students = dataByTeacher[teacher.uid]?.students ?? []
    return {
      uid: teacher.uid,
      name: teacher.name,
      role: teacher.role,
      active: students.filter(student => student.active).length,
      withdrawn: students.filter(student => !student.active && inRange(student.withdrawnAt, start, end)).length,
      registeredInPeriod: students.filter(student => inRange(student.registeredAt, start, end)).length,
      withdrawnInPeriod: students.filter(student => inRange(student.withdrawnAt, start, end)).length,
    }
  }), [dataByTeacher, end, scopedTeachers, start])

  const totals = metrics.reduce(
    (acc, metric) => ({
      active: acc.active + metric.active,
      withdrawn: acc.withdrawn + metric.withdrawn,
      registeredInPeriod: acc.registeredInPeriod + metric.registeredInPeriod,
      withdrawnInPeriod: acc.withdrawnInPeriod + metric.withdrawnInPeriod,
    }),
    { active: 0, withdrawn: 0, registeredInPeriod: 0, withdrawnInPeriod: 0 }
  )
  const yearMonths = useMemo(() => yearMonthsUntil(selectedYear), [selectedYear])

  const yearlyWithdrawalRows = useMemo(() => scopedTeachers.map(teacher => {
    const students = dataByTeacher[teacher.uid]?.students ?? []
    return {
      uid: teacher.uid,
      name: teacher.name,
      months: yearMonths.map(ym => {
        const bounds = monthBounds(ym)
        const activeAtMonthEnd = students.filter(student => {
          const registeredAt = student.registeredAt?.slice(0, 10) ?? '0000-00-00'
          const withdrawnAt = student.withdrawnAt?.slice(0, 10)
          return registeredAt <= bounds.end && (!withdrawnAt || withdrawnAt > bounds.end)
        }).length
        const withdrawn = students.filter(student => inRange(student.withdrawnAt, bounds.start, bounds.end)).length
        return {
          ym,
          withdrawn,
          rate: percent(withdrawn, activeAtMonthEnd + withdrawn),
        }
      }),
    }
  }), [dataByTeacher, scopedTeachers, yearMonths])

  const classPopulationRows = useMemo<TeacherClassPopulation[]>(() => {
    return scopedTeachers.flatMap(teacher => {
      const data = dataByTeacher[teacher.uid] ?? { students: [], classes: [] }
      return data.classes.map(cls => ({
        teacherUid: teacher.uid,
        teacherName: teacher.name,
        classId: cls.id,
        className: cls.name,
        classDays: cls.days,
        active: data.students.filter(student => student.active && student.classId === cls.id).length,
        withdrawnInPeriod: data.students.filter(student =>
          !student.active &&
          student.classId === cls.id &&
          inRange(student.withdrawnAt, start, end)
        ).length,
      }))
    }).sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ko') || b.active - a.active || a.className.localeCompare(b.className, 'ko'))
  }, [dataByTeacher, end, scopedTeachers, start])

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">원장 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">학원 내부 선생님별 등록·퇴원 흐름과 재원 현황</p>
          <p className="text-xs text-slate-400 mt-1">조회 범위는 현재 로그인한 원장의 학원 데이터로만 제한됩니다.</p>
        </div>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        >
          {availableYears.map(year => <option key={year} value={year}>{year}년</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedTeacherUid('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${selectedTeacherUid === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
        >
          전체 선생님
        </button>
        {teachers.map(teacher => (
          <button
            key={teacher.uid}
            type="button"
            onClick={() => setSelectedTeacherUid(teacher.uid)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${selectedTeacherUid === teacher.uid ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            {teacher.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard icon={Users} label="현재 재원" value={`${totals.active}명`} tone="blue" />
        <SummaryCard icon={TrendingUp} label={`${monthLabel(selectedYM)} 등록`} value={`${totals.registeredInPeriod}명`} tone="emerald" />
        <SummaryCard icon={TrendingDown} label={`${monthLabel(selectedYM)} 퇴원`} value={`${totals.withdrawnInPeriod}명`} tone="rose" />
        <SummaryCard icon={BarChart3} label="기간 퇴원율" value={`${percent(totals.withdrawnInPeriod, totals.active + totals.withdrawnInPeriod)}%`} tone="slate" />
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">선생님별 월별 퇴원율</h2>
          <p className="text-xs text-slate-400 mt-1">{selectedYear}년 1월부터 진행된 달까지, 월별 퇴원 수 / 해당 월 재원+퇴원 수 기준입니다</p>
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중
          </div>
        ) : yearlyWithdrawalRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">그래프로 볼 데이터가 없습니다</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {yearlyWithdrawalRows.map(row => (
              <WithdrawalYearChart
                key={row.uid}
                row={row}
                selected={selectedTeacherUid === row.uid}
                onSelect={() => setSelectedTeacherUid(row.uid)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">퇴원 사유별 비율</h2>
          <p className="text-xs text-slate-400 mt-1">{selectedYear}년에 퇴원 처리된 학생의 사유 기준입니다</p>
        </div>
        {withdrawalReasons.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">퇴원 사유 데이터가 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {withdrawalReasons.map(reason => (
              <div key={reason.reason} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <PieChart size={15} className="shrink-0 text-rose-500" />
                    <span className="truncate text-sm font-semibold text-slate-800">{reason.reason}</span>
                  </div>
                  <span className="text-sm font-bold text-rose-600">{reason.rate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-rose-400" style={{ width: `${reason.rate}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate-400">{reason.count}명</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">반별 인원 현황</h2>
          <p className="text-xs text-slate-400 mt-1">선택 월 퇴원 수는 해당 월에 퇴원 처리된 학생만 집계됩니다</p>
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중
          </div>
        ) : classPopulationRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">반별 인원 데이터가 없습니다</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {classPopulationRows.map(row => (
              <div key={`${row.teacherUid}-${row.classId}`} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{row.className}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{row.teacherName}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{getClassDaysLabel(row.classDays)}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-800">{row.active}명</div>
                  <div className="text-xs text-slate-400">월 퇴원 {row.withdrawnInPeriod}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">선생님별 등록·퇴원 비율</h2>
          <p className="text-xs text-slate-400 mt-1">선택 월에 처리된 등록/퇴원 기록 기준입니다</p>
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중
          </div>
        ) : metrics.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">집계할 선생님 데이터가 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-5 py-3">선생님</th>
                  <th className="text-right px-4 py-3">재원</th>
                  <th className="text-right px-4 py-3">월 퇴원</th>
                  <th className="text-right px-4 py-3">기간 등록</th>
                  <th className="text-right px-4 py-3">기간 퇴원</th>
                  <th className="text-right px-4 py-3">등록 비율</th>
                  <th className="text-right px-5 py-3">퇴원 비율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.map(metric => {
                  const total = metric.registeredInPeriod + metric.withdrawnInPeriod
                  return (
                    <tr key={metric.uid} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedTeacherUid(metric.uid)}
                          className="font-medium text-slate-800 hover:text-blue-600"
                        >
                          {metric.name}
                        </button>
                        <div className="text-xs text-slate-400">{metric.role}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{metric.active}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{metric.withdrawn}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{metric.registeredInPeriod}</td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600">{metric.withdrawnInPeriod}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{percent(metric.registeredInPeriod, total)}%</td>
                      <td className="px-5 py-3 text-right text-slate-700">{percent(metric.withdrawnInPeriod, total)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function WithdrawalYearChart({
  row,
  selected,
  onSelect,
}: {
  row: { uid: string; name: string; months: { ym: string; withdrawn: number; rate: number }[] }
  selected: boolean
  onSelect: () => void
}) {
  const maxRate = Math.max(10, ...row.months.map(month => month.rate))
  const chartWidth = 720
  const chartHeight = 150
  const paddingX = 28
  const paddingY = 18
  const plotHeight = chartHeight - paddingY * 2
  const columnWidth = (chartWidth - paddingX * 2) / Math.max(1, row.months.length)
  const points = row.months.map((month, index) => {
    const x = paddingX + columnWidth * index + columnWidth / 2
    const y = paddingY + plotHeight - (month.rate / maxRate) * plotHeight
    return { ...month, x, y }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <div className={`px-5 py-4 ${selected ? 'bg-blue-50/40' : ''}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button type="button" onClick={onSelect} className="text-sm font-semibold text-slate-800 hover:text-blue-600">
          {row.name}
        </button>
        <span className="text-xs text-slate-400">클릭하면 이 선생님만 보기</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full rounded-lg bg-slate-50">
            {[0, 0.5, 1].map(ratio => {
              const y = paddingY + plotHeight * ratio
              return <line key={ratio} x1={paddingX} x2={chartWidth - paddingX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            })}
            {path && <path d={path} fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
            {points.map(point => (
              <g key={point.ym}>
                <circle cx={point.x} cy={point.y} r="4.5" fill="#fb7185">
                  <title>{`${monthLabel(point.ym)} 퇴원율 ${point.rate}% / 퇴원 ${point.withdrawn}명`}</title>
                </circle>
                <text x={point.x} y={point.y - 10} textAnchor="middle" className="fill-slate-600 text-[10px] font-semibold">{point.rate}%</text>
              </g>
            ))}
          </svg>
          <div className="mt-2 grid px-[28px]" style={{ gridTemplateColumns: `repeat(${row.months.length}, minmax(0, 1fr))` }}>
            {row.months.map(month => (
              <div key={month.ym} className="text-center">
                <div className="text-[11px] font-medium text-slate-400">{shortMonthLabel(month.ym)}</div>
                <div className="text-[10px] font-semibold text-slate-600">{month.withdrawn}명</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  tone: 'blue' | 'emerald' | 'rose' | 'slate'
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
          <Icon size={19} />
        </div>
      </div>
    </div>
  )
}
