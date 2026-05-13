import { RouterProvider } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { router } from './router'

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

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
