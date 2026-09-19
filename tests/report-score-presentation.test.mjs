import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/report-portal/scorePresentation.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const { displayDistribution } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

test('combines the two lower score bands from live reports', () => {
  const distribution = displayDistribution({
    result: { totalScore: 55 },
    scoreDistribution: {
      studentBand: '50–59',
      bins: [
        { label: '0–49', percent: 25 },
        { label: '50–59', percent: 20.5 },
        { label: '60–69', percent: 22.7 },
      ],
    },
  })
  assert.deepEqual(distribution, {
    bins: [
      { label: '0–59', percent: 45.5 },
      { label: '60–69', percent: 22.7 },
    ],
    studentBand: '0–59',
  })
})

test('keeps an already-combined sample band and handles absent students', () => {
  const scoreDistribution = {
    studentBand: '0~59',
    bins: [{ label: '0~59', percent: 13 }, { label: '60~69', percent: 87 }],
  }
  assert.deepEqual(displayDistribution({ result: { totalScore: 50 }, scoreDistribution }), {
    bins: [{ label: '0–59', percent: 13 }, { label: '60–69', percent: 87 }],
    studentBand: '0–59',
  })
  assert.equal(displayDistribution({ result: null, scoreDistribution }).studentBand, null)
})
