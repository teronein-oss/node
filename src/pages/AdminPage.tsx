import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Trash2, Eye, Clock } from 'lucide-react'
import { useAuth, fetchAllRegistrations, type RegistrationInfo } from '../context/AuthContext'

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

  const handleView = (reg: RegistrationInfo) => {
    setViewingUid(reg.uid, reg.displayName)
    navigate('/')
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
      <h1 className="text-xl font-bold text-slate-800">관리자 패널</h1>

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
                    <CheckCircle size={13} />
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                  >
                    <XCircle size={13} />
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 승인된 사용자 */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          <CheckCircle size={14} />
          승인된 사용자 ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-slate-400">승인된 사용자가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {approved.map(reg => {
              const teachers = approved.filter(r => r.role === '선생님' || r.role === '관리자')
              return (
                <div key={reg.uid} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {reg.displayName}
                      <span className="ml-2 text-xs text-slate-400">({reg.role})</span>
                    </p>
                    <p className="text-xs text-slate-500">{reg.email}</p>
                    {reg.role === '조교' && (
                      <select
                        className="mt-1 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                        value={reg.assignedTeacherUid ?? ''}
                        onChange={async (e) => {
                          const teacherUid = e.target.value || null
                          await assignTeacher(reg.uid, teacherUid)
                          setRegistrations(prev => prev.map(r =>
                            r.uid === reg.uid ? { ...r, assignedTeacherUid: teacherUid } : r
                          ))
                        }}
                      >
                        <option value="">미배정</option>
                        {teachers.map(t => (
                          <option key={t.uid} value={t.uid}>{t.displayName}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleView(reg)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                    >
                      <Eye size={13} />
                      대시보드 보기
                    </button>
                    <button
                      onClick={() => handleDelete(reg.uid)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={13} />
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

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
                    <CheckCircle size={13} />
                    승인
                  </button>
                  <button
                    onClick={() => handleDelete(reg.uid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={13} />
                    삭제
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
