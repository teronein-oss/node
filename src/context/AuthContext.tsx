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
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs,
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
  setViewingUid: (uid: string | null, name?: string) => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  submitRegistration: (name: string, role: string) => Promise<void>
  // Admin
  approveUser: (uid: string) => Promise<void>
  rejectUser: (uid: string) => Promise<void>
  deleteRegistration: (uid: string) => Promise<void>
  assignTeacher: (jogyoUid: string, teacherUid: string | null) => Promise<void>
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

  const setViewingUid = (uid: string | null, name?: string) => {
    setViewingUidState(uid)
    setViewingUserName(uid ? (name ?? null) : null)
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
        setRegistrationStatus('none')
        return
      }

      setFirebaseUser(fbUser)
      setRegistrationStatus('loading')
      const adminUser = fbUser.email === ADMIN_EMAIL
      setIsAdmin(adminUser)

      if (adminUser) {
        setUser({ uid: fbUser.uid, email: fbUser.email ?? '', displayName: fbUser.displayName ?? '관리자', role: '관리자' })
        setAdminUid(fbUser.uid)
        setRegistrationStatus('approved')
        // 조교가 admin UID를 읽을 수 있도록 config에 기록
        setDoc(doc(db, 'config', 'sharedData'), { adminUid: fbUser.uid }, { merge: true })
        // 관리자 계정을 registrations에 자동 등록 (없을 경우에만)
        const adminRef = doc(db, 'registrations', fbUser.uid)
        getDocs(collection(db, 'registrations')).then(snap => {
          if (!snap.docs.find(d => d.id === fbUser.uid)) {
            setDoc(adminRef, {
              uid: fbUser.uid,
              email: fbUser.email ?? '',
              displayName: fbUser.displayName ?? '관리자',
              role: '관리자',
              status: 'approved',
              createdAt: new Date().toISOString(),
            } satisfies RegistrationInfo)
          }
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
              setAdminUid(data.assignedTeacherUid ?? null)
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

  const submitRegistration = async (name: string, role: string) => {
    if (!firebaseUser) return
    const regRef = doc(db, 'registrations', firebaseUser.uid)
    await setDoc(regRef, {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: name.trim(),
      role,
      status: 'pending',
      createdAt: new Date().toISOString(),
    } satisfies RegistrationInfo)
    setRegistrationStatus('pending')
  }

  const approveUser = async (uid: string) => {
    await updateDoc(doc(db, 'registrations', uid), { status: 'approved' })
    // users 컬렉션에도 추가 (없을 경우에만)
    const regSnap = await getDocs(collection(db, 'registrations'))
    const reg = regSnap.docs.find(d => d.id === uid)?.data() as RegistrationInfo | undefined
    if (reg) {
      await setDoc(doc(db, 'users', uid), {
        uid: reg.uid,
        email: reg.email,
        displayName: reg.displayName,
        role: reg.role,
        approvedAt: new Date().toISOString(),
      }, { merge: true })
    }
  }

  const rejectUser = async (uid: string) => {
    await updateDoc(doc(db, 'registrations', uid), { status: 'rejected' })
  }

  const deleteRegistration = async (uid: string) => {
    await deleteDoc(doc(db, 'registrations', uid))
  }

  const assignTeacher = async (jogyoUid: string, teacherUid: string | null) => {
    await updateDoc(doc(db, 'registrations', jogyoUid), { assignedTeacherUid: teacherUid })
  }

  return (
    <AuthContext.Provider value={{
      firebaseUser, user, registrationStatus, isAdmin, adminUid, viewingUid, viewingUserName, setViewingUid,
      signInWithGoogle, signOut, submitRegistration,
      approveUser, rejectUser, deleteRegistration, assignTeacher,
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
