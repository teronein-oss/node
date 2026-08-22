const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const requireFromFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'))
const { applicationDefault, initializeApp } = requireFromFunctions('firebase-admin/app')
const { Timestamp, getFirestore } = requireFromFunctions('firebase-admin/firestore')
const firebaseCliApi = require('/Users/andrewko/.nvm/versions/node/v20.20.1/lib/node_modules/firebase-tools/lib/api.js')

const PROJECT_ID = 'node-94b40'
const CREDENTIALS_PATH = '/Users/andrewko/.config/configstore/firebase-tools.json'
const TEMP_ADC_PATH = '/private/tmp/node-report-retention-adc.json'
const RETENTION_DAYS = 730

async function updateInChunks(db, documents, expiresAt) {
  let updated = 0
  for (let index = 0; index < documents.length; index += 400) {
    const batch = db.batch()
    for (const document of documents.slice(index, index + 400)) {
      batch.set(document.ref, { expiresAt, retentionUpdatedAt: Timestamp.now() }, { merge: true })
      updated += 1
    }
    await batch.commit()
  }
  return updated
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

  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() })
  const db = getFirestore()
  const expiresAt = Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const [accessSnapshot, reportsSnapshot] = await Promise.all([
    db.collection('studentReportAccess').get(),
    db.collectionGroup('studentReports').get(),
  ])
  const accessUpdated = await updateInChunks(db, accessSnapshot.docs, expiresAt)
  const reportsUpdated = await updateInChunks(db, reportsSnapshot.docs, expiresAt)
  console.log(JSON.stringify({ accessUpdated, reportsUpdated, expiresAt: expiresAt.toDate().toISOString() }))
}

main()
  .catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => {
    if (fs.existsSync(TEMP_ADC_PATH)) fs.unlinkSync(TEMP_ADC_PATH)
  })
