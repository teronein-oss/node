import type {
  ActualExamScore,
  StudentCumulativeExam,
  StudentCumulativeReportData,
  StudentTypeAnalysis,
  TeacherReportTerm,
} from '../types/studentReport'

type SampleLevel = '상위권' | '중위권' | '하위권'

interface SampleStudentBlueprint {
  code: string
  studentId: string
  studentName: string
  level: SampleLevel
  baseScore: number
  baseTopPercent: number
  termGrowth: number[]
  actualScores: number[]
  typeOffsets: number[]
}

const TERMS: TeacherReportTerm[] = [
  { termId: 'g1-s1-mid', year: 2025, semester: 1, examType: '중간고사', label: '1학년 1학기 영어 중간고사' },
  { termId: 'g1-s1-final', year: 2025, semester: 1, examType: '기말고사', label: '1학년 1학기 영어 기말고사' },
  { termId: 'g1-s2-mid', year: 2025, semester: 2, examType: '중간고사', label: '1학년 2학기 영어 중간고사' },
  { termId: 'g1-s2-final', year: 2025, semester: 2, examType: '기말고사', label: '1학년 2학기 영어 기말고사' },
  { termId: 'g2-s1-mid', year: 2026, semester: 1, examType: '중간고사', label: '2학년 1학기 영어 중간고사' },
  { termId: 'g2-s1-final', year: 2026, semester: 1, examType: '기말고사', label: '2학년 1학기 영어 기말고사' },
  { termId: 'g2-s2-mid', year: 2026, semester: 2, examType: '중간고사', label: '2학년 2학기 영어 중간고사' },
  { termId: 'g2-s2-final', year: 2026, semester: 2, examType: '기말고사', label: '2학년 2학기 영어 기말고사' },
]

const STUDENTS: SampleStudentBlueprint[] = [
  {
    code: 'LEE7A526',
    studentId: 'sample-lee-top',
    studentName: '이X은',
    level: '상위권',
    baseScore: 92,
    baseTopPercent: 5,
    termGrowth: [0, 1, 0, 1, 1, 2, 2, 4],
    actualScores: [94, 95, 93, 96, 95, 97, 96, 98],
    typeOffsets: [2, 5, 3, -1, 1],
  },
  {
    code: 'KMS6B427',
    studentId: 'sample-kim-middle',
    studentName: '김X성',
    level: '중위권',
    baseScore: 72,
    baseTopPercent: 49,
    termGrowth: [0, 1, 1, 2, 2, 3, 3, 4],
    actualScores: [73, 74, 75, 76, 77, 76, 79, 80],
    typeOffsets: [3, -4, 4, -2, 1],
  },
  {
    code: 'HSE8C329',
    studentId: 'sample-oh-lower',
    studentName: '오X세',
    level: '하위권',
    baseScore: 47,
    baseTopPercent: 85,
    termGrowth: [0, 1, 2, 3, 4, 5, 6, 7],
    actualScores: [49, 50, 52, 53, 55, 56, 58, 60],
    typeOffsets: [3, -6, 5, -3, 1],
  },
]

const ROUND_SCORE_OFFSETS = [-4, -2, 0, 1, 3]
const ROUND_PERCENT_OFFSETS = [4, 2, 1, 0, -2]
const ANALYSIS_TYPES = [
  { category: '어휘', detailType: '어휘 의미와 문맥 추론' },
  { category: '문법', detailType: '문법·어법 판단' },
  { category: '독해', detailType: '주제·요지와 세부 내용' },
  { category: '추론', detailType: '빈칸 추론과 문장 배열' },
  { category: '대화', detailType: '대화문과 실용문 이해' },
]

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function average(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1) * 10) / 10
}

function splitScore(totalScore: number) {
  const writtenScore = clamp(Math.round(totalScore * 0.2), 0, 20)
  return {
    objectiveScore: totalScore - writtenScore,
    writtenScore,
  }
}

function studentBand(score: number) {
  if (score >= 90) return '90~100'
  if (score >= 80) return '80~89'
  if (score >= 70) return '70~79'
  if (score >= 60) return '60~69'
  return '0~59'
}

function makeTypeAnalysis(score: number, typeOffsets: number[], questionOffset = 0): StudentTypeAnalysis[] {
  return ANALYSIS_TYPES.map((type, index) => {
    const accuracy = clamp(score + typeOffsets[index] + ((questionOffset + index) % 3) - 1, 18, 100)
    const total = 4
    const correct = clamp(Math.round(accuracy / 25), 0, total)
    const missedCount = total - correct
    return {
      ...type,
      correct,
      total,
      missedCount,
      accuracy,
      cohortRate: clamp(66 + index * 1.8 + (questionOffset % 4), 0, 100),
      missedQuestions: Array.from(
        { length: missedCount },
        (_, missedIndex) => index * 4 + missedIndex + 1,
      ),
    }
  })
}

function makeExam(
  student: SampleStudentBlueprint,
  term: TeacherReportTerm,
  termIndex: number,
  roundIndex: number,
): StudentCumulativeExam {
  const totalScore = clamp(
    student.baseScore + student.termGrowth[termIndex] + ROUND_SCORE_OFFSETS[roundIndex] + ((termIndex + roundIndex) % 3) - 1,
    28,
    100,
  )
  const { objectiveScore, writtenScore } = splitScore(totalScore)
  const cohortTotal = Math.round((68.4 + termIndex * 0.5 + roundIndex * 0.35) * 10) / 10
  const cohortWritten = Math.round(cohortTotal * 0.2 * 10) / 10

  return {
    examId: `${term.termId}-mock-${roundIndex + 1}`,
    termId: term.termId,
    round: roundIndex + 1,
    title: `${term.label} 대비 ${roundIndex + 1}차 모의고사`,
    averages: {
      total: cohortTotal,
      objective: Math.round((cohortTotal - cohortWritten) * 10) / 10,
      written: cohortWritten,
    },
    attended: true,
    result: {
      totalScore,
      objectiveScore,
      writtenScore,
      topPercent: clamp(
        student.baseTopPercent + ROUND_PERCENT_OFFSETS[roundIndex] - Math.floor(student.termGrowth[termIndex] / 2),
        1,
        97,
      ),
    },
    typeAnalysis: makeTypeAnalysis(totalScore, student.typeOffsets, termIndex + roundIndex),
    scoreDistribution: {
      highest: Math.min(100, 97 + ((termIndex + roundIndex) % 4)),
      lowest: 31 + ((termIndex * 2 + roundIndex) % 8),
      studentBand: studentBand(totalScore),
      bins: [
        { label: '0~59', percent: 13 },
        { label: '60~69', percent: 21 },
        { label: '70~79', percent: 30 },
        { label: '80~89', percent: 24 },
        { label: '90~100', percent: 12 },
      ],
    },
  }
}

function makeActualScore(
  student: SampleStudentBlueprint,
  term: TeacherReportTerm,
  termIndex: number,
): ActualExamScore {
  return {
    id: `${term.termId}-actual`,
    termId: term.termId,
    year: term.year,
    semester: term.semester,
    examType: term.examType as ActualExamScore['examType'],
    score: student.actualScores[termIndex],
    updatedAt: Date.UTC(2026, 8, 18),
  }
}

function buildStudentReport(student: SampleStudentBlueprint): StudentCumulativeReportData {
  const exams = TERMS.flatMap((term, termIndex) => (
    ROUND_SCORE_OFFSETS.map((_, roundIndex) => makeExam(student, term, termIndex, roundIndex))
  ))
  const totalScores = exams.map(exam => exam.result?.totalScore ?? 0)
  const objectiveScores = exams.map(exam => exam.result?.objectiveScore ?? 0)
  const writtenScores = exams.map(exam => exam.result?.writtenScore ?? 0)
  const topPercents = exams.map(exam => exam.result?.topPercent ?? 100)
  const bestExam = exams.reduce((best, exam) => (
    (exam.result?.totalScore ?? 0) > (best.result?.totalScore ?? 0) ? exam : best
  ))

  return {
    cohortId: 'node-english-samples',
    studentId: student.studentId,
    studentName: student.studentName,
    school: `가상고등학교 · 영어 ${student.level}`,
    grade: 2,
    terms: TERMS,
    exams,
    typeAnalysis: makeTypeAnalysis(average(totalScores), student.typeOffsets, 2),
    actualScores: TERMS.map((term, termIndex) => makeActualScore(student, term, termIndex)),
    summary: {
      attempts: exams.length,
      totalAverage: average(totalScores),
      objectiveAverage: average(objectiveScores),
      writtenAverage: average(writtenScores),
      cumulativeTopPercent: Math.round(average(topPercents)),
      bestRound: bestExam.round,
      bestScore: bestExam.result?.totalScore ?? 0,
      scoreChange: Math.round((totalScores[totalScores.length - 1] - totalScores[0]) * 10) / 10,
    },
  }
}

const REPORTS_BY_CODE = new Map(
  STUDENTS.map(student => [student.code, buildStudentReport(student)]),
)

export function getSampleEnglishReport(code: string) {
  return REPORTS_BY_CODE.get(code) ?? null
}
