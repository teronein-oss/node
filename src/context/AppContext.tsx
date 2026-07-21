import { createContext, useContext, useReducer, useEffect, useState, useMemo, type ReactNode } from 'react'
import type { Class, Student, GradeRecord, RetestRecord, HomeworkAssignment, HomeworkItem, HomeworkStatus, ScoreColumn, SessionScope, NoticeItem, TodoItem, TodoPriority, ExamInfo, WeeklyProgress, ScheduleEvent, ClinicSchedule, SessionTestConfig } from '../types'
import { CLASS_NAME_MIGRATION } from '../data/initialData'
import { genId, getWeekStart, getSessionNum, getWeekStartForSession, needsRetest, getMonthSessions, getClassDate } from '../utils/helpers'
import { useAppPersistence } from './useAppPersistence'

// ─── State ──────────────────────────────────────────────────────────────────

export interface AppState {
  classes: Class[]
  students: Student[]
  grades: GradeRecord[]
  retests: RetestRecord[]
  homeworks: HomeworkAssignment[]
  scoreColumns: ScoreColumn[]
  scopes: SessionScope[]
  vocabThreshold: number
  dailyThreshold: number
  vocabMode: '점수' | '개수'
  dailyMode: '점수' | '개수'
  vocabTotal: number
  dailyTotal: number
  notices: NoticeItem[]
  todos: TodoItem[]
  examInfo: ExamInfo[]
  weeklyProgress: WeeklyProgress[]
  scheduleEvents: ScheduleEvent[]
  clinicSchedules: ClinicSchedule[]
  sessionTestConfigs: SessionTestConfig[]
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'LOAD'; payload: AppState }
  | { type: 'ADD_CLASS'; payload: Omit<Class, 'id'> }
  | { type: 'UPDATE_CLASS'; payload: Class }
  | { type: 'RENAME_CLASS'; payload: { id: string; name: string } }
  | { type: 'DELETE_CLASS'; payload: string }
  | { type: 'ADD_STUDENT'; payload: Omit<Student, 'id'> }
  | { type: 'UPDATE_STUDENT'; payload: Student }
  | { type: 'DEACTIVATE_STUDENT'; payload: string }
  | { type: 'SAVE_GRADES'; payload: Omit<GradeRecord, 'id' | 'createdAt'>[] }
  | { type: 'SAVE_RETEST'; payload: { id: string; retestScore: number | null; passed: boolean } }
  | { type: 'ADD_RETEST'; payload: Omit<RetestRecord, 'id' | 'createdAt'> }
  | { type: 'SAVE_HOMEWORK'; payload: Omit<HomeworkAssignment, 'id' | 'createdAt'> }
  | { type: 'DELETE_HOMEWORK'; payload: string }
  | { type: 'TOGGLE_HOMEWORK_ITEM'; payload: { assignmentId: string; itemId: string } }
  | { type: 'SET_ITEM_STUDENT_STATUS'; payload: { assignmentId: string; itemId: string; studentId: string; status: '제출' | '미흡' | '미제출' | '재확인완료' | null } }
  | { type: 'SET_HOMEWORK_RECHECK_DATE'; payload: { assignmentId: string; studentId: string; date: string | null } }
  | { type: 'UPDATE_HOMEWORK_STATUS'; payload: { studentId: string; sessionNum: number; status: HomeworkStatus } }
  | { type: 'ADD_SCORE_COLUMN'; payload: { sessionNum: number; classId: string; name: string } }
  | { type: 'UPDATE_SCORE_COLUMN'; payload: { sessionNum: number; classId: string; id: string; name?: string; mode?: '점수' | '개수'; total?: number; threshold?: number } }
  | { type: 'DELETE_SCORE_COLUMN'; payload: { sessionNum: number; classId: string; id: string } }
  | { type: 'SET_THRESHOLD'; payload: { key: 'vocabThreshold' | 'dailyThreshold'; value: number } }
  | { type: 'SET_TEST_CONFIG'; payload: Partial<{ vocabMode: '점수' | '개수'; dailyMode: '점수' | '개수'; vocabTotal: number; dailyTotal: number }> }
  | { type: 'SAVE_SCOPE'; payload: Omit<SessionScope, 'id' | 'createdAt'> }
  | { type: 'DELETE_SCOPE'; payload: { sessionNum: number; classId: string } }
  | { type: 'ADD_NOTICE'; payload: { message: string; deadline?: string } }
  | { type: 'TOGGLE_NOTICE'; payload: string }
  | { type: 'REMOVE_NOTICE'; payload: string }
  | { type: 'ADD_TODO'; payload: { title: string; date: string; priority: TodoPriority; memo?: string } }
  | { type: 'UPDATE_TODO'; payload: { id: string; title?: string; date?: string; priority?: TodoPriority; memo?: string } }
  | { type: 'TOGGLE_TODO'; payload: string }
  | { type: 'REMOVE_TODO'; payload: string }
  | { type: 'SAVE_EXAM_INFO'; payload: ExamInfo }
  | { type: 'SAVE_WEEKLY_PROGRESS'; payload: Omit<WeeklyProgress, 'id' | 'createdAt'> }
  | { type: 'DELETE_WEEKLY_PROGRESS'; payload: string }
  | { type: 'ADD_SCHEDULE_EVENT'; payload: Omit<ScheduleEvent, 'id' | 'createdAt'> }
  | { type: 'COMPLETE_SCHEDULE_EVENT'; payload: string }
  | { type: 'TOGGLE_SCHEDULE_EVENT'; payload: string }
  | { type: 'DELETE_SCHEDULE_EVENT'; payload: string }
  | { type: 'UPDATE_SCHEDULE_EVENT'; payload: { id: string; title: string; startDate: string; endDate: string; time?: string; type: 'personal' | 'all' } }
  | { type: 'CLEAR_SESSION_GRADES'; payload: { sessionNum: number; studentIds: string[] } }
  | { type: 'ADD_CLINIC_SCHEDULE'; payload: Omit<ClinicSchedule, 'id' | 'createdAt'> }
  | { type: 'DELETE_CLINIC_SCHEDULE'; payload: string }
  | { type: 'SET_SESSION_TEST_CONFIG'; payload: { sessionNum: number; classId?: string } & Partial<Omit<SessionTestConfig, 'sessionNum' | 'classId'>> }
  | { type: 'UPDATE_RETEST_DATE'; payload: { id: string; retestDate: string | null } }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD':
      return action.payload

    case 'ADD_CLASS':
      return {
        ...state,
        classes: [...state.classes, { ...action.payload, id: genId() }],
      }

    case 'UPDATE_CLASS':
      return {
        ...state,
        classes: state.classes.map(c => c.id === action.payload.id ? action.payload : c),
      }

    case 'RENAME_CLASS':
      return {
        ...state,
        classes: state.classes.map(c =>
          c.id === action.payload.id ? { ...c, name: action.payload.name } : c
        ),
      }

    case 'DELETE_CLASS': {
      const deletedAt = new Date().toISOString()
      return {
        ...state,
        classes: state.classes.filter(c => c.id !== action.payload),
        students: state.students.map(s =>
          s.classId === action.payload ? { ...s, active: false, withdrawnAt: s.withdrawnAt ?? deletedAt } : s
        ),
      }
    }

    case 'ADD_STUDENT':
      return {
        ...state,
        students: [...state.students, { ...action.payload, id: genId(), registeredAt: action.payload.registeredAt ?? new Date().toISOString() }],
      }

    case 'UPDATE_STUDENT':
      return {
        ...state,
        students: state.students.map(s => s.id === action.payload.id ? action.payload : s),
      }

    case 'DEACTIVATE_STUDENT':
      return {
        ...state,
        students: state.students.map(s => s.id === action.payload ? { ...s, active: false, withdrawnAt: s.withdrawnAt ?? new Date().toISOString() } : s),
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
      const retestIdsToRemove = new Set<string>()

      for (const g of newGrades) {
        const gClassId = state.students.find(s => s.id === g.studentId)?.classId
        const sessionCfg = state.sessionTestConfigs.find(
          c => c.sessionNum === g.sessionNum && (gClassId ? c.classId === gClassId : !c.classId)
        ) ?? state.sessionTestConfigs.find(c => c.sessionNum === g.sessionNum)
        for (const type of ['vocab', 'daily'] as const) {
          const score = type === 'vocab' ? g.vocabScore : g.dailyTestScore
          const threshold = type === 'vocab'
            ? (sessionCfg?.vocabThreshold ?? state.vocabThreshold)
            : (sessionCfg?.dailyThreshold ?? state.dailyThreshold)
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
          } else {
            // 점수가 기준 이상으로 수정됐으면 미처리 재시험 레코드 제거
            const pending = state.retests.find(
              r => r.studentId === g.studentId && r.sessionNum === g.sessionNum && r.type === type && r.passed === null
            )
            if (pending) retestIdsToRemove.add(pending.id)
          }
        }

        // 추가 항목 재시험 처리
        for (const [colId, score] of Object.entries(g.extras)) {
          if (score === null) continue
          const sessionColsForGrade = sessionCfg?.scoreColumns ?? []
          const col = sessionColsForGrade.find(c => c.id === colId) ?? state.scoreColumns.find(c => c.id === colId)
          if (!col?.threshold || col.threshold <= 0) continue
          if (needsRetest(score, col.threshold)) {
            const exists = state.retests.some(
              r => r.studentId === g.studentId && r.sessionNum === g.sessionNum && r.type === colId
            )
            if (!exists) {
              newRetests.push({
                id: genId(),
                studentId: g.studentId,
                sessionNum: g.sessionNum,
                type: colId,
                originalScore: score,
                retestScore: null,
                passed: null,
                scheduledNote: '',
                createdAt: now,
              })
            }
          } else {
            const pending = state.retests.find(
              r => r.studentId === g.studentId && r.sessionNum === g.sessionNum && r.type === colId && r.passed === null
            )
            if (pending) retestIdsToRemove.add(pending.id)
          }
        }
      }

      // 성적 저장 시 회차별 시험 설정이 없으면 현재 설정으로 스냅샷 생성
      const newSessionConfigs = [...state.sessionTestConfigs]
      for (const g of newGrades) {
        const sNum = g.sessionNum
        const classId = state.students.find(s => s.id === g.studentId)?.classId
        const exists = newSessionConfigs.find(
          c => c.sessionNum === sNum && (classId ? c.classId === classId : !c.classId)
        )
        if (!exists) {
          const baseCfg = newSessionConfigs.find(c => c.sessionNum === sNum)
          newSessionConfigs.push({
            sessionNum: sNum,
            classId,
            vocabMode: baseCfg?.vocabMode ?? state.vocabMode,
            vocabTotal: baseCfg?.vocabTotal ?? state.vocabTotal,
            vocabThreshold: baseCfg?.vocabThreshold ?? state.vocabThreshold,
            dailyMode: baseCfg?.dailyMode ?? state.dailyMode,
            dailyTotal: baseCfg?.dailyTotal ?? state.dailyTotal,
            dailyThreshold: baseCfg?.dailyThreshold ?? state.dailyThreshold,
          })
        }
      }

      return {
        ...state,
        grades: [...filtered, ...newGrades],
        retests: [...state.retests.filter(r => !retestIdsToRemove.has(r.id)), ...newRetests],
        sessionTestConfigs: newSessionConfigs,
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
      const prev = state.homeworks.find(h =>
        h.sessionNum === action.payload.sessionNum && h.classId === action.payload.classId
      )
      const others = state.homeworks.filter(h =>
        !(h.sessionNum === action.payload.sessionNum && h.classId === action.payload.classId)
      )
      return {
        ...state,
        homeworks: [
          ...others,
          {
            ...action.payload,
            recheckDates: action.payload.recheckDates ?? prev?.recheckDates,
            id: prev?.id ?? genId(),
            createdAt: prev?.createdAt ?? new Date().toISOString(),
          },
        ],
      }
    }

    case 'SET_HOMEWORK_RECHECK_DATE': {
      const { assignmentId, studentId, date } = action.payload
      return {
        ...state,
        homeworks: state.homeworks.map(h => {
          if (h.id !== assignmentId) return h
          const others = (h.recheckDates ?? []).filter(rd => rd.studentId !== studentId)
          return {
            ...h,
            recheckDates: date === null ? others : [...others, { studentId, date }],
          }
        }),
      }
    }

    case 'DELETE_HOMEWORK':
      return { ...state, homeworks: state.homeworks.filter(h => h.id !== action.payload) }

    case 'TOGGLE_HOMEWORK_ITEM': {
      const { assignmentId, itemId } = action.payload
      return {
        ...state,
        homeworks: state.homeworks.map(h =>
          h.id !== assignmentId ? h : {
            ...h,
            items: (h.items ?? []).map((item: HomeworkItem) =>
              item.id === itemId ? { ...item, done: !item.done } : item
            ),
          }
        ),
      }
    }

    case 'SET_ITEM_STUDENT_STATUS': {
      const { assignmentId, itemId, studentId, status } = action.payload
      const updatedHomeworks = state.homeworks.map(h => {
        if (h.id !== assignmentId) return h
        return {
          ...h,
          items: (h.items ?? []).map((item: HomeworkItem) => {
            if (item.id !== itemId) return item
            const others = (item.studentStatuses ?? []).filter(ss => ss.studentId !== studentId)
            return {
              ...item,
              studentStatuses: status === null ? others : [...others, { studentId, status }],
            }
          }),
        }
      })

      // 모든 항목 상태에서 전체 homeworkDone 자동 계산
      const hw = updatedHomeworks.find(h => h.id === assignmentId)
      const sessionNum = hw?.sessionNum
      if (!hw || sessionNum === undefined) return { ...state, homeworks: updatedHomeworks }

      const allStatuses = (hw.items ?? []).map(item =>
        (item.studentStatuses ?? []).find(ss => ss.studentId === studentId)?.status
      )
      const derivedStatus: HomeworkStatus =
        allStatuses.some(s => s === '미흡' || s === '미제출') ? '미흡'
        : allStatuses.some(s => s === '재확인완료') ? '재확인완료'
        : '제출'

      const studentClass = state.classes.find(c => c.id === state.students.find(s => s.id === studentId)?.classId)
      const upsertHomeworkGrade = (grades: GradeRecord[], targetSessionNum: number) => {
        const existingGrade = grades.find(g => g.studentId === studentId && g.sessionNum === targetSessionNum)
        const weekStart = studentClass
          ? getWeekStart(new Date(getClassDate(targetSessionNum, studentClass.days, studentClass.weekdays) + 'T00:00:00'))
          : getWeekStartForSession(targetSessionNum)

        if (existingGrade) {
          return grades.map(g =>
            g.studentId === studentId && g.sessionNum === targetSessionNum
              ? { ...g, homeworkDone: derivedStatus }
              : g
          )
        }

        return [...grades, {
          id: genId(), studentId, sessionNum: targetSessionNum,
          weekStart,
          vocabScore: null, dailyTestScore: null, extras: {},
          attendance: null, homeworkDone: derivedStatus,
          createdAt: new Date().toISOString(),
        }]
      }

      // 숙제 출제일과 검사일 양쪽 성적 기록을 맞춰 대시보드/숙제관리/성적관리가 같은 상태를 보게 한다.
      const updatedGrades = upsertHomeworkGrade(
        upsertHomeworkGrade(state.grades, sessionNum),
        sessionNum + 1
      )

      return { ...state, homeworks: updatedHomeworks, grades: updatedGrades }
    }

    case 'UPDATE_HOMEWORK_STATUS': {
      const { studentId, sessionNum, status } = action.payload
      const existing = state.grades.find(g => g.studentId === studentId && g.sessionNum === sessionNum)
      const studentClass = state.classes.find(c => c.id === state.students.find(s => s.id === studentId)?.classId)
      const weekStart = studentClass
        ? getWeekStart(new Date(getClassDate(sessionNum, studentClass.days, studentClass.weekdays) + 'T00:00:00'))
        : getWeekStartForSession(sessionNum)

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
            weekStart,
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

    case 'UPDATE_RETEST_DATE':
      return {
        ...state,
        retests: state.retests.map(r =>
          r.id === action.payload.id
            ? { ...r, retestDate: action.payload.retestDate ?? undefined }
            : r
        ),
      }

    case 'ADD_SCORE_COLUMN': {
      const { sessionNum, classId, name } = action.payload
      const newCol: ScoreColumn = { id: genId(), name, createdAt: new Date().toISOString() }
      const matches = (c: SessionTestConfig) => c.sessionNum === sessionNum && c.classId === classId
      const existing = state.sessionTestConfigs.find(matches)
      if (existing) {
        return {
          ...state,
          sessionTestConfigs: state.sessionTestConfigs.map(c =>
            matches(c) ? { ...c, scoreColumns: [...(c.scoreColumns ?? []), newCol] } : c
          ),
        }
      }
      const legacy = state.sessionTestConfigs.find(c => c.sessionNum === sessionNum && !c.classId)
      return {
        ...state,
        sessionTestConfigs: [
          ...state.sessionTestConfigs,
          {
            sessionNum, classId,
            vocabMode: legacy?.vocabMode ?? state.vocabMode,
            vocabTotal: legacy?.vocabTotal ?? state.vocabTotal,
            vocabThreshold: legacy?.vocabThreshold ?? state.vocabThreshold,
            dailyMode: legacy?.dailyMode ?? state.dailyMode,
            dailyTotal: legacy?.dailyTotal ?? state.dailyTotal,
            dailyThreshold: legacy?.dailyThreshold ?? state.dailyThreshold,
            scoreColumns: [newCol],
          },
        ],
      }
    }

    case 'UPDATE_SCORE_COLUMN': {
      const { sessionNum, classId, id, ...colUpdates } = action.payload
      const cleanColUpdates = Object.fromEntries(
        Object.entries(colUpdates).filter(([, v]) => v !== undefined)
      )
      const matches = (c: SessionTestConfig) => c.sessionNum === sessionNum && c.classId === classId
      const existing = state.sessionTestConfigs.find(matches)
      if (existing?.scoreColumns?.some(c => c.id === id)) {
        return {
          ...state,
          sessionTestConfigs: state.sessionTestConfigs.map(c =>
            matches(c) ? { ...c, scoreColumns: (c.scoreColumns ?? []).map(col => col.id === id ? { ...col, ...cleanColUpdates } : col) } : c
          ),
        }
      }
      // fallback: global scoreColumns (기존 데이터)
      return { ...state, scoreColumns: state.scoreColumns.map(c => c.id === id ? { ...c, ...cleanColUpdates } : c) }
    }

    case 'DELETE_SCORE_COLUMN': {
      const { sessionNum, classId, id } = action.payload
      const matches = (c: SessionTestConfig) => c.sessionNum === sessionNum && c.classId === classId
      const existing = state.sessionTestConfigs.find(matches)
      if (existing?.scoreColumns?.some(c => c.id === id)) {
        return {
          ...state,
          sessionTestConfigs: state.sessionTestConfigs.map(c =>
            matches(c) ? { ...c, scoreColumns: (c.scoreColumns ?? []).filter(col => col.id !== id) } : c
          ),
        }
      }
      return { ...state, scoreColumns: state.scoreColumns.filter(c => c.id !== id) }
    }

    case 'SET_THRESHOLD':
      return { ...state, [action.payload.key]: action.payload.value }

    case 'SET_TEST_CONFIG':
      return { ...state, ...action.payload }

    case 'SAVE_SCOPE': {
      const filtered = state.scopes.filter(
        s => !(s.sessionNum === action.payload.sessionNum && s.classId === action.payload.classId)
      )
      return {
        ...state,
        scopes: [
          ...filtered,
          { ...action.payload, id: genId(), createdAt: new Date().toISOString() },
        ],
      }
    }

    case 'DELETE_SCOPE':
      return {
        ...state,
        scopes: state.scopes.filter(
          s => !(s.sessionNum === action.payload.sessionNum && s.classId === action.payload.classId)
        ),
      }

    case 'ADD_NOTICE':
      return { ...state, notices: [...state.notices, { id: genId(), message: action.payload.message, completed: false, deadline: action.payload.deadline }] }
    case 'TOGGLE_NOTICE':
      return { ...state, notices: state.notices.map(n => n.id === action.payload ? { ...n, completed: !n.completed } : n) }
    case 'REMOVE_NOTICE':
      return { ...state, notices: state.notices.filter(n => n.id !== action.payload) }
    case 'ADD_TODO':
      return {
        ...state,
        todos: [
          ...state.todos,
          {
            id: genId(),
            title: action.payload.title,
            date: action.payload.date,
            priority: action.payload.priority,
            memo: action.payload.memo,
            completed: false,
            createdAt: new Date().toISOString(),
          },
        ],
      }
    case 'UPDATE_TODO':
      return {
        ...state,
        todos: state.todos.map(todo =>
          todo.id === action.payload.id
            ? { ...todo, ...action.payload }
            : todo
        ),
      }
    case 'TOGGLE_TODO':
      return {
        ...state,
        todos: state.todos.map(todo =>
          todo.id === action.payload
            ? { ...todo, completed: !todo.completed, completedAt: todo.completed ? undefined : new Date().toISOString() }
            : todo
        ),
      }
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
            ? { ...e, title: action.payload.title, startDate: action.payload.startDate, endDate: action.payload.endDate, time: action.payload.time, type: action.payload.type }
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

    case 'ADD_CLINIC_SCHEDULE':
      return {
        ...state,
        clinicSchedules: [
          ...(state.clinicSchedules ?? []),
          { ...action.payload, id: genId(), createdAt: new Date().toISOString() },
        ],
      }

    case 'DELETE_CLINIC_SCHEDULE':
      return { ...state, clinicSchedules: (state.clinicSchedules ?? []).filter(c => c.id !== action.payload) }

    case 'SET_SESSION_TEST_CONFIG': {
      const { sessionNum, classId, ...updates } = action.payload
      const matches = (c: SessionTestConfig) =>
        c.sessionNum === sessionNum && (classId ? c.classId === classId : !c.classId)
      const existing = state.sessionTestConfigs.find(matches)
      if (existing) {
        return {
          ...state,
          sessionTestConfigs: state.sessionTestConfigs.map(c =>
            matches(c) ? { ...c, ...updates } : c
          ),
        }
      }
      // Inherit from legacy (no-classId) config for this session if available
      const legacy = classId ? state.sessionTestConfigs.find(c => c.sessionNum === sessionNum && !c.classId) : undefined
      return {
        ...state,
        sessionTestConfigs: [
          ...state.sessionTestConfigs,
          {
            sessionNum,
            classId,
            vocabMode: legacy?.vocabMode ?? state.vocabMode,
            vocabTotal: legacy?.vocabTotal ?? state.vocabTotal,
            vocabThreshold: legacy?.vocabThreshold ?? state.vocabThreshold,
            dailyMode: legacy?.dailyMode ?? state.dailyMode,
            dailyTotal: legacy?.dailyTotal ?? state.dailyTotal,
            dailyThreshold: legacy?.dailyThreshold ?? state.dailyThreshold,
            vocabName: legacy?.vocabName,
            dailyName: legacy?.dailyName,
            ...updates,
          },
        ],
      }
    }

    default:
      return state
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export const LEGACY_STORAGE_KEY = 'academy-dashboard-v3'

const DEFAULT_STATE: AppState = {
  classes: [],
  students: [],
  grades: [],
  retests: [],
  homeworks: [],
  scoreColumns: [],
  scopes: [],
  vocabThreshold: 80,
  dailyThreshold: 80,
  vocabMode: '점수' as const,
  dailyMode: '점수' as const,
  vocabTotal: 100,
  dailyTotal: 100,
  notices: [],
  todos: [],
  examInfo: [],
  weeklyProgress: [],
  scheduleEvents: [],
  clinicSchedules: [],
  sessionTestConfigs: [],
}

export function normalizeState(parsed: AppState): AppState {
  const normalizedAt = new Date().toISOString()
  return {
    ...parsed,
    students: (parsed.students ?? []).map(s => ({
      ...s,
      active: s.active ?? true,
      registeredAt: s.registeredAt,
      withdrawnAt: s.active === false ? (s.withdrawnAt ?? normalizedAt) : s.withdrawnAt,
    })),
    retests: parsed.retests ?? [],
    homeworks: (parsed.homeworks ?? []).map((h: HomeworkAssignment & { classId?: string }) => {
      const existingItems: HomeworkItem[] = Array.isArray(h.items) ? h.items : []
      let items = existingItems
      let description = h.description ?? ''
      // 기존 description 텍스트를 items로 마이그레이션 (items가 비어있을 때만)
      if (items.length === 0 && description.trim()) {
        items = [{ id: h.id + '_desc', text: description, done: false }]
        description = ''
      }
      return {
        ...h,
        classId: h.classId ?? '',
        items,
        description,
      }
    }),
    scoreColumns: parsed.scoreColumns ?? [],
    scopes: (parsed.scopes ?? []).map((s: SessionScope & { classId?: string }) => ({
      ...s,
      classId: s.classId ?? '',
    })),
    vocabThreshold: parsed.vocabThreshold ?? 80,
    dailyThreshold: parsed.dailyThreshold ?? 80,
    vocabMode: parsed.vocabMode ?? '점수',
    dailyMode: parsed.dailyMode ?? '점수',
    vocabTotal: parsed.vocabTotal ?? 100,
    dailyTotal: parsed.dailyTotal ?? 100,
    notices: parsed.notices ?? [{ id: '1', message: 'Test', completed: false }],
    todos: (parsed.todos ?? []).map((todo: TodoItem & { message?: string; deadline?: string }) => ({
      id: todo.id ?? genId(),
      title: todo.title ?? todo.message ?? '',
      date: todo.date ?? todo.deadline ?? new Date().toISOString().slice(0, 10),
      priority: todo.priority ?? 'none',
      completed: todo.completed ?? false,
      memo: todo.memo,
      createdAt: todo.createdAt ?? new Date().toISOString(),
      completedAt: todo.completedAt,
    })),
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
    clinicSchedules: parsed.clinicSchedules ?? [],
    sessionTestConfigs: parsed.sessionTestConfigs ?? [],
    weeklyProgress: (parsed.weeklyProgress ?? []).map((p: WeeklyProgress & { schoolId?: string }) => ({
      ...p,
      classId: p.classId ?? p.schoolId ?? '',
    })),
    classes: (parsed.classes ?? []).map(c => ({
      ...c,
      name: CLASS_NAME_MIGRATION[c.name] ?? c.name,
      days: c.days ?? 'mon-fri',
    })),
    grades: (parsed.grades ?? []).map((g: GradeRecord & { homeworkDone: unknown }) => {
      const hd: unknown = g.homeworkDone
      return {
        ...g,
        extras: g.extras ?? {},
        attendance: g.attendance ?? null,
        homeworkDone: hd === true ? '제출'
          : (hd === false || hd === '미제출') ? '미흡'
          : (hd as HomeworkStatus) ?? null,
      }
    }),
  }
}

// ─── Context ────────────────────────────────────────────────────────────────

export const SCHEDULE_ACTION_TYPES = new Set<Action['type']>([
  'ADD_SCHEDULE_EVENT', 'UPDATE_SCHEDULE_EVENT', 'DELETE_SCHEDULE_EVENT',
  'COMPLETE_SCHEDULE_EVENT', 'TOGGLE_SCHEDULE_EVENT',
])

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  loading: boolean
  globalScheduleEvents: ScheduleEvent[]
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
  getScope: (sessionNum: number, classId: string) => SessionScope | undefined
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({
  children,
  uid,
  academyId,
  isAdmin = false,
}: {
  children: ReactNode
  uid: string
  academyId?: string
  isAdmin?: boolean
}) {
  const [state, baseDispatch] = useReducer(reducer, DEFAULT_STATE)
  const [loading, setLoading] = useState(true)
  const [globalScheduleEvents, setGlobalScheduleEvents] = useState<ScheduleEvent[]>([])
  const [visibleCount, setVisibleCount] = useState(8)
  const dispatch = useAppPersistence({
    uid,
    academyId,
    isAdmin,
    state,
    loading,
    baseDispatch,
    setLoading,
    setGlobalScheduleEvents,
    normalizeState,
    legacyStorageKey: LEGACY_STORAGE_KEY,
    scheduleActionTypes: SCHEDULE_ACTION_TYPES,
  })

  const currentYM = useMemo(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [selectedYM, setSelectedYM] = useState(currentYM)

  const [selectedSession, setSelectedSession] = useState(() => {
    const ws = getWeekStart()
    const cur = getSessionNum(ws) + 1
    const d = new Date(ws + 'T00:00:00')
    d.setDate(d.getDate() + 3)
    const cym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const [y, m] = cym.split('-').map(Number)
    const sessions = getMonthSessions(y, m, 8)
    return sessions.includes(cur) ? cur : (sessions[0] ?? 1)
  })

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

  const getScope = (sessionNum: number, classId: string) =>
    state.scopes.find(s => s.sessionNum === sessionNum && s.classId === classId)

  return (
    <AppContext.Provider
      value={{ state, dispatch, loading, globalScheduleEvents, visibleCount, setVisibleCount, selectedYM, setSelectedYM, selectedSession, setSelectedSession, getStudentsByClass, getGrade, getRetests, getPendingRetests, getCurrentSession, getScope }}
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
