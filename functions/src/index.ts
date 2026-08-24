import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink, writeFile } from 'node:fs/promises'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { logger, setGlobalOptions } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { SolapiMessageService } from 'solapi'
import {
  isJpeg,
  isValidPhone,
  MAX_MMS_IMAGE_BYTES,
  MAX_RECIPIENTS,
  normalizePhone,
  normalizeRecipients,
  solapiTextBytes,
  summarizeDeliveries,
  type DeliveryResult,
  type MessageType,
} from './messageDomain'
import {
  createAccessCode,
  hashAccessCode,
  hashTeacherAccessCode,
  hashViewerAddress,
  isValidAccessCode,
  isValidMasterAccessCode,
  normalizeAccessCode,
  rankToTopPercent,
} from './reportAccessDomain'
import { baekhyeonReportSeed } from './reportSeedData'
import { examPortalSeed } from './generatedExamPortalSeed'

initializeApp()
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

const db = getFirestore()
const solapiApiKey = defineSecret('SOLAPI_API_KEY')
const solapiApiSecret = defineSecret('SOLAPI_API_SECRET')
const solapiSender = defineSecret('SOLAPI_SENDER')
const secrets = [solapiApiKey, solapiApiSecret, solapiSender]
const SUPER_ADMIN_EMAIL = 'teronein@gmail.com'
const ADMIN_ROLES = new Set(['관리자', '원장'])
const REPORT_ACCESS_DAYS = 730
const REPORT_RETENTION_MS = REPORT_ACCESS_DAYS * 24 * 60 * 60 * 1000
const REPORT_RATE_WINDOW_MS = 10 * 60 * 1000
const REPORT_LOCK_MS = 15 * 60 * 1000
const REPORT_MAX_FAILURES = 5
// 원문은 저장하지 않습니다. 12자리 마스터 코드를 teacher-report 네임스페이스로 해시한 값입니다.
const MASTER_TEACHER_ACCESS_HASH = '3d7f53d9252b4ad4216d34db72e97b7f05d8a146a387c710f936c5f3a4586fbb'

interface SendMessageInput {
  academyId?: unknown
  clientRequestId?: unknown
  type?: unknown
  recipients?: unknown
  text?: unknown
  subject?: unknown
  imageBase64?: unknown
  imageName?: unknown
}

interface SyncJob {
  academyId: string
  logId: string
  groupId: string
  attempts?: number
}

interface AuthorizedSender {
  uid: string
  email: string
  displayName: string
  academyId: string
}

interface StudentReportAccessInput {
  code?: unknown
}

interface ReportPortalAccessInput extends StudentReportAccessInput {}

interface PublishStudentReportsInput {
  academyId?: unknown
  rotateCodes?: unknown
}

interface TeacherDashboardInput {
  code?: unknown
}

interface TeacherStudentReportInput extends TeacherDashboardInput {
  studentId?: unknown
}

interface ActualExamScoreAdminInput {
  academyId?: unknown
}

interface SaveActualExamScoresInput extends ActualExamScoreAdminInput {
  cohortId?: unknown
  termId?: unknown
  scores?: unknown
}

function messageService(): SolapiMessageService {
  return new SolapiMessageService(solapiApiKey.value(), solapiApiSecret.value())
}

function cleanAcademyId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (raw.toLowerCase() === 'node-default') return 'node-default'
  const result = raw.toUpperCase()
  return /^[A-Z0-9_-]{2,64}$/.test(result) ? result : ''
}

function publicError(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== 'object') return { code: 'unknown', message: '문자 발송 중 오류가 발생했습니다.' }
  const data = error as Record<string, unknown>
  const code = String(data.errorCode ?? data.code ?? 'provider-error').slice(0, 80)
  const message = String(data.errorMessage ?? data.message ?? 'SOLAPI 요청에 실패했습니다.').slice(0, 500)
  return { code, message }
}

function syncJobId(academyId: string, logId: string): string {
  return `${academyId}--${logId}`
}

async function authorizeAdmin(auth: { uid: string; token: Record<string, unknown> } | undefined, requestedAcademyId: unknown): Promise<AuthorizedSender> {
  if (!auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  const email = typeof auth.token.email === 'string' ? auth.token.email : ''
  if (email === SUPER_ADMIN_EMAIL) {
    return {
      uid: auth.uid,
      email,
      displayName: typeof auth.token.name === 'string' ? auth.token.name : email,
      academyId: cleanAcademyId(requestedAcademyId) || 'node-default',
    }
  }

  const registration = await db.doc(`registrations/${auth.uid}`).get()
  const data = registration.data()
  if (!registration.exists || data?.status !== 'approved' || !ADMIN_ROLES.has(data?.role)) {
    throw new HttpsError('permission-denied', '관리자 또는 원장만 문자를 발송할 수 있습니다.')
  }
  const academyId = cleanAcademyId(data?.academyId) || 'node-default'
  const requested = cleanAcademyId(requestedAcademyId)
  if (requested && requested !== academyId) {
    throw new HttpsError('permission-denied', '다른 학원의 문자 데이터에는 접근할 수 없습니다.')
  }
  return {
    uid: auth.uid,
    email,
    displayName: typeof data?.displayName === 'string' ? data.displayName : email,
    academyId,
  }
}

function validateSendInput(data: SendMessageInput) {
  const clientRequestId = typeof data.clientRequestId === 'string' ? data.clientRequestId.trim() : ''
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientRequestId)) {
    throw new HttpsError('invalid-argument', '올바르지 않은 발송 요청 ID입니다.')
  }
  const type: MessageType = data.type === 'MMS' ? 'MMS' : data.type === 'SMS' ? 'SMS' : (() => {
    throw new HttpsError('invalid-argument', '문자 유형은 SMS 또는 MMS여야 합니다.')
  })()
  const recipients = normalizeRecipients(data.recipients)
  if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS || recipients.some(phone => !isValidPhone(phone))) {
    throw new HttpsError('invalid-argument', `수신번호는 숫자 8~15자리로 한 번에 ${MAX_RECIPIENTS}개까지 입력할 수 있습니다.`)
  }
  const text = typeof data.text === 'string' ? data.text.trim() : ''
  const textBytes = solapiTextBytes(text)
  if (!text || (type === 'SMS' && textBytes > 90) || (type === 'MMS' && textBytes > 2000)) {
    throw new HttpsError('invalid-argument', type === 'SMS' ? 'SMS 내용은 90 byte 이하여야 합니다.' : 'MMS 내용은 2,000 byte 이하여야 합니다.')
  }
  const subject = typeof data.subject === 'string' ? data.subject.trim() : ''
  if (subject.length > 40 || (type === 'SMS' && subject)) {
    throw new HttpsError('invalid-argument', type === 'SMS' ? 'SMS에는 제목을 사용할 수 없습니다.' : 'MMS 제목은 40자 이하여야 합니다.')
  }
  return { clientRequestId, type, recipients, text, textBytes, subject }
}

function decodeMmsImage(data: SendMessageInput): Buffer {
  if (typeof data.imageBase64 !== 'string') throw new HttpsError('invalid-argument', 'MMS에는 JPG 이미지가 필요합니다.')
  const match = data.imageBase64.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new HttpsError('invalid-argument', 'MMS 이미지는 JPG 형식만 사용할 수 있습니다.')
  const buffer = Buffer.from(match[1], 'base64')
  if (!buffer.length || buffer.length > MAX_MMS_IMAGE_BYTES || !isJpeg(buffer)) {
    throw new HttpsError('invalid-argument', 'MMS 이미지는 200KB 이하의 올바른 JPG 파일이어야 합니다.')
  }
  return buffer
}

function initialDeliveries(
  recipients: string[],
  requestedType: MessageType,
  result: Awaited<ReturnType<SolapiMessageService['send']>>,
): DeliveryResult[] {
  const accepted = result.messageList ?? []
  const failed = result.failedMessageList ?? []
  return recipients.map((to, index) => {
    const acceptedItem = accepted.find(item => item.customFields?.recipientIndex === String(index)) ?? accepted[index]
    const failedItem = failed.find(item => normalizePhone(item.to) === to)
    if (failedItem) {
      return {
        messageId: failedItem.messageId || null,
        to,
        type: failedItem.type || 'SMS',
        status: 'COMPLETE',
        statusCode: failedItem.statusCode || null,
        reason: failedItem.statusMessage || null,
        dateReceived: null,
        dateReported: null,
      }
    }
    return {
      messageId: acceptedItem?.messageId ?? null,
      to,
      type: requestedType,
      status: acceptedItem ? 'PENDING' : 'QUEUED',
      statusCode: acceptedItem?.statusCode ?? null,
      reason: acceptedItem?.statusMessage ?? null,
      dateReceived: null,
      dateReported: null,
    }
  })
}

async function syncDeliveryJob(jobId: string, job: SyncJob): Promise<string> {
  const service = messageService()
  const response = await service.getGroupMessages(job.groupId, { limit: 500 })
  const providerMessages = Object.values(response.messageList)
  if (providerMessages.length === 0) return 'PROCESSING'

  const providerDeliveries: DeliveryResult[] = providerMessages.map(message => ({
    messageId: message.messageId ?? null,
    to: Array.isArray(message.to) ? String(message.to[0] ?? '') : String(message.to ?? ''),
    type: message.type ?? 'SMS',
    status: message.status === 'COMPLETE' || message.status === 'SENDING' || message.status === 'PENDING'
      ? message.status
      : 'PENDING',
    statusCode: message.statusCode ?? null,
    reason: message.reason ?? null,
    dateReceived: message.dateReceived ?? null,
    dateReported: message.dateReported ?? null,
  }))
  const logRef = db.doc(`academies/${job.academyId}/messageLogs/${job.logId}`)
  const logSnapshot = await logRef.get()
  const logData = logSnapshot.data()
  if (!logSnapshot.exists) {
    await db.doc(`messageSyncJobs/${jobId}`).delete()
    return 'FAILED'
  }
  const existingDeliveries = Array.isArray(logData?.deliveries) ? logData.deliveries as DeliveryResult[] : []
  const providerKeys = new Set(providerDeliveries.flatMap(item => [item.messageId, item.to].filter(Boolean)))
  const preservedFailures = existingDeliveries.filter(item => item.status === 'COMPLETE' && !providerKeys.has(item.messageId) && !providerKeys.has(item.to))
  const deliveries = [...providerDeliveries, ...preservedFailures]
  const expectedCount = typeof logData?.recipientCount === 'number' ? logData.recipientCount : deliveries.length
  const status = deliveries.length < expectedCount ? 'PROCESSING' : summarizeDeliveries(deliveries)
  const successCount = deliveries.filter(item => item.status === 'COMPLETE' && item.statusCode === '4000').length
  const failureCount = deliveries.filter(item => item.status === 'COMPLETE' && item.statusCode !== '4000').length
  const update: Record<string, unknown> = {
    deliveries,
    status,
    successCount,
    failureCount,
    lastSyncedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }
  if (status !== 'PROCESSING') update.completedAt = Timestamp.now()

  await logRef.set(update, { merge: true })
  const jobRef = db.doc(`messageSyncJobs/${jobId}`)
  if (status === 'PROCESSING') {
    await jobRef.set({ attempts: FieldValue.increment(1), lastAttemptAt: Timestamp.now() }, { merge: true })
  } else {
    await jobRef.delete()
  }
  return status
}

export const sendSolapiMessage = onCall<SendMessageInput>({
  secrets,
  timeoutSeconds: 60,
  memory: '512MiB',
}, async request => {
  const sender = await authorizeAdmin(request.auth, request.data.academyId)
  const input = validateSendInput(request.data)
  const senderNumber = normalizePhone(solapiSender.value())
  if (!isValidPhone(senderNumber)) throw new HttpsError('failed-precondition', 'SOLAPI_SENDER 설정을 확인해 주세요.')

  const logRef = db.doc(`academies/${sender.academyId}/messageLogs/${input.clientRequestId}`)
  const claimed = await db.runTransaction(async transaction => {
    const existing = await transaction.get(logRef)
    if (existing.exists) return false
    transaction.create(logRef, {
      type: input.type,
      subject: input.subject || null,
      text: input.text,
      textBytes: input.textBytes,
      recipientCount: input.recipients.length,
      recipients: input.recipients,
      hasImage: input.type === 'MMS',
      status: 'PROCESSING',
      deliveries: input.recipients.map(to => ({
        messageId: null, to, type: input.type, status: 'QUEUED', statusCode: null,
        reason: null, dateReceived: null, dateReported: null,
      })),
      successCount: 0,
      failureCount: 0,
      createdBy: { uid: sender.uid, email: sender.email, displayName: sender.displayName },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    return true
  })
  if (!claimed) {
    const existing = (await logRef.get()).data()
    return { logId: input.clientRequestId, duplicate: true, status: existing?.status ?? 'PROCESSING' }
  }

  let temporaryImagePath: string | null = null
  try {
    const service = messageService()
    let imageId: string | undefined
    if (input.type === 'MMS') {
      const image = decodeMmsImage(request.data)
      temporaryImagePath = join(tmpdir(), `solapi-${randomUUID()}.jpg`)
      await writeFile(temporaryImagePath, image, { flag: 'wx' })
      imageId = (await service.uploadFile(temporaryImagePath, 'MMS', typeof request.data.imageName === 'string' ? request.data.imageName.slice(0, 80) : 'message.jpg')).fileId
    }

    const messages = input.recipients.map((to, index) => ({
      to,
      from: senderNumber,
      text: input.text,
      type: input.type,
      ...(input.subject ? { subject: input.subject } : {}),
      ...(imageId ? { imageId } : {}),
      customFields: { requestId: input.clientRequestId, recipientIndex: String(index) },
    }))
    const result = await service.send(messages, { allowDuplicates: false, showMessageList: true })
    const groupId = result.groupInfo.groupId
    const deliveries = initialDeliveries(input.recipients, input.type, result)
    const status = summarizeDeliveries(deliveries)
    const jobRef = db.doc(`messageSyncJobs/${syncJobId(sender.academyId, input.clientRequestId)}`)
    await db.runTransaction(async transaction => {
      transaction.set(logRef, {
        groupId,
        providerStatus: result.groupInfo.status,
        status,
        deliveries,
        acceptedCount: result.messageList?.length ?? 0,
        failureCount: result.failedMessageList?.length ?? 0,
        updatedAt: Timestamp.now(),
      }, { merge: true })
      if (status === 'PROCESSING') {
        transaction.create(jobRef, {
          academyId: sender.academyId,
          logId: input.clientRequestId,
          groupId,
          attempts: 0,
          createdAt: Timestamp.now(),
        })
      }
    })
    return { logId: input.clientRequestId, groupId, duplicate: false, status }
  } catch (error) {
    const safeError = publicError(error)
    logger.error('SOLAPI send failed', { logId: input.clientRequestId, academyId: sender.academyId, code: safeError.code })
    await logRef.set({
      status: 'FAILED',
      error: safeError,
      failureCount: input.recipients.length,
      deliveries: input.recipients.map(to => ({
        messageId: null, to, type: input.type, status: 'COMPLETE', statusCode: safeError.code,
        reason: safeError.message, dateReceived: null, dateReported: null,
      })),
      updatedAt: Timestamp.now(),
      completedAt: Timestamp.now(),
    }, { merge: true })
    throw new HttpsError('internal', safeError.message, { logId: input.clientRequestId, providerCode: safeError.code })
  } finally {
    if (temporaryImagePath) await unlink(temporaryImagePath).catch(() => undefined)
  }
})

export const refreshSolapiMessageStatus = onCall<{ academyId?: unknown; logId?: unknown }>({ secrets }, async request => {
  const sender = await authorizeAdmin(request.auth, request.data.academyId)
  const logId = typeof request.data.logId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(request.data.logId)
    ? request.data.logId
    : ''
  if (!logId) throw new HttpsError('invalid-argument', '올바르지 않은 발송 기록 ID입니다.')
  const log = await db.doc(`academies/${sender.academyId}/messageLogs/${logId}`).get()
  const groupId = log.data()?.groupId
  if (!log.exists || typeof groupId !== 'string') throw new HttpsError('failed-precondition', '아직 조회할 수 있는 발송 결과가 없습니다.')

  const jobRef = db.doc(`messageSyncJobs/${syncJobId(sender.academyId, logId)}`)
  if (!(await jobRef.get()).exists) {
    await jobRef.set({ academyId: sender.academyId, logId, groupId, attempts: 0, createdAt: Timestamp.now() })
  }
  const status = await syncDeliveryJob(jobRef.id, { academyId: sender.academyId, logId, groupId })
  return { logId, status }
})

export const syncSolapiMessageResults = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Seoul',
  secrets,
  timeoutSeconds: 240,
}, async () => {
  const jobs = await db.collection('messageSyncJobs').orderBy('createdAt').limit(100).get()
  for (const document of jobs.docs) {
    try {
      await syncDeliveryJob(document.id, document.data() as SyncJob)
    } catch (error) {
      const safeError = publicError(error)
      logger.error('SOLAPI result sync failed', { jobId: document.id, code: safeError.code })
      await document.ref.set({ attempts: FieldValue.increment(1), lastAttemptAt: Timestamp.now(), lastError: safeError }, { merge: true })
    }
  }
})

function reportCodeError(): HttpsError {
  return new HttpsError('permission-denied', '식별 코드를 확인해 주세요.')
}

function viewerAddress(request: { rawRequest: { ip?: string; socket?: { remoteAddress?: string | null } } }): string {
  return request.rawRequest.ip || request.rawRequest.socket?.remoteAddress || 'unknown'
}

function teacherCohortsForHash(accessHash: string) {
  if (accessHash === MASTER_TEACHER_ACCESS_HASH) return examPortalSeed.cohorts
  return Date.now() < examPortalSeed.expiresAt
    ? examPortalSeed.cohorts.filter(item => item.teacherAccessHash === accessHash)
    : []
}

function isMasterTeacherCode(code: string, accessHash: string): boolean {
  return isValidMasterAccessCode(code) && accessHash === MASTER_TEACHER_ACCESS_HASH
}

export const resolveReportPortalAccess = onCall<ReportPortalAccessInput>({
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 20,
}, async request => {
  const code = normalizeAccessCode(request.data?.code)
  const studentHash = hashAccessCode(code || 'invalid')
  const teacherHash = hashTeacherAccessCode(code || 'invalid')
  const embeddedStudent = embeddedStudentAccess(studentHash)
  const teacherCohorts = teacherCohortsForHash(teacherHash)
  const ipHash = hashViewerAddress(`portal:${viewerAddress(request)}`)
  const rateRef = db.doc(`reportPortalRateLimits/${ipHash}`)
  const accessRef = db.doc(`studentReportAccess/${studentHash}`)
  const now = Timestamp.now()

  const role = await db.runTransaction(async transaction => {
    const [rateSnapshot, accessSnapshot] = await Promise.all([
      transaction.get(rateRef),
      transaction.get(accessRef),
    ])
    const rateData = rateSnapshot.data()
    const lockedUntil = rateData?.lockedUntil instanceof Timestamp ? rateData.lockedUntil : null
    if (lockedUntil && lockedUntil.toMillis() > now.toMillis()) return 'locked' as const

    const accessData = accessSnapshot.data()
    const expiresAt = accessData?.expiresAt instanceof Timestamp ? accessData.expiresAt : null
    const firestoreStudentValid = isValidAccessCode(code)
      && accessSnapshot.exists
      && accessData?.active === true
      && expiresAt !== null
      && expiresAt.toMillis() > now.toMillis()
      && typeof accessData?.academyId === 'string'
      && typeof accessData?.reportId === 'string'
    const embeddedStudentValid = isValidAccessCode(code) && embeddedStudent !== null
    const teacherValid = (isValidAccessCode(code) || isMasterTeacherCode(code, teacherHash)) && teacherCohorts.length > 0
    const resolvedRole = teacherValid ? 'teacher' as const : firestoreStudentValid || embeddedStudentValid ? 'student' as const : null

    if (!resolvedRole) {
      const windowStartedAt = rateData?.windowStartedAt instanceof Timestamp ? rateData.windowStartedAt : now
      const withinWindow = now.toMillis() - windowStartedAt.toMillis() <= REPORT_RATE_WINDOW_MS
      const failedAttempts = withinWindow && typeof rateData?.failedAttempts === 'number' ? rateData.failedAttempts + 1 : 1
      transaction.set(rateRef, {
        failedAttempts,
        windowStartedAt: withinWindow ? windowStartedAt : now,
        lastAttemptAt: now,
        expiresAt: retentionExpiresAt(now),
        ...(failedAttempts >= REPORT_MAX_FAILURES
          ? { lockedUntil: Timestamp.fromMillis(now.toMillis() + REPORT_LOCK_MS) }
          : { lockedUntil: null }),
      }, { merge: true })
      return 'invalid' as const
    }

    transaction.set(rateRef, {
      failedAttempts: 0,
      windowStartedAt: now,
      lastAttemptAt: now,
      lockedUntil: null,
      expiresAt: retentionExpiresAt(now),
    }, { merge: true })
    return resolvedRole
  })

  if (role === 'locked') throw new HttpsError('resource-exhausted', '입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.')
  if (role === 'invalid') throw reportCodeError()
  return { role }
})

function retentionExpiresAt(now: Timestamp): Timestamp {
  return Timestamp.fromMillis(now.toMillis() + REPORT_RETENTION_MS)
}

type ActualExamType = '중간고사' | '기말고사'

function actualExamScoreCollection(academyId: string) {
  return db.collection(`academies/${academyId}/actualExamScores`)
}

function actualExamScoreDocumentId(cohortId: string, studentId: string, termId: string) {
  return `${cohortId}--${studentId}--${termId}`
}

type ExamPortalCohort = (typeof examPortalSeed.cohorts)[number]

const SCORE_DISTRIBUTION_BANDS = [
  { label: '0–49', min: 0, maxExclusive: 50 },
  { label: '50–59', min: 50, maxExclusive: 60 },
  { label: '60–69', min: 60, maxExclusive: 70 },
  { label: '70–79', min: 70, maxExclusive: 80 },
  { label: '80–89', min: 80, maxExclusive: 90 },
  { label: '90–99', min: 90, maxExclusive: 100 },
  { label: '100', min: 100, maxExclusive: 101 },
] as const

function examScoreDistribution(exam: ExamPortalCohort['exams'][number], studentScore: number | null) {
  const scores = exam.students.map(student => student.totalScore)
  const counts = SCORE_DISTRIBUTION_BANDS.map(band =>
    scores.filter(value => value >= band.min && value < band.maxExclusive).length)
  const percentages = counts.map(count => scores.length ? Math.round(count / scores.length * 1000) / 10 : 0)
  if (scores.length) {
    const roundingDelta = Math.round((100 - percentages.reduce((sum, value) => sum + value, 0)) * 10) / 10
    const largestBandIndex = counts.indexOf(Math.max(...counts))
    percentages[largestBandIndex] = Math.round((percentages[largestBandIndex] + roundingDelta) * 10) / 10
  }
  const studentBand = studentScore === null
    ? null
    : SCORE_DISTRIBUTION_BANDS.find(band => studentScore >= band.min && studentScore < band.maxExclusive)?.label ?? null
  return {
    highest: scores.length ? Math.max(...scores) : 0,
    lowest: scores.length ? Math.min(...scores) : 0,
    studentBand,
    bins: SCORE_DISTRIBUTION_BANDS.map((band, index) => ({
      label: band.label,
      percent: percentages[index],
    })),
  }
}

function embeddedStudentAccess(accessHash: string): { cohort: ExamPortalCohort; studentId: string } | null {
  if (Date.now() >= examPortalSeed.expiresAt) return null
  for (const cohort of examPortalSeed.cohorts) {
    const access = cohort.studentAccess.find(item => item.accessHash === accessHash)
    if (access) return { cohort, studentId: access.studentId }
  }
  return null
}

function buildStudentCumulative(cohort: ExamPortalCohort, studentId: string, allowExpired = false) {
  if (!allowExpired && Date.now() >= examPortalSeed.expiresAt) return null
  const access = cohort.studentAccess.find(item => item.studentId === studentId)
  if (!access) return null

  const attendedExams = cohort.exams.flatMap(exam => {
    const result = exam.students.find(student => student.studentId === studentId)
    if (!result) return []
    const typeAnalysis = result.typeResults.map(typeResult => {
      let cohortCorrect = 0
      let cohortTotal = 0
      for (const student of exam.students) {
        const cohortType = student.typeResults.find(item => item.detailType === typeResult.detailType)
        if (cohortType) {
          cohortCorrect += cohortType.correct
          cohortTotal += cohortType.total
        }
      }
      return {
        category: typeResult.category,
        detailType: typeResult.detailType,
        correct: typeResult.correct,
        total: typeResult.total,
        missedQuestions: typeResult.missedQuestions,
        cohortRate: cohortTotal ? Math.round(cohortCorrect / cohortTotal * 1000) / 10 : 0,
      }
    })
    return [{
      examId: exam.examId,
      termId: exam.termId,
      round: exam.round,
      title: exam.title,
      averages: exam.averages,
      attended: true as const,
      result: {
        totalScore: result.totalScore,
        objectiveScore: result.objectiveScore,
        writtenScore: result.writtenScore,
        topPercent: result.topPercent,
      },
      typeAnalysis,
      scoreDistribution: examScoreDistribution(exam, result.totalScore),
    }]
  })
  if (!attendedExams.length) return null

  const attendedByExamId = new Map(attendedExams.map(exam => [exam.examId, exam]))
  const exams = cohort.exams.map(exam => attendedByExamId.get(exam.examId) ?? {
    examId: exam.examId,
    termId: exam.termId,
    round: exam.round,
    title: exam.title,
    averages: exam.averages,
    attended: false as const,
    result: null,
    typeAnalysis: [],
    scoreDistribution: examScoreDistribution(exam, null),
  })

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const totalAverage = average(attendedExams.map(exam => exam.result.totalScore))
  const objectiveAverage = average(attendedExams.map(exam => exam.result.objectiveScore))
  const writtenAverage = average(attendedExams.map(exam => exam.result.writtenScore))
  const cohortAverages = cohort.studentAccess.flatMap(item => {
    const scores = cohort.exams.flatMap(exam => {
      const student = exam.students.find(candidate => candidate.studentId === item.studentId)
      return student ? [student.totalScore] : []
    })
    return scores.length ? [{ studentId: item.studentId, average: average(scores) }] : []
  })
  const cumulativeRank = 1 + cohortAverages.filter(item => item.average > totalAverage).length
  const cumulativeTopPercent = rankToTopPercent(cumulativeRank, cohortAverages.length)
  const bestExam = [...attendedExams].sort((first, second) => second.result.totalScore - first.result.totalScore || first.round - second.round)[0]
  const firstExam = attendedExams[0]
  const latestExam = attendedExams[attendedExams.length - 1]
  const cumulativeTypes = new Map<string, {
    category: string
    detailType: string
    correct: number
    total: number
    cohortWeightedRate: number
    missedQuestions: string[]
  }>()
  for (const exam of attendedExams) {
    for (const type of exam.typeAnalysis) {
      const current = cumulativeTypes.get(type.detailType) ?? {
        category: type.category,
        detailType: type.detailType,
        correct: 0,
        total: 0,
        cohortWeightedRate: 0,
        missedQuestions: [],
      }
      current.correct += type.correct
      current.total += type.total
      current.cohortWeightedRate += type.cohortRate * type.total
      current.missedQuestions.push(...type.missedQuestions.map(question => `${exam.round}차 ${question}번`))
      cumulativeTypes.set(type.detailType, current)
    }
  }
  const typeAnalysis = [...cumulativeTypes.values()].map(type => ({
    category: type.category,
    detailType: type.detailType,
    correct: type.correct,
    total: type.total,
    missedCount: type.total - type.correct,
    accuracy: Math.round(type.correct / type.total * 1000) / 10,
    cohortRate: Math.round(type.cohortWeightedRate / type.total * 10) / 10,
    missedQuestions: type.missedQuestions,
  }))

  return {
    cohortId: cohort.cohortId,
    studentId,
    studentName: access.studentName,
    school: cohort.school,
    grade: cohort.grade,
    terms: examPortalSeed.terms,
    exams,
    typeAnalysis,
    summary: {
      attempts: attendedExams.length,
      totalAverage: Math.round(totalAverage * 10) / 10,
      objectiveAverage: Math.round(objectiveAverage * 10) / 10,
      writtenAverage: Math.round(writtenAverage * 10) / 10,
      cumulativeTopPercent,
      bestRound: bestExam.round,
      bestScore: bestExam.result.totalScore,
      scoreChange: Math.round((latestExam.result.totalScore - firstExam.result.totalScore) * 10) / 10,
    },
  }
}

async function attachActualExamScores<T extends { cohortId: string; studentId: string }>(cumulative: T, academyId: string) {
  const snapshot = await actualExamScoreCollection(academyId)
    .where('studentKey', '==', `${cumulative.cohortId}:${cumulative.studentId}`)
    .get()
  const now = Date.now()
  const actualScores = snapshot.docs.flatMap(document => {
    const value = document.data()
    const expiresAt = value.expiresAt instanceof Timestamp ? value.expiresAt.toMillis() : 0
    const examType = value.examType === '중간고사' || value.examType === '기말고사' ? value.examType : null
    if (expiresAt <= now || !examType || typeof value.score !== 'number') return []
    const storedTermId = typeof value.termId === 'string' ? value.termId : ''
    const linkedTerm = examPortalSeed.terms.find(term => term.termId === storedTermId)
      ?? examPortalSeed.terms.find(term => term.year === Number(value.year) && term.semester === Number(value.semester) && term.examType === examType)
    if (!linkedTerm) return []
    return [{
      id: document.id,
      termId: linkedTerm.termId,
      year: linkedTerm.year,
      semester: linkedTerm.semester,
      examType: linkedTerm.examType as ActualExamType,
      score: Math.round(value.score * 10) / 10,
      updatedAt: value.updatedAt instanceof Timestamp ? value.updatedAt.toMillis() : null,
    }]
  }).sort((first, second) => first.year - second.year || first.semester - second.semester || first.examType.localeCompare(second.examType, 'ko'))
  return { ...cumulative, actualScores }
}

async function cumulativeForPublishedReport(report: FirebaseFirestore.DocumentData, academyId: string) {
  const title = String(report.examTitle ?? '')
  const studentName = String(report.studentName ?? '')
  const cohort = examPortalSeed.cohorts.find(item => title.includes(item.school))
  const access = cohort?.studentAccess.find(item => item.studentName === studentName)
  const cumulative = cohort && access ? buildStudentCumulative(cohort, access.studentId) : null
  return cumulative ? attachActualExamScores(cumulative, academyId) : null
}

export const getStudentReport = onCall<StudentReportAccessInput>({
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 20,
}, async request => {
  const code = normalizeAccessCode(request.data?.code)
  const codeHash = hashAccessCode(code || 'invalid')
  const embeddedAccess = embeddedStudentAccess(codeHash)
  const ipHash = hashViewerAddress(viewerAddress(request))
  const rateRef = db.doc(`studentReportRateLimits/${ipHash}`)
  const accessRef = db.doc(`studentReportAccess/${codeHash}`)
  const now = Timestamp.now()

  const access = await db.runTransaction(async transaction => {
    const [rateSnapshot, accessSnapshot] = await Promise.all([
      transaction.get(rateRef),
      transaction.get(accessRef),
    ])
    const rateData = rateSnapshot.data()
    const lockedUntil = rateData?.lockedUntil instanceof Timestamp ? rateData.lockedUntil : null
    if (lockedUntil && lockedUntil.toMillis() > now.toMillis()) return { status: 'locked' as const }

    const accessData = accessSnapshot.data()
    const expiresAt = accessData?.expiresAt instanceof Timestamp ? accessData.expiresAt : null
    const firestoreValid = isValidAccessCode(code)
      && accessSnapshot.exists
      && accessData?.active === true
      && expiresAt !== null
      && expiresAt.toMillis() > now.toMillis()
      && typeof accessData?.academyId === 'string'
      && typeof accessData?.reportId === 'string'
    const embeddedValid = isValidAccessCode(code) && embeddedAccess !== null

    if (!firestoreValid && !embeddedValid) {
      const windowStartedAt = rateData?.windowStartedAt instanceof Timestamp
        ? rateData.windowStartedAt
        : now
      const withinWindow = now.toMillis() - windowStartedAt.toMillis() <= REPORT_RATE_WINDOW_MS
      const failedAttempts = withinWindow && typeof rateData?.failedAttempts === 'number'
        ? rateData.failedAttempts + 1
        : 1
      transaction.set(rateRef, {
        failedAttempts,
        windowStartedAt: withinWindow ? windowStartedAt : now,
        lastAttemptAt: now,
        expiresAt: retentionExpiresAt(now),
        ...(failedAttempts >= REPORT_MAX_FAILURES
          ? { lockedUntil: Timestamp.fromMillis(now.toMillis() + REPORT_LOCK_MS) }
          : { lockedUntil: null }),
      }, { merge: true })
      return { status: 'invalid' as const }
    }

    transaction.set(rateRef, {
      failedAttempts: 0,
      windowStartedAt: now,
      lastAttemptAt: now,
      lockedUntil: null,
      expiresAt: retentionExpiresAt(now),
    }, { merge: true })
    if (firestoreValid) {
      transaction.set(accessRef, {
        lastAccessedAt: now,
        accessCount: FieldValue.increment(1),
      }, { merge: true })
    }

    return firestoreValid ? {
      status: 'valid' as const,
      source: 'firestore' as const,
      academyId: String(accessData.academyId),
      reportId: String(accessData.reportId),
      expiresAt: expiresAt.toMillis(),
    } : {
      status: 'valid' as const,
      source: 'embedded' as const,
      cohortId: embeddedAccess!.cohort.cohortId,
      studentId: embeddedAccess!.studentId,
    }
  })

  if (access.status === 'locked') {
    throw new HttpsError('resource-exhausted', '입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.')
  }
  if (access.status === 'invalid') throw reportCodeError()

  if (access.source === 'embedded') {
    const cohort = examPortalSeed.cohorts.find(item => item.cohortId === access.cohortId)
    const cumulativeBase = cohort ? buildStudentCumulative(cohort, access.studentId) : null
    const cumulative = cumulativeBase ? await attachActualExamScores(cumulativeBase, 'node-default') : null
    if (!cumulative) throw reportCodeError()
    await db.collection('studentReportViewLogs').add({
      academyId: null,
      reportId: `cumulative:${access.cohortId}:${access.studentId}`,
      ipHash,
      userAgent: String(request.rawRequest.headers['user-agent'] ?? '').slice(0, 300),
      accessedAt: now,
      expiresAt: retentionExpiresAt(now),
    })
    return { expiresAt: null, report: null, cumulative }
  }

  const reportSnapshot = await db.doc(`academies/${access.academyId}/studentReports/${access.reportId}`).get()
  if (!reportSnapshot.exists || reportSnapshot.data()?.published !== true) throw reportCodeError()
  const report = reportSnapshot.data()!

  await db.collection('studentReportViewLogs').add({
    academyId: access.academyId,
    reportId: access.reportId,
    ipHash,
    userAgent: String(request.rawRequest.headers['user-agent'] ?? '').slice(0, 300),
    accessedAt: now,
    expiresAt: retentionExpiresAt(now),
  })

  return {
    expiresAt: access.expiresAt,
    cumulative: await cumulativeForPublishedReport(report, access.academyId),
    report: {
      examId: report.examId,
      examTitle: report.examTitle,
      studentName: report.studentName,
      totalScore: report.totalScore,
      objectiveScore: report.objectiveScore,
      writtenScore: report.writtenScore,
      objectiveTopPercent: rankToTopPercent(report.sourceRank, report.cohortSize),
      totalTopPercent: rankToTopPercent(report.totalScoreRank, report.cohortSize),
      cohortAverages: report.cohortAverages,
      categories: report.categories,
      questions: report.questions,
      strengths: report.strengths,
      priorities: report.priorities,
      dataWarning: report.dataWarning ?? null,
    },
  }
})

export const getTeacherDashboard = onCall<TeacherDashboardInput>({
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 20,
}, async request => {
  const code = normalizeAccessCode(request.data?.code)
  const accessHash = hashTeacherAccessCode(code || 'invalid')
  const masterAccess = isMasterTeacherCode(code, accessHash)
  const cohorts = teacherCohortsForHash(accessHash)
  const ipHash = hashViewerAddress(`teacher:${viewerAddress(request)}`)
  const rateRef = db.doc(`teacherReportRateLimits/${ipHash}`)
  const now = Timestamp.now()

  const status = await db.runTransaction(async transaction => {
    const rateSnapshot = await transaction.get(rateRef)
    const rateData = rateSnapshot.data()
    const lockedUntil = rateData?.lockedUntil instanceof Timestamp ? rateData.lockedUntil : null
    if (lockedUntil && lockedUntil.toMillis() > now.toMillis()) return 'locked' as const

    if ((!isValidAccessCode(code) && !masterAccess) || cohorts.length === 0) {
      const windowStartedAt = rateData?.windowStartedAt instanceof Timestamp
        ? rateData.windowStartedAt
        : now
      const withinWindow = now.toMillis() - windowStartedAt.toMillis() <= REPORT_RATE_WINDOW_MS
      const failedAttempts = withinWindow && typeof rateData?.failedAttempts === 'number'
        ? rateData.failedAttempts + 1
        : 1
      transaction.set(rateRef, {
        failedAttempts,
        windowStartedAt: withinWindow ? windowStartedAt : now,
        lastAttemptAt: now,
        expiresAt: retentionExpiresAt(now),
        ...(failedAttempts >= REPORT_MAX_FAILURES
          ? { lockedUntil: Timestamp.fromMillis(now.toMillis() + REPORT_LOCK_MS) }
          : { lockedUntil: null }),
      }, { merge: true })
      return 'invalid' as const
    }

    transaction.set(rateRef, {
      failedAttempts: 0,
      windowStartedAt: now,
      lastAttemptAt: now,
      lockedUntil: null,
      expiresAt: retentionExpiresAt(now),
    }, { merge: true })
    return 'valid' as const
  })

  if (status === 'locked') {
    throw new HttpsError('resource-exhausted', '입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.')
  }
  if (status === 'invalid' || cohorts.length === 0) {
    throw new HttpsError('permission-denied', '교사용 접근 코드를 확인해 주세요.')
  }

  await db.collection('teacherReportViewLogs').add({
    cohortIds: cohorts.map(cohort => cohort.cohortId),
    teacherLabel: cohorts.length > 1 ? '통합 교사' : cohorts[0].teacherLabel,
    ipHash,
    userAgent: String(request.rawRequest.headers['user-agent'] ?? '').slice(0, 300),
    accessedAt: now,
    expiresAt: retentionExpiresAt(now),
  })

  return {
    terms: examPortalSeed.terms,
    teacher: {
      label: cohorts.length > 1 ? '통합 교사' : cohorts[0].teacherLabel,
      cohortId: cohorts[0].cohortId,
      school: cohorts[0].school,
      grade: cohorts[0].grade,
    },
    exams: cohorts[0].exams,
    cohorts: cohorts.map(cohort => ({
      cohortId: cohort.cohortId,
      school: cohort.school,
      grade: cohort.grade,
      teacherLabel: cohort.teacherLabel,
      exams: cohort.exams,
    })),
  }
})

export const getTeacherStudentReport = onCall<TeacherStudentReportInput>({
  timeoutSeconds: 30,
  memory: '256MiB',
  maxInstances: 20,
}, async request => {
  const code = normalizeAccessCode(request.data?.code)
  const studentId = typeof request.data?.studentId === 'string' ? request.data.studentId.slice(0, 80) : ''
  const accessHash = hashTeacherAccessCode(code || 'invalid')
  const masterAccess = isMasterTeacherCode(code, accessHash)
  const authorizedCohorts = teacherCohortsForHash(accessHash)
  const cohort = authorizedCohorts.find(item => item.studentAccess.some(student => student.studentId === studentId))
  const ipHash = hashViewerAddress(`teacher:${viewerAddress(request)}`)
  const rateRef = db.doc(`teacherReportRateLimits/${ipHash}`)
  const now = Timestamp.now()

  const status = await db.runTransaction(async transaction => {
    const rateSnapshot = await transaction.get(rateRef)
    const rateData = rateSnapshot.data()
    const lockedUntil = rateData?.lockedUntil instanceof Timestamp ? rateData.lockedUntil : null
    if (lockedUntil && lockedUntil.toMillis() > now.toMillis()) return 'locked' as const

    const studentAllowed = cohort?.studentAccess.some(student => student.studentId === studentId) === true
    if ((!isValidAccessCode(code) && !masterAccess) || !cohort || !studentAllowed) {
      const windowStartedAt = rateData?.windowStartedAt instanceof Timestamp ? rateData.windowStartedAt : now
      const withinWindow = now.toMillis() - windowStartedAt.toMillis() <= REPORT_RATE_WINDOW_MS
      const failedAttempts = withinWindow && typeof rateData?.failedAttempts === 'number'
        ? rateData.failedAttempts + 1
        : 1
      transaction.set(rateRef, {
        failedAttempts,
        windowStartedAt: withinWindow ? windowStartedAt : now,
        lastAttemptAt: now,
        expiresAt: retentionExpiresAt(now),
        ...(failedAttempts >= REPORT_MAX_FAILURES
          ? { lockedUntil: Timestamp.fromMillis(now.toMillis() + REPORT_LOCK_MS) }
          : { lockedUntil: null }),
      }, { merge: true })
      return 'invalid' as const
    }

    transaction.set(rateRef, {
      failedAttempts: 0,
      windowStartedAt: now,
      lastAttemptAt: now,
      lockedUntil: null,
      expiresAt: retentionExpiresAt(now),
    }, { merge: true })
    return 'valid' as const
  })

  if (status === 'locked') {
    throw new HttpsError('resource-exhausted', '입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.')
  }
  if (status === 'invalid' || !cohort) {
    throw new HttpsError('permission-denied', '학생 성적표 열람 권한을 확인해 주세요.')
  }

  const cumulativeBase = buildStudentCumulative(cohort, studentId, masterAccess)
  if (!cumulativeBase) throw new HttpsError('not-found', '학생 성적표를 찾을 수 없습니다.')
  const cumulative = await attachActualExamScores(cumulativeBase, 'node-default')

  await db.collection('teacherReportViewLogs').add({
    cohortId: cohort.cohortId,
    teacherLabel: cohort.teacherLabel,
    studentId,
    viewType: 'student-detail',
    ipHash,
    userAgent: String(request.rawRequest.headers['user-agent'] ?? '').slice(0, 300),
    accessedAt: now,
    expiresAt: retentionExpiresAt(now),
  })

  return { cumulative }
})

export const getActualExamScoreAdminData = onCall<ActualExamScoreAdminInput>({
  timeoutSeconds: 30,
  memory: '256MiB',
}, async request => {
  const admin = await authorizeAdmin(request.auth, request.data?.academyId)
  const snapshot = await actualExamScoreCollection(admin.academyId).get()
  const now = Date.now()
  const scores = snapshot.docs.flatMap(document => {
    const value = document.data()
    const expiresAt = value.expiresAt instanceof Timestamp ? value.expiresAt.toMillis() : 0
    if (expiresAt <= now || typeof value.score !== 'number') return []
    const storedTermId = typeof value.termId === 'string' ? value.termId : ''
    const examType = value.examType === '중간고사' || value.examType === '기말고사' ? value.examType : null
    const linkedTerm = examPortalSeed.terms.find(term => term.termId === storedTermId)
      ?? (examType ? examPortalSeed.terms.find(term => term.year === Number(value.year) && term.semester === Number(value.semester) && term.examType === examType) : undefined)
    if (!linkedTerm) return []
    return [{
      id: document.id,
      cohortId: String(value.cohortId ?? ''),
      studentId: String(value.studentId ?? ''),
      termId: linkedTerm.termId,
      year: linkedTerm.year,
      semester: linkedTerm.semester,
      examType: linkedTerm.examType,
      score: Math.round(value.score * 10) / 10,
      updatedAt: value.updatedAt instanceof Timestamp ? value.updatedAt.toMillis() : null,
    }]
  })
  return {
    retentionDays: REPORT_ACCESS_DAYS,
    terms: examPortalSeed.terms,
    cohorts: examPortalSeed.cohorts.map(cohort => ({
      cohortId: cohort.cohortId,
      school: cohort.school,
      grade: cohort.grade,
      termIds: [...new Set(cohort.exams.map(exam => exam.termId))],
      students: cohort.studentAccess.map(student => ({ studentId: student.studentId, studentName: student.studentName })),
    })),
    scores,
  }
})

export const saveActualExamScores = onCall<SaveActualExamScoresInput>({
  timeoutSeconds: 30,
  memory: '256MiB',
}, async request => {
  const admin = await authorizeAdmin(request.auth, request.data?.academyId)
  const cohortId = typeof request.data?.cohortId === 'string' ? request.data.cohortId : ''
  const cohort = examPortalSeed.cohorts.find(item => item.cohortId === cohortId)
  const termId = typeof request.data?.termId === 'string' ? request.data.termId : ''
  const term = examPortalSeed.terms.find(item => item.termId === termId)
  const rawExamType = String(term?.examType ?? '')
  const examType: ActualExamType | null = rawExamType === '중간고사' || rawExamType === '기말고사' ? rawExamType : null
  const rawScores = Array.isArray(request.data?.scores) ? request.data.scores : []
  if (!cohort || !term || !examType || !cohort.exams.some(exam => exam.termId === termId)) {
    throw new HttpsError('invalid-argument', '분석파일이 등록된 학교와 시험 대분류를 선택해 주세요.')
  }
  if (rawScores.length > 300) throw new HttpsError('invalid-argument', '한 번에 저장할 수 있는 학생 수를 초과했습니다.')

  const allowedStudents = new Set<string>(cohort.studentAccess.map(student => student.studentId))
  const normalizedScores = rawScores.map(item => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const studentId = typeof value.studentId === 'string' ? value.studentId : ''
    const rawScore = value.score
    const score = rawScore === null || rawScore === '' ? null : Number(rawScore)
    if (!allowedStudents.has(studentId) || (score !== null && (!Number.isFinite(score) || score < 0 || score > 100))) {
      throw new HttpsError('invalid-argument', '학생별 점수는 0점부터 100점까지 입력해 주세요.')
    }
    return { studentId, score: score === null ? null : Math.round(score * 10) / 10 }
  })

  const now = Timestamp.now()
  const batch = db.batch()
  let savedCount = 0
  let deletedCount = 0
  for (const item of normalizedScores) {
    const documentId = actualExamScoreDocumentId(cohortId, item.studentId, termId)
    const reference = actualExamScoreCollection(admin.academyId).doc(documentId)
    if (item.score === null) {
      batch.delete(reference)
      deletedCount += 1
      continue
    }
    const student = cohort.studentAccess.find(candidate => candidate.studentId === item.studentId)!
    batch.set(reference, {
      academyId: admin.academyId,
      cohortId,
      studentKey: `${cohortId}:${item.studentId}`,
      studentId: item.studentId,
      studentName: student.studentName,
      school: cohort.school,
      grade: cohort.grade,
      termId,
      year: term.year,
      semester: term.semester,
      examType,
      score: item.score,
      updatedAt: now,
      updatedBy: { uid: admin.uid, email: admin.email, displayName: admin.displayName },
      expiresAt: retentionExpiresAt(now),
    }, { merge: true })
    savedCount += 1
  }
  await batch.commit()
  logger.info('Actual exam scores saved', { academyId: admin.academyId, cohortId, termId, year: term.year, semester: term.semester, examType, savedCount, deletedCount })
  return { savedCount, deletedCount, expiresAt: retentionExpiresAt(now).toMillis() }
})

async function purgeExpiredQuery(query: FirebaseFirestore.Query): Promise<number> {
  let deleted = 0
  while (true) {
    const snapshot = await query.limit(400).get()
    if (snapshot.empty) return deleted
    const batch = db.batch()
    snapshot.docs.forEach(document => batch.delete(document.ref))
    await batch.commit()
    deleted += snapshot.size
    if (snapshot.size < 400) return deleted
  }
}

export const purgeExpiredReportData = onSchedule({
  schedule: 'every day 03:15',
  timeZone: 'Asia/Seoul',
  timeoutSeconds: 300,
  memory: '256MiB',
}, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - REPORT_RETENTION_MS)
  const targets: Array<[string, FirebaseFirestore.Query]> = [
    ['studentReports', db.collectionGroup('studentReports').where('publishedAt', '<=', cutoff)],
    ['studentReportAccess', db.collection('studentReportAccess').where('createdAt', '<=', cutoff)],
    ['studentReportViewLogs', db.collection('studentReportViewLogs').where('accessedAt', '<=', cutoff)],
    ['studentReportRateLimits', db.collection('studentReportRateLimits').where('lastAttemptAt', '<=', cutoff)],
    ['reportPortalRateLimits', db.collection('reportPortalRateLimits').where('lastAttemptAt', '<=', cutoff)],
    ['teacherReportViewLogs', db.collection('teacherReportViewLogs').where('accessedAt', '<=', cutoff)],
    ['teacherReportRateLimits', db.collection('teacherReportRateLimits').where('lastAttemptAt', '<=', cutoff)],
    ['actualExamScores', db.collectionGroup('actualExamScores').where('expiresAt', '<=', Timestamp.now())],
  ]
  const deleted: Record<string, number> = {}
  for (const [name, query] of targets) deleted[name] = await purgeExpiredQuery(query)
  logger.info('Expired report data purged', { cutoff: cutoff.toDate().toISOString(), deleted })
})

export const publishBaekhyeonStudentReports = onCall<PublishStudentReportsInput>({
  timeoutSeconds: 60,
  memory: '512MiB',
}, async request => {
  const admin = await authorizeAdmin(request.auth, request.data?.academyId)
  const rotateCodes = request.data?.rotateCodes === true
  const reportRefs = baekhyeonReportSeed.reports.map(report =>
    db.doc(`academies/${admin.academyId}/studentReports/${baekhyeonReportSeed.exam.examId}-${report.sourceReportId}`)
  )
  const existingSnapshots = await db.getAll(...reportRefs)
  const existingById = new Map(existingSnapshots.map(snapshot => [snapshot.id, snapshot.data()]))
  const batch = db.batch()
  const issuedCodes: Array<{ reportId: string; studentName: string; accessCode: string }> = []
  let existingCount = 0
  const expiresAt = Timestamp.fromMillis(Date.now() + REPORT_ACCESS_DAYS * 24 * 60 * 60 * 1000)
  const publishedAt = Timestamp.now()

  baekhyeonReportSeed.reports.forEach((report, index) => {
    const reportRef = reportRefs[index]
    const existing = existingById.get(reportRef.id)
    const previousHash = typeof existing?.accessHash === 'string' ? existing.accessHash : ''
    let accessHash = previousHash

    if (!previousHash || rotateCodes) {
      if (previousHash) batch.delete(db.doc(`studentReportAccess/${previousHash}`))
      const accessCode = createAccessCode()
      accessHash = hashAccessCode(accessCode)
      batch.create(db.doc(`studentReportAccess/${accessHash}`), {
        academyId: admin.academyId,
        reportId: reportRef.id,
        active: true,
        expiresAt,
        createdAt: publishedAt,
        lastAccessedAt: null,
        accessCount: 0,
      })
      issuedCodes.push({ reportId: reportRef.id, studentName: report.studentName, accessCode })
    } else {
      existingCount += 1
      batch.set(db.doc(`studentReportAccess/${previousHash}`), {
        active: true,
        expiresAt,
      }, { merge: true })
    }

    batch.set(reportRef, {
      ...report,
      academyId: admin.academyId,
      examId: baekhyeonReportSeed.exam.examId,
      examTitle: baekhyeonReportSeed.exam.title,
      accessHash,
      published: true,
      expiresAt,
      publishedAt: existing?.publishedAt ?? publishedAt,
      updatedAt: publishedAt,
      publishedBy: { uid: admin.uid, email: admin.email, displayName: admin.displayName },
    }, { merge: true })
  })

  await batch.commit()
  logger.info('Student reports published', {
    academyId: admin.academyId,
    reportCount: baekhyeonReportSeed.reports.length,
    issuedCodeCount: issuedCodes.length,
    rotateCodes,
  })
  return {
    examId: baekhyeonReportSeed.exam.examId,
    examTitle: baekhyeonReportSeed.exam.title,
    publishedCount: baekhyeonReportSeed.reports.length,
    existingCount,
    issuedCodes,
    expiresAt: expiresAt.toMillis(),
  }
})
