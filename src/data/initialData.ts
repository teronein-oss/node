import type { Class, Student } from '../types'

export const INITIAL_CLASSES: Class[] = [
  { id: 'mon-fri-a', name: '청덕2 S2', days: 'mon-fri' },
  { id: 'mon-fri-b', name: '백현2 A2', days: 'mon-fri' },
  { id: 'tue-thu-a', name: '청덕2 S1', days: 'tue-thu' },
  { id: 'tue-thu-b', name: '백현2 A1', days: 'tue-thu' },
]

export const CLASS_NAME_MIGRATION: Record<string, string> = {
  '월금A반': '청덕2 S2',
  '월금B반': '백현2 A2',
  '화목A반': '청덕2 S1',
  '화목B반': '백현2 A1',
}

export const INITIAL_STUDENTS: Student[] = [
  // 청덕2 S2
  { id: 's01', name: '권태현', classId: 'mon-fri-a', active: true },
  { id: 's02', name: '금서연', classId: 'mon-fri-a', active: true },
  { id: 's03', name: '김경준', classId: 'mon-fri-a', active: true },
  { id: 's04', name: '김나은', classId: 'mon-fri-a', active: true },
  { id: 's05', name: '김도건', classId: 'mon-fri-a', active: true },
  { id: 's06', name: '박민지', classId: 'mon-fri-a', active: true },
  { id: 's07', name: '배민지', classId: 'mon-fri-a', active: true },
  { id: 's08', name: '신지윤', classId: 'mon-fri-a', active: true },
  { id: 's09', name: '이도영', classId: 'mon-fri-a', active: true },
  { id: 's10', name: '이승주', classId: 'mon-fri-a', active: true },
  { id: 's11', name: '황채원', classId: 'mon-fri-a', active: true },
  // 백현2 A2
  { id: 's12', name: '강지환', classId: 'mon-fri-b', active: true },
  { id: 's13', name: '김은서', classId: 'mon-fri-b', active: true },
  { id: 's14', name: '백윤재', classId: 'mon-fri-b', active: true },
  { id: 's15', name: '서정인', classId: 'mon-fri-b', active: true },
  { id: 's16', name: '양해준', classId: 'mon-fri-b', active: true },
  { id: 's17', name: '오민석', classId: 'mon-fri-b', active: true },
  { id: 's18', name: '오은준', classId: 'mon-fri-b', active: true },
  { id: 's19', name: '이상민', classId: 'mon-fri-b', active: true },
  { id: 's20', name: '이현서', classId: 'mon-fri-b', active: true },
  { id: 's21', name: '이현호', classId: 'mon-fri-b', active: true },
  { id: 's22', name: '정아영', classId: 'mon-fri-b', active: true },
  { id: 's23', name: '조민서', classId: 'mon-fri-b', active: true },
  { id: 's24', name: '조유림', classId: 'mon-fri-b', active: true },
  // 청덕2 S1
  { id: 's25', name: '권원영', classId: 'tue-thu-a', active: true },
  { id: 's26', name: '김진규', classId: 'tue-thu-a', active: true },
  { id: 's27', name: '도연주', classId: 'tue-thu-a', active: true },
  { id: 's28', name: '류지환', classId: 'tue-thu-a', active: true },
  { id: 's29', name: '박준용', classId: 'tue-thu-a', active: true },
  { id: 's30', name: '손지우', classId: 'tue-thu-a', active: true },
  { id: 's31', name: '오초아', classId: 'tue-thu-a', active: true },
  { id: 's32', name: '유제현', classId: 'tue-thu-a', active: true },
  { id: 's33', name: '윤이솔', classId: 'tue-thu-a', active: true },
  { id: 's34', name: '이유주', classId: 'tue-thu-a', active: true },
  { id: 's35', name: '이효준', classId: 'tue-thu-a', active: true },
  { id: 's36', name: '정우진', classId: 'tue-thu-a', active: true },
  { id: 's37', name: '정재훈', classId: 'tue-thu-a', active: true },
  { id: 's38', name: '조민선', classId: 'tue-thu-a', active: true },
  { id: 's39', name: '조연우', classId: 'tue-thu-a', active: true },
  { id: 's40', name: '한제윤', classId: 'tue-thu-a', active: true },
  // 백현2 A1
  { id: 's41', name: '김보경', classId: 'tue-thu-b', active: true },
  { id: 's42', name: '김아름', classId: 'tue-thu-b', active: true },
  { id: 's43', name: '김현준', classId: 'tue-thu-b', active: true },
  { id: 's44', name: '마민준', classId: 'tue-thu-b', active: true },
  { id: 's45', name: '안수연', classId: 'tue-thu-b', active: true },
  { id: 's46', name: '윤은호', classId: 'tue-thu-b', active: true },
  { id: 's47', name: '윤채은', classId: 'tue-thu-b', active: true },
  { id: 's48', name: '이지후', classId: 'tue-thu-b', active: true },
  { id: 's49', name: '이해원', classId: 'tue-thu-b', active: true },
  { id: 's50', name: '정은솔', classId: 'tue-thu-b', active: true },
  { id: 's51', name: '조예준', classId: 'tue-thu-b', active: true },
  { id: 's52', name: '차윤주', classId: 'tue-thu-b', active: true },
  { id: 's53', name: '함채은', classId: 'tue-thu-b', active: true },
]

export const RETEST_THRESHOLD = 80
