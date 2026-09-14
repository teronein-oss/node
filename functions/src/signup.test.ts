import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSignupInput } from './signup'

const policy = { enabled: true, termsVersion: 'terms-v1', privacyVersion: 'privacy-v1' }
const valid = {
  proofTicket: 'A'.repeat(48),
  accountType: 'personal',
  termsVersion: policy.termsVersion,
  privacyVersion: policy.privacyVersion,
  acceptTerms: true,
  acceptPrivacy: true,
  marketingEmail: false,
  marketingSms: false,
}

test('registration stays closed without a published signup policy', () => {
  assert.throws(() => parseSignupInput(valid, { ...policy, enabled: false }), /신규 가입이 준비 중/)
  assert.throws(() => parseSignupInput(valid, {}), /신규 가입이 준비 중/)
})

test('registration requires verified identity proof and exact mandatory agreement versions', () => {
  assert.throws(() => parseSignupInput({ ...valid, proofTicket: '' }, policy), /휴대폰 본인확인/)
  assert.throws(() => parseSignupInput({ ...valid, acceptPrivacy: false }, policy), /필수 약관/)
  assert.throws(() => parseSignupInput({ ...valid, termsVersion: 'old' }, policy), /필수 약관/)
})

test('registration accepts only supported account types and academy names', () => {
  assert.throws(() => parseSignupInput({ ...valid, accountType: '관리자' }, policy), /가입 유형/)
  assert.throws(() => parseSignupInput({ ...valid, accountType: 'academy', academyName: 'A' }, policy), /학원 이름/)
  const input = parseSignupInput({ ...valid, accountType: 'academy', academyName: ' NODE 학원 ' }, policy)
  assert.equal(input.accountType, 'academy')
  assert.equal(input.academyName, 'NODE 학원')
  assert.match(input.proofHash, /^[a-f0-9]{64}$/)
})
