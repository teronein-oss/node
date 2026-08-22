import assert from 'node:assert/strict'
import test from 'node:test'
import { isJpeg, normalizeRecipients, solapiTextBytes, summarizeDeliveries, type DeliveryResult } from './messageDomain'

const delivery = (status: DeliveryResult['status'], statusCode: string | null): DeliveryResult => ({
  messageId: 'M1', to: '01012345678', type: 'SMS', status, statusCode,
  reason: null, dateReceived: null, dateReported: null,
})

test('수신번호를 정규화하고 중복을 제거한다', () => {
  assert.deepEqual(normalizeRecipients(['010-1234-5678', '01012345678', ' 02 123 4567 ']), ['01012345678', '021234567'])
})

test('SOLAPI 문자 byte를 계산한다', () => {
  assert.equal(solapiTextBytes('abc한글'), 7)
})

test('전체 발송 상태를 집계한다', () => {
  assert.equal(summarizeDeliveries([delivery('PENDING', '2000')]), 'PROCESSING')
  assert.equal(summarizeDeliveries([delivery('COMPLETE', '4000')]), 'SUCCESS')
  assert.equal(summarizeDeliveries([delivery('COMPLETE', '4000'), delivery('COMPLETE', '5000')]), 'PARTIAL_FAILURE')
  assert.equal(summarizeDeliveries([delivery('COMPLETE', '5000')]), 'FAILED')
})

test('JPEG 시그니처를 확인한다', () => {
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0x00])), true)
  assert.equal(isJpeg(Buffer.from('not an image')), false)
})
