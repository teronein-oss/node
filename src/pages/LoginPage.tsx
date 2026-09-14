import { useState, type FormEvent } from 'react'
import { GraduationCap, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

type Screen = 'login' | 'signup' | 'reset'
type AccountType = 'personal' | 'academy' | 'invited'

const accountTypes: Array<{ id: AccountType; title: string; description: string }> = [
  { id: 'personal', title: '개인 강사', description: '내 이름으로 학습관리 공간을 만듭니다.' },
  { id: 'academy', title: '학원 원장', description: '학원 공간을 만들고 강사를 초대합니다.' },
  { id: 'invited', title: '초대받은 구성원', description: '강사 또는 조교로 기존 공간에 참여합니다.' },
]

function authError(error: unknown) {
  const code = (error as { code?: string })?.code
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return '이메일 또는 비밀번호를 확인해 주세요.'
  if (code === 'auth/too-many-requests') return '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'
  if (code === 'auth/invalid-email') return '올바른 이메일 주소를 입력해 주세요.'
  if (code === 'auth/popup-blocked') return 'Google 로그인 팝업을 허용해 주세요.'
  if (code === 'auth/popup-closed-by-user') return 'Google 로그인 창이 닫혔습니다.'
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

export default function LoginPage() {
  const { firebaseUser, registrationStatus, signInWithEmail, signInWithGoogle, resetPassword, resendVerificationEmail, activateEmailAccount, signOut } = useAuth()
  const [screen, setScreen] = useState<Screen>('login')
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const switchScreen = (next: Screen) => {
    setScreen(next)
    setError('')
    setNotice('')
    setPassword('')
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signInWithEmail(email, password)
    } catch (loginError) {
      setError(authError(loginError))
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await resetPassword(email)
      setNotice('비밀번호 재설정 메일을 보냈습니다. 받은편지함을 확인해 주세요.')
    } catch (resetError) {
      setError(authError(resetError))
    } finally {
      setBusy(false)
    }
  }

  const handleLegacyGoogle = async () => {
    setBusy(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (loginError) {
      setError(authError(loginError))
    } finally {
      setBusy(false)
    }
  }

  const handleEmailActivation = async () => {
    setBusy(true)
    setError('')
    try {
      await activateEmailAccount()
    } catch (activationError) {
      const message = (activationError as Error).message
      setError(message?.includes('이메일 인증') ? message : '인증 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const handleResendVerification = async () => {
    setBusy(true)
    setError('')
    try {
      await resendVerificationEmail()
      setNotice('인증 메일을 다시 보냈습니다.')
    } catch (sendError) {
      setError(authError(sendError))
    } finally {
      setBusy(false)
    }
  }

  if (registrationStatus === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]"><div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
  }

  const blockedMessage = registrationStatus === 'pending_email'
    ? '이메일 인증이 완료될 때까지 대시보드를 사용할 수 없습니다.'
    : registrationStatus === 'pending'
      ? '가입 승인 대기 중입니다.'
      : registrationStatus === 'rejected'
        ? '이 계정의 가입이 승인되지 않았습니다.'
        : '이 계정은 NODE 가입이 완료되지 않았습니다.'

  return (
    <div className="notion-login flex min-h-screen items-center justify-center bg-[#f7f7f5] p-4">
      <div className={`notion-login-card w-full rounded-xl border border-[#e3e3e0] bg-white p-7 shadow-sm ${screen === 'signup' && !firebaseUser ? 'max-w-lg' : 'max-w-sm'}`}>
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#eef4fb]"><GraduationCap size={27} className="text-[#4f7fa8]" /></div>
          <h1 className="text-xl font-bold text-[#37352f]">NODE</h1>
          <p className="mt-1 text-sm text-[#787774]">학생 관리 워크스페이스</p>
        </div>

        {firebaseUser ? (
          <div className="space-y-4 text-center">
            <ShieldCheck size={28} className="mx-auto text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">{blockedMessage}</p>
            <p className="break-all text-xs text-slate-500">{firebaseUser.email}</p>
            {registrationStatus === 'pending_email' && (
              <div className="space-y-2">
                <button onClick={handleEmailActivation} disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">이메일 인증 완료 확인</button>
                <button onClick={handleResendVerification} disabled={busy} className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">인증 메일 다시 보내기</button>
              </div>
            )}
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
            <button onClick={signOut} className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">다른 계정으로 로그인</button>
          </div>
        ) : screen === 'login' ? (
          <>
            <h2 className="mb-4 text-base font-semibold text-slate-800">이메일로 로그인</h2>
            <form className="space-y-3" onSubmit={handleLogin}>
              <label className="block text-xs font-medium text-slate-600">이메일
                <input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
              </label>
              <label className="block text-xs font-medium text-slate-600">비밀번호
                <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
              </label>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? '로그인 중...' : '로그인'}</button>
            </form>
            <div className="mt-3 flex justify-between text-xs">
              <button onClick={() => switchScreen('reset')} className="text-slate-500 hover:text-slate-800">비밀번호 찾기</button>
              <button onClick={() => switchScreen('signup')} className="font-semibold text-blue-600 hover:text-blue-800">회원가입</button>
            </div>
            <div className="my-5 border-t border-slate-100" />
            <button onClick={handleLegacyGoogle} disabled={busy} className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">기존 사용자 Google 로그인</button>
          </>
        ) : screen === 'reset' ? (
          <>
            <h2 className="mb-2 text-base font-semibold text-slate-800">비밀번호 찾기</h2>
            <p className="mb-4 text-xs text-slate-500">가입한 이메일로 재설정 링크를 보내드립니다.</p>
            <form className="space-y-3" onSubmit={handleReset}>
              <label className="block text-xs font-medium text-slate-600">이메일
                <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
              </label>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
              <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">재설정 메일 보내기</button>
            </form>
            <button onClick={() => switchScreen('login')} className="mt-4 text-xs text-slate-500 hover:text-slate-800">로그인으로 돌아가기</button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-slate-800">NODE 회원가입</h2>
            <p className="mb-5 mt-1 text-xs text-slate-500">가입 유형을 선택한 뒤 약관 동의와 휴대폰 본인확인을 진행합니다.</p>
            <div className="space-y-2" role="radiogroup" aria-label="가입 유형">
              {accountTypes.map(type => (
                <button key={type.id} type="button" role="radio" aria-checked={accountType === type.id} onClick={() => setAccountType(type.id)} className={`w-full rounded-lg border px-4 py-3 text-left ${accountType === type.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <span className="block text-sm font-semibold text-slate-800">{type.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{type.description}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Mail size={15} />서비스 약관 및 개인정보 안내</p>
              <p className="text-xs leading-5 text-slate-500">약관 문안과 휴대폰 본인확인 서비스가 준비되는 동안 신규 가입은 열리지 않습니다.</p>
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700"><ShieldCheck size={15} />휴대폰 실명·본인확인</p>
              <p className="text-xs leading-5 text-slate-500">통신사 인증이 완료된 이름으로 계정을 만들 예정입니다.</p>
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700"><LockKeyhole size={15} />이메일·비밀번호 설정</p>
              <p className="text-xs leading-5 text-slate-500">본인확인 후 이메일 인증을 거쳐 가입이 완료됩니다.</p>
            </div>
            <button disabled className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white opacity-50">본인확인 준비 중</button>
            <button onClick={() => switchScreen('login')} className="mt-4 w-full text-xs text-slate-500 hover:text-slate-800">로그인으로 돌아가기</button>
          </>
        )}
      </div>
    </div>
  )
}
