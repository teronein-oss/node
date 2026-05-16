import { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { CheckCircle, XCircle, Trash2, Eye, Clock, RotateCcw, GraduationCap, Users, Settings } from 'lucide-react'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth, fetchAllRegistrations, type RegistrationInfo } from '../context/AuthContext'

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

export default function AdminPage() {
  const { approveUser, rejectUser, deleteRegistration, setViewingUid, assignTeacher } = useAuth()
  const [registrations, setRegistrations] = useState<RegistrationInfo[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchAllRegistrations()
      setRegistrations(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pending = registrations.filter(r => r.status === 'pending')
  const approved = registrations.filter(r => r.status === 'approved')
  const rejected = registrations.filter(r => r.status === 'rejected')

  const teachers = approved.filter(r => r.role === '선생님' || r.role === '관리자')
  const jogyoList = approved.filter(r => r.role === '조교')
  const unassignedJogyo = jogyoList.filter(r => !r.assignedTeacherUid)

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

  // 선생님/관리자: 해당 uid로 대시보드 보기
  // 조교: 담당 선생님 uid로 대시보드 보기 (조교 본인 데이터 없음)
  const handleView = (reg: RegistrationInfo) => {
    if (reg.role === '조교' && reg.assignedTeacherUid) {
      // 조교는 담당 선생님 데이터를 사용하지만, 메뉴는 조교 기준으로 필터링
      setViewingUid(reg.assignedTeacherUid, `${reg.displayName} 조교 뷰`, '조교')
    } else {
      setViewingUid(reg.uid, reg.displayName, reg.role)
    }
    navigate('/')
  }

  const handleResetData = async (uid: string, name: string) => {
    if (!confirm(`"${name}" 계정의 모든 데이터(반, 학생, 성적 등)를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    await deleteDoc(doc(db, 'appData', uid))
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
              const assignedJogyo = jogyoList.filter(j => j.assignedTeacherUid === teacher.uid)
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
                      <button
                        onClick={() => handleView(teacher)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                      >
                        <Eye size={13} />대시보드 보기
                      </button>
                      <button
                        onClick={() => handleResetData(teacher.uid, teacher.displayName)}
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
                  {assignedJogyo.length > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50/60">
                      {assignedJogyo.map(jogyo => (
                        <div key={jogyo.uid} className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 last:border-b-0">
                          <div className="flex items-center gap-2 pl-4">
                            <span className="text-slate-300 text-xs">└</span>
                            <div>
                              <p className="text-xs font-medium text-slate-700">
                                {jogyo.displayName}
                                <span className="ml-1.5 text-slate-400">(조교)</span>
                              </p>
                              <p className="text-[11px] text-slate-400">{jogyo.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleView(jogyo)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                              title={`${teacher.displayName} 선생님 대시보드로 연결`}
                            >
                              <Eye size={12} />조교 뷰
                            </button>
                            <button
                              onClick={async () => {
                                await assignTeacher(jogyo.uid, null)
                                setRegistrations(prev => prev.map(r =>
                                  r.uid === jogyo.uid ? { ...r, assignedTeacherUid: null } : r
                                ))
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
                      ))}
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
                        await assignTeacher(jogyo.uid, teacherUid)
                        setRegistrations(prev => prev.map(r =>
                          r.uid === jogyo.uid ? { ...r, assignedTeacherUid: teacherUid } : r
                        ))
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
