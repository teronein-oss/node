import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, GraduationCap, X, ClipboardList, CalendarDays, LogOut, Shield, Stethoscope, TableProperties, BookOpenCheck, BarChart3, CheckSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_ACADEMY_ID } from '../utils/academy'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const LEARNING_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: '대시보드', end: true },
  { to: '/grades', icon: BookOpen, label: '성적관리' },
  { to: '/homework', icon: ClipboardList, label: '숙제관리' },
  { to: '/students', icon: Users, label: '학생관리' },
  { to: '/clinic', icon: Stethoscope, label: '보충/클리닉' },
  { to: '/todo', icon: CheckSquare, label: 'ToDo' },
]

const OPERATION_ITEMS = [
  { to: '/schedule', icon: CalendarDays, label: '업무 일정표' },
  { to: '/student-dashboard', icon: TableProperties, label: '학생 대시보드' },
]

type SidebarItem = {
  to: string
  icon: React.ElementType
  label: string
  end?: boolean
  tone?: 'default' | 'emerald' | 'amber'
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 px-3 py-4">
      <p className="mb-2 px-3 text-xs font-semibold text-slate-400">{title}</p>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function SidebarLink({ item, onClose }: { item: SidebarItem; onClose: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) => {
        const inactive = item.tone === 'amber'
          ? 'text-amber-300 hover:bg-white/10 hover:text-amber-200'
          : item.tone === 'emerald'
            ? 'text-emerald-300 hover:bg-white/10 hover:text-emerald-200'
            : 'text-slate-200 hover:bg-white/10 hover:text-white'
        const active = item.tone === 'amber'
          ? 'bg-amber-400/15 text-amber-300 border-r-4 border-amber-300'
          : item.tone === 'emerald'
            ? 'bg-emerald-400/15 text-emerald-300 border-r-4 border-emerald-300'
            : 'bg-blue-500/20 text-white border-r-4 border-blue-400'
        return `flex items-center gap-3 rounded-l-lg px-4 py-3 text-sm font-semibold transition-colors ${isActive ? active : inactive}`
      }}
    >
      <Icon size={19} className={item.tone === 'amber' ? 'text-yellow-300' : item.tone === 'emerald' ? 'text-emerald-300' : undefined} />
      {item.label}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isAdmin, isAcademyAdmin, adminUid, viewingUid, viewingUserName, viewingUserRole, viewingAcademyId, viewingAcademyName, viewingJogyoTeachers, signOut, jogyoTeachers, switchTeacher, setViewingUid } = useAuth()
  const navigate = useNavigate()
  // 다른 사용자 대시보드 조회 중이면 그 사용자의 역할 기준으로 메뉴 필터
  const effectiveRole = viewingUid ? (viewingUserRole ?? '') : (user?.role ?? '')
  const effectiveAcademyId = viewingUid ? viewingAcademyId : user?.academyId
  const isJogyo = effectiveRole === '조교'
  const isPrincipal = effectiveRole === '원장' || effectiveRole === '관리자'
  const filterItem = (item: { to: string }) => {
    if (isJogyo && item.to === '/schedule') return false
    if (item.to === '/student-dashboard' && effectiveAcademyId !== DEFAULT_ACADEMY_ID) return false
    return true
  }
  const visibleLearningItems = LEARNING_ITEMS.filter(filterItem)
  const visibleOperationItems = OPERATION_ITEMS.filter(filterItem)

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
          fixed top-0 left-0 h-full w-60 bg-[#10243d] text-white z-30
          flex flex-col
          transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-6 border-b border-white/10 bg-[#112844]">
          <div className="flex items-center gap-2">
            <GraduationCap size={25} className="text-white" />
            <span className="font-bold text-xl leading-tight tracking-wide">NODE</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 overflow-y-auto">
          <SidebarSection title="학습 관리">
            {visibleLearningItems.map(item => <SidebarLink key={item.to} item={item} onClose={onClose} />)}
          </SidebarSection>

          <SidebarSection title="운영">
            {visibleOperationItems.map(item => <SidebarLink key={item.to} item={item} onClose={onClose} />)}
            {isPrincipal && !viewingUid && (
              <SidebarLink item={{ to: '/principal', icon: BarChart3, label: '원장 대시보드', tone: 'emerald' }} onClose={onClose} />
            )}
          </SidebarSection>

          {(isAdmin || isAcademyAdmin) && (
            <SidebarSection title="관리자">
              <SidebarLink item={{ to: '/admin', icon: Shield, label: '관리자 모드', tone: 'amber' }} onClose={onClose} />
            </SidebarSection>
          )}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <SidebarLink item={{ to: '/classes', icon: BookOpenCheck, label: '반관리' }} onClose={onClose} />
        </div>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="px-4 py-4 border-t border-white/10 space-y-3 bg-[#0f2239]">
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
                    setViewingUid(e.target.value, viewingUserName ?? undefined, '조교', viewingJogyoTeachers, viewingAcademyId ?? undefined, viewingAcademyName ?? undefined)
                  } else {
                    switchTeacher(e.target.value)
                  }
                  navigate('/')
                  onClose()
                }}
                className="w-full bg-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 border border-white/10 cursor-pointer"
              >
                {switcherTeachers.map(t => (
                  <option key={t.uid} value={t.uid}>{t.displayName}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors text-sm"
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  )
}
