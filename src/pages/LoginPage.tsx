import { useState, type FormEvent } from 'react'
import { GraduationCap, ShieldCheck } from 'lucide-react'
import { useAuth, type SignupForm } from '../context/AuthContext'

type Screen = 'login' | 'signup' | 'reset'
type AccountType = SignupForm['accountType']

const accountTypes: Array<{ id: AccountType; title: string; description: string }> = [
  { id: 'personal', title: '새 학원 강사', description: '내 학원 이름으로 새 공간을 만듭니다.' },
  { id: 'academy', title: '새 학원 원장', description: '학원 공간을 만들고 강사를 초대합니다.' },
  { id: 'join', title: '기존 학원 합류', description: '학원 코드로 강사·조교로 가입합니다.' },
]

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500'

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`
}

function signupError(error: unknown) {
  const code = (error as { code?: string })?.code ?? ''
  const message = (error as Error)?.message
  if (code.startsWith('functions/') && code !== 'functions/internal' && code !== 'functions/unavailable' && message) return message
  return authError(error)
}

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
  const { firebaseUser, registrationStatus, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword, resendVerificationEmail, activateEmailAccount, signOut } = useAuth()
  const [screen, setScreen] = useState<Screen>('login')
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [academyName, setAcademyName] = useState('')
  const [academyCode, setAcademyCode] = useState('')
  const [joinRole, setJoinRole] = useState<SignupForm['joinRole']>('선생님')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const switchScreen = (next: Screen) => {
    setScreen(next)
    setError('')
    setNotice('')
    setPassword('')
    setPasswordConfirm('')
  }

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('비밀번호는 8자 이상으로 입력해 주세요.')
    if (password !== passwordConfirm) return setError('비밀번호가 일치하지 않습니다.')
    if (!acceptTerms || !acceptPrivacy) return setError('필수 약관에 동의해 주세요.')
    setBusy(true)
    try {
      await signUpWithEmail({ name, birthDate, phone, email, password, accountType, academyName, academyCode, joinRole, acceptTerms, acceptPrivacy })
    } catch (signupFailure) {
      setError(signupError(signupFailure))
      setBusy(false)
    }
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
      ? '가입 승인 대기 중입니다. 원장님 승인 후 사용할 수 있습니다.'
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
            <p className="mb-5 mt-1 text-xs text-slate-500">정보를 입력하면 이메일 인증 후 가입이 완료됩니다.</p>
            <form className="space-y-3" onSubmit={handleSignup}>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="가입 유형">
                {accountTypes.map(type => (
                  <button key={type.id} type="button" role="radio" aria-checked={accountType === type.id} onClick={() => setAccountType(type.id)} className={`rounded-lg border px-3 py-2.5 text-left ${accountType === type.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="block text-sm font-semibold text-slate-800">{type.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{type.description}</span>
                  </button>
                ))}
              </div>
              {accountType === 'join' ? (
                <>
                  <label className="block text-xs font-medium text-slate-600">학원 코드
                    <input required placeholder="원장님께 받은 학원 코드" value={academyCode} onChange={event => setAcademyCode(event.target.value)} className={inputClass} />
                  </label>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="합류 역할">
                    {(['선생님', '조교'] as const).map(role => (
                      <button key={role} type="button" role="radio" aria-checked={joinRole === role} onClick={() => setJoinRole(role)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${joinRole === role ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {role === '선생님' ? '강사' : '조교'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">{joinRole === '선생님' ? '이메일 인증 후 바로 사용할 수 있습니다.' : '이메일 인증 후 원장님이 승인하면 사용할 수 있습니다.'}</p>
                </>
              ) : (
                <label className="block text-xs font-medium text-slate-600">학원 이름
                  <input required minLength={2} maxLength={60} value={academyName} onChange={event => setAcademyName(event.target.value)} className={inputClass} />
                </label>
              )}
              <label className="block text-xs font-medium text-slate-600">이름
                <input required autoComplete="name" minLength={2} maxLength={40} value={name} onChange={event => setName(event.target.value)} className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">생년월일
                  <input type="date" required autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={event => setBirthDate(event.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-slate-600">휴대폰 번호
                  <input type="tel" required autoComplete="tel" inputMode="numeric" placeholder="010-0000-0000" pattern="01[016789]-?\d{3,4}-?\d{4}" value={phone} onChange={event => setPhone(formatPhone(event.target.value))} className={inputClass} />
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">이메일
                <input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">비밀번호
                  <input type="password" required autoComplete="new-password" minLength={8} placeholder="8자 이상" value={password} onChange={event => setPassword(event.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-slate-600">비밀번호 확인
                  <input type="password" required autoComplete="new-password" minLength={8} value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} className={inputClass} />
                </label>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} className="mt-0.5" />
                  <span>[필수] 서비스 이용약관에 동의합니다.</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={acceptPrivacy} onChange={event => setAcceptPrivacy(event.target.checked)} className="mt-0.5" />
                  <span>[필수] 개인정보(이름, 생년월일, 휴대폰 번호, 이메일) 수집·이용에 동의합니다.</span>
                </label>
              </div>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? '가입 중...' : '회원가입'}</button>
            </form>
            <button onClick={() => switchScreen('login')} className="mt-4 w-full text-xs text-slate-500 hover:text-slate-800">로그인으로 돌아가기</button>
          </>
        )}
      </div>
    </div>
  )
}
