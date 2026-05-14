export interface Class {
  id: string
  name: string
  days: 'mon-fri' | 'tue-thu' | 'wed-sat'
}

export interface NoticeItem {
  id: string
  message: string
  completed: boolean
  deadline?: string  // YYYY-MM-DD
}

export interface Student {
  id: string
  name: string
  classId: string
  active: boolean
}

export interface ScoreColumn {
  id: string
  name: string
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
  type: 'vocab' | 'daily'
  originalScore: number
  retestScore: number | null
  passed: boolean | null
  scheduledNote: string    // 재시험 일정 메모
  createdAt: string
}

export interface HomeworkAssignment {
  id: string
  classId: string
  sessionNum: number
  weekStart: string
  description: string
  createdAt: string
}

export type HomeworkStatus = '제출' | '미제출' | '미흡' | '재확인완료' | '결석' | null

export interface SessionScope {
  id: string
  classId: string
  sessionNum: number
  vocabRange: string
  dailyRange: string
  createdAt: string
}

export type FilterType = 'all' | 'retest' | 'no-homework'

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
