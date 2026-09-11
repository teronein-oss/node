import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

// Install playwright locally, or point PLAYWRIGHT_MODULE at an existing installation.
// Run: node --test tests/grade-persistence.test.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fixture = resolve('tests/fixtures/grade-firestore.js')
const originalPage = process.env.GRADE_PAGE_SOURCE
const bundle = await build({
  entryPoints: ['tests/fixtures/grade-page.jsx'],
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  plugins: [{
    name: 'isolated-grade-test',
    setup(builder) {
      builder.onResolve({ filter: /^(firebase\/firestore|.*\/utils\/firestorePaths)$/ }, () => ({ path: fixture }))
      builder.onResolve({ filter: /\/context\/AuthContext$/ }, () => ({ path: 'auth-test', namespace: 'test' }))
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
        contents: 'export const useAuth = () => ({ user: { academyId: "node-default" } })',
      }))
      if (originalPage) {
        builder.onLoad({ filter: /\/pages\/GradePage\.tsx$/ }, async args => ({
          contents: await readFile(originalPage, 'utf8'), loader: 'tsx', resolveDir: resolve(args.path, '..'),
        }))
      }
    },
  }],
})

test('grade edits survive navigation and persist through the app save queue', async t => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/test.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/test.js' ? bundle.outputFiles[0].text
      : '<!doctype html><html lang="ko"><meta charset="utf-8"><title>Grade persistence regression</title><div id="root"></div><script type="module" src="/test.js"></script></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL })
  t.after(() => browser.close())
  const page = await browser.newPage({ timezoneId: 'Asia/Seoul', viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-09-11T12:00:00+09:00') })
  await page.clock.pauseAt(new Date('2026-09-11T12:00:00+09:00'))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const row = () => page.locator('tbody tr').filter({ hasText: '테스트학생가' })
  const scores = () => row().locator('input[type="number"]')
  await row().waitFor()
  const session = await page.evaluate(() => window.gradeTest.app.selectedSession)
  const grade = async (student = 'student-a', sessionNum = session) => page.evaluate(
    ([id, sn]) => window.gradeTest.app.state.grades.find(g => g.studentId === id && g.sessionNum === sn),
    [student, sessionNum],
  )

  await t.test('input then navigate immediately, without advancing the 800 ms timer', async () => {
    await scores().nth(0).fill('87')
    await scores().nth(1).fill('92')
    await page.getByRole('link', { name: '다른 페이지', exact: true }).click()
    assert.equal((await grade())?.vocabScore, 87)
    assert.equal((await grade())?.dailyTestScore, 92)
    assert.equal(await page.evaluate(() => window.gradeTest.app.saveStatus), 'saving')
    await page.getByRole('link', { name: '성적 페이지', exact: true }).click()
    await row().waitFor()
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['87', '92'])
    await page.clock.runFor(350)
    const stored = await page.evaluate(() => window.gradeTest.readDocuments()['appData/teacher-test'].grades)
    assert.equal(stored.find(g => g.studentId === 'student-a').vocabScore, 87)
    assert.equal(await page.evaluate(() => window.gradeTest.app.saveStatus), 'saved')
  })
  if (originalPage) return

  await t.test('switch class and date immediately without writing scores into another scope', async () => {
    await scores().nth(0).fill('91')
    await page.getByRole('button', { name: '테스트 B반', exact: true }).click()
    assert.deepEqual(await page.locator('tbody input[type="number"]').evaluateAll(inputs => inputs.map(input => input.value)), ['', ''])
    await page.getByRole('button', { name: '테스트 A반', exact: true }).click()
    assert.equal(await scores().nth(0).inputValue(), '91')
    await scores().nth(1).fill('76')
    await page.locator('.mobile-grade-date-nav button').first().click()
    const previousSession = await page.evaluate(() => window.gradeTest.app.selectedSession)
    assert.notEqual(previousSession, session)
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['', ''])
    await scores().nth(0).fill('65')
    await page.locator('.mobile-grade-date-nav button').last().click()
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['91', '76'])
    assert.equal((await grade('student-a', previousSession)).vocabScore, 65)
    assert.equal(await grade('student-c'), undefined)
    assert.equal(await grade('student-b'), undefined)
  })

  await t.test('configuration changes and stale snapshots preserve recent scores', async () => {
    const stale = await page.evaluate(() => window.gradeTest.readDocuments()['appData/teacher-test'])
    await scores().nth(0).fill('88')
    await page.getByRole('button', { name: '항목 추가', exact: true }).click()
    await page.locator('input[placeholder="항목 이름"]').fill('추가시험')
    await page.locator('input[placeholder="항목 이름"]').press('Enter')
    assert.equal(await scores().nth(0).inputValue(), '88')
    await scores().nth(2).fill('43')
    await page.evaluate(data => window.gradeTest.emitSnapshot('appData/teacher-test', data), stale)
    assert.equal(await scores().nth(2).inputValue(), '43')
    await page.getByRole('link', { name: '다른 페이지', exact: true }).click()
    await page.getByRole('link', { name: '성적 페이지', exact: true }).click()
    await row().waitFor()
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['88', '76', '43'])
  })

  await t.test('multi-digit scores update pending retest scores and retain schedules', async () => {
    await scores().nth(0).fill('7')
    await page.evaluate(() => {
      const { app } = window.gradeTest
      const retest = app.state.retests.find(r => r.studentId === 'student-a' && r.sessionNum === app.selectedSession && r.type === 'vocab')
      app.dispatch({ type: 'UPDATE_RETEST_DATE', payload: { id: retest.id, retestDate: '2026-09-14', retestTime: '16:00' } })
    })
    await scores().nth(0).fill('78')
    const retest = await page.evaluate(() => window.gradeTest.app.state.retests.find(
      r => r.studentId === 'student-a' && r.sessionNum === window.gradeTest.app.selectedSession && r.type === 'vocab',
    ))
    assert.equal(retest.originalScore, 78)
    assert.equal(retest.retestDate, '2026-09-14')
    assert.equal(retest.retestTime, '16:00')
    await scores().nth(0).fill('85')
    assert.equal(await page.evaluate(() => window.gradeTest.app.state.retests.some(
      r => r.studentId === 'student-a' && r.sessionNum === window.gradeTest.app.selectedSession && r.type === 'vocab',
    )), false)
  })

  await t.test('zero, clearing, attendance and homework retain their meaning', async () => {
    await scores().nth(0).fill('')
    await scores().nth(0).pressSequentially('72.5')
    assert.equal((await grade()).vocabScore, 72.5)
    await page.evaluate(() => {
      const { app } = window.gradeTest
      app.dispatch({ type: 'UPDATE_HOMEWORK_STATUS', payload: { studentId: 'student-a', sessionNum: app.selectedSession, status: '제출' } })
    })
    await page.waitForFunction(() => window.gradeTest.app.state.grades.find(
      g => g.studentId === 'student-a' && g.sessionNum === window.gradeTest.app.selectedSession,
    )?.homeworkDone === '제출')
    await scores().nth(0).fill('0')
    await scores().nth(1).fill('')
    await row().getByRole('button', { name: '출석', exact: true }).click()
    await page.getByRole('link', { name: '다른 페이지', exact: true }).click()
    await page.getByRole('link', { name: '성적 페이지', exact: true }).click()
    await row().waitFor()
    const value = await grade()
    assert.equal(value.vocabScore, 0)
    assert.equal(value.dailyTestScore, null)
    assert.equal(value.attendance, '결석')
    assert.equal(value.homeworkDone, '제출')
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['0', '', '43'])
  })

  await t.test('server acknowledgement is required for saved status; failed writes can be retried', async () => {
    await page.clock.runFor(350)
    await page.evaluate(() => window.gradeTest.setFailWrites(true))
    await scores().nth(0).fill('89')
    await page.clock.runFor(350)
    assert.equal(await page.evaluate(() => window.gradeTest.app.saveStatus), 'error')
    assert.match(await page.getByRole('alert').innerText(), /저장 권한/)
    assert.equal((await grade()).vocabScore, 89)
    await page.evaluate(() => window.gradeTest.setFailWrites(false))
    await page.getByRole('button', { name: '다시 저장', exact: true }).click()
    await page.clock.runFor(350)
    assert.equal(await page.evaluate(() => window.gradeTest.app.saveStatus), 'saved')
    await page.reload()
    await row().waitFor()
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['89', '', '43'])
  })

  await t.test('cleared grades stay cleared after navigation', async () => {
    await page.getByRole('button', { name: '초기화', exact: true }).click()
    await page.getByRole('button', { name: '확인', exact: true }).click()
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['', '', ''])
    await page.getByRole('link', { name: '다른 페이지', exact: true }).click()
    await page.clock.runFor(1000)
    await page.getByRole('link', { name: '성적 페이지', exact: true }).click()
    await row().waitFor()
    assert.equal(await grade(), undefined)
    assert.deepEqual(await scores().evaluateAll(inputs => inputs.map(input => input.value)), ['', '', ''])
  })

  assert.deepEqual(errors, [])
  if (process.env.GRADE_SCREENSHOT) await page.screenshot({ path: process.env.GRADE_SCREENSHOT, fullPage: true })
})
