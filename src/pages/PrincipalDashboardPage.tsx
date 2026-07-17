import { useEffect, useMemo, useState } from 'react'
import { getDoc, getDocs, query, where } from 'firebase/firestore'
import { BarChart3, Loader2, TrendingDown, TrendingUp, Users } from 'lucide-react'
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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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

function previousMonths(baseYM: string, count: number) {
  const [year, month] = baseYM.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1 - (count - 1 - index), 1)
    return monthKey(date)
  })
}

function shortMonthLabel(ym: string) {
  return `${Number(ym.slice(5, 7))}월`
}

export default function PrincipalDashboardPage() {
  const { user } = useAuth()
  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [dataByTeacher, setDataByTeacher] = useState<Record<string, TeacherAppData>>({})
  const [loading, setLoading] = useState(true)
  const [selectedYM, setSelectedYM] = useState(() => monthKey(new Date()))

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const regQuery = query(registrationsCollection(), where('academyId', '==', user.academyId))
      const regSnap = await getDocs(regQuery)
      const teacherList: TeacherInfo[] = []
      regSnap.forEach(docSnap => {
        const data = docSnap.data()
        if (data.status !== 'approved') return
        if (!['선생님', '관리자', '원장'].includes(data.role)) return
        teacherList.push({
          uid: data.uid ?? docSnap.id,
          name: displayName(data.displayName),
          role: data.role,
          academyId: data.academyId ?? user.academyId,
        })
      })

      const entries = await Promise.all(teacherList.map(async teacher => {
        const snap = await getDoc(appDataDoc(teacher.uid, teacher.academyId ?? user.academyId))
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

  const availableMonths = useMemo(() => {
    const months = new Set<string>([monthKey(new Date())])
    for (let i = 1; i <= 5; i++) {
      months.add(monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)))
    }
    Object.values(dataByTeacher).flatMap(data => data.students).forEach(student => {
      const registered = student.registeredAt?.slice(0, 7)
      const withdrawn = student.withdrawnAt?.slice(0, 7)
      if (registered) months.add(registered)
      if (withdrawn) months.add(withdrawn)
    })
    return [...months].sort().reverse()
  }, [dataByTeacher])

  const { start, end } = monthBounds(selectedYM)

  const metrics = useMemo<TeacherMetric[]>(() => teachers.map(teacher => {
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
  }), [dataByTeacher, end, start, teachers])

  const totals = metrics.reduce(
    (acc, metric) => ({
      active: acc.active + metric.active,
      withdrawn: acc.withdrawn + metric.withdrawn,
      registeredInPeriod: acc.registeredInPeriod + metric.registeredInPeriod,
      withdrawnInPeriod: acc.withdrawnInPeriod + metric.withdrawnInPeriod,
    }),
    { active: 0, withdrawn: 0, registeredInPeriod: 0, withdrawnInPeriod: 0 }
  )
  const yearMonths = useMemo(() => previousMonths(selectedYM, 12), [selectedYM])

  const yearlyWithdrawalRows = useMemo(() => teachers.map(teacher => {
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
  }), [dataByTeacher, teachers, yearMonths])

  const classPopulationRows = useMemo<TeacherClassPopulation[]>(() => {
    return teachers.flatMap(teacher => {
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
  }, [dataByTeacher, end, start, teachers])

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">원장 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">선생님별 등록·퇴원 흐름과 재원 현황</p>
        </div>
        <select
          value={selectedYM}
          onChange={e => setSelectedYM(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        >
          {availableMonths.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
        </select>
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
          <p className="text-xs text-slate-400 mt-1">선택 월 기준 최근 12개월, 월별 퇴원 수 / 해당 월 재원+퇴원 수 기준입니다</p>
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중
          </div>
        ) : yearlyWithdrawalRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">그래프로 볼 데이터가 없습니다</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {yearlyWithdrawalRows.map(row => <WithdrawalYearChart key={row.uid} row={row} />)}
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
                        <div className="font-medium text-slate-800">{metric.name}</div>
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
}: {
  row: { uid: string; name: string; months: { ym: string; withdrawn: number; rate: number }[] }
}) {
  const maxRate = Math.max(10, ...row.months.map(month => month.rate))

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">{row.name}</h3>
        <span className="text-xs text-slate-400">
          평균 {percent(row.months.reduce((sum, month) => sum + month.rate, 0), row.months.length)}%
        </span>
      </div>
      <div className="grid grid-cols-12 items-end gap-2">
        {row.months.map(month => (
          <div key={month.ym} className="min-w-0">
            <div className="flex h-24 items-end rounded bg-slate-50 px-1">
              <div
                className="w-full rounded-t bg-rose-400"
                style={{ height: `${Math.max(4, (month.rate / maxRate) * 100)}%` }}
                title={`${monthLabel(month.ym)} 퇴원율 ${month.rate}% / 퇴원 ${month.withdrawn}명`}
              />
            </div>
            <div className="mt-1 truncate text-center text-[10px] font-medium text-slate-400">{shortMonthLabel(month.ym)}</div>
            <div className="text-center text-[10px] font-semibold text-slate-600">{month.rate}%</div>
          </div>
        ))}
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
