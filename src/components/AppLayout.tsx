import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, ArrowLeft, MoreHorizontal, Star } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { viewingUid, viewingUserName, setViewingUid } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pageTitle = ({
    '/': '대시보드',
    '/grades': '성적관리',
    '/homework': '숙제관리',
    '/students': '학생관리',
    '/clinic': '보충/클리닉',
    '/todo': '메모',
    '/schedule': '업무 일정표',
    '/student-dashboard': '학생 대시보드',
    '/classes': '반관리',
    '/principal': '원장 대시보드',
    '/admin': '관리자 모드',
    '/admin/manage': '사용자 관리',
    '/admin/messages': '문자 발송',
    '/admin/reports': '성적표 게시',
  } as Record<string, string>)[pathname] ?? 'SEUM'

  const exitViewingMode = () => {
    setViewingUid(null)
    navigate('/admin')
  }

  return (
    <div className="notion-dashboard flex h-screen overflow-hidden bg-white text-[#37352f]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 관리자 뷰잉 배너 */}
        {viewingUid && (
          <div className="flex shrink-0 items-center justify-between border-b border-[#ead9b0] bg-[#fbf3db] px-4 py-2">
            <p className="text-xs font-medium text-[#8a6424]">
              {viewingUserName
                ? `${viewingUserName}님의 대시보드를 보고 있습니다`
                : '다른 사용자의 대시보드를 보고 있습니다'}
            </p>
            <button
              onClick={exitViewingMode}
              className="flex items-center gap-1 text-xs font-medium text-[#8a6424] transition-colors hover:text-[#684b19]"
            >
              <ArrowLeft size={12} />
              관리자 패널로 돌아가기
            </button>
          </div>
        )}

        {/* 데스크톱 노션형 페이지 상단 바 */}
        <header className="notion-page-topbar hidden h-12 shrink-0 items-center border-b border-[#e9e9e7] bg-white px-4 lg:flex">
          <span className="truncate text-[13px] font-semibold text-[#37352f]">{pageTitle}</span>
          <div className="ml-auto flex items-center gap-1 text-[#9b9a97]">
            <span className="mr-2 text-[11px]">SEUM workspace</span>
            <button type="button" aria-label="즐겨찾기" className="rounded-md p-1.5 hover:bg-[#f1f1ef] hover:text-[#37352f]"><Star size={16} /></button>
            <button type="button" aria-label="더 보기" className="rounded-md p-1.5 hover:bg-[#f1f1ef] hover:text-[#37352f]"><MoreHorizontal size={17} /></button>
          </div>
        </header>

        {/* 모바일 상단 바 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[#e9e9e7] bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="사이드 메뉴 열기"
            className="rounded-md p-1 text-[#787774] hover:bg-[#f1f1ef] hover:text-[#37352f]"
          >
            <Menu size={22} />
          </button>
          <span className="text-sm font-semibold text-[#37352f]">SEUM</span>
        </header>

        {/* 메인 콘텐츠 */}
        <main className="notion-main flex-1 overflow-y-auto p-3 sm:p-4 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
