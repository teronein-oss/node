import { useState } from 'react'
import { GraduationCap, LogIn, UserPlus } from 'lucide-react'
import { useAuth, ROLES } from '../context/AuthContext'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.6-5 7.3v6h8c4.7-4.3 7.3-10.7 7.3-17.4z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-8-6c-2.1 1.4-4.8 2.2-7.9 2.2-6.1 0-11.2-4.1-13.1-9.6H2.7v6.2C6.7 43 14.8 48 24 48z" />
      <path fill="#FBBC05" d="M10.9 28.8c-.5-1.4-.7-2.9-.7-4.4s.2-3 .7-4.4v-6.2H2.7C1 16.9 0 20.3 0 24s1 7.1 2.7 10.2l8.2-5.4z" />
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.8 0 6.7 5 2.7 12.2l8.2 5.4C12.8 13.6 17.9 9.5 24 9.5z" />
    </svg>
  )
}

type Mode = 'select' | 'register'

export default function LoginPage() {
  const { firebaseUser, registrationStatus, signInWithGoogle, signOut, submitRegistration } = useAuth()
  const [mode, setMode] = useState<Mode>('select')
  const [name, setName] = useState('')
  const [role, setRole] = useState<string>(ROLES[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleLogin = async (nextMode?: Mode) => {
    setError('')
    if (nextMode) setMode(nextMode)
    try {
      await signInWithGoogle()
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? ''
      if (code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.')
      } else if (code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해주세요.')
      } else if (code === 'auth/unauthorized-domain') {
        setError('인증되지 않은 도메인입니다. Firebase 콘솔에서 도메인을 등록해주세요.')
      } else {
        setError(`오류: ${code || '알 수 없는 오류'}`)
      }
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await submitRegistration(name.trim(), role)
    } catch {
      setError('가입신청 중 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  if (registrationStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        {/* 로고 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <GraduationCap size={30} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">NODE</h1>
          <p className="text-sm text-slate-400 mt-1">학원 관리 시스템</p>
        </div>

        {!firebaseUser ? (
          /* ── 로그인/회원가입 선택 ── */
          <div className="space-y-3">
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              onClick={() => handleGoogleLogin('select')}
              className="w-full flex items-center justify-center gap-3 py-3 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <LogIn size={16} className="text-slate-500" />
              로그인
            </button>

            <button
              onClick={() => handleGoogleLogin('register')}
              className="w-full flex items-center justify-center gap-3 py-3 bg-blue-600 rounded-xl text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={16} />
              회원가입
            </button>

            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs text-slate-300">Google 계정으로 진행</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            <div className="flex justify-center">
              <GoogleIcon />
            </div>

            <p className="text-xs text-slate-400 text-center pt-1">
              개인 데이터는 안전하게 암호화됩니다
            </p>
          </div>

        ) : registrationStatus === 'none' || (registrationStatus === 'approved' && mode === 'register') ? (
          /* ── 가입신청 폼 ── */
          <div className="space-y-4">
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-2 mb-1">
                <GoogleIcon />
                <p className="text-xs text-slate-500 truncate">{firebaseUser.email}</p>
              </div>
              <p className="text-sm font-semibold text-slate-700">가입 정보를 입력해주세요</p>
              <p className="text-xs text-slate-400 mt-0.5">관리자 승인 후 서비스를 이용할 수 있습니다</p>
            </div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="실명 입력"
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {submitting ? '신청 중...' : '가입신청'}
            </button>
            <button
              onClick={signOut}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              다른 계정으로 로그인
            </button>
          </div>

        ) : registrationStatus === 'pending' ? (
          /* ── 승인 대기 ── */
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto text-3xl">⏳</div>
            <div>
              <p className="font-semibold text-slate-800">승인 대기 중입니다</p>
              <p className="text-sm text-slate-500 mt-1">관리자의 승인 후 이용할 수 있습니다</p>
            </div>
            <button onClick={signOut} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              로그아웃
            </button>
          </div>

        ) : registrationStatus === 'rejected' ? (
          /* ── 거절 ── */
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-3xl">🚫</div>
            <div>
              <p className="font-semibold text-red-700">허락되지 않은 계정입니다</p>
              <p className="text-sm text-slate-500 mt-1">관리자에게 문의하세요</p>
            </div>
            <button onClick={signOut} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              로그아웃
            </button>
          </div>

        ) : null}
      </div>
    </div>
  )
}
