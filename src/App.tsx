import { RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider, useApp } from './context/AppContext'
import { router } from './router'
import LoginPage from './pages/LoginPage'

function AppInner() {
  const { loading } = useApp()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return <RouterProvider router={router} />
}

function AuthGate() {
  const { registrationStatus, firebaseUser, viewingUid, user, adminUid, signOut, isAdmin } = useAuth()

  if (registrationStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
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
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-4">
          <p className="text-slate-600 text-sm">담당 선생님이 배정되지 않았습니다</p>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  const uid = viewingUid ?? (isJogyo ? adminUid! : firebaseUser.uid)
  // 다른 사용자 대시보드 조회 중에는 isAdmin=false — globalScheduleEvents 구독 활성화 + 불필요한 sync 방지
  return (
    <AppProvider key={uid} uid={uid} isAdmin={isAdmin && !viewingUid}>
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
