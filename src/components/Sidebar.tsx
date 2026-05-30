import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, GraduationCap, X, ClipboardList, School, CalendarDays, LogOut, Shield, Stethoscope } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

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
  { to: '/clinic', icon: Stethoscope, label: '보충/클리닉' },
  { to: '/schedule', icon: CalendarDays, label: '업무 일정표' },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isAdmin, adminUid, viewingUid, viewingUserName, viewingUserRole, viewingJogyoTeachers, signOut, jogyoTeachers, switchTeacher, setViewingUid } = useAuth()
  const navigate = useNavigate()
  // 다른 사용자 대시보드 조회 중이면 그 사용자의 역할 기준으로 메뉴 필터
  const effectiveRole = viewingUid ? (viewingUserRole ?? '') : (user?.role ?? '')
  const isJogyo = effectiveRole === '조교'
  const visibleNavItems = NAV_ITEMS.filter(item => !(isJogyo && item.to === '/schedule'))

  // 실제 조교 본인: 담당 선생님 2명 이상
  const isOwnJogyoSwitch = !viewingUid && user?.role === '조교' && jogyoTeachers.length > 1
  // 관리자가 조교 뷰로 진입한 경우: 해당 조교가 2개 이상 선생님 배정
  const isAdminJogyoSwitch = !!viewingUid && viewingUserRole === '조교' && viewingJogyoTeachers.length > 1
  const showTeacherSwitcher = isOwnJogyoSwitch || isAdminJogyoSwitch

  const switcherTeachers = isAdminJogyoSwitch ? viewingJogyoTeachers : jogyoTeachers
  const switcherCurrentUid = isAdminJogyoSwitch ? viewingUid : adminUid

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
            <span className="font-bold text-base leading-tight">NODE</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {visibleNavItems.map(({ to, icon: Icon, label, end }) => (
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

          {/* 관리자 모드 */}
          {isAdmin && (
            <>
              <div className="my-3 border-t border-slate-700" />
              <NavLink
                to="/admin"
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-300 hover:bg-slate-700 hover:text-amber-200'
                  }`
                }
              >
                <Shield size={18} />
                관리자 모드
              </NavLink>
            </>
          )}
        </nav>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="px-4 py-4 border-t border-slate-700 space-y-3">
          {user && (
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {user.displayName[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          )}

          {/* 조교 담당 선생님 전환 드롭다운 */}
          {showTeacherSwitcher && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1 px-1">담당 선생님</p>
              <select
                value={switcherCurrentUid ?? ''}
                onChange={(e) => {
                  if (isAdminJogyoSwitch) {
                    setViewingUid(e.target.value, viewingUserName ?? undefined, '조교', viewingJogyoTeachers)
                  } else {
                    switchTeacher(e.target.value)
                  }
                  navigate('/')
                  onClose()
                }}
                className="w-full bg-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600 cursor-pointer"
              >
                {switcherTeachers.map(t => (
                  <option key={t.uid} value={t.uid}>{t.displayName}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-sm"
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  )
}
