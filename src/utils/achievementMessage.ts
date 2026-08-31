import type { HomeworkStatus } from '../types'

export interface AchievementScoreItem {
  label: string
  score: string
  total: number
  mode: '점수' | '개수'
  threshold?: number
  retestStatus?: '대상' | '완료'
}

export interface AchievementHomeworkItem {
  text: string
  status: '제출' | '미흡' | '미제출' | '재확인완료'
}

interface BuildAchievementMessageOptions {
  date: string
  studentName: string
  absent: boolean
  scores: AchievementScoreItem[]
  homeworkItems: AchievementHomeworkItem[]
  homeworkStatus?: HomeworkStatus
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function formatAchievementDate(date: string) {
  const value = new Date(`${date}T00:00:00`)
  return `${value.getMonth() + 1}/${value.getDate()} (${WEEKDAYS[value.getDay()]})`
}

export function buildVocabMessageLabel(name: string, range: string) {
  const trimmedRange = range.trim()
  if (!trimmedRange) return name
  if (/^단어\s*시험$/.test(name)) {
    return trimmedRange.includes('단어') ? trimmedRange : `${trimmedRange} 단어`
  }
  return `${trimmedRange} ${name}`
}

function formatScore({ score, total, mode, threshold, retestStatus }: AchievementScoreItem, absent: boolean) {
  if (absent) return '결석'
  const unit = mode === '개수' ? '개' : '점'
  const result = score === '' ? '미입력' : `${score}/${total}${unit}`
  const details: string[] = []
  if (threshold && threshold > 0) details.push(`커트라인 ${threshold}${unit}`)
  if (retestStatus) details.push(`재시험 ${retestStatus}`)
  return details.length > 0 ? `${result} (${details.join(' / ')})` : result
}

function formatHomework(
  items: AchievementHomeworkItem[],
  status: HomeworkStatus | undefined,
  absent: boolean
) {
  if (absent) return '결석'
  if (items.length > 0) {
    return items.map(item => `${item.text} (${item.status})`).join(', ')
  }
  if (status === '제출') return '완료'
  if (status === '미흡') return '미흡 또는 미완료'
  if (status === '재확인완료') return '재확인 완료'
  if (status === '결석') return '결석'
  return '미입력'
}

export function buildAchievementMessage({
  date,
  studentName,
  absent,
  scores,
  homeworkItems,
  homeworkStatus,
}: BuildAchievementMessageOptions) {
  const resultLines = scores.map(
    (item, index) => `${index + 1}. ${item.label} : ${formatScore(item, absent)}`
  )
  resultLines.push(
    `${resultLines.length + 1}. 숙제 : ${formatHomework(homeworkItems, homeworkStatus, absent)}`
  )

  return `${formatAchievementDate(date)} ${studentName} 학생 성취도 결과 안내드립니다.

${resultLines.join('\n\n')}

*숙제 미완료 부분은 매 수업시간마다 담당 강사와 조교의 지속적인 케어를 통해, 체크/관리되고 있습니다.

**반복적으로 숙제가 미완료 상태인 경우, 학생과 먼저 학습상담을 진행한 후, 담당 강사가 직접 학부모님께 전화드리도록 하겠습니다.`
}
