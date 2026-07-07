import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  type User,
} from 'firebase/auth'
import {
  onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, getDoc, deleteField, query, where,
} from 'firebase/firestore'
import { auth } from '../firebase'
import { displayName } from '../utils/displayName'
import { DEFAULT_ACADEMY_ID, DEFAULT_ACADEMY_NAME, createInviteCode, normalizeAcademyId, normalizeAcademyName } from '../utils/academy'
import { academyDoc, configDoc, registrationDoc, registrationsCollection, userDoc } from '../utils/firestorePaths'

export const ADMIN_EMAIL = 'teronein@gmail.com'

export interface RegistrationInfo {
  uid: string
  email: string
  displayName: string
  role: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  academyId?: string
  academyName?: string
  assignedTeacherUid?: string | null
  assignedTeacherUids?: string[]
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: string
  academyId: string
  academyName: string
}

export interface AcademyRegistrationInput {
  mode: 'join' | 'create'
  academyName?: string
  inviteCode?: string
}

export type RegistrationStatus = 'loading' | 'none' | 'pending' | 'approved' | 'rejected'

interface AuthContextValue {
  firebaseUser: User | null
  user: UserProfile | null
  registrationStatus: RegistrationStatus
  isAdmin: boolean
  isAcademyAdmin: boolean
  adminUid: string | null
  viewingUid: string | null
  viewingUserName: string | null
  viewingUserRole: string | null
  viewingAcademyId: string | null
  viewingAcademyName: string | null
  viewingJogyoTeachers: Array<{ uid: string; displayName: string }>
  setViewingUid: (uid: string | null, name?: string, role?: string, jogyoTeachers?: Array<{ uid: string; displayName: string }>, academyId?: string, academyName?: string) => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  approvedTeachers: Array<{ uid: string; displayName: string }>
  jogyoTeacherUids: string[]
  jogyoTeachers: Array<{ uid: string; displayName: string }>
  switchTeacher: (uid: string) => void
  submitRegistration: (name: string, role: string, assignedTeacherUid?: string | null, academy?: AcademyRegistrationInput) => Promise<void>
  // Admin
  approveUser: (uid: string) => Promise<void>
  rejectUser: (uid: string) => Promise<void>
  deleteRegistration: (uid: string) => Promise<void>
  assignTeacher: (jogyoUid: string, teacherUid: string | null) => Promise<void>
  addTeacherToJogyo: (jogyoUid: string, teacherUid: string) => Promise<void>
  removeTeacherFromJogyo: (jogyoUid: string, teacherUid: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ROLES = ['관리자', '선생님', '조교', '학생', '학부모'] as const

export { ROLES }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>('loading')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isAcademyAdmin, setIsAcademyAdmin] = useState(false)
  const [adminUid, setAdminUid] = useState<string | null>(null)
  const [viewingUid, setViewingUidState] = useState<string | null>(null)
  const [viewingUserName, setViewingUserName] = useState<string | null>(null)
  const [viewingUserRole, setViewingUserRole] = useState<string | null>(null)
  const [viewingAcademyId, setViewingAcademyId] = useState<string | null>(null)
  const [viewingAcademyName, setViewingAcademyName] = useState<string | null>(null)
  const [approvedTeachers, setApprovedTeachers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [jogyoTeacherUids, setJogyoTeacherUids] = useState<string[]>([])
  const [viewingJogyoTeachers, setViewingJogyoTeachers] = useState<Array<{ uid: string; displayName: string }>>([])

  // 조교 담당 선생님 목록: 조교도 읽을 수 있는 approvedTeachers 맵에서 파생.
  // 배정된 uid 순서를 유지하고, 맵에 이름이 아직 없으면 해당 항목은 건너뛴다.
  const jogyoTeachers = jogyoTeacherUids
    .map(uid => {
      const found = approvedTeachers.find(t => t.uid === uid)
      return found ? { uid, displayName: found.displayName } : null
    })
    .filter((t): t is { uid: string; displayName: string } => t !== null)


  const switchTeacher = (uid: string) => setAdminUid(uid)

  const setViewingUid = (uid: string | null, name?: string, role?: string, jogyoTeacherList?: Array<{ uid: string; displayName: string }>, academyId?: string, academyName?: string) => {
    setViewingUidState(uid)
    setViewingUserName(uid ? (displayName(name) || null) : null)
    setViewingUserRole(uid ? (role ?? null) : null)
    setViewingAcademyId(uid && academyId ? normalizeAcademyId(academyId) : null)
    setViewingAcademyName(uid && academyName ? normalizeAcademyName(academyName) : null)
    setViewingJogyoTeachers(uid && role === '조교'
      ? (jogyoTeacherList ?? []).map(t => ({ ...t, displayName: displayName(t.displayName) }))
      : [])
  }
  const regUnsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const authUnsub = onAuthStateChanged(auth, (fbUser) => {
      // Clean up previous registration listener
      if (regUnsubRef.current) {
        regUnsubRef.current()
        regUnsubRef.current = null
      }

      if (!fbUser) {
        setFirebaseUser(null)
        setUser(null)
        setIsAdmin(false)
        setIsAcademyAdmin(false)
        setAdminUid(null)
        setViewingUidState(null)
        setViewingUserName(null)
        setViewingUserRole(null)
        setViewingAcademyId(null)
        setViewingAcademyName(null)
        setJogyoTeacherUids([])
        setRegistrationStatus('none')
        return
      }

      setFirebaseUser(fbUser)
      setRegistrationStatus('loading')
      const adminUser = fbUser.email === ADMIN_EMAIL
      setIsAdmin(adminUser)

      if (adminUser) {
        const adminDisplayName = displayName(fbUser.displayName) || '고승환'
        setUser({
          uid: fbUser.uid,
          email: fbUser.email ?? '',
          displayName: adminDisplayName,
          role: '관리자',
          academyId: DEFAULT_ACADEMY_ID,
          academyName: DEFAULT_ACADEMY_NAME,
        })
        setIsAcademyAdmin(true)
        setAdminUid(fbUser.uid)
        setRegistrationStatus('approved')
        // 조교가 admin UID를 읽을 수 있도록 config에 기록
        setDoc(configDoc(DEFAULT_ACADEMY_ID), { adminUid: fbUser.uid }, { merge: true })
        // 관리자 계정을 registrations에 항상 최신 이름으로 동기화
        const adminRef = registrationDoc(fbUser.uid, DEFAULT_ACADEMY_ID)
        getDocs(registrationsCollection(DEFAULT_ACADEMY_ID)).then(snap => {
          const existing = snap.docs.find(d => d.id === fbUser.uid)
          setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email ?? '',
            displayName: adminDisplayName,
            role: '관리자',
            status: 'approved',
            academyId: DEFAULT_ACADEMY_ID,
            academyName: DEFAULT_ACADEMY_NAME,
            createdAt: (existing?.data() as RegistrationInfo | undefined)?.createdAt ?? new Date().toISOString(),
          }, { merge: true })
          // 승인된 선생님 + 관리자를 approvedTeachers에 동기화 (조교 전환 드롭다운에서 관리자도 표시되도록)
          const teacherMap: Record<string, string> = {
            [fbUser.uid]: adminDisplayName,
          }
          snap.docs.forEach(d => {
            const reg = d.data() as RegistrationInfo
            if (reg.role === '선생님' && reg.status === 'approved') {
              teacherMap[reg.uid] = displayName(reg.displayName)
            }
          })
          setDoc(configDoc(DEFAULT_ACADEMY_ID), { approvedTeachers: teacherMap }, { merge: true })
        })
        return
      }

      // Real-time listener on this user's registration
      const regRef = registrationDoc(fbUser.uid, DEFAULT_ACADEMY_ID)
      let firstFire = true
      const regUnsub = onSnapshot(regRef, (snap) => {
        if (!snap.exists()) {
          setRegistrationStatus('none')
          setUser(null)
        } else {
          const data = snap.data() as RegistrationInfo
          const academyId = normalizeAcademyId(data.academyId)
          const academyName = normalizeAcademyName(data.academyName)
          if (data.status === 'approved') {
            setUser({
              uid: fbUser.uid,
              email: fbUser.email ?? '',
              displayName: displayName(data.displayName),
              role: data.role,
              academyId,
              academyName,
            })
            setIsAcademyAdmin(data.role === '관리자')
            setRegistrationStatus('approved')
            if (data.role === '조교') {
              const uids = data.assignedTeacherUids ?? (data.assignedTeacherUid ? [data.assignedTeacherUid] : [])
              setJogyoTeacherUids(uids)
              setAdminUid(prev => (prev && uids.includes(prev)) ? prev : (uids[0] ?? null))
              // 선생님 이름은 조교도 읽을 수 있는 config/sharedData의 approvedTeachers 맵에서
              // 파생 계산한다 (registrations 직접 조회는 보안 규칙상 조교에게 거부됨)
            }
          } else if (data.status === 'rejected') {
            setUser(null)
            setIsAcademyAdmin(false)
            setRegistrationStatus('rejected')
          } else {
            setUser(null)
            setIsAcademyAdmin(false)
            setRegistrationStatus('pending')
          }
        }
        if (firstFire) {
          firstFire = false
        }
      }, () => {
        setRegistrationStatus('none')
      })
      regUnsubRef.current = regUnsub
    })

    return () => {
      authUnsub()
      if (regUnsubRef.current) regUnsubRef.current()
    }
  }, [])

  useEffect(() => {
    if (!firebaseUser) {
      setApprovedTeachers([])
      return
    }
    const academyId = user?.academyId ?? DEFAULT_ACADEMY_ID
    const unsub = onSnapshot(configDoc(academyId), (snap) => {
      if (snap.exists()) {
        const teachersMap = (snap.data().approvedTeachers ?? {}) as Record<string, string>
        setApprovedTeachers(
          Object.entries(teachersMap).map(([uid, name]) => ({ uid, displayName: displayName(name) }))
        )
      } else {
        setApprovedTeachers([])
      }
    })
    return unsub
  }, [firebaseUser, user?.academyId])

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    await setPersistence(auth, browserSessionPersistence)
    await signInWithPopup(auth, provider)
  }

  const signOut = async () => {
    setViewingUid(null)
    await firebaseSignOut(auth)
  }

  const submitRegistration = async (name: string, role: string, assignedTeacherUid?: string | null, academy?: AcademyRegistrationInput) => {
    if (!firebaseUser) return
    let academyId = DEFAULT_ACADEMY_ID
    let academyName = DEFAULT_ACADEMY_NAME
    if (academy?.mode === 'create') {
      academyName = academy.academyName?.trim() || DEFAULT_ACADEMY_NAME
      academyId = createInviteCode(academyName)
      await setDoc(academyDoc(academyId), {
        id: academyId,
        name: academyName,
        inviteCode: academyId,
        ownerUid: firebaseUser.uid,
        createdAt: new Date().toISOString(),
      }, { merge: true })
    } else if (academy?.mode === 'join' && academy.inviteCode?.trim()) {
      academyId = academy.inviteCode.trim().toUpperCase()
      const academySnap = await getDoc(academyDoc(academyId))
      if (!academySnap.exists()) throw new Error('academy-not-found')
      const academyData = academySnap.data() as { name?: string }
      academyName = academyData.name ?? academyId
    }
    const regRef = registrationDoc(firebaseUser.uid, DEFAULT_ACADEMY_ID)
    const regData: RegistrationInfo = {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: name.trim(),
      role,
      status: 'pending',
      academyId,
      academyName,
      createdAt: new Date().toISOString(),
    }
    if (assignedTeacherUid) regData.assignedTeacherUid = assignedTeacherUid
    await setDoc(regRef, regData)
    setRegistrationStatus('pending')
  }

  const approveUser = async (uid: string) => {
    const regRef = registrationDoc(uid, DEFAULT_ACADEMY_ID)
    await updateDoc(regRef, { status: 'approved' })
    const regSnap = await getDoc(regRef)
    const reg = regSnap.exists() ? regSnap.data() as RegistrationInfo : null
    if (reg) {
      await setDoc(userDoc(uid, reg.academyId), {
        uid: reg.uid,
        email: reg.email,
        displayName: reg.displayName,
        role: reg.role,
        academyId: normalizeAcademyId(reg.academyId),
        academyName: normalizeAcademyName(reg.academyName),
        approvedAt: new Date().toISOString(),
      }, { merge: true })
      if (reg.role === '선생님' || reg.role === '관리자') {
        await setDoc(configDoc(reg.academyId), {
          approvedTeachers: { [uid]: reg.displayName }
        }, { merge: true })
      }
    }
  }

  const rejectUser = async (uid: string) => {
    await updateDoc(registrationDoc(uid, DEFAULT_ACADEMY_ID), { status: 'rejected' })
  }

  const deleteRegistration = async (uid: string) => {
    const regRef = registrationDoc(uid, DEFAULT_ACADEMY_ID)
    const regSnap = await getDoc(regRef)
    const reg = regSnap.exists() ? regSnap.data() as RegistrationInfo : null
    await deleteDoc(regRef)
    if (reg?.role === '선생님' || reg?.role === '관리자') {
      await updateDoc(configDoc(reg.academyId), {
        [`approvedTeachers.${uid}`]: deleteField()
      })
    }
  }

  const assignTeacher = async (jogyoUid: string, teacherUid: string | null) => {
    await updateDoc(registrationDoc(jogyoUid, DEFAULT_ACADEMY_ID), { assignedTeacherUid: teacherUid })
  }

  const addTeacherToJogyo = async (jogyoUid: string, teacherUid: string) => {
    const snap = await getDoc(registrationDoc(jogyoUid, DEFAULT_ACADEMY_ID))
    if (!snap.exists()) return
    const data = snap.data() as RegistrationInfo
    const existing = data.assignedTeacherUids ?? (data.assignedTeacherUid ? [data.assignedTeacherUid] : [])
    const next = [...new Set([...existing, teacherUid])]
    await updateDoc(registrationDoc(jogyoUid, DEFAULT_ACADEMY_ID), { assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null })
  }

  const removeTeacherFromJogyo = async (jogyoUid: string, teacherUid: string) => {
    const snap = await getDoc(registrationDoc(jogyoUid, DEFAULT_ACADEMY_ID))
    if (!snap.exists()) return
    const data = snap.data() as RegistrationInfo
    const existing = data.assignedTeacherUids ?? (data.assignedTeacherUid ? [data.assignedTeacherUid] : [])
    const next = existing.filter(u => u !== teacherUid)
    await updateDoc(registrationDoc(jogyoUid, DEFAULT_ACADEMY_ID), { assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null })
  }

  return (
    <AuthContext.Provider value={{
      firebaseUser, user, registrationStatus, isAdmin, isAcademyAdmin, adminUid, viewingUid, viewingUserName, viewingUserRole, viewingAcademyId, viewingAcademyName, viewingJogyoTeachers, setViewingUid,
      approvedTeachers, jogyoTeacherUids, jogyoTeachers, switchTeacher,
      signInWithGoogle, signOut, submitRegistration,
      approveUser, rejectUser, deleteRegistration, assignTeacher, addTeacherToJogyo, removeTeacherFromJogyo,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// Helper to fetch all registrations (admin only)
export async function fetchAllRegistrations(academyId?: string, includeAll = false): Promise<RegistrationInfo[]> {
  const base = registrationsCollection(DEFAULT_ACADEMY_ID)
  const snap = await getDocs(includeAll || !academyId
    ? base
    : query(base, where('academyId', '==', academyId)))
  return snap.docs
    .map(d => {
      const data = d.data() as RegistrationInfo
      return { ...data, displayName: displayName(data.displayName) }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
