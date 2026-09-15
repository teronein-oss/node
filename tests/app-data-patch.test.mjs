import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/context/appDataPatch.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const { buildAppDataPatch, valuesEqual } = await import(moduleUrl)

const baseState = () => ({
  classes: [], students: [], grades: [], retests: [], homeworks: [], scoreColumns: [], scopes: [],
  vocabThreshold: 80, dailyThreshold: 80, vocabMode: '개수', dailyMode: '개수',
  vocabTotal: 100, dailyTotal: 100, notices: [], todos: [], examInfo: [], weeklyProgress: [],
  scheduleEvents: [], clinicSchedules: [], sessionTestConfigs: [],
})

test('buildAppDataPatch only includes fields changed by the local action', () => {
  const previous = baseState()
  const next = { ...previous, grades: [{ id: 'grade-1', vocabScore: 90 }] }

  assert.deepEqual(buildAppDataPatch(previous, next), {
    grades: [{ id: 'grade-1', vocabScore: 90 }],
  })
})

test('merging a stale-tab patch preserves newer remote schedules and memos', () => {
  const stale = baseState()
  const next = { ...stale, grades: [{ id: 'grade-1', vocabScore: 84 }] }
  const remote = {
    ...stale,
    scheduleEvents: [{ id: 'schedule-1', title: '다른 기기에서 추가한 일정' }],
    todos: [{ id: 'memo-1', title: '다른 기기에서 추가한 메모' }],
  }

  const merged = { ...remote, ...buildAppDataPatch(stale, next) }
  assert.deepEqual(merged.scheduleEvents, remote.scheduleEvents)
  assert.deepEqual(merged.todos, remote.todos)
  assert.deepEqual(merged.grades, next.grades)
})

test('comparison ignores object key order and undefined values', () => {
  assert.equal(valuesEqual(
    { id: 'schedule-1', title: '일정', time: undefined },
    { title: '일정', id: 'schedule-1' },
  ), true)
})
