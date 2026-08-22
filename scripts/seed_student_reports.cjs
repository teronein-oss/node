const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const requireFromFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'))
const { applicationDefault, initializeApp } = requireFromFunctions('firebase-admin/app')
const { Timestamp, getFirestore } = requireFromFunctions('firebase-admin/firestore')
const firebaseCliApi = require('/Users/andrewko/.nvm/versions/node/v20.20.1/lib/node_modules/firebase-tools/lib/api.js')
const { baekhyeonReportSeed } = require('../functions/lib/reportSeedData.js')
const { createAccessCode, hashAccessCode } = require('../functions/lib/reportAccessDomain.js')

const PROJECT_ID = 'node-94b40'
const ACADEMY_ID = 'node-default'
const REPORT_URL = 'https://node-94b40.web.app/report'
const CREDENTIALS_PATH = '/Users/andrewko/.config/configstore/firebase-tools.json'
const TEMP_ADC_PATH = '/private/tmp/node-student-report-adc.json'
const OUTPUT_PATH = path.resolve(__dirname, '../output/baekhyeon-2026-final-4/access-codes.csv')

function escapeCsv(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'))
  const refreshToken = config?.tokens?.refresh_token
  if (!refreshToken) throw new Error('Firebase CLI 로그인이 필요합니다.')
  fs.writeFileSync(TEMP_ADC_PATH, JSON.stringify({
    type: 'authorized_user',
    client_id: firebaseCliApi.clientId(),
    client_secret: firebaseCliApi.clientSecret(),
    refresh_token: refreshToken,
  }), { mode: 0o600 })
  process.env.GOOGLE_APPLICATION_CREDENTIALS = TEMP_ADC_PATH

  initializeApp({
    projectId: PROJECT_ID,
    credential: applicationDefault(),
  })

  const db = getFirestore()
  const reportRefs = baekhyeonReportSeed.reports.map(report =>
    db.doc(`academies/${ACADEMY_ID}/studentReports/${baekhyeonReportSeed.exam.examId}-${report.sourceReportId}`)
  )
  const existingSnapshots = await db.getAll(...reportRefs)
  const existingCount = existingSnapshots.filter(snapshot => snapshot.exists).length
  if (existingCount > 0) {
    throw new Error(`이미 ${existingCount}개의 리포트가 있습니다. 코드 재발급은 관리자 화면에서 진행하세요.`)
  }

  const batch = db.batch()
  const publishedAt = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(Date.now() + 730 * 24 * 60 * 60 * 1000)
  const issuedCodes = []

  baekhyeonReportSeed.reports.forEach((report, index) => {
    const reportRef = reportRefs[index]
    const accessCode = createAccessCode()
    const accessHash = hashAccessCode(accessCode)
    batch.create(db.doc(`studentReportAccess/${accessHash}`), {
      academyId: ACADEMY_ID,
      reportId: reportRef.id,
      active: true,
      expiresAt,
      createdAt: publishedAt,
      lastAccessedAt: null,
      accessCount: 0,
    })
    batch.create(reportRef, {
      ...report,
      academyId: ACADEMY_ID,
      examId: baekhyeonReportSeed.exam.examId,
      examTitle: baekhyeonReportSeed.exam.title,
      accessHash,
      published: true,
      publishedAt,
      updatedAt: publishedAt,
      publishedBy: { uid: 'firebase-cli', email: config?.user?.email || '', displayName: 'Firebase CLI' },
    })
    issuedCodes.push({ studentName: report.studentName, accessCode })
  })

  await batch.commit()
  const rows = [
    ['학생명', '식별코드', '성적표 링크', '문자 내용'],
    ...issuedCodes.map(item => {
      const formattedCode = `${item.accessCode.slice(0, 4)}-${item.accessCode.slice(4)}`
      return [
        item.studentName,
        formattedCode,
        REPORT_URL,
        `[NODE] ${item.studentName} 학생 성적표\n${REPORT_URL}\n식별코드: ${formattedCode}`,
      ]
    }),
  ]
  fs.writeFileSync(OUTPUT_PATH, `\ufeff${rows.map(row => row.map(escapeCsv).join(',')).join('\n')}`, { mode: 0o600 })
  fs.chmodSync(OUTPUT_PATH, 0o600)
  console.log(`게시 완료: ${issuedCodes.length}명`)
  console.log(`식별 코드 파일: ${OUTPUT_PATH}`)
  fs.unlinkSync(TEMP_ADC_PATH)
}

main().catch(error => {
  if (fs.existsSync(TEMP_ADC_PATH)) fs.unlinkSync(TEMP_ADC_PATH)
  console.error(error.message)
  process.exitCode = 1
})
