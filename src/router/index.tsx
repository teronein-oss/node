import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useAuth } from '../context/AuthContext'

function ScheduleGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role === '조교') return <Navigate to="/" replace />
  return <>{children}</>
}

const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const GradePage = lazy(() => import('../pages/GradePage'))
const StudentPage = lazy(() => import('../pages/StudentPage'))
const HomeworkPage = lazy(() => import('../pages/HomeworkPage'))
const ExamPage = lazy(() => import('../pages/ExamPage'))
const SchedulePage = lazy(() => import('../pages/SchedulePage'))
const AdminPage = lazy(() => import('../pages/AdminPage'))
const AdminManagePage = lazy(() => import('../pages/AdminManagePage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ErrorPage() {
  const error = useRouteError() as Error
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h2 style={{ color: '#dc2626' }}>오류가 발생했습니다</h2>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: '1rem', borderRadius: '6px', fontSize: '13px' }}>
        {error?.message ?? String(error)}
        {'\n\n'}
        {error?.stack}
      </pre>
      <button
        onClick={() => { localStorage.clear(); window.location.href = '/' }}
        style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
      >
        데이터 초기화 후 재시작
      </button>
    </div>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: 'grades', element: <Lazy><GradePage /></Lazy> },
      { path: 'students', element: <Lazy><StudentPage /></Lazy> },
      { path: 'homework', element: <Lazy><HomeworkPage /></Lazy> },
      { path: 'exam', element: <Lazy><ExamPage /></Lazy> },
      { path: 'schedule', element: <ScheduleGuard><Lazy><SchedulePage /></Lazy></ScheduleGuard> },
      { path: 'admin', element: <Lazy><AdminPage /></Lazy> },
      { path: 'admin/manage', element: <Lazy><AdminManagePage /></Lazy> },
    ],
  },
])
