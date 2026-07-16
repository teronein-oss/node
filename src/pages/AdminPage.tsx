import { useEffect, useMemo, useState } from 'react'
import { deleteDoc } from 'firebase/firestore'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { CheckCircle, XCircle, Trash2, Eye, Clock, RotateCcw, GraduationCap, Users, Settings } from 'lucide-react'
import { useAuth, fetchAllRegistrations, type RegistrationInfo } from '../context/AuthContext'
import { appDataDoc, sharedStudentRosterDoc } from '../utils/firestorePaths'
import { DEFAULT_ACADEMY_ID, DEFAULT_ACADEMY_NAME, normalizeAcademyId, normalizeAcademyName } from '../utils/academy'

function AdminTabs() {
  const { pathname } = useLocation()
  return (
    <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
      <Link
        to="/admin"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
          ${pathname === '/admin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      >
        <Clock size={14} />가입 관리
      </Link>
      <Link
        to="/admin/manage"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
          ${pathname === '/admin/manage' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      >
        <Settings size={14} />계정 관리
      </Link>
    </div>
  )
}

const ROLE_OPTIONS = ['원장', '선생님', '조교', '학생', '학부모']

export default function AdminPage() {
  const { approveUser, rejectUser, deleteRegistration, updateUserRole, setViewingUid, addTeacherToJogyo, removeTeacherFromJogyo, isAdmin, user } = useAuth()
  const [registrations, setRegistrations] = useState<RegistrationInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAcademyId, setActiveAcademyId] = useState('')
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchAllRegistrations(user?.academyId, isAdmin)
      setRegistrations(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const academyGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; registrations: RegistrationInfo[] }>()
    for (const reg of registrations) {
      const id = normalizeAcademyId(reg.academyId)
      const name = normalizeAcademyName(reg.academyName)
      const group = map.get(id) ?? { id, name, registrations: [] }
      group.registrations.push(reg)
      map.set(id, group)
    }
    if (!map.has(DEFAULT_ACADEMY_ID) && user?.academyId === DEFAULT_ACADEMY_ID) {
      map.set(DEFAULT_ACADEMY_ID, { id: DEFAULT_ACADEMY_ID, name: DEFAULT_ACADEMY_NAME, registrations: [] })
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)
    )
  }, [registrations, user?.academyId])

  const currentAcademyId = isAdmin
    ? (activeAcademyId && academyGroups.some(a => a.id === activeAcademyId)
      ? activeAcademyId
      : academyGroups[0]?.id ?? user?.academyId ?? DEFAULT_ACADEMY_ID)
    : user?.academyId ?? DEFAULT_ACADEMY_ID
  const currentAcademy = academyGroups.find(a => a.id === currentAcademyId) ?? {
    id: currentAcademyId,
    name: normalizeAcademyName(user?.academyName),
    registrations: [],
  }

  const currentRegistrations = currentAcademy.registrations
  const pending = currentRegistrations.filter(r => r.status === 'pending')
  const approved = currentRegistrations.filter(r => r.status === 'approved')
  const rejected = currentRegistrations.filter(r => r.status === 'rejected')

  const teachers = approved.filter(r => r.role === '선생님' || r.role === '관리자' || r.role === '원장')
  const jogyoList = approved.filter(r => r.role === '조교')
  const otherApproved = approved.filter(r => !teachers.some(t => t.uid === r.uid) && r.role !== '조교')

  const getJogyoUids = (r: RegistrationInfo) =>
    r.assignedTeacherUids ?? (r.assignedTeacherUid ? [r.assignedTeacherUid] : [])

  const unassignedJogyo = jogyoList.filter(r => getJogyoUids(r).length === 0)

  const handleApprove = async (uid: string) => {
    await approveUser(uid)
    await load()
  }

  const handleReject = async (uid: string) => {
    await rejectUser(uid)
    await load()
  }

  const handleDelete = async (uid: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteRegistration(uid)
    await load()
  }

  const handleRoleChange = async (reg: RegistrationInfo, role: string) => {
    if (reg.role === role) return
    await updateUserRole(reg.uid, role)
    await load()
  }

  const handleView = (reg: RegistrationInfo, teacherUid?: string) => {
    const targetAcademyId = normalizeAcademyId(reg.academyId ?? currentAcademyId)
    const targetAcademyName = normalizeAcademyName(reg.academyName ?? currentAcademy.name)
    if (reg.role === '조교') {
      const uid = teacherUid ?? getJogyoUids(reg)[0]
      if (uid) {
        const jogyoTeacherList = teachers.filter(t => getJogyoUids(reg).includes(t.uid))
        setViewingUid(uid, `${reg.displayName} 조교 뷰`, '조교', jogyoTeacherList, targetAcademyId, targetAcademyName)
      }
    } else {
      setViewingUid(reg.uid, reg.displayName, reg.role, undefined, targetAcademyId, targetAcademyName)
    }
    navigate('/')
  }

  const handleResetData = async (uid: string, name: string, academyId?: string) => {
    if (!confirm(`"${name}" 계정의 모든 데이터(반, 학생, 성적 등)를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    await deleteDoc(appDataDoc(uid, academyId ?? user?.academyId))
    await deleteDoc(sharedStudentRosterDoc(uid, academyId ?? user?.academyId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800">관리자 패널</h1>
        <AdminTabs />
        {user?.academyId && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold text-blue-700">학원 초대코드</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{user.academyId}</p>
            <p className="mt-0.5 text-xs text-slate-500">{user.academyName} 구성원 가입 시 이 코드를 입력합니다</p>
          </div>
        )}
        {isAdmin && academyGroups.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">학원별 관리</p>
            <div className="flex flex-wrap gap-2">
              {academyGroups.map(academy => {
                const count = academy.registrations.length
                return (
                  <button
                    key={academy.id}
                    onClick={() => setActiveAcademyId(academy.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      currentAcademyId === academy.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-semibold">{academy.name}</span>
                    <span className="text-[11px] opacity-80">{academy.id} · {count}명</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold text-slate-500">현재 관리 중인 학원</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-slate-800">{currentAcademy.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{currentAcademy.id}</span>
        </div>
      </div>

      {/* 승인 대기 */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          <Clock size={14} />
          승인 대기 ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">대기 중인 가입 신청이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {pending.map(reg => (
              <div key={reg.uid} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {reg.displayName}
                    <span className="ml-2 text-xs text-slate-400">({reg.role})</span>
                  </p>
                  <p className="text-xs text-slate-500">{reg.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(reg.createdAt).toLocaleDateString('ko-KR')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors"
                  >
                    <CheckCircle size={13} />승인
                  </button>
                  <button
                    onClick={() => handleReject(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                  >
                    <XCircle size={13} />거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 선생님 + 소속 조교 */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          <GraduationCap size={14} />
          선생님 ({teachers.length})
        </h2>
        {teachers.length === 0 ? (
          <p className="text-sm text-slate-400">승인된 선생님이 없습니다</p>
        ) : (
          <div className="space-y-3">
            {teachers.map(teacher => {
              const assignedJogyo = jogyoList.filter(j => getJogyoUids(j).includes(teacher.uid))
              const unassignedToThisTeacher = jogyoList.filter(j => !getJogyoUids(j).includes(teacher.uid))
              return (
                <div key={teacher.uid} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* 선생님 행 */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {teacher.displayName}
                        <span className="ml-2 text-xs text-slate-400">({teacher.role})</span>
                      </p>
                      <p className="text-xs text-slate-500">{teacher.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={teacher.role}
                        onChange={e => handleRoleChange(teacher, e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                        title="권한 변경"
                      >
                        {ROLE_OPTIONS.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleView(teacher)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                      >
                        <Eye size={13} />대시보드 보기
                      </button>
                      <button
                        onClick={() => handleResetData(teacher.uid, teacher.displayName, teacher.academyId)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200 transition-colors"
                        title="반·학생·성적 데이터 초기화"
                      >
                        <RotateCcw size={13} />초기화
                      </button>
                      <button
                        onClick={() => handleDelete(teacher.uid)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={13} />삭제
                      </button>
                    </div>
                  </div>

                  {/* 소속 조교 */}
                  {(assignedJogyo.length > 0 || unassignedToThisTeacher.length > 0) && (
                    <div className="border-t border-slate-100 bg-slate-50/60">
                      {assignedJogyo.map(jogyo => {
                        const otherTeachers = teachers.filter(t => !getJogyoUids(jogyo).includes(t.uid))
                        return (
                        <div key={jogyo.uid} className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 last:border-b-0">
                          <div className="flex items-center gap-2 pl-4">
                            <span className="text-slate-300 text-xs">└</span>
                            <div>
                              <p className="text-xs font-medium text-slate-700">
                                {jogyo.displayName}
                                <span className="ml-1.5 text-slate-400">(조교)</span>
                              </p>
                              <p className="text-[11px] text-slate-400">{jogyo.email}</p>
                              {/* 다른 선생님 추가(중복) 배정 */}
                              {otherTeachers.length > 0 && (
                                <select
                                  className="mt-1.5 border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                                  value=""
                                  onChange={async (e) => {
                                    const teacherUid = e.target.value
                                    if (!teacherUid) return
                                    await addTeacherToJogyo(jogyo.uid, teacherUid)
                                    setRegistrations(prev => prev.map(r => {
                                      if (r.uid !== jogyo.uid) return r
                                      const next = [...new Set([...getJogyoUids(r), teacherUid])]
                                      return { ...r, assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null }
                                    }))
                                  }}
                                >
                                  <option value="">+ 선생님 추가 배정...</option>
                                  {otherTeachers.map(t => (
                                    <option key={t.uid} value={t.uid}>{t.displayName}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={jogyo.role}
                              onChange={e => handleRoleChange(jogyo, e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                              title="권한 변경"
                            >
                              {ROLE_OPTIONS.map(role => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleView(jogyo, teacher.uid)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                              title={`${teacher.displayName} 선생님 대시보드로 연결`}
                            >
                              <Eye size={12} />조교 뷰
                            </button>
                            <button
                              onClick={async () => {
                                await removeTeacherFromJogyo(jogyo.uid, teacher.uid)
                                setRegistrations(prev => prev.map(r => {
                                  if (r.uid !== jogyo.uid) return r
                                  const next = getJogyoUids(r).filter(u => u !== teacher.uid)
                                  return { ...r, assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null }
                                }))
                              }}
                              className="text-[11px] px-2 py-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              배정 해제
                            </button>
                            <button
                              onClick={() => handleDelete(jogyo.uid)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-400 rounded-lg text-xs hover:bg-red-100 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        )
                      })}
                      {/* 이 선생님에게 조교 추가 배정 */}
                      {unassignedToThisTeacher.length > 0 && (
                        <div className="px-4 py-2 border-t border-slate-100">
                          <select
                            className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                            value=""
                            onChange={async (e) => {
                              const jogyoUid = e.target.value
                              if (!jogyoUid) return
                              await addTeacherToJogyo(jogyoUid, teacher.uid)
                              setRegistrations(prev => prev.map(r => {
                                if (r.uid !== jogyoUid) return r
                                const next = [...new Set([...getJogyoUids(r), teacher.uid])]
                                return { ...r, assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null }
                              }))
                            }}
                          >
                            <option value="">조교 추가 배정...</option>
                            {unassignedToThisTeacher.map(j => (
                              <option key={j.uid} value={j.uid}>{j.displayName}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 미배정 조교 */}
      {unassignedJogyo.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            <Users size={14} />
            미배정 조교 ({unassignedJogyo.length})
          </h2>
          <div className="space-y-2">
            {unassignedJogyo.map(jogyo => (
              <div key={jogyo.uid} className="bg-white rounded-xl border border-amber-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {jogyo.displayName}
                    <span className="ml-2 text-xs text-slate-400">(조교)</span>
                  </p>
                  <p className="text-xs text-slate-500">{jogyo.email}</p>
                  <div className="mt-1.5">
                    <select
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                      value=""
                      onChange={async (e) => {
                        const teacherUid = e.target.value || null
                        if (!teacherUid) return
                        await addTeacherToJogyo(jogyo.uid, teacherUid)
                        setRegistrations(prev => prev.map(r => {
                          if (r.uid !== jogyo.uid) return r
                          const next = [...new Set([...getJogyoUids(r), teacherUid])]
                          return { ...r, assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null }
                        }))
                      }}
                    >
                      <option value="">담당 선생님 배정...</option>
                      {teachers.map(t => (
                        <option key={t.uid} value={t.uid}>{t.displayName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={jogyo.role}
                    onChange={e => handleRoleChange(jogyo, e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                    title="권한 변경"
                  >
                    {ROLE_OPTIONS.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(jogyo.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={13} />삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 기타 승인 사용자 */}
      {otherApproved.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            <Users size={14} />
            기타 가입자 ({otherApproved.length})
          </h2>
          <div className="space-y-2">
            {otherApproved.map(reg => (
              <div key={reg.uid} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {reg.displayName}
                    <span className="ml-2 text-xs text-slate-400">({reg.role})</span>
                  </p>
                  <p className="text-xs text-slate-500">{reg.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={reg.role}
                    onChange={e => handleRoleChange(reg, e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                    title="권한 변경"
                  >
                    {ROLE_OPTIONS.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={13} />삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 거절된 사용자 */}
      {rejected.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            <XCircle size={14} />
            거절된 사용자 ({rejected.length})
          </h2>
          <div className="space-y-2">
            {rejected.map(reg => (
              <div key={reg.uid} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between opacity-60">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {reg.displayName}
                    <span className="ml-2 text-xs text-slate-400">({reg.role})</span>
                  </p>
                  <p className="text-xs text-slate-500">{reg.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors"
                  >
                    <CheckCircle size={13} />승인
                  </button>
                  <button
                    onClick={() => handleDelete(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={13} />삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
