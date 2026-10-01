import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSignupInput } from './signup'

const now = new Date('2026-10-01T00:00:00Z')
const valid = {
  name: ' 홍  길동 ',
  birthDate: '1990-05-17',
  phone: '010-1234-5678',
  email: ' Teacher@Example.com ',
  password: 'secret123',
  accountType: 'personal',
  academyName: '세움 영어',
  acceptTerms: true,
  acceptPrivacy: true,
}

test('registration can be closed by policy but is open by default', () => {
  assert.throws(() => parseSignupInput(valid, { enabled: false }, now), /신규 가입이 준비 중/)
  assert.doesNotThrow(() => parseSignupInput(valid, {}, now))
})

test('registration normalizes name, phone and email', () => {
  const input = parseSignupInput(valid, {}, now)
  assert.equal(input.name, '홍 길동')
  assert.equal(input.phone, '01012345678')
  assert.equal(input.email, 'teacher@example.com')
  assert.equal(input.birthDate, '1990-05-17')
})

test('registration rejects invalid personal fields', () => {
  assert.throws(() => parseSignupInput({ ...valid, name: '홍' }, {}, now), /이름/)
  assert.throws(() => parseSignupInput({ ...valid, birthDate: '1990-02-30' }, {}, now), /생년월일/)
  assert.throws(() => parseSignupInput({ ...valid, birthDate: '2027-01-01' }, {}, now), /생년월일/)
  assert.throws(() => parseSignupInput({ ...valid, phone: '02-123-4567' }, {}, now), /휴대폰/)
  assert.throws(() => parseSignupInput({ ...valid, email: 'not-an-email' }, {}, now), /이메일/)
  assert.throws(() => parseSignupInput({ ...valid, password: 'short' }, {}, now), /비밀번호/)
  assert.throws(() => parseSignupInput({ ...valid, acceptPrivacy: false }, {}, now), /필수 약관/)
})

test('registration accepts only supported account types and academy names', () => {
  assert.throws(() => parseSignupInput({ ...valid, accountType: '관리자' }, {}, now), /가입 유형/)
  assert.throws(() => parseSignupInput({ ...valid, accountType: 'academy', academyName: 'A' }, {}, now), /학원 이름/)
  assert.throws(() => parseSignupInput({ ...valid, academyName: '' }, {}, now), /학원 이름/)
  const input = parseSignupInput({ ...valid, accountType: 'academy', academyName: ' NODE 학원 ' }, {}, now)
  assert.equal(input.accountType, 'academy')
  assert.equal(input.academyName, 'NODE 학원')
  assert.equal(input.role, '원장')
  assert.equal(parseSignupInput(valid, {}, now).role, '선생님')
})

test('teachers and assistants join an existing academy by code', () => {
  const join = { ...valid, accountType: 'join', academyName: '', joinRole: '선생님' }
  assert.throws(() => parseSignupInput({ ...join, academyCode: '' }, {}, now), /학원 코드/)
  assert.throws(() => parseSignupInput({ ...join, academyCode: 'N-123' }, {}, now), /학원 코드/)
  assert.throws(() => parseSignupInput({ ...join, academyCode: 'node-default' }, {}, now), /학원 코드/)
  assert.throws(() => parseSignupInput({ ...join, academyCode: 'seum6898', joinRole: '원장' }, {}, now), /강사 또는 조교/)
  const code = 'n-' + 'a1'.repeat(10)
  assert.equal(parseSignupInput({ ...join, academyCode: ` ${code} ` }, {}, now).academyCode, code.toUpperCase())
  const assistant = parseSignupInput({ ...join, academyCode: ' SEUM6898 ', joinRole: '조교' }, {}, now)
  assert.equal(assistant.academyCode, 'node-default')
  assert.equal(assistant.role, '조교')
})
