import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, X, ClipboardList, CalendarDays, LogOut, Shield, Stethoscope, TableProperties, BookOpenCheck, BarChart3, StickyNote, MessageSquareText, FileKey2, Search, ChevronsUpDown, Settings2 } from 'lucide-react'
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
  { to: '/todo', icon: StickyNote, label: '메모' },
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
    <section className="px-2 pb-3 pt-2">
      <p className="mb-1 px-2 text-[11px] font-semibold text-[#9b9a97]">{title}</p>
      <div className="space-y-0.5">{children}</div>
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
          ? 'text-[#9a6a22] hover:bg-[#f2ead8] hover:text-[#795119]'
          : item.tone === 'emerald'
            ? 'text-[#3f7b63] hover:bg-[#eaf3ee] hover:text-[#2f654f]'
            : 'text-[#5f5e5b] hover:bg-[#efefed] hover:text-[#37352f]'
        const active = item.tone === 'amber'
          ? 'bg-[#f3ead5] text-[#8a5d1c]'
          : item.tone === 'emerald'
            ? 'bg-[#e6f0ea] text-[#356d56]'
            : 'bg-[#e9e9e7] text-[#2f2f2f]'
        return `group flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${isActive ? active : inactive}`
      }}
    >
      <Icon size={16} strokeWidth={1.9} className="shrink-0 opacity-90" />
      <span className="truncate">{item.label}</span>
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
          notion-sidebar fixed left-0 top-0 z-30 h-full w-64 text-[#37352f]
          flex flex-col
          transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* 헤더 */}
        <div className="flex h-12 items-center gap-2 px-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[#efefed]">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#dededb] bg-white text-xs font-semibold text-[#565550]">S</div>
            <span className="truncate text-[13px] font-semibold text-[#37352f]">{viewingAcademyName ?? user?.academyName ?? 'SEUM Academy'}</span>
            <ChevronsUpDown size={13} className="ml-auto shrink-0 text-[#a4a39f]" />
          </div>
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="rounded-md p-1.5 text-[#9b9a97] hover:bg-[#efefed] hover:text-[#37352f] lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 px-3 pb-3">
          <NavLink to="/" onClick={onClose} aria-label="홈" className="flex h-8 items-center justify-center rounded-md text-[#787774] hover:bg-[#efefed] hover:text-[#37352f]"><LayoutDashboard size={17} /></NavLink>
          <NavLink to="/students" onClick={onClose} aria-label="학생 검색" className="flex h-8 items-center justify-center rounded-md text-[#787774] hover:bg-[#efefed] hover:text-[#37352f]"><Search size={17} /></NavLink>
          <NavLink to="/todo" onClick={onClose} aria-label="메모" className="flex h-8 items-center justify-center rounded-md text-[#787774] hover:bg-[#efefed] hover:text-[#37352f]"><StickyNote size={17} /></NavLink>
          <NavLink to="/classes" onClick={onClose} aria-label="반 설정" className="flex h-8 items-center justify-center rounded-md text-[#787774] hover:bg-[#efefed] hover:text-[#37352f]"><Settings2 size={17} /></NavLink>
        </div>

        {/* 메뉴 */}
        <nav className="notion-sidebar-scroll flex-1 overflow-y-auto px-1">
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
              <SidebarLink item={{ to: '/admin/messages', icon: MessageSquareText, label: '문자 발송', tone: 'amber' }} onClose={onClose} />
              <SidebarLink item={{ to: '/admin/reports', icon: FileKey2, label: '성적표 게시', tone: 'amber' }} onClose={onClose} />
            </SidebarSection>
          )}
        </nav>

        <div className="border-t border-[#e3e3e0] px-2 py-2">
          <SidebarLink item={{ to: '/classes', icon: BookOpenCheck, label: '반관리' }} onClose={onClose} />
        </div>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="space-y-2 border-t border-[#e3e3e0] px-3 py-3">
          {user && (
            <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#e9e9e7] text-xs font-semibold text-[#565550]">
                {user.displayName[0]}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[#37352f]">{user.displayName}</p>
                <p className="truncate text-[11px] text-[#9b9a97]">{user.role}</p>
              </div>
            </div>
          )}

          {/* 조교 담당 선생님 전환 드롭다운 */}
          {showTeacherSwitcher && (
            <div>
              <p className="mb-1 px-1 text-[11px] text-[#9b9a97]">담당 선생님</p>
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
                className="w-full cursor-pointer rounded-md border border-[#dededb] bg-white px-2.5 py-2 text-xs text-[#37352f] outline-none focus:border-[#b8b8b3]"
              >
                {switcherTeachers.map(t => (
                  <option key={t.uid} value={t.uid}>{t.displayName}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[#787774] transition-colors hover:bg-[#efefed] hover:text-[#37352f]"
          >
            <LogOut size={15} />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  )
}
