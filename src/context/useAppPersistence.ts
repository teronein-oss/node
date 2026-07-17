import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { onSnapshot, setDoc } from 'firebase/firestore'
import type { ScheduleEvent } from '../types'
import type { Action, AppState } from './AppContext'
import { appDataDoc, configDoc, sharedStudentRosterDoc } from '../utils/firestorePaths'

interface UseAppPersistenceParams {
  uid: string
  academyId?: string
  isAdmin: boolean
  state: AppState
  loading: boolean
  baseDispatch: Dispatch<Action>
  setLoading: Dispatch<SetStateAction<boolean>>
  setGlobalScheduleEvents: Dispatch<SetStateAction<ScheduleEvent[]>>
  normalizeState: (parsed: AppState) => AppState
  legacyStorageKey: string
  scheduleActionTypes: Set<Action['type']>
}

const toFirestoreData = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const getGlobalEvents = (events: ScheduleEvent[] = []) =>
  events.filter(e => e.type === 'all')

export function useAppPersistence({
  uid,
  academyId,
  isAdmin,
  state,
  loading,
  baseDispatch,
  setLoading,
  setGlobalScheduleEvents,
  normalizeState,
  legacyStorageKey,
  scheduleActionTypes,
}: UseAppPersistenceParams): Dispatch<Action> {
  const firestoreDoc = useMemo(() => appDataDoc(uid, academyId), [uid, academyId])
  const stateRef = useRef(state)
  stateRef.current = state
  const loadingRef = useRef(true)
  loadingRef.current = loading
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWriteCount = useRef(0)

  // 비관리자: config/sharedData 구독해서 전체 공지 일정 수신
  useEffect(() => {
    if (isAdmin) return
    const sharedRef = configDoc(academyId)
    return onSnapshot(sharedRef, (snap) => {
      if (snap.exists()) {
        const raw = ((snap.data().globalScheduleEvents ?? []) as Record<string, unknown>[])
        setGlobalScheduleEvents(raw.map(ev => ({
          id: ev['id'] as string,
          startDate: ev['startDate'] as string,
          endDate: ev['endDate'] as string,
          title: ev['title'] as string,
          type: 'all' as const,
          time: ev['time'] as string | undefined,
          completed: (ev['completed'] as boolean | undefined) ?? false,
          createdAt: ev['createdAt'] as string,
        })))
      } else {
        setGlobalScheduleEvents([])
      }
    })
  }, [isAdmin, setGlobalScheduleEvents])

  // 관리자 데이터 로드 완료 시 전체 공지 일정을 config/sharedData에 즉시 1회 동기화
  useEffect(() => {
    if (!isAdmin || loading) return
    setDoc(
      configDoc(academyId),
      { globalScheduleEvents: toFirestoreData(getGlobalEvents(state.scheduleEvents)) },
      { merge: true }
    ).catch(err => console.error('❌ 전체 일정 동기화 실패:', err?.code))
  // loading이 false로 바뀌는 시점(최초 1회)에만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading])

  // dispatch: LOAD 액션은 Firestore 저장 건너뜀, 나머지는 300ms 디바운스 저장
  const dispatch = useCallback((action: Action) => {
    baseDispatch(action)
    if (action.type === 'LOAD' || loadingRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      pendingWriteCount.current++
      setDoc(firestoreDoc, toFirestoreData(stateRef.current))
        .then(() => {
          console.log('✅ Firestore 저장:', firestoreDoc.path)
          // 관리자가 일정을 변경한 경우 전체 공지 일정을 config/sharedData에 동기화
          if (isAdmin && scheduleActionTypes.has(action.type)) {
            setDoc(
              configDoc(academyId),
              { globalScheduleEvents: toFirestoreData(getGlobalEvents(stateRef.current.scheduleEvents)) },
              { merge: true }
            )
              .then(() => console.log('✅ 전체 일정 동기화 완료'))
              .catch(err => console.error('❌ 전체 일정 동기화 실패:', err?.code))
          }
        })
        .catch((err) => {
          pendingWriteCount.current--
          console.error('❌ Firestore 저장 실패:', err?.code, err?.message)
        })
    }, 300)
  }, [baseDispatch, firestoreDoc, isAdmin, scheduleActionTypes])

  // Firestore 실시간 구독 (읽기 전용 — 저장은 dispatch 래퍼가 담당)
  useEffect(() => {
    const unsubscribe = onSnapshot(firestoreDoc, (snap) => {
      if (snap.exists()) {
        if (pendingWriteCount.current > 0) {
          // 우리가 직접 저장한 onSnapshot 반응 — in-memory 상태를 덮어쓰지 않음
          pendingWriteCount.current--
        } else {
          const rawState = snap.data() as AppState
          const normalized = normalizeState(rawState)
          baseDispatch({ type: 'LOAD', payload: normalized })
          if ((rawState.students ?? []).some(student => student.active === false && !student.withdrawnAt)) {
            setDoc(firestoreDoc, toFirestoreData(normalized), { merge: true })
              .catch(err => console.error('❌ 퇴원일 마이그레이션 실패:', err?.code))
          }
          // 관리자 계정 로드 시 기존 전체 공지 일정도 즉시 동기화
          if (isAdmin) {
            setDoc(
              configDoc(academyId),
              { globalScheduleEvents: toFirestoreData(getGlobalEvents(normalized.scheduleEvents)) },
              { merge: true }
            )
              .then(() => console.log('✅ 기존 전체 일정 동기화 완료'))
              .catch(err => console.error('❌ 전체 일정 동기화 실패:', err?.code))
          }
        }
      } else {
        try {
          const saved = localStorage.getItem(legacyStorageKey)
          if (saved) {
            const parsed = normalizeState(JSON.parse(saved) as AppState)
            setDoc(firestoreDoc, toFirestoreData(parsed))
              .then(() => localStorage.removeItem(legacyStorageKey))
              .catch((err) => console.error('마이그레이션 실패:', err?.code))
            baseDispatch({ type: 'LOAD', payload: parsed })
          }
        } catch { /* ignore */ }
      }
      setLoading(false)
    }, (err) => {
      console.error('Firestore 오류:', err?.code, err?.message)
      setLoading(false)
    })
    return unsubscribe
  }, [baseDispatch, firestoreDoc, isAdmin, legacyStorageKey, normalizeState, setLoading])

  useEffect(() => {
    if (loading) return
    setDoc(sharedStudentRosterDoc(uid, academyId), {
      uid,
      classes: toFirestoreData(state.classes ?? []),
      students: toFirestoreData(state.students ?? []),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(err => console.error('공유 학생 명단 동기화 실패:', err?.code))
  }, [uid, academyId, loading, state.classes, state.students])

  return dispatch
}
