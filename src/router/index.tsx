import { createBrowserRouter, useRouteError } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import DashboardPage from '../pages/DashboardPage'
import GradePage from '../pages/GradePage'
import StudentPage from '../pages/StudentPage'
import HomeworkPage from '../pages/HomeworkPage'
import ExamPage from '../pages/ExamPage'
import SchedulePage from '../pages/SchedulePage'
import AdminPage from '../pages/AdminPage'

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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'grades', element: <GradePage /> },
      { path: 'students', element: <StudentPage /> },
      { path: 'homework', element: <HomeworkPage /> },
      { path: 'exam', element: <ExamPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'admin', element: <AdminPage /> },
    ],
  },
])
