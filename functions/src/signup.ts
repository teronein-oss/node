import { randomUUID } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

interface SignupInput {
  name?: unknown
  birthDate?: unknown
  phone?: unknown
  email?: unknown
  password?: unknown
  accountType?: unknown
  academyName?: unknown
  academyCode?: unknown
  joinRole?: unknown
  acceptTerms?: unknown
  acceptPrivacy?: unknown
}

const DEFAULT_ACADEMY_ID = 'node-default'
const DEFAULT_ACADEMY_NAME = '세움학원'
// 기본 학원은 문서 ID(node-default) 대신 이 가입 코드로만 조교 가입을 받습니다.
const DEFAULT_ACADEMY_JOIN_CODE = 'seum6898'

interface SignupPolicy {
  enabled?: boolean
}

function requiredAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  return uid
}

function parseBirthDate(value: unknown, now: Date): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) throw new HttpsError('invalid-argument', '생년월일을 확인해 주세요.')
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || year < 1900 || date.getTime() > now.getTime()) {
    throw new HttpsError('invalid-argument', '생년월일을 확인해 주세요.')
  }
  return text
}

export function parseSignupInput(data: SignupInput, policy: SignupPolicy, now = new Date()) {
  if (policy.enabled === false) {
    throw new HttpsError('failed-precondition', '신규 가입이 준비 중입니다.')
  }
  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 40) {
    throw new HttpsError('invalid-argument', '이름은 2~40자로 입력해 주세요.')
  }
  const birthDate = parseBirthDate(data.birthDate, now)
  const phone = typeof data.phone === 'string' ? data.phone.replace(/[\s-]/g, '') : ''
  if (!/^01[016789]\d{7,8}$/.test(phone)) {
    throw new HttpsError('invalid-argument', '휴대폰 번호를 확인해 주세요.')
  }
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', '이메일 주소를 확인해 주세요.')
  }
  const password = typeof data.password === 'string' ? data.password : ''
  if (password.length < 8 || password.length > 128) {
    throw new HttpsError('invalid-argument', '비밀번호는 8자 이상으로 입력해 주세요.')
  }
  if (data.acceptTerms !== true || data.acceptPrivacy !== true) {
    throw new HttpsError('invalid-argument', '필수 약관 동의를 다시 확인해 주세요.')
  }
  // personal: 새 학원 강사, academy: 새 학원 원장, join: 학원 코드로 기존 학원 합류(강사·조교)
  if (data.accountType !== 'personal' && data.accountType !== 'academy' && data.accountType !== 'join') {
    throw new HttpsError('invalid-argument', '가입 유형을 확인해 주세요.')
  }
  const academyName = typeof data.academyName === 'string' ? data.academyName.trim() : ''
  if (data.accountType !== 'join' && (academyName.length < 2 || academyName.length > 60)) {
    throw new HttpsError('invalid-argument', '학원 이름은 2~60자로 입력해 주세요.')
  }
  const rawCode = typeof data.academyCode === 'string' ? data.academyCode.trim() : ''
  const academyCode = rawCode.toLowerCase() === DEFAULT_ACADEMY_JOIN_CODE ? DEFAULT_ACADEMY_ID : rawCode.toUpperCase()
  if (data.accountType === 'join' && academyCode !== DEFAULT_ACADEMY_ID && !/^N-[A-Z0-9]{20}$/.test(academyCode)) {
    throw new HttpsError('invalid-argument', '학원 코드를 확인해 주세요.')
  }
  if (data.accountType === 'join' && data.joinRole !== '선생님' && data.joinRole !== '조교') {
    throw new HttpsError('invalid-argument', '강사 또는 조교를 선택해 주세요.')
  }
  const role = data.accountType === 'join' ? data.joinRole as '선생님' | '조교'
    : data.accountType === 'academy' ? '원장' : '선생님'
  return { name, birthDate, phone, email, password, accountType: data.accountType, academyName, academyCode, role }
}

// 본인인증 없이 이름·생년월일·휴대폰·이메일로 계정을 만들고, 이메일 인증 후 activateNodeAccount로 승인합니다.
export const registerNodeAccount = onCall<SignupInput>({ region: 'asia-northeast3' }, async request => {
  const db = getFirestore()
  const policy = (await db.doc('signupConfig/current').get()).data() as SignupPolicy | undefined
  const input = parseSignupInput(request.data ?? {}, policy ?? {})

  // 기존 학원 합류는 학원 코드가 실제로 있어야 합니다. 강사는 이메일 인증 후 바로 사용하고, 조교는 원장 승인을 기다립니다.
  let joinedAcademyName = ''
  if (input.accountType === 'join') {
    const academy = await db.doc(`academies/${input.academyCode}`).get()
    if (!academy.exists && input.academyCode !== DEFAULT_ACADEMY_ID) {
      throw new HttpsError('not-found', '학원 코드를 찾을 수 없습니다.')
    }
    joinedAcademyName = (academy.get('name') as string | undefined) || DEFAULT_ACADEMY_NAME
  }

  let uid: string
  try {
    uid = (await getAuth().createUser({ email: input.email, password: input.password, displayName: input.name })).uid
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'auth/email-already-exists') throw new HttpsError('already-exists', '이미 가입된 이메일입니다.')
    if (code === 'auth/invalid-password') throw new HttpsError('invalid-argument', '비밀번호는 8자 이상으로 입력해 주세요.')
    if (code === 'auth/invalid-email') throw new HttpsError('invalid-argument', '이메일 주소를 확인해 주세요.')
    throw error
  }

  const isJoin = input.accountType === 'join'
  const academyId = isJoin ? input.academyCode : `N-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`
  const createdAt = new Date().toISOString()
  const workspaceName = isJoin ? joinedAcademyName : input.academyName
  const role = input.role
  try {
    const batch = db.batch()
    if (!isJoin) {
      batch.create(db.doc(`academies/${academyId}`), {
        id: academyId,
        name: workspaceName,
        workspaceType: input.accountType,
        ownerUid: uid,
        createdAt,
      })
    }
    batch.create(db.doc(`registrations/${uid}`), {
      uid,
      email: input.email,
      displayName: input.name,
      birthDate: input.birthDate,
      phone: input.phone,
      role,
      status: 'pending_email',
      academyId,
      academyName: workspaceName,
      createdAt,
      consent: { terms: true, privacy: true, agreedAt: createdAt },
    })
    await batch.commit()
  } catch (error) {
    await getAuth().deleteUser(uid).catch(() => undefined)
    throw error
  }
  return { status: 'pending_email', academyId }
})

export const activateNodeAccount = onCall({ region: 'asia-northeast3' }, async request => {
  const uid = requiredAuth(request.auth?.uid)
  const authUser = await getAuth().getUser(uid)
  if (!authUser.emailVerified) throw new HttpsError('failed-precondition', '이메일 인증을 완료해 주세요.')
  const db = getFirestore()
  const registrationRef = db.doc(`registrations/${uid}`)
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(registrationRef)
    if (!snapshot.exists) throw new HttpsError('failed-precondition', '가입 정보를 찾을 수 없습니다.')
    const data = snapshot.data()!
    if (data.status === 'approved' || data.status === 'pending') return { status: data.status as string }
    if (data.status !== 'pending_email' || !data.consent
      || data.email !== authUser.email
      || typeof data.academyId !== 'string' || typeof data.displayName !== 'string') {
      throw new HttpsError('failed-precondition', '가입 상태를 확인해 주세요.')
    }
    if (data.role === '조교') {
      transaction.update(registrationRef, { status: 'pending', emailVerifiedAt: new Date().toISOString() })
      return { status: 'pending' }
    }
    const approvedAt = new Date().toISOString()
    transaction.update(registrationRef, { status: 'approved', approvedAt })
    // 기본 학원(세움학원)은 최상위 users/config 경로를 사용합니다. (src/utils/firestorePaths.ts 참고)
    const academyPrefix = data.academyId === DEFAULT_ACADEMY_ID ? '' : `academies/${data.academyId}/`
    transaction.set(db.doc(`${academyPrefix}users/${uid}`), {
      uid,
      email: authUser.email,
      displayName: data.displayName,
      role: data.role,
      academyId: data.academyId,
      academyName: data.academyName,
      approvedAt,
    }, { merge: true })
    transaction.set(db.doc(`${academyPrefix}config/sharedData`), {
      approvedTeachers: { [uid]: data.displayName },
    }, { merge: true })
    return { status: 'approved' }
  })
})
