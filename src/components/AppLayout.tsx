import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, ArrowLeft } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { viewingUid, viewingUserName, setViewingUid } = useAuth()
  const navigate = useNavigate()

  const exitViewingMode = () => {
    setViewingUid(null)
    navigate('/admin')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 관리자 뷰잉 배너 */}
        {viewingUid && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between shrink-0">
            <p className="text-xs text-amber-700 font-medium">
              {viewingUserName
                ? `${viewingUserName}님의 대시보드를 보고 있습니다`
                : '다른 사용자의 대시보드를 보고 있습니다'}
            </p>
            <button
              onClick={exitViewingMode}
              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors"
            >
              <ArrowLeft size={12} />
              관리자 패널로 돌아가기
            </button>
          </div>
        )}

        {/* 모바일 상단 바 */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-600 hover:text-slate-900"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-slate-800">NODE</span>
        </header>

        {/* 메인 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
