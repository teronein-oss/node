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
