export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export type WeeklyFrequency = 1 | 2 | 3

export interface Class {
  id: string
  name: string
  days: string
  weeklyFrequency?: WeeklyFrequency
  weekdays?: WeekdayKey[]
}

export interface NoticeItem {
  id: string
  message: string
  completed: boolean
  deadline?: string  // YYYY-MM-DD
}

export type WithdrawalReason =
  | '방학 휴원'
  | '성적불만'
  | '개인학습'
  | '관리부족'
  | '성적상승 후 퇴원'
  | '알 수 없음'

export interface Student {
  id: string
  name: string
  classId: string
  active: boolean
  registeredAt?: string
  registeredByUid?: string
  registeredByName?: string
  withdrawalReason?: WithdrawalReason
  withdrawnAt?: string
  withdrawnByUid?: string
  withdrawnByName?: string
}

export interface ScoreColumn {
  id: string
  name: string
  mode?: '점수' | '개수'
  total?: number
  threshold?: number
  createdAt: string
}

export interface GradeRecord {
  id: string
  studentId: string
  sessionNum: number       // 주단위 회차 (1, 2, 3...)
  weekStart: string        // 해당 주 월요일 YYYY-MM-DD
  vocabScore: number | null
  dailyTestScore: number | null
  extras: Record<string, number | null>   // ScoreColumn id → 점수
  homeworkDone: HomeworkStatus
  attendance: '출석' | '결석' | null      // null = 출석 (기본값)
  createdAt: string
}

export interface RetestRecord {
  id: string
  studentId: string
  sessionNum: number
  type: string   // 'vocab' | 'daily' | ScoreColumn.id
  originalScore: number
  retestScore: number | null
  passed: boolean | null
  scheduledNote: string    // 재시험 일정 메모
  retestDate?: string      // YYYY-MM-DD 재시험 날짜
  createdAt: string
}

export interface HomeworkItem {
  id: string
  text: string
  done: boolean
  studentStatuses?: { studentId: string; status: '제출' | '미흡' | '미제출' | '재확인완료' }[]
}

export interface HomeworkAssignment {
  id: string
  classId: string
  sessionNum: number
  weekStart: string
  description: string
  items?: HomeworkItem[]
  recheckDates?: { studentId: string; date: string }[]   // 미흡/미제출 학생별 재확인 날짜 YYYY-MM-DD
  createdAt: string
}

export type HomeworkStatus = '제출' | '미흡' | '재확인완료' | '결석' | null

export interface SessionScope {
  id: string
  classId: string
  sessionNum: number
  vocabRange: string
  dailyRange: string
  createdAt: string
}

export type FilterType = 'all' | 'retest' | 'no-homework'

export interface ClinicSchedule {
  id: string
  studentId: string
  date: string        // YYYY-MM-DD
  time: string        // HH:MM
  createdAt: string
}

export interface SessionTestConfig {
  sessionNum: number
  classId?: string
  vocabMode: '점수' | '개수'
  vocabTotal: number
  vocabThreshold: number
  dailyMode: '점수' | '개수'
  dailyTotal: number
  dailyThreshold: number
  vocabName?: string
  dailyName?: string
  scoreColumns?: ScoreColumn[]
}

export interface ExamInfo {
  classId: string
  semester: string   // '1학기 중간' | '1학기 기말' | '2학기 중간' | '2학기 기말'
  subject: string    // 과목
  examDate: string   // 시험일 YYYY-MM-DD
  examScope: string  // 시험범위
  updatedAt: string
}

export interface ScheduleEvent {
  id: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  time?: string      // HH:MM (24h), optional
  title: string
  type: 'personal' | 'all'
  completed: boolean
  createdAt: string
}

export interface WeeklyProgress {
  id: string
  classId: string
  sessionNum: number
  content: string    // 진도 내용
  memo: string
  createdAt: string
}
