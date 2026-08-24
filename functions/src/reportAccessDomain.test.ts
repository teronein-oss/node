import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_CODE_LENGTH,
  MASTER_ACCESS_CODE_LENGTH,
  createAccessCode,
  hashAccessCode,
  hashTeacherAccessCode,
  isValidAccessCode,
  isValidMasterAccessCode,
  normalizeAccessCode,
  rankToTopPercent,
} from './reportAccessDomain'

test('access code normalization removes separators and uppercases letters', () => {
  assert.equal(normalizeAccessCode(' abcd-2345 '), 'ABCD2345')
})

test('generated access codes use the supported alphabet', () => {
  for (let index = 0; index < 100; index += 1) {
    const code = createAccessCode()
    assert.equal(code.length, ACCESS_CODE_LENGTH)
    assert.equal(isValidAccessCode(code), true)
  }
})

test('master access codes use a separate longer format', () => {
  assert.equal(MASTER_ACCESS_CODE_LENGTH, 12)
  assert.equal(isValidMasterAccessCode('ABCDEFGHJKLM'), true)
  assert.equal(isValidMasterAccessCode('ABCD2345'), false)
  assert.equal(isValidAccessCode('ABCDEFGHJKLM'), false)
})

test('access code hashes are stable and do not expose the original code', () => {
  const first = hashAccessCode('ABCD2345')
  assert.equal(first, hashAccessCode('ABCD2345'))
  assert.notEqual(first, hashAccessCode('ABCD2346'))
  assert.equal(first.includes('ABCD2345'), false)
})

test('teacher and student codes use separate hash namespaces', () => {
  assert.notEqual(hashTeacherAccessCode('ABCD2345'), hashAccessCode('ABCD2345'))
  assert.equal(hashTeacherAccessCode('ABCD2345'), hashTeacherAccessCode('ABCD2345'))
})

test('ranks are converted to a top percentage without exposing cohort size', () => {
  assert.equal(rankToTopPercent(1, 43), 3)
  assert.equal(rankToTopPercent(29, 43), 68)
  assert.equal(rankToTopPercent(35, 43), 82)
})
