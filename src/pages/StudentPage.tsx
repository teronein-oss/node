import { useState, useMemo } from 'react'
import { Search, UserPlus, CheckCircle, AlertCircle, BookX, ChevronRight, Calendar, Plus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { Student, FilterType } from '../types'
import { getMonthSessions, getWeekStartForSession } from '../utils/helpers'
import StudentDetail from './StudentDetail'

export default function StudentPage() {
  const { state, dispatch, visibleCount, setVisibleCount, selectedYM, setSelectedYM } = useApp()

  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState<Student | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // 새 학생 추가 폼
  const [newName, setNewName] = useState('')
  const [newClass, setNewClass] = useState(state.classes[0]?.id ?? '')

  // 현재 월 계산 (목요일 기준)
  const curDate = new Date()
  const currentYM = `${curDate.getFullYear()}-${curDate.getMonth() + 1}`

  // 선택 가능한 월 목록 (성적 있는 월 + 현재 월)
  const availableMonths = useMemo(() => {
    const ymSet = new Set<string>([currentYM])
    // 최근 3개월 항상 포함
    const curDate2 = new Date()
    for (let i = 1; i <= 3; i++) {
      const d = new Date(curDate2.getFullYear(), curDate2.getMonth() - i, 1)
      ymSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
    for (const g of state.grades) {
      const ws = getWeekStartForSession(g.sessionNum)
      const d = new Date(ws + 'T00:00:00')
      const thu = new Date(d)
      thu.setDate(d.getDate() + 3)
      ymSet.add(`${thu.getFullYear()}-${thu.getMonth() + 1}`)
    }
    return [...ymSet]
      .sort()
      .reverse()
      .map(ym => {
        const [y, m] = ym.split('-').map(Number)
        return { ym, year: y, month: m, label: `${y}년 ${m}월` }
      })
  }, [state.grades, currentYM])

  // selectedYM / setSelectedYM come from global context (shared across pages)
  const selectedMonthInfo = availableMonths.find(m => m.ym === selectedYM) ?? availableMonths[0]

  // 선택 월의 sessionNum 목록
  const monthSessionNums = useMemo(() => {
    if (!selectedMonthInfo) return []
    return getMonthSessions(selectedMonthInfo.year, selectedMonthInfo.month, visibleCount)
  }, [selectedMonthInfo, visibleCount])

  // 선택 월 기준 성적·재시험 데이터
  const monthGrades = state.grades.filter(g => monthSessionNums.includes(g.sessionNum))
  const monthRetests = state.retests.filter(r => monthSessionNums.includes(r.sessionNum))

  const pendingRetestIds = new Set(
    monthRetests.filter(r => r.passed === null).map(r => r.studentId)
  )
  const noHomeworkIds = new Set(
    monthGrades.filter(g => g.homeworkDone === '미제출' || g.homeworkDone === '미흡').map(g => g.studentId)
  )

  const filteredStudents = state.students
    .filter(s => s.active)
    .filter(s => classFilter === 'all' || s.classId === classFilter)
    .filter(s => search === '' || s.name.includes(search))
    .filter(s => {
      if (statusFilter === 'retest') return pendingRetestIds.has(s.id)
      if (statusFilter === 'no-homework') return noHomeworkIds.has(s.id)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const handleAddStudent = () => {
    if (!newName.trim()) return
    dispatch({
      type: 'ADD_STUDENT',
      payload: { name: newName.trim(), classId: newClass, active: true },
    })
    setNewName('')
    setShowAdd(false)
  }

  const getClassName = (classId: string) =>
    state.classes.find(c => c.id === classId)?.name ?? ''

  const filterCounts = {
    all: state.students.filter(s => s.active).length,
    retest: state.students.filter(s => s.active && pendingRetestIds.has(s.id)).length,
    'no-homework': state.students.filter(s => s.active && noHomeworkIds.has(s.id)).length,
  }

  const totalSessions = monthSessionNums.length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">학생관리</h1>
          <p className="text-sm text-slate-500 mt-1">전체 {state.students.filter(s => s.active).length}명 등록</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} />
          학생 추가
        </button>
      </div>

      {/* 학생 추가 폼 */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">새 학생 추가</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">이름</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="학생 이름"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 w-36"
                onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">반</label>
              <select
                value={newClass}
                onChange={e => setNewClass(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              >
                {state.classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddStudent}
                disabled={!newName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                추가
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 필터 영역 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* 월 선택 */}
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-slate-400 shrink-0" />
          <select
            value={selectedYM}
            onChange={e => setSelectedYM(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            {availableMonths.map(m => (
              <option key={m.ym} value={m.ym}>
                {m.label}{m.ym === currentYM ? ' (현재)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* 검색 */}
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름 검색..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* 상태 필터 */}
        <div className="flex gap-1.5">
          {([
            { key: 'all', label: '전체' },
            { key: 'retest', label: '재시험' },
            { key: 'no-homework', label: '미제출' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1
                ${statusFilter === key
                  ? key === 'retest' ? 'bg-orange-500 text-white'
                  : key === 'no-homework' ? 'bg-red-500 text-white'
                  : 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
            >
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full
                ${statusFilter === key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {filterCounts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 반 탭 */}
      <div className="flex gap-1.5 flex-wrap">
        {[{ id: 'all', name: '전체' }, ...state.classes].map(cls => (
          <button
            key={cls.id}
            onClick={() => setClassFilter(cls.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${classFilter === cls.id
                ? 'bg-slate-700 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
              }`}
          >
            {cls.name}
          </button>
        ))}
      </div>

      {/* 학생 목록 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-500">{filteredStudents.length}명 표시</p>
          <p className="text-xs text-slate-400">{selectedMonthInfo?.label} 기준 · {totalSessions}회차</p>
        </div>
        <div className="divide-y divide-slate-50">
          {filteredStudents.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">해당하는 학생이 없습니다</p>
          ) : (
            filteredStudents.map(student => {
              const studentGrades = monthGrades.filter(g => g.studentId === student.id)
              const studentRetests = monthRetests.filter(r => r.studentId === student.id && r.passed === null)
              const noHwCount = studentGrades.filter(g => g.homeworkDone === '미제출' || g.homeworkDone === '미흡').length
              const recorded = studentGrades.length

              return (
                <button
                  key={student.id}
                  onClick={() => setSelected(student)}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                    {student.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{student.name}</span>
                      <span className="text-xs text-slate-400">{getClassName(student.classId)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {recorded === 0 ? (
                        <span className="text-xs text-slate-300">기록 없음</span>
                      ) : (
                        <span className="text-xs text-slate-400">{recorded}/{totalSessions}회 기록</span>
                      )}
                      {studentRetests.length > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                          <AlertCircle size={10} /> 재시험 {studentRetests.length}회
                        </span>
                      )}
                      {noHwCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                          <BookX size={10} /> 미제출 {noHwCount}회
                        </span>
                      )}
                      {recorded > 0 && studentRetests.length === 0 && noHwCount === 0 && (
                        <CheckCircle size={13} className="text-green-400" />
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 shrink-0" />
                </button>
              )
            })
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-center">
          <button
            onClick={() => setVisibleCount(c => c + 2)}
            className="flex items-center gap-1.5 mx-auto text-xs text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Plus size={13} />
            회차 추가
          </button>
        </div>
      </div>

      {/* 학생 상세 모달 */}
      {selected && (
        <StudentDetail student={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
