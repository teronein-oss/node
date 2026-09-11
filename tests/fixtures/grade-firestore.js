// Isolated Firestore substitute: only test data in this browser's localStorage.
const storageKey = 'grade-persistence-test-db'
const listeners = new Map()
export let failWrites = false
export const setFailWrites = value => { failWrites = value }
export const readDocuments = () => JSON.parse(localStorage.getItem(storageKey) ?? '{}')
export const seedDocuments = documents => {
  if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(documents))
}
const snapshot = path => {
  const data = readDocuments()[path]
  return { exists: () => data !== undefined, data: () => structuredClone(data) }
}
export const emitSnapshot = (path, data) => {
  for (const listener of listeners.get(path) ?? []) {
    listener({ exists: () => true, data: () => structuredClone(data) })
  }
}
export const onSnapshot = (path, callback) => {
  const subscribers = listeners.get(path) ?? new Set()
  listeners.set(path, subscribers)
  subscribers.add(callback)
  queueMicrotask(() => { if (subscribers.has(callback)) callback(snapshot(path)) })
  return () => subscribers.delete(callback)
}
export const setDoc = async (path, data, options) => {
  if (failWrites && path === 'appData/teacher-test') {
    throw Object.assign(new Error('Test write rejected'), { code: 'permission-denied' })
  }
  await new Promise(resolve => setTimeout(resolve, 40))
  const documents = readDocuments()
  documents[path] = options?.merge ? { ...documents[path], ...data } : data
  localStorage.setItem(storageKey, JSON.stringify(documents))
  emitSnapshot(path, documents[path])
}
export const deleteField = () => undefined
export const updateDoc = (path, data) => setDoc(path, data, { merge: true })
export const appDataDoc = uid => `appData/${uid}`
export const homeworkDataDoc = uid => `homeworkData/${uid}`
export const sharedStudentRosterDoc = uid => `rosters/${uid}`
export const configDoc = () => 'config/sharedData'
