import { RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider, useApp } from './context/AppContext'
import { router } from './router'
import LoginPage from './pages/LoginPage'

function AppInner() {
  const { loading } = useApp()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#787774]">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return <RouterProvider router={router} />
}

function AuthGate() {
  const { registrationStatus, firebaseUser, viewingUid, viewingAcademyId, user, adminUid, signOut, isAdmin, isAcademyAdmin } = useAuth()

  if (registrationStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!firebaseUser || registrationStatus !== 'approved') {
    return <LoginPage />
  }

  const isJogyo = user?.role === '조교'

  // 조교에게 담당 선생님이 배정되지 않은 경우
  if (isJogyo && !adminUid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="text-center space-y-4">
          <p className="text-sm text-[#787774]">담당 선생님이 배정되지 않았습니다</p>
          <button
            onClick={() => signOut()}
            className="rounded-md border border-[#dededb] bg-white px-4 py-2 text-sm text-[#37352f] transition-colors hover:bg-[#efefed]"
          >
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  const uid = viewingUid ?? (isJogyo ? adminUid! : firebaseUser.uid)
  const academyId = viewingAcademyId ?? user?.academyId
  // 다른 사용자 대시보드 조회 중에는 isAdmin=false — globalScheduleEvents 구독 활성화 + 불필요한 sync 방지
  return (
    <AppProvider key={`${academyId ?? 'default'}-${uid}`} uid={uid} academyId={academyId} isAdmin={(isAdmin || isAcademyAdmin) && !viewingUid}>
      <AppInner />
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
