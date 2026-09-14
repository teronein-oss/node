import { createHash, randomUUID } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

interface SignupInput {
  proofTicket?: unknown
  accountType?: unknown
  academyName?: unknown
  termsVersion?: unknown
  privacyVersion?: unknown
  acceptTerms?: unknown
  acceptPrivacy?: unknown
  marketingEmail?: unknown
  marketingSms?: unknown
}

interface SignupPolicy {
  enabled?: boolean
  termsVersion?: string
  privacyVersion?: string
}

interface VerifiedIdentity {
  status?: string
  name?: string
  phone?: string
  subjectHash?: string
  verifiedAt?: Timestamp
  expiresAt?: Timestamp
}

function requiredAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  return uid
}

export function parseSignupInput(data: SignupInput, policy: SignupPolicy) {
  if (!policy.enabled || !policy.termsVersion || !policy.privacyVersion) {
    throw new HttpsError('failed-precondition', '신규 가입이 준비 중입니다.')
  }
  const proofTicket = typeof data.proofTicket === 'string' ? data.proofTicket.trim() : ''
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(proofTicket)) {
    throw new HttpsError('failed-precondition', '휴대폰 본인확인을 완료해 주세요.')
  }
  if (data.acceptTerms !== true || data.acceptPrivacy !== true
    || data.termsVersion !== policy.termsVersion || data.privacyVersion !== policy.privacyVersion) {
    throw new HttpsError('invalid-argument', '필수 약관 동의를 다시 확인해 주세요.')
  }
  if (typeof data.marketingEmail !== 'boolean' || typeof data.marketingSms !== 'boolean') {
    throw new HttpsError('invalid-argument', '마케팅 수신 선택을 확인해 주세요.')
  }
  if (data.accountType !== 'personal' && data.accountType !== 'academy') {
    throw new HttpsError('invalid-argument', '가입 유형을 확인해 주세요.')
  }
  const academyName = typeof data.academyName === 'string' ? data.academyName.trim() : ''
  if (data.accountType === 'academy' && (academyName.length < 2 || academyName.length > 60)) {
    throw new HttpsError('invalid-argument', '학원 이름은 2~60자로 입력해 주세요.')
  }
  return {
    proofHash: createHash('sha256').update(proofTicket).digest('hex'),
    accountType: data.accountType,
    academyName,
    marketingEmail: data.marketingEmail,
    marketingSms: data.marketingSms,
  }
}

// 본인확인 제공사 콜백만 identityVerificationTickets를 생성할 수 있습니다.
// 제공사 계약 전에는 발급 경로가 없으므로 이 함수만으로 가입을 통과할 수 없습니다.
export const registerNodeAccount = onCall<SignupInput>({ region: 'asia-northeast3' }, async request => {
  const uid = requiredAuth(request.auth?.uid)
  if (request.auth?.token.firebase?.sign_in_provider !== 'password') {
    throw new HttpsError('failed-precondition', '이메일·비밀번호 계정으로 가입해 주세요.')
  }
  const db = getFirestore()
  const policy = (await db.doc('signupConfig/current').get()).data() as SignupPolicy | undefined
  const input = parseSignupInput(request.data ?? {}, policy ?? {})
  const authUser = await getAuth().getUser(uid)
  if (!authUser.email) throw new HttpsError('failed-precondition', '이메일 계정이 필요합니다.')

  const academyId = `N-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`
  const registrationRef = db.doc(`registrations/${uid}`)
  const proofRef = db.doc(`identityVerificationTickets/${input.proofHash}`)
  const now = Timestamp.now()
  const createdAt = now.toDate().toISOString()

  return db.runTransaction(async transaction => {
    const existing = await transaction.get(registrationRef)
    if (existing.exists) {
      if (existing.get('identityTicketHash') === input.proofHash) {
        return { status: existing.get('status') as string, academyId: existing.get('academyId') as string }
      }
      throw new HttpsError('already-exists', '이미 가입된 계정입니다.')
    }

    const proofSnapshot = await transaction.get(proofRef)
    const proof = proofSnapshot.data() as VerifiedIdentity | undefined
    if (!proofSnapshot.exists || proof?.status !== 'verified'
      || !proof.expiresAt || proof.expiresAt.toMillis() <= now.toMillis()
      || !proof.verifiedAt || proof.verifiedAt.toMillis() > now.toMillis()
      || now.toMillis() - proof.verifiedAt.toMillis() > 10 * 60 * 1000
      || !proof.name?.trim() || !proof.phone?.trim()
      || !/^[a-f0-9]{64}$/.test(proof.subjectHash ?? '')) {
      throw new HttpsError('failed-precondition', '휴대폰 본인확인을 다시 진행해 주세요.')
    }
    const claimRef = db.doc(`identityClaims/${proof.subjectHash}`)
    const claim = await transaction.get(claimRef)
    if (claim.exists && claim.get('uid') !== uid) {
      throw new HttpsError('already-exists', '이미 가입된 본인확인 정보입니다.')
    }

    const verifiedName = proof.name.trim().slice(0, 80)
    const workspaceName = input.accountType === 'personal' ? `${verifiedName} 워크스페이스` : input.academyName
    const role = input.accountType === 'personal' ? '선생님' : '원장'
    const academyRef = db.doc(`academies/${academyId}`)
    transaction.create(academyRef, {
      id: academyId,
      name: workspaceName,
      workspaceType: input.accountType,
      ownerUid: uid,
      createdAt,
    })
    transaction.create(registrationRef, {
      uid,
      email: authUser.email,
      displayName: verifiedName,
      identityVerifiedAt: proof.verifiedAt.toDate().toISOString(),
      identityTicketHash: input.proofHash,
      role,
      status: 'pending_email',
      academyId,
      academyName: workspaceName,
      createdAt,
      consent: {
        termsVersion: policy!.termsVersion,
        privacyVersion: policy!.privacyVersion,
        marketingEmail: input.marketingEmail,
        marketingSms: input.marketingSms,
        agreedAt: createdAt,
      },
    })
    if (!claim.exists) transaction.create(claimRef, { uid, createdAt })
    transaction.delete(proofRef)
    return { status: 'pending_email', academyId }
  })
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
    if (data.status === 'approved') return { status: 'approved' }
    if (data.status !== 'pending_email' || !data.identityVerifiedAt || !data.consent
      || data.email !== authUser.email
      || typeof data.academyId !== 'string' || typeof data.displayName !== 'string') {
      throw new HttpsError('failed-precondition', '가입 상태를 확인해 주세요.')
    }
    const approvedAt = new Date().toISOString()
    transaction.update(registrationRef, { status: 'approved', approvedAt })
    transaction.set(db.doc(`academies/${data.academyId}/users/${uid}`), {
      uid,
      email: authUser.email,
      displayName: data.displayName,
      role: data.role,
      academyId: data.academyId,
      academyName: data.academyName,
      approvedAt,
    }, { merge: true })
    transaction.set(db.doc(`academies/${data.academyId}/config/sharedData`), {
      approvedTeachers: { [uid]: data.displayName },
    }, { merge: true })
    return { status: 'approved' }
  })
})
