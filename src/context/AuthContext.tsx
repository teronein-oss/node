import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
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
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ROLES = ['선생님', '조교', '학생', '학부모'] as const

export { ROLES }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>('loading')
  const [isAdmin, setIsAdmin] = useState(false)
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
        setViewingUidState(null)
        setViewingUserName(null)
        setRegistrationStatus('none')
        return
      }

      setFirebaseUser(fbUser)
      const adminUser = fbUser.email === ADMIN_EMAIL
      setIsAdmin(adminUser)

      if (adminUser) {
        setUser({ uid: fbUser.uid, email: fbUser.email ?? '', displayName: fbUser.displayName ?? '관리자', role: '관리자' })
        setRegistrationStatus('approved')
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
  }

  const rejectUser = async (uid: string) => {
    await updateDoc(doc(db, 'registrations', uid), { status: 'rejected' })
  }

  const deleteRegistration = async (uid: string) => {
    await deleteDoc(doc(db, 'registrations', uid))
  }

  return (
    <AuthContext.Provider value={{
      firebaseUser, user, registrationStatus, isAdmin, viewingUid, viewingUserName, setViewingUid,
      signInWithGoogle, signOut, submitRegistration,
      approveUser, rejectUser, deleteRegistration,
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
