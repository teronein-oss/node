import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/report-portal/gradePresentation.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const { GRADE_CRITERIA, gradeForTopPercent } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

test('uses the five stated grade shares and cumulative upper bounds', () => {
  assert.deepEqual(GRADE_CRITERIA.map(({ grade, share, cumulativeTopPercent }) => [grade, share, cumulativeTopPercent]), [
    [1, 10, 10],
    [2, 24, 34],
    [3, 32, 66],
    [4, 24, 90],
    [5, 10, 100],
  ])
  assert.equal(GRADE_CRITERIA.reduce((sum, criterion) => sum + criterion.share, 0), 100)
})

test('assigns exact grade boundaries from the stored top percentile', () => {
  for (const [topPercent, grade] of [
    [1, 1], [10, 1], [11, 2], [34, 2], [35, 3], [66, 3],
    [67, 4], [90, 4], [91, 5], [100, 5],
  ]) {
    assert.equal(gradeForTopPercent(topPercent), grade)
  }
  for (const topPercent of [null, Number.NaN, 0, -1, 101, Number.POSITIVE_INFINITY]) {
    assert.equal(gradeForTopPercent(topPercent), null)
  }
})
