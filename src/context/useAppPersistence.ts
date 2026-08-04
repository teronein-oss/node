import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { deleteField, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import type { HomeworkAssignment, ScheduleEvent } from '../types'
import type { Action, AppState } from './AppContext'
import { appDataDoc, configDoc, homeworkDataDoc, sharedStudentRosterDoc } from '../utils/firestorePaths'

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
  reduceState: (state: AppState, action: Action) => AppState
}

export type AppSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAppPersistenceResult {
  dispatch: Dispatch<Action>
  saveStatus: AppSaveStatus
  saveError: string | null
}

interface HomeworkDocument {
  homeworks: HomeworkAssignment[]
  updatedAt: string
  clientUpdatedAt: number
  schemaVersion: 1
}

const HOMEWORK_ACTION_TYPES = new Set<Action['type']>([
  'SAVE_HOMEWORK',
  'ADD_HOMEWORK_ITEM',
  'DELETE_HOMEWORK',
  'TOGGLE_HOMEWORK_ITEM',
  'SET_ITEM_STUDENT_STATUS',
  'SET_HOMEWORK_RECHECK_DATE',
  'BULK_REASSIGN_STUDENTS',
])

const HOMEWORK_ONLY_ACTION_TYPES = new Set<Action['type']>([
  'SAVE_HOMEWORK',
  'ADD_HOMEWORK_ITEM',
  'DELETE_HOMEWORK',
  'TOGGLE_HOMEWORK_ITEM',
  'SET_HOMEWORK_RECHECK_DATE',
])

const NON_RETRYABLE_FIRESTORE_ERRORS = new Set([
  'permission-denied',
  'invalid-argument',
  'failed-precondition',
  'unauthenticated',
])

const FIRESTORE_WARNING_BYTES = 900_000

const toFirestoreData = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const toAppData = (state: AppState): Omit<AppState, 'homeworks'> => {
  const { homeworks: _homeworks, ...appData } = state
  return toFirestoreData(appData)
}

const getGlobalEvents = (events: ScheduleEvent[] = []) =>
  events.filter(event => event.type === 'all')

const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay))

const approximateBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length

const formatSaveError = (error: unknown) => {
  const err = error as { code?: string; message?: string }
  if (err.code === 'permission-denied') return '저장 권한이 없습니다. 다시 로그인해 주세요.'
  if (err.code === 'resource-exhausted' || err.message?.includes('too large')) {
    return '저장 데이터가 Firestore 용량 제한을 초과했습니다.'
  }
  if (err.code === 'unavailable') return '네트워크 연결을 확인해 주세요.'
  return err.message || '저장 중 알 수 없는 오류가 발생했습니다.'
}

const parsePendingHomework = (storageKey: string): HomeworkDocument | null => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HomeworkDocument>
    if (!Array.isArray(parsed.homeworks) || typeof parsed.clientUpdatedAt !== 'number') return null
    return {
      homeworks: parsed.homeworks,
      updatedAt: parsed.updatedAt ?? new Date(parsed.clientUpdatedAt).toISOString(),
      clientUpdatedAt: parsed.clientUpdatedAt,
      schemaVersion: 1,
    }
  } catch {
    return null
  }
}

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
  reduceState,
}: UseAppPersistenceParams): UseAppPersistenceResult {
  const firestoreDoc = useMemo(() => appDataDoc(uid, academyId), [uid, academyId])
  const homeworkDoc = useMemo(() => homeworkDataDoc(uid, academyId), [uid, academyId])
  const pendingHomeworkKey = useMemo(
    () => `academy-dashboard-homework-pending-v1:${academyId ?? 'node-default'}:${uid}`,
    [academyId, uid]
  )

  const stateRef = useRef(state)
  stateRef.current = state
  const loadingRef = useRef(true)
  loadingRef.current = loading
  const appSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const homeworkSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appChangeVersion = useRef(0)
  const homeworkChangeVersion = useRef(0)
  const hasPendingAppChanges = useRef(false)
  const hasPendingHomeworkChanges = useRef(false)
  const appWriteChain = useRef<Promise<void>>(Promise.resolve())
  const homeworkWriteChain = useRef<Promise<void>>(Promise.resolve())
  const saveErrorRef = useRef<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<AppSaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const markSaving = useCallback(() => {
    if (statusResetTimer.current) clearTimeout(statusResetTimer.current)
    saveErrorRef.current = null
    setSaveError(null)
    setSaveStatus('saving')
  }, [])

  const refreshSaveStatus = useCallback(() => {
    if (saveErrorRef.current) {
      setSaveStatus('error')
      setSaveError(saveErrorRef.current)
      return
    }
    if (hasPendingAppChanges.current || hasPendingHomeworkChanges.current) {
      setSaveStatus('saving')
      return
    }
    setSaveStatus('saved')
    if (statusResetTimer.current) clearTimeout(statusResetTimer.current)
    statusResetTimer.current = setTimeout(() => setSaveStatus('idle'), 2500)
  }, [])

  const markSaveError = useCallback((error: unknown) => {
    const message = formatSaveError(error)
    saveErrorRef.current = message
    setSaveError(message)
    setSaveStatus('error')
  }, [])

  const writeWithRetry = useCallback(async (write: () => Promise<void>) => {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await write()
        return
      } catch (error) {
        lastError = error
        const code = (error as { code?: string }).code ?? ''
        if (NON_RETRYABLE_FIRESTORE_ERRORS.has(code) || attempt === 2) break
        await wait(250 * (attempt + 1))
      }
    }
    throw lastError
  }, [])

  const enqueueAppWrite = useCallback((nextState: AppState, version: number) => {
    const data = toAppData(nextState)
    if (approximateBytes(data) > FIRESTORE_WARNING_BYTES) {
      markSaveError(new Error('앱 데이터 문서가 Firestore 용량 제한에 근접했습니다.'))
      return
    }

    appWriteChain.current = appWriteChain.current
      .catch(() => undefined)
      .then(() => writeWithRetry(() => setDoc(firestoreDoc, data)))
      .then(() => {
        if (version === appChangeVersion.current) hasPendingAppChanges.current = false
        refreshSaveStatus()
      })
      .catch(error => {
        console.error('Firestore 앱 데이터 저장 실패:', (error as { code?: string }).code, (error as Error).message)
        markSaveError(error)
      })
  }, [firestoreDoc, markSaveError, refreshSaveStatus, writeWithRetry])

  const enqueueHomeworkWrite = useCallback((document: HomeworkDocument, version: number, removeLegacy = false) => {
    if (approximateBytes(document) > FIRESTORE_WARNING_BYTES) {
      markSaveError(new Error('숙제 데이터 문서가 Firestore 용량 제한에 근접했습니다.'))
      return
    }

    homeworkWriteChain.current = homeworkWriteChain.current
      .catch(() => undefined)
      .then(() => writeWithRetry(() => setDoc(homeworkDoc, toFirestoreData(document))))
      .then(async () => {
        if (removeLegacy) {
          await updateDoc(firestoreDoc, { homeworks: deleteField() }).catch(error => {
            console.error('기존 숙제 데이터 정리 실패:', (error as { code?: string }).code)
          })
        }
        if (version === homeworkChangeVersion.current) {
          hasPendingHomeworkChanges.current = false
          const pending = parsePendingHomework(pendingHomeworkKey)
          if (!pending || pending.clientUpdatedAt <= document.clientUpdatedAt) {
            localStorage.removeItem(pendingHomeworkKey)
          }
        }
        refreshSaveStatus()
      })
      .catch(error => {
        console.error('Firestore 숙제 저장 실패:', (error as { code?: string }).code, (error as Error).message)
        markSaveError(error)
      })
  }, [firestoreDoc, homeworkDoc, markSaveError, pendingHomeworkKey, refreshSaveStatus, writeWithRetry])

  const scheduleAppSave = useCallback((nextState: AppState) => {
    const version = ++appChangeVersion.current
    hasPendingAppChanges.current = true
    markSaving()
    if (appSaveTimer.current) clearTimeout(appSaveTimer.current)
    appSaveTimer.current = setTimeout(() => {
      appSaveTimer.current = null
      enqueueAppWrite(nextState, version)
    }, 250)
  }, [enqueueAppWrite, markSaving])

  const scheduleHomeworkSave = useCallback((homeworks: HomeworkAssignment[], removeLegacy = false) => {
    const version = ++homeworkChangeVersion.current
    const clientUpdatedAt = Date.now()
    const document: HomeworkDocument = {
      homeworks: toFirestoreData(homeworks),
      updatedAt: new Date(clientUpdatedAt).toISOString(),
      clientUpdatedAt,
      schemaVersion: 1,
    }
    try {
      localStorage.setItem(pendingHomeworkKey, JSON.stringify(document))
    } catch (error) {
      console.warn('숙제 임시 저장소 기록 실패:', error)
    }
    hasPendingHomeworkChanges.current = true
    markSaving()
    if (homeworkSaveTimer.current) clearTimeout(homeworkSaveTimer.current)
    homeworkSaveTimer.current = setTimeout(() => {
      homeworkSaveTimer.current = null
      enqueueHomeworkWrite(document, version, removeLegacy)
    }, 0)
  }, [enqueueHomeworkWrite, markSaving, pendingHomeworkKey])

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'LOAD') {
      stateRef.current = action.payload
      baseDispatch(action)
      return
    }

    const nextState = reduceState(stateRef.current, action)
    stateRef.current = nextState
    baseDispatch({ type: 'LOAD', payload: nextState })
    if (loadingRef.current) return

    if (HOMEWORK_ACTION_TYPES.has(action.type)) {
      scheduleHomeworkSave(nextState.homeworks)
    }
    if (!HOMEWORK_ONLY_ACTION_TYPES.has(action.type)) {
      scheduleAppSave(nextState)
    }

    if (isAdmin && scheduleActionTypes.has(action.type)) {
      setDoc(
        configDoc(academyId),
        { globalScheduleEvents: toFirestoreData(getGlobalEvents(nextState.scheduleEvents)) },
        { merge: true }
      ).catch(error => console.error('전체 일정 동기화 실패:', (error as { code?: string }).code))
    }
  }, [academyId, baseDispatch, isAdmin, reduceState, scheduleActionTypes, scheduleAppSave, scheduleHomeworkSave])

  // 비관리자: 학원 전체 공지 일정을 구독한다.
  useEffect(() => {
    if (isAdmin) return
    return onSnapshot(configDoc(academyId), snapshot => {
      if (!snapshot.exists()) {
        setGlobalScheduleEvents([])
        return
      }
      const raw = (snapshot.data().globalScheduleEvents ?? []) as Record<string, unknown>[]
      setGlobalScheduleEvents(raw.map(event => ({
        id: event.id as string,
        startDate: event.startDate as string,
        endDate: event.endDate as string,
        title: event.title as string,
        type: 'all' as const,
        time: event.time as string | undefined,
        completed: (event.completed as boolean | undefined) ?? false,
        createdAt: event.createdAt as string,
      })))
    })
  }, [academyId, isAdmin, setGlobalScheduleEvents])

  // 앱 데이터와 숙제 전용 문서를 모두 받은 뒤 한 번에 화면에 적용한다.
  useEffect(() => {
    let appSnapshotState: AppState | null = null
    let appDocumentExists = false
    let homeworkSnapshotData: HomeworkDocument | null = null
    let homeworkSnapshotReceived = false
    let initialized = false

    setLoading(true)

    const applyInitialState = () => {
      if (initialized || !appSnapshotState || !homeworkSnapshotReceived) return

      const pending = parsePendingHomework(pendingHomeworkKey)
      const serverUpdatedAt = homeworkSnapshotData?.clientUpdatedAt ?? 0
      const pendingIsNewer = pending && pending.clientUpdatedAt > serverUpdatedAt
      const selectedHomeworks = pendingIsNewer
        ? pending.homeworks
        : homeworkSnapshotData?.homeworks ?? appSnapshotState.homeworks
      const merged = normalizeState({ ...appSnapshotState, homeworks: selectedHomeworks })

      stateRef.current = merged
      baseDispatch({ type: 'LOAD', payload: merged })
      initialized = true
      setLoading(false)

      if (pendingIsNewer) {
        scheduleHomeworkSave(pending.homeworks, homeworkSnapshotData === null && appSnapshotState.homeworks.length > 0)
      } else if (homeworkSnapshotData === null && appSnapshotState.homeworks.length > 0) {
        scheduleHomeworkSave(appSnapshotState.homeworks, appDocumentExists)
      } else if (pending && !pendingIsNewer) {
        localStorage.removeItem(pendingHomeworkKey)
      }

      if (!appDocumentExists) {
        setDoc(firestoreDoc, toAppData(merged)).catch(error => markSaveError(error))
      }
    }

    const unsubscribeApp = onSnapshot(firestoreDoc, snapshot => {
      appDocumentExists = snapshot.exists()
      if (snapshot.exists()) {
        const rawState = snapshot.data() as AppState
        const normalized = normalizeState(rawState)
        appSnapshotState = normalized

        if (initialized && !hasPendingAppChanges.current && appSaveTimer.current === null) {
          const merged = normalizeState({ ...normalized, homeworks: stateRef.current.homeworks })
          stateRef.current = merged
          baseDispatch({ type: 'LOAD', payload: merged })
        }

        const rawAppData = toAppData(rawState)
        const normalizedAppData = toAppData(normalized)
        if (JSON.stringify(rawAppData) !== JSON.stringify(normalizedAppData)) {
          setDoc(firestoreDoc, normalizedAppData).catch(error => console.error('데이터 정규화 저장 실패:', (error as { code?: string }).code))
        }
      } else {
        let legacyState: AppState | null = null
        try {
          const saved = localStorage.getItem(legacyStorageKey)
          if (saved) legacyState = normalizeState(JSON.parse(saved) as AppState)
        } catch {
          legacyState = null
        }
        appSnapshotState = legacyState ?? normalizeState({} as AppState)
      }
      applyInitialState()
    }, error => {
      console.error('Firestore 앱 데이터 구독 실패:', error.code, error.message)
      markSaveError(error)
      setLoading(false)
    })

    const unsubscribeHomework = onSnapshot(homeworkDoc, snapshot => {
      homeworkSnapshotReceived = true
      homeworkSnapshotData = snapshot.exists()
        ? {
            homeworks: (snapshot.data().homeworks ?? []) as HomeworkAssignment[],
            updatedAt: snapshot.data().updatedAt ?? '',
            clientUpdatedAt: snapshot.data().clientUpdatedAt ?? 0,
            schemaVersion: 1,
          }
        : null

      const currentHomeworkData = homeworkSnapshotData
      if (initialized && currentHomeworkData && !hasPendingHomeworkChanges.current && homeworkSaveTimer.current === null) {
        const merged = normalizeState({ ...stateRef.current, homeworks: currentHomeworkData.homeworks })
        stateRef.current = merged
        baseDispatch({ type: 'LOAD', payload: merged })
      }
      applyInitialState()
    }, error => {
      console.error('Firestore 숙제 데이터 구독 실패:', error.code, error.message)
      markSaveError(error)
      homeworkSnapshotReceived = true
      applyInitialState()
    })

    return () => {
      unsubscribeApp()
      unsubscribeHomework()
    }
  }, [baseDispatch, firestoreDoc, homeworkDoc, legacyStorageKey, markSaveError, normalizeState, pendingHomeworkKey, scheduleHomeworkSave, setLoading])

  // 관리자 데이터 로드 후 전체 공지 일정도 공유 문서에 맞춘다.
  useEffect(() => {
    if (!isAdmin || loading) return
    setDoc(
      configDoc(academyId),
      { globalScheduleEvents: toFirestoreData(getGlobalEvents(state.scheduleEvents)) },
      { merge: true }
    ).catch(error => console.error('전체 일정 동기화 실패:', (error as { code?: string }).code))
  // loading이 false로 바뀌는 최초 시점에만 실행한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading])

  useEffect(() => {
    if (loading) return
    setDoc(sharedStudentRosterDoc(uid, academyId), {
      uid,
      classes: toFirestoreData(state.classes ?? []),
      students: toFirestoreData(state.students ?? []),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(error => console.error('공유 학생 명단 동기화 실패:', (error as { code?: string }).code))
  }, [uid, academyId, loading, state.classes, state.students])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingAppChanges.current && !hasPendingHomeworkChanges.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [])

  useEffect(() => () => {
    if (appSaveTimer.current) clearTimeout(appSaveTimer.current)
    if (homeworkSaveTimer.current) clearTimeout(homeworkSaveTimer.current)
    if (statusResetTimer.current) clearTimeout(statusResetTimer.current)
  }, [])

  return { dispatch, saveStatus, saveError }
}
