export interface StudentReportCategory {
  category: string
  correct: number
  total: number
  cohortRate: number
  missedQuestions: number[]
}

export interface StudentReportQuestion {
  number: number
  category: string
  detailType: string
  topic: string
  correctAnswer: string
  studentAnswer: string
  correct: boolean
  cohortRate: number
}

export interface StudentReportData {
  examId: string
  examTitle: string
  studentName: string
  totalScore: number
  objectiveScore: number
  writtenScore: number
  objectiveTopPercent: number
  totalTopPercent: number
  cohortAverages: {
    total: number
    objective: number
    written: number
  }
  categories: StudentReportCategory[]
  questions: StudentReportQuestion[]
  strengths: string[]
  priorities: number[]
  dataWarning: string | null
}

export interface StudentReportResponse {
  expiresAt: number | null
  report: StudentReportData | null
  cumulative: StudentCumulativeReportData | null
}

export interface StudentCumulativeExam {
  examId: string
  termId: string
  round: number
  title: string
  averages: {
    total: number
    objective: number
    written: number
  }
  attended: boolean
  result: {
    totalScore: number
    objectiveScore: number
    writtenScore: number
    topPercent: number
  } | null
  typeAnalysis: StudentTypeAnalysis[]
  scoreDistribution: {
    highest: number
    lowest: number
    studentBand: string | null
    bins: Array<{
      label: string
      percent: number
    }>
  }
}

export interface StudentTypeAnalysis {
  category: string
  detailType: string
  correct: number
  total: number
  missedCount?: number
  accuracy?: number
  cohortRate: number
  missedQuestions: Array<number | string>
}

export interface StudentCumulativeReportData {
  cohortId: string
  studentId: string
  studentName: string
  school: string
  grade: number
  terms: TeacherReportTerm[]
  exams: StudentCumulativeExam[]
  typeAnalysis: StudentTypeAnalysis[]
  actualScores: ActualExamScore[]
  summary: {
    attempts: number
    totalAverage: number
    objectiveAverage: number
    writtenAverage: number
    cumulativeTopPercent: number
    bestRound: number
    bestScore: number
    scoreChange: number
  }
}

export interface ActualExamScore {
  id: string
  termId: string
  year: number
  semester: number
  examType: '중간고사' | '기말고사'
  score: number
  updatedAt: number | null
}

export interface TeacherReportTerm {
  termId: string
  year: number
  semester: number
  examType: string
  label: string
}

export interface TeacherReportStudent {
  studentId: string
  studentName: string
  totalScore: number
  objectiveScore: number
  writtenScore: number
  rank: number
  topPercent: number
}

export interface TeacherReportExam {
  examId: string
  termId: string
  round: number
  title: string
  averages: {
    total: number
    objective: number
    written: number
  }
  students: TeacherReportStudent[]
}

export interface TeacherDashboardResponse {
  terms: TeacherReportTerm[]
  teacher: {
    label: string
    cohortId: string
    school: string
    grade: number
  }
  exams: TeacherReportExam[]
  cohorts: Array<{
    cohortId: string
    school: string
    grade: number
    teacherLabel: string
    exams: TeacherReportExam[]
  }>
}

export interface TeacherStudentReportResponse {
  cumulative: StudentCumulativeReportData
}
