import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, GraduationCap, X, ClipboardList, School, CalendarDays } from 'lucide-react'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: '대시보드', end: true },
  { to: '/grades', icon: BookOpen, label: '성적관리' },
  { to: '/homework', icon: ClipboardList, label: '숙제관리' },
  { to: '/students', icon: Users, label: '학생관리' },
  { to: '/exam', icon: School, label: '내신관리' },
  { to: '/schedule', icon: CalendarDays, label: '업무 일정표' },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* 모바일 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-60 bg-slate-800 text-white z-30
          flex flex-col
          transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <GraduationCap size={22} className="text-blue-400" />
            <span className="font-bold text-base leading-tight">학원 관리 대시보드</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 py-4 px-3">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">주2회 수업 관리 시스템</p>
        </div>
      </aside>
    </>
  )
}
