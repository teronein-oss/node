import { createContext, useContext, useReducer, useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { Class, Student, GradeRecord, RetestRecord, HomeworkAssignment, HomeworkStatus, ScoreColumn, SessionScope, NoticeItem, ExamInfo, WeeklyProgress, ScheduleEvent } from '../types'
import { INITIAL_CLASSES, INITIAL_STUDENTS, CLASS_NAME_MIGRATION } from '../data/initialData'
import { genId, getWeekStart, getSessionNum, getWeekStartForSession, needsRetest, getMonthSessions } from '../utils/helpers'

// ─── State ──────────────────────────────────────────────────────────────────

interface AppState {
  classes: Class[]
  students: Student[]
  grades: GradeRecord[]
  retests: RetestRecord[]
  homeworks: HomeworkAssignment[]
  scoreColumns: ScoreColumn[]
  scopes: SessionScope[]
  vocabThreshold: number
  dailyThreshold: number
  notices: NoticeItem[]
  todos: NoticeItem[]
  examInfo: ExamInfo[]
  weeklyProgress: WeeklyProgress[]
  scheduleEvents: ScheduleEvent[]
}

// ─── Actions ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD'; payload: AppState }
  | { type: 'ADD_STUDENT'; payload: Omit<Student, 'id'> }
  | { type: 'UPDATE_STUDENT'; payload: Student }
  | { type: 'DEACTIVATE_STUDENT'; payload: string }
  | { type: 'SAVE_GRADES'; payload: Omit<GradeRecord, 'id' | 'createdAt'>[] }
  | { type: 'SAVE_RETEST'; payload: { id: string; retestScore: number | null; passed: boolean } }
  | { type: 'ADD_RETEST'; payload: Omit<RetestRecord, 'id' | 'createdAt'> }
  | { type: 'SAVE_HOMEWORK'; payload: Omit<HomeworkAssignment, 'id' | 'createdAt'> }
  | { type: 'DELETE_HOMEWORK'; payload: string }
  | { type: 'UPDATE_HOMEWORK_STATUS'; payload: { studentId: string; sessionNum: number; status: HomeworkStatus } }
  | { type: 'ADD_SCORE_COLUMN'; payload: { name: string } }
  | { type: 'UPDATE_SCORE_COLUMN'; payload: { id: string; name: string } }
  | { type: 'DELETE_SCORE_COLUMN'; payload: string }
  | { type: 'SET_THRESHOLD'; payload: { key: 'vocabThreshold' | 'dailyThreshold'; value: number } }
  | { type: 'SAVE_SCOPE'; payload: Omit<SessionScope, 'id' | 'createdAt'> }
  | { type: 'DELETE_SCOPE'; payload: number }
  | { type: 'ADD_NOTICE'; payload: { message: string; deadline?: string } }
  | { type: 'TOGGLE_NOTICE'; payload: string }
  | { type: 'REMOVE_NOTICE'; payload: string }
  | { type: 'ADD_TODO'; payload: { message: string; deadline?: string } }
  | { type: 'TOGGLE_TODO'; payload: string }
  | { type: 'REMOVE_TODO'; payload: string }
  | { type: 'SAVE_EXAM_INFO'; payload: ExamInfo }
  | { type: 'SAVE_WEEKLY_PROGRESS'; payload: Omit<WeeklyProgress, 'id' | 'createdAt'> }
  | { type: 'DELETE_WEEKLY_PROGRESS'; payload: string }
  | { type: 'ADD_SCHEDULE_EVENT'; payload: Omit<ScheduleEvent, 'id' | 'createdAt'> }
  | { type: 'COMPLETE_SCHEDULE_EVENT'; payload: string }
  | { type: 'TOGGLE_SCHEDULE_EVENT'; payload: string }
  | { type: 'DELETE_SCHEDULE_EVENT'; payload: string }
  | { type: 'UPDATE_SCHEDULE_EVENT'; payload: { id: string; title: string; startDate: string; endDate: string; type: 'personal' | 'all' } }
  | { type: 'CLEAR_SESSION_GRADES'; payload: { sessionNum: number; studentIds: string[] } }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD':
      return action.payload

    case 'ADD_STUDENT':
      return {
        ...state,
        students: [...state.students, { ...action.payload, id: genId() }],
      }

    case 'UPDATE_STUDENT':
      return {
        ...state,
        students: state.students.map(s => s.id === action.payload.id ? action.payload : s),
      }

    case 'DEACTIVATE_STUDENT':
      return {
        ...state,
        students: state.students.map(s => s.id === action.payload ? { ...s, active: false } : s),
      }

    case 'SAVE_GRADES': {
      const now = new Date().toISOString()
      const newGrades = action.payload.map(g => ({
        ...g,
        id: genId(),
        createdAt: now,
      }))

      const existingIds = new Set(newGrades.map(g => `${g.studentId}-${g.sessionNum}`))
      const filtered = state.grades.filter(g => !existingIds.has(`${g.studentId}-${g.sessionNum}`))

      const newRetests: RetestRecord[] = []
      for (const g of newGrades) {
        for (const type of ['vocab', 'daily'] as const) {
          const score = type === 'vocab' ? g.vocabScore : g.dailyTestScore
          const threshold = type === 'vocab' ? state.vocabThreshold : state.dailyThreshold
          if (needsRetest(score, threshold)) {
            const exists = state.retests.some(
              r => r.studentId === g.studentId && r.sessionNum === g.sessionNum && r.type === type
            )
            if (!exists) {
              newRetests.push({
                id: genId(),
                studentId: g.studentId,
                sessionNum: g.sessionNum,
                type,
                originalScore: score!,
                retestScore: null,
                passed: null,
                scheduledNote: '',
                createdAt: now,
              })
            }
          }
        }
      }

      return {
        ...state,
        grades: [...filtered, ...newGrades],
        retests: [...state.retests, ...newRetests],
      }
    }

    case 'ADD_RETEST':
      return {
        ...state,
        retests: [
          ...state.retests,
          { ...action.payload, id: genId(), createdAt: new Date().toISOString() },
        ],
      }

    case 'SAVE_HOMEWORK': {
      const existing = state.homeworks.filter(h =>
        !(h.sessionNum === action.payload.sessionNum && h.classId === action.payload.classId)
      )
      return {
        ...state,
        homeworks: [
          ...existing,
          { ...action.payload, id: genId(), createdAt: new Date().toISOString() },
        ],
      }
    }

    case 'DELETE_HOMEWORK':
      return { ...state, homeworks: state.homeworks.filter(h => h.id !== action.payload) }

    case 'UPDATE_HOMEWORK_STATUS': {
      const { studentId, sessionNum, status } = action.payload
      const existing = state.grades.find(g => g.studentId === studentId && g.sessionNum === sessionNum)

      if (status === null) {
        if (existing && existing.vocabScore === null && existing.dailyTestScore === null) {
          return {
            ...state,
            grades: state.grades.filter(g => !(g.studentId === studentId && g.sessionNum === sessionNum)),
          }
        }
        return {
          ...state,
          grades: state.grades.map(g =>
            g.studentId === studentId && g.sessionNum === sessionNum
              ? { ...g, homeworkDone: null }
              : g
          ),
        }
      }

      if (existing) {
        return {
          ...state,
          grades: state.grades.map(g =>
            g.studentId === studentId && g.sessionNum === sessionNum
              ? { ...g, homeworkDone: status }
              : g
          ),
        }
      }

      return {
        ...state,
        grades: [
          ...state.grades,
          {
            id: genId(),
            studentId,
            sessionNum,
            weekStart: getWeekStartForSession(sessionNum),
            vocabScore: null,
            dailyTestScore: null,
            extras: {},
            attendance: null,
            homeworkDone: status,
            createdAt: new Date().toISOString(),
          },
        ],
      }
    }

    case 'SAVE_RETEST':
      return {
        ...state,
        retests: state.retests.map(r =>
          r.id === action.payload.id
            ? { ...r, retestScore: action.payload.retestScore, passed: action.payload.passed }
            : r
        ),
      }

    case 'ADD_SCORE_COLUMN':
      return {
        ...state,
        scoreColumns: [
          ...state.scoreColumns,
          { id: genId(), name: action.payload.name, createdAt: new Date().toISOString() },
        ],
      }

    case 'UPDATE_SCORE_COLUMN':
      return {
        ...state,
        scoreColumns: state.scoreColumns.map(c =>
          c.id === action.payload.id ? { ...c, name: action.payload.name } : c
        ),
      }

    case 'DELETE_SCORE_COLUMN':
      return {
        ...state,
        scoreColumns: state.scoreColumns.filter(c => c.id !== action.payload),
      }

    case 'SET_THRESHOLD':
      return { ...state, [action.payload.key]: action.payload.value }

    case 'SAVE_SCOPE': {
      const filtered = state.scopes.filter(s => s.sessionNum !== action.payload.sessionNum)
      return {
        ...state,
        scopes: [
          ...filtered,
          { ...action.payload, id: genId(), createdAt: new Date().toISOString() },
        ],
      }
    }

    case 'DELETE_SCOPE':
      return { ...state, scopes: state.scopes.filter(s => s.sessionNum !== action.payload) }

    case 'ADD_NOTICE':
      return { ...state, notices: [...state.notices, { id: genId(), message: action.payload.message, completed: false, deadline: action.payload.deadline }] }
    case 'TOGGLE_NOTICE':
      return { ...state, notices: state.notices.map(n => n.id === action.payload ? { ...n, completed: !n.completed } : n) }
    case 'REMOVE_NOTICE':
      return { ...state, notices: state.notices.filter(n => n.id !== action.payload) }
    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, { id: genId(), message: action.payload.message, completed: false, deadline: action.payload.deadline }] }
    case 'TOGGLE_TODO':
      return { ...state, todos: state.todos.map(n => n.id === action.payload ? { ...n, completed: !n.completed } : n) }
    case 'REMOVE_TODO':
      return { ...state, todos: state.todos.filter(n => n.id !== action.payload) }

    case 'SAVE_EXAM_INFO': {
      const filtered = (state.examInfo ?? []).filter(
        e => !(e.classId === action.payload.classId && e.semester === action.payload.semester)
      )
      return { ...state, examInfo: [...filtered, action.payload] }
    }
    case 'SAVE_WEEKLY_PROGRESS': {
      const filtered = (state.weeklyProgress ?? []).filter(
        p => !(p.classId === action.payload.classId && p.sessionNum === action.payload.sessionNum)
      )
      return { ...state, weeklyProgress: [...filtered, { ...action.payload, id: genId(), createdAt: new Date().toISOString() }] }
    }
    case 'DELETE_WEEKLY_PROGRESS':
      return { ...state, weeklyProgress: (state.weeklyProgress ?? []).filter(p => p.id !== action.payload) }

    case 'ADD_SCHEDULE_EVENT':
      return {
        ...state,
        scheduleEvents: [
          ...(state.scheduleEvents ?? []),
          { ...action.payload, id: genId(), createdAt: new Date().toISOString() },
        ],
      }
    case 'COMPLETE_SCHEDULE_EVENT':
      return {
        ...state,
        scheduleEvents: (state.scheduleEvents ?? []).map(e =>
          e.id === action.payload ? { ...e, completed: true } : e
        ),
      }
    case 'TOGGLE_SCHEDULE_EVENT':
      return {
        ...state,
        scheduleEvents: (state.scheduleEvents ?? []).map(e =>
          e.id === action.payload ? { ...e, completed: !e.completed } : e
        ),
      }
    case 'DELETE_SCHEDULE_EVENT':
      return { ...state, scheduleEvents: (state.scheduleEvents ?? []).filter(e => e.id !== action.payload) }

    case 'UPDATE_SCHEDULE_EVENT':
      return {
        ...state,
        scheduleEvents: (state.scheduleEvents ?? []).map(e =>
          e.id === action.payload.id
            ? { ...e, title: action.payload.title, startDate: action.payload.startDate, endDate: action.payload.endDate, type: action.payload.type }
            : e
        ),
      }

    case 'CLEAR_SESSION_GRADES': {
      const { sessionNum, studentIds } = action.payload
      const idSet = new Set(studentIds)
      return {
        ...state,
        grades: state.grades.filter(g => !(g.sessionNum === sessionNum && idSet.has(g.studentId))),
        retests: state.retests.filter(r => !(r.sessionNum === sessionNum && idSet.has(r.studentId))),
      }
    }

    default:
      return state
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LEGACY_STORAGE_KEY = 'academy-dashboard-v3'

const DEFAULT_STATE: AppState = {
  classes: INITIAL_CLASSES,
  students: INITIAL_STUDENTS,
  grades: [],
  retests: [],
  homeworks: [],
  scoreColumns: [],
  scopes: [],
  vocabThreshold: 80,
  dailyThreshold: 80,
  notices: [{ id: '1', message: 'Test', completed: false }],
  todos: [],
  examInfo: [],
  weeklyProgress: [],
  scheduleEvents: [],
}

function normalizeState(parsed: AppState): AppState {
  return {
    ...parsed,
    students: parsed.students ?? INITIAL_STUDENTS,
    retests: parsed.retests ?? [],
    homeworks: (parsed.homeworks ?? []).map((h: HomeworkAssignment & { classId?: string }) => ({
      ...h,
      classId: h.classId ?? '',
    })),
    scoreColumns: parsed.scoreColumns ?? [],
    scopes: parsed.scopes ?? [],
    vocabThreshold: parsed.vocabThreshold ?? 80,
    dailyThreshold: parsed.dailyThreshold ?? 80,
    notices: parsed.notices ?? [{ id: '1', message: 'Test', completed: false }],
    todos: parsed.todos ?? [],
    examInfo: (parsed.examInfo ?? []).map((e: ExamInfo & { semester?: string }) => ({
      ...e,
      semester: e.semester ?? '1학기 중간',
    })),
    scheduleEvents: (parsed.scheduleEvents ?? []).map((e) => {
      const ev = e as unknown as Record<string, unknown>
      const legacyDate = (ev['date'] as string | undefined) ?? ''
      return {
        id: ev['id'] as string,
        startDate: (ev['startDate'] as string | undefined) ?? legacyDate,
        endDate: (ev['endDate'] as string | undefined) ?? legacyDate,
        title: ev['title'] as string,
        type: ev['type'] as 'personal' | 'all',
        completed: (ev['completed'] as boolean | undefined) ?? false,
        createdAt: ev['createdAt'] as string,
      }
    }),
    weeklyProgress: (parsed.weeklyProgress ?? []).map((p: WeeklyProgress & { schoolId?: string }) => ({
      ...p,
      classId: p.classId ?? p.schoolId ?? '',
    })),
    classes: (parsed.classes ?? INITIAL_CLASSES).map(c => ({
      ...c,
      name: CLASS_NAME_MIGRATION[c.name] ?? c.name,
    })),
    grades: (parsed.grades ?? []).map((g: GradeRecord & { homeworkDone: unknown }) => {
      const hd: unknown = g.homeworkDone
      return {
        ...g,
        extras: g.extras ?? {},
        attendance: g.attendance ?? null,
        homeworkDone: hd === true ? '제출'
          : hd === false ? '미제출'
          : (hd as HomeworkStatus) ?? null,
      }
    }),
  }
}

// ─── Context ────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  loading: boolean
  visibleCount: number
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>
  selectedYM: string
  setSelectedYM: React.Dispatch<React.SetStateAction<string>>
  selectedSession: number
  setSelectedSession: React.Dispatch<React.SetStateAction<number>>
  getStudentsByClass: (classId: string) => Student[]
  getGrade: (studentId: string, sessionNum: number) => GradeRecord | undefined
  getRetests: (studentId: string) => RetestRecord[]
  getPendingRetests: (classId?: string) => RetestRecord[]
  getCurrentSession: () => { sessionNum: number; weekStart: string }
  getScope: (sessionNum: number) => SessionScope | undefined
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children, uid }: { children: ReactNode; uid: string }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE)
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(8)
  const isRemoteUpdate = useRef(false)
  const firestoreDoc = doc(db, 'appData', uid)

  const currentYM = useMemo(() => {
    const today = new Date()
    return `${today.getFullYear()}-${today.getMonth() + 1}`
  }, [])

  const [selectedYM, setSelectedYM] = useState(currentYM)

  const [selectedSession, setSelectedSession] = useState(() => {
    const ws = getWeekStart()
    const cur = getSessionNum(ws) + 1
    const d = new Date(ws + 'T00:00:00')
    d.setDate(d.getDate() + 3)
    const cym = `${d.getFullYear()}-${d.getMonth() + 1}`
    const [y, m] = cym.split('-').map(Number)
    const sessions = getMonthSessions(y, m, 8)
    return sessions.includes(cur) ? cur : (sessions[0] ?? 1)
  })

  // Firestore 실시간 구독 — 최초 1회 로컬 데이터 마이그레이션 포함
  useEffect(() => {
    let serverResponded = false

    const unsubscribe = onSnapshot(firestoreDoc, { includeMetadataChanges: true }, (snap) => {
      const fromCache = snap.metadata.fromCache

      if (snap.exists()) {
        // 캐시 or 서버 데이터 — 둘 다 유효하게 로드
        isRemoteUpdate.current = true
        dispatch({ type: 'LOAD', payload: normalizeState(snap.data() as AppState) })
        if (!serverResponded) {
          serverResponded = true
          setLoading(false)
        }
      } else if (!fromCache) {
        // 서버가 "문서 없음"을 확인한 경우에만 초기화
        serverResponded = true
        try {
          const saved = localStorage.getItem(LEGACY_STORAGE_KEY)
          if (saved) {
            const parsed = normalizeState(JSON.parse(saved) as AppState)
            setDoc(firestoreDoc, parsed)
              .then(() => localStorage.removeItem(LEGACY_STORAGE_KEY))
              .catch((err) => console.error('[AppContext] 마이그레이션 저장 실패:', err?.code))
            isRemoteUpdate.current = true
            dispatch({ type: 'LOAD', payload: parsed })
          }
        } catch {
          // ignore
        }
        setLoading(false)
      }
      // fromCache && !snap.exists() → 캐시 미스, 서버 응답 대기 (무시)
    }, (err) => {
      console.error('[AppContext] Firestore onSnapshot 실패:', err?.code, err?.message)
      try {
        const saved = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (saved) {
          dispatch({ type: 'LOAD', payload: normalizeState(JSON.parse(saved) as AppState) })
        }
      } catch {
        // ignore
      }
      setLoading(false)
    })

    return unsubscribe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  // 상태 변경 시 Firestore에 저장
  useEffect(() => {
    console.log('[Save] effect triggered — loading:', loading, 'isRemote:', isRemoteUpdate.current)
    if (loading) return
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false
      return
    }
    console.log('[Save] calling setDoc →', firestoreDoc.path)
    const sanitized = JSON.parse(JSON.stringify(state))
    setDoc(firestoreDoc, sanitized)
      .then(() => console.log('[Save] 성공:', firestoreDoc.path))
      .catch((err) => {
        console.error('[Save] 실패:', err?.code, err?.message)
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loading])

  // 월 변경 시 선택 회차 + 표시 개수 초기화
  useEffect(() => {
    const [year, month] = selectedYM.split('-').map(Number)
    const sessions = getMonthSessions(year, month, 8)
    if (selectedYM === currentYM) {
      const cur = getSessionNum(getWeekStart()) + 1
      setSelectedSession(sessions.includes(cur) ? cur : (sessions[0] ?? 1))
    } else {
      setSelectedSession(sessions[0] ?? 1)
    }
    setVisibleCount(8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYM])

  const getStudentsByClass = (classId: string) =>
    state.students.filter(s => s.classId === classId && s.active)

  const getGrade = (studentId: string, sessionNum: number) =>
    state.grades.find(g => g.studentId === studentId && g.sessionNum === sessionNum)

  const getRetests = (studentId: string) =>
    state.retests.filter(r => r.studentId === studentId)

  const getPendingRetests = (classId?: string) => {
    const studentIds = classId
      ? new Set(state.students.filter(s => s.classId === classId && s.active).map(s => s.id))
      : null
    return state.retests.filter(r =>
      r.passed === null && (studentIds === null || studentIds.has(r.studentId))
    )
  }

  const getCurrentSession = () => {
    const weekStart = getWeekStart()
    const firstSession = getSessionNum(weekStart)
    return { sessionNum: firstSession + 1, weekStart }
  }

  const getScope = (sessionNum: number) =>
    state.scopes.find(s => s.sessionNum === sessionNum)

  return (
    <AppContext.Provider
      value={{ state, dispatch, loading, visibleCount, setVisibleCount, selectedYM, setSelectedYM, selectedSession, setSelectedSession, getStudentsByClass, getGrade, getRetests, getPendingRetests, getCurrentSession, getScope }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
