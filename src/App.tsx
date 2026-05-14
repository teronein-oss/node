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
  const { registrationStatus, firebaseUser, viewingUid, user, adminUid } = useAuth()

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

  // 조교는 admin의 데이터를 공유 — adminUid 로딩 대기
  if (isJogyo && !adminUid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const uid = viewingUid ?? (isJogyo ? adminUid! : firebaseUser.uid)
  return (
    <AppProvider key={uid} uid={uid}>
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
