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
const { displayDistribution, scoreBandFor } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

test('maps each score boundary to exactly one mascot band', () => {
  assert.equal(scoreBandFor(0), '0–59')
  assert.equal(scoreBandFor(59.9), '0–59')
  assert.equal(scoreBandFor(60), '60–69')
  assert.equal(scoreBandFor(70), '70–79')
  assert.equal(scoreBandFor(80), '80–89')
  assert.equal(scoreBandFor(90), '90–99')
  assert.equal(scoreBandFor(99.9), '90–99')
  assert.equal(scoreBandFor(100), '100')
  assert.equal(scoreBandFor(null), null)
  assert.equal(scoreBandFor(Number.NaN), null)
})

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

test('the three sample codes cover all six animation bands', async () => {
  const sampleBundle = await build({
    entryPoints: ['src/report-portal/sampleEnglishReports.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  })
  const { getSampleEnglishReport } = await import(`data:text/javascript;base64,${Buffer.from(sampleBundle.outputFiles[0].text).toString('base64')}`)
  const bands = new Set(['LEE7A526', 'KMS6B427', 'HSE8C329'].flatMap(code => (
    getSampleEnglishReport(code).exams.map(exam => scoreBandFor(exam.result.totalScore))
  )))
  assert.deepEqual([...bands].sort(), ['0–59', '60–69', '70–79', '80–89', '90–99', '100'].sort())
})
