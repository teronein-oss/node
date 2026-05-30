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
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, getDoc, deleteField,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

export const ADMIN_EMAIL = 'teronein@gmail.com'

export interface RegistrationInfo {
  uid: string
  email: string
  displayName: string
  role: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  assignedTeacherUid?: string | null
  assignedTeacherUids?: string[]
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: string
}

export type RegistrationStatus = 'loading' | 'none' | 'pending' | 'approved' | 'rejected'

interface AuthContextValue {
  firebaseUser: User | null
  user: UserProfile | null
  registrationStatus: RegistrationStatus
  isAdmin: boolean
  adminUid: string | null
  viewingUid: string | null
  viewingUserName: string | null
  viewingUserRole: string | null
  viewingJogyoTeachers: Array<{ uid: string; displayName: string }>
  setViewingUid: (uid: string | null, name?: string, role?: string, jogyoTeachers?: Array<{ uid: string; displayName: string }>) => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  approvedTeachers: Array<{ uid: string; displayName: string }>
  jogyoTeacherUids: string[]
  jogyoTeachers: Array<{ uid: string; displayName: string }>
  switchTeacher: (uid: string) => void
  submitRegistration: (name: string, role: string, assignedTeacherUid?: string | null) => Promise<void>
  // Admin
  approveUser: (uid: string) => Promise<void>
  rejectUser: (uid: string) => Promise<void>
  deleteRegistration: (uid: string) => Promise<void>
  assignTeacher: (jogyoUid: string, teacherUid: string | null) => Promise<void>
  addTeacherToJogyo: (jogyoUid: string, teacherUid: string) => Promise<void>
  removeTeacherFromJogyo: (jogyoUid: string, teacherUid: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ROLES = ['선생님', '조교', '학생', '학부모'] as const

export { ROLES }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>('loading')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminUid, setAdminUid] = useState<string | null>(null)
  const [viewingUid, setViewingUidState] = useState<string | null>(null)
  const [viewingUserName, setViewingUserName] = useState<string | null>(null)
  const [viewingUserRole, setViewingUserRole] = useState<string | null>(null)
  const [approvedTeachers, setApprovedTeachers] = useState<Array<{ uid: string; displayName: string }>>([])
  const [jogyoTeacherUids, setJogyoTeacherUids] = useState<string[]>([])
  const [viewingJogyoTeachers, setViewingJogyoTeachers] = useState<Array<{ uid: string; displayName: string }>>([])

  const jogyoTeachers = approvedTeachers.filter(t => jogyoTeacherUids.includes(t.uid))

  const switchTeacher = (uid: string) => setAdminUid(uid)

  const setViewingUid = (uid: string | null, name?: string, role?: string, jogyoTeacherList?: Array<{ uid: string; displayName: string }>) => {
    setViewingUidState(uid)
    setViewingUserName(uid ? (name ?? null) : null)
    setViewingUserRole(uid ? (role ?? null) : null)
    setViewingJogyoTeachers(uid && role === '조교' ? (jogyoTeacherList ?? []) : [])
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
        setAdminUid(null)
        setViewingUidState(null)
        setViewingUserName(null)
        setViewingUserRole(null)
        setRegistrationStatus('none')
        return
      }

      setFirebaseUser(fbUser)
      setRegistrationStatus('loading')
      const adminUser = fbUser.email === ADMIN_EMAIL
      setIsAdmin(adminUser)

      if (adminUser) {
        const adminDisplayName = fbUser.displayName ?? '고승환'
        setUser({ uid: fbUser.uid, email: fbUser.email ?? '', displayName: adminDisplayName, role: '관리자' })
        setAdminUid(fbUser.uid)
        setRegistrationStatus('approved')
        // 조교가 admin UID를 읽을 수 있도록 config에 기록
        setDoc(doc(db, 'config', 'sharedData'), { adminUid: fbUser.uid }, { merge: true })
        // 관리자 계정을 registrations에 항상 최신 이름으로 동기화
        const adminRef = doc(db, 'registrations', fbUser.uid)
        getDocs(collection(db, 'registrations')).then(snap => {
          const existing = snap.docs.find(d => d.id === fbUser.uid)
          setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email ?? '',
            displayName: adminDisplayName,
            role: '관리자',
            status: 'approved',
            createdAt: (existing?.data() as RegistrationInfo | undefined)?.createdAt ?? new Date().toISOString(),
          }, { merge: true })
          // 승인된 선생님 + 관리자를 approvedTeachers에 동기화 (조교 전환 드롭다운에서 관리자도 표시되도록)
          const teacherMap: Record<string, string> = {
            [fbUser.uid]: adminDisplayName,
          }
          snap.docs.forEach(d => {
            const reg = d.data() as RegistrationInfo
            if (reg.role === '선생님' && reg.status === 'approved') {
              teacherMap[reg.uid] = reg.displayName
            }
          })
          setDoc(doc(db, 'config', 'sharedData'), { approvedTeachers: teacherMap }, { merge: true })
        })
        return
      }

      // Real-time listener on this user's registration
      const regRef = doc(db, 'registrations', fbUser.uid)
      let firstFire = true
      const regUnsub = onSnapshot(regRef, (snap) => {
        if (!snap.exists()) {
          setRegistrationStatus('none')
          setUser(null)
        } else {
          const data = snap.data() as RegistrationInfo
          if (data.status === 'approved') {
            setUser({ uid: fbUser.uid, email: fbUser.email ?? '', displayName: data.displayName, role: data.role })
            setRegistrationStatus('approved')
            if (data.role === '조교') {
              const uids = data.assignedTeacherUids ?? (data.assignedTeacherUid ? [data.assignedTeacherUid] : [])
              setJogyoTeacherUids(uids)
              setAdminUid(prev => (prev && uids.includes(prev)) ? prev : (uids[0] ?? null))
            }
          } else if (data.status === 'rejected') {
            setUser(null)
            setRegistrationStatus('rejected')
          } else {
            setUser(null)
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
    const unsub = onSnapshot(doc(db, 'config', 'sharedData'), (snap) => {
      if (snap.exists()) {
        const teachersMap = (snap.data().approvedTeachers ?? {}) as Record<string, string>
        setApprovedTeachers(
          Object.entries(teachersMap).map(([uid, displayName]) => ({ uid, displayName }))
        )
      } else {
        setApprovedTeachers([])
      }
    })
    return unsub
  }, [firebaseUser])

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

  const submitRegistration = async (name: string, role: string, assignedTeacherUid?: string | null) => {
    if (!firebaseUser) return
    const regRef = doc(db, 'registrations', firebaseUser.uid)
    const regData: RegistrationInfo = {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: name.trim(),
      role,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    if (assignedTeacherUid) regData.assignedTeacherUid = assignedTeacherUid
    await setDoc(regRef, regData)
    setRegistrationStatus('pending')
  }

  const approveUser = async (uid: string) => {
    const regRef = doc(db, 'registrations', uid)
    await updateDoc(regRef, { status: 'approved' })
    const regSnap = await getDoc(regRef)
    const reg = regSnap.exists() ? regSnap.data() as RegistrationInfo : null
    if (reg) {
      await setDoc(doc(db, 'users', uid), {
        uid: reg.uid,
        email: reg.email,
        displayName: reg.displayName,
        role: reg.role,
        approvedAt: new Date().toISOString(),
      }, { merge: true })
      if (reg.role === '선생님') {
        await setDoc(doc(db, 'config', 'sharedData'), {
          approvedTeachers: { [uid]: reg.displayName }
        }, { merge: true })
      }
    }
  }

  const rejectUser = async (uid: string) => {
    await updateDoc(doc(db, 'registrations', uid), { status: 'rejected' })
  }

  const deleteRegistration = async (uid: string) => {
    const regRef = doc(db, 'registrations', uid)
    const regSnap = await getDoc(regRef)
    const reg = regSnap.exists() ? regSnap.data() as RegistrationInfo : null
    await deleteDoc(regRef)
    if (reg?.role === '선생님') {
      await updateDoc(doc(db, 'config', 'sharedData'), {
        [`approvedTeachers.${uid}`]: deleteField()
      })
    }
  }

  const assignTeacher = async (jogyoUid: string, teacherUid: string | null) => {
    await updateDoc(doc(db, 'registrations', jogyoUid), { assignedTeacherUid: teacherUid })
  }

  const addTeacherToJogyo = async (jogyoUid: string, teacherUid: string) => {
    const snap = await getDoc(doc(db, 'registrations', jogyoUid))
    if (!snap.exists()) return
    const data = snap.data() as RegistrationInfo
    const existing = data.assignedTeacherUids ?? (data.assignedTeacherUid ? [data.assignedTeacherUid] : [])
    const next = [...new Set([...existing, teacherUid])]
    await updateDoc(doc(db, 'registrations', jogyoUid), { assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null })
  }

  const removeTeacherFromJogyo = async (jogyoUid: string, teacherUid: string) => {
    const snap = await getDoc(doc(db, 'registrations', jogyoUid))
    if (!snap.exists()) return
    const data = snap.data() as RegistrationInfo
    const existing = data.assignedTeacherUids ?? (data.assignedTeacherUid ? [data.assignedTeacherUid] : [])
    const next = existing.filter(u => u !== teacherUid)
    await updateDoc(doc(db, 'registrations', jogyoUid), { assignedTeacherUids: next, assignedTeacherUid: next[0] ?? null })
  }

  return (
    <AuthContext.Provider value={{
      firebaseUser, user, registrationStatus, isAdmin, adminUid, viewingUid, viewingUserName, viewingUserRole, viewingJogyoTeachers, setViewingUid,
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
export async function fetchAllRegistrations(): Promise<RegistrationInfo[]> {
  const snap = await getDocs(collection(db, 'registrations'))
  return snap.docs.map(d => d.data() as RegistrationInfo).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
