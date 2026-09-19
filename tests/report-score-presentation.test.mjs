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

test('maps each score boundary to exactly one of the five descending bands', () => {
  assert.equal(scoreBandFor(0), '59–0')
  assert.equal(scoreBandFor(59.9), '59–0')
  assert.equal(scoreBandFor(60), '69–60')
  assert.equal(scoreBandFor(69.9), '69–60')
  assert.equal(scoreBandFor(70), '79–70')
  assert.equal(scoreBandFor(79.9), '79–70')
  assert.equal(scoreBandFor(80), '89–80')
  assert.equal(scoreBandFor(89.9), '89–80')
  assert.equal(scoreBandFor(90), '100–90')
  assert.equal(scoreBandFor(99.9), '100–90')
  assert.equal(scoreBandFor(100), '100–90')
  assert.equal(scoreBandFor(null), null)
  assert.equal(scoreBandFor(Number.NaN), null)
})

test('combines the old upper and lower bins from live reports without losing percentages', () => {
  const distribution = displayDistribution({
    result: { totalScore: 55 },
    scoreDistribution: {
      studentBand: '90–99',
      bins: [
        { label: '0–49', percent: 25 },
        { label: '50–59', percent: 20.5 },
        { label: '60–69', percent: 22.7 },
        { label: '70–79', percent: 10 },
        { label: '80–89', percent: 5 },
        { label: '90–99', percent: 14.8 },
        { label: '100', percent: 2 },
      ],
    },
  })
  assert.deepEqual(distribution, {
    bins: [
      { label: '100–90', percent: 16.8 },
      { label: '89–80', percent: 5 },
      { label: '79–70', percent: 10 },
      { label: '69–60', percent: 22.7 },
      { label: '59–0', percent: 45.5 },
    ],
    studentBand: '59–0',
  })
  assert.equal(distribution.bins.reduce((sum, bin) => sum + bin.percent, 0), 100)
})

test('normalizes already-combined sample bins and handles absent students', () => {
  const scoreDistribution = {
    studentBand: '0~59',
    bins: [
      { label: '0~59', percent: 13 },
      { label: '60~69', percent: 21 },
      { label: '70~79', percent: 30 },
      { label: '80~89', percent: 24 },
      { label: '90~100', percent: 12 },
    ],
  }
  assert.deepEqual(displayDistribution({ result: { totalScore: 100 }, scoreDistribution }), {
    bins: [
      { label: '100–90', percent: 12 },
      { label: '89–80', percent: 24 },
      { label: '79–70', percent: 30 },
      { label: '69–60', percent: 21 },
      { label: '59–0', percent: 13 },
    ],
    studentBand: '100–90',
  })
  assert.equal(displayDistribution({ result: null, scoreDistribution }).studentBand, null)
})

test('the three sample codes cover all five display bands', async () => {
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
  assert.deepEqual([...bands].sort(), ['59–0', '69–60', '79–70', '89–80', '100–90'].sort())
})

test('one sample student shows all five bands in every term', async () => {
  const sampleBundle = await build({
    entryPoints: ['src/report-portal/sampleEnglishReports.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  })
  const { getSampleEnglishReport } = await import(`data:text/javascript;base64,${Buffer.from(sampleBundle.outputFiles[0].text).toString('base64')}`)
  const report = getSampleEnglishReport('CAT52026')

  assert.ok(report)
  assert.equal(report.studentName, '한X별')
  assert.equal(report.terms.length, 8)
  for (const term of report.terms) {
    const exams = report.exams.filter(exam => exam.termId === term.termId)
    assert.equal(exams.length, 5)
    assert.deepEqual(exams.map(exam => scoreBandFor(exam.result.totalScore)), [
      '59–0', '69–60', '79–70', '89–80', '100–90',
    ])
    for (const exam of exams) {
      assert.equal(exam.result.objectiveScore + exam.result.writtenScore, exam.result.totalScore)
    }
  }
  assert.deepEqual(report.exams.filter(exam => exam.termId === report.terms[0].termId).map(exam => exam.result.totalScore), [55, 65, 75, 85, 95])
})
