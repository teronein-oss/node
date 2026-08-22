import { collection, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { isDefaultAcademy, normalizeAcademyId } from './academy'

export const academyDoc = (academyId: string) =>
  doc(db, 'academies', normalizeAcademyId(academyId))

export const registrationsCollection = (academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? collection(db, 'registrations')
    : collection(db, 'academies', normalizeAcademyId(academyId), 'registrations')

export const registrationDoc = (uid: string, academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'registrations', uid)
    : doc(db, 'academies', normalizeAcademyId(academyId), 'registrations', uid)

export const userDoc = (uid: string, academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'users', uid)
    : doc(db, 'academies', normalizeAcademyId(academyId), 'users', uid)

export const configDoc = (academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'config', 'sharedData')
    : doc(db, 'academies', normalizeAcademyId(academyId), 'config', 'sharedData')

export const appDataCollection = (academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? collection(db, 'appData')
    : collection(db, 'academies', normalizeAcademyId(academyId), 'appData')

export const appDataDoc = (uid: string, academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'appData', uid)
    : doc(db, 'academies', normalizeAcademyId(academyId), 'appData', uid)

export const homeworkDataDoc = (uid: string, academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'homeworkData', uid)
    : doc(db, 'academies', normalizeAcademyId(academyId), 'homeworkData', uid)

export const sharedStudentRostersCollection = (academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? collection(db, 'sharedStudentRosters')
    : collection(db, 'academies', normalizeAcademyId(academyId), 'sharedStudentRosters')

export const sharedStudentRosterDoc = (uid: string, academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'sharedStudentRosters', uid)
    : doc(db, 'academies', normalizeAcademyId(academyId), 'sharedStudentRosters', uid)

export const studentDashboardRowsCollection = (academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? collection(db, 'studentDashboardRows')
    : collection(db, 'academies', normalizeAcademyId(academyId), 'studentDashboardRows')

export const studentDashboardRowDoc = (rowId: string, academyId?: string | null) =>
  isDefaultAcademy(academyId)
    ? doc(db, 'studentDashboardRows', rowId)
    : doc(db, 'academies', normalizeAcademyId(academyId), 'studentDashboardRows', rowId)

// 문자 발송 기록은 Cloud Functions에서만 쓰고, 관리자 화면에서는 읽기만 합니다.
// 기본 학원을 포함해 항상 academy 하위에 저장해 테넌트 경계를 명확히 유지합니다.
export const messageLogsCollection = (academyId: string) =>
  collection(db, 'academies', normalizeAcademyId(academyId), 'messageLogs')
