#!/usr/bin/env node

// One-time retirement of the old Baekhyeon report seed. Dry-run is the default.
// This intentionally leaves view logs and rate-limit records untouched: those
// records cannot all be tied unambiguously to this exam.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createRequire } = require('node:module')

const requireFromFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'))
const { applicationDefault, deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app')
const { getFirestore } = requireFromFunctions('firebase-admin/firestore')

const PROJECT_ID = 'node-94b40'
const ACADEMY_ID = 'node-default'
const LEGACY_EXAM_ID = 'baekhyeon-2026-final-4'
const EXPECTED_REPORT_COUNT = 43
const REPORT_PREFIX = `${LEGACY_EXAM_ID}-`

class SafeAbort extends Error {}
let temporaryCredentialDir = null

function abort(message) {
  throw new SafeAbort(message)
}

function getCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault()

  const cliConfigPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json')
  if (!fs.existsSync(cliConfigPath)) abort('Firebase CLI login or GOOGLE_APPLICATION_CREDENTIALS is required.')

  const cliConfig = JSON.parse(fs.readFileSync(cliConfigPath, 'utf8'))
  const token = cliConfig?.tokens?.refresh_token
  if (!token) abort('Firebase CLI login or GOOGLE_APPLICATION_CREDENTIALS is required.')

  // Resolve the installed CLI beside its executable rather than relying on a
  // particular Node installation path. ADC needs a short-lived private file.
  const cliExecutable = execFileSync('which', ['firebase'], { encoding: 'utf8' }).trim()
  const cliApiPath = path.resolve(path.dirname(fs.realpathSync(cliExecutable)), '../api.js')
  const firebaseCliApi = require(cliApiPath)
  temporaryCredentialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-retirement-'))
  const credentialPath = path.join(temporaryCredentialDir, 'adc.json')
  fs.writeFileSync(credentialPath, JSON.stringify({
    type: 'authorized_user',
    client_id: firebaseCliApi.clientId(),
    client_secret: firebaseCliApi.clientSecret(),
    refresh_token: token,
  }), { mode: 0o600 })
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath
  return applicationDefault()
}

async function inspectLegacyRecords(db, reader) {
  const reportCollection = db.collection(`academies/${ACADEMY_ID}/studentReports`)
  const reportsSnapshot = await reader.get(reportCollection.where('examId', '==', LEGACY_EXAM_ID))
  const accessSnapshot = await reader.get(db.collection('studentReportAccess').where('academyId', '==', ACADEMY_ID))
  const allReportsSnapshot = await reader.get(reportCollection.select('examId', 'accessHash'))

  const reports = reportsSnapshot.docs
  if (reports.length !== EXPECTED_REPORT_COUNT) {
    abort(`Expected ${EXPECTED_REPORT_COUNT} legacy reports, found ${reports.length}; no records were deleted.`)
  }

  const reportsByHash = new Map()
  for (const report of reports) {
    const data = report.data()
    const hash = data.accessHash
    if (!report.id.startsWith(REPORT_PREFIX)
      || data.examId !== LEGACY_EXAM_ID
      || data.academyId !== ACADEMY_ID
      || typeof hash !== 'string'
      || !/^[0-9a-f]{64}$/.test(hash)
      || reportsByHash.has(hash)) {
      abort('Legacy report IDs or access hashes failed validation; no records were deleted.')
    }
    reportsByHash.set(hash, report)
  }

  const linkedAccess = accessSnapshot.docs.filter(access => {
    const reportId = access.data().reportId
    return typeof reportId === 'string' && reportId.startsWith(REPORT_PREFIX)
  })
  if (linkedAccess.length !== reports.length) {
    abort('Legacy report and access counts do not match; no records were deleted.')
  }
  for (const access of linkedAccess) {
    const data = access.data()
    if (data.academyId !== ACADEMY_ID || reportsByHash.get(access.id)?.id !== data.reportId) {
      abort('Legacy report access links are not one-to-one; no records were deleted.')
    }
  }

  // A new report must never share an old access hash, even if its exam ID differs.
  for (const report of allReportsSnapshot.docs) {
    if (!report.id.startsWith(REPORT_PREFIX)
      && reportsByHash.has(report.data().accessHash)) {
      abort('An access hash is referenced by a different report; no records were deleted.')
    }
  }

  return { reports, linkedAccess }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--execute')) {
    abort('Usage: node scripts/retire_legacy_baekhyeon_reports.cjs [--execute]')
  }
  const execute = args[0] === '--execute'
  let app

  try {
    app = initializeApp({ projectId: PROJECT_ID, credential: getCredential() }, 'retire-legacy-baekhyeon-reports')
    const db = getFirestore(app)
    if (!execute) {
      const result = await inspectLegacyRecords(db, { get: query => query.get() })
      console.log(`Dry run verified ${result.reports.length} legacy reports and ${result.linkedAccess.length} linked access records in ${PROJECT_ID}. No changes made.`)
      return
    }

    const result = await db.runTransaction(async transaction => {
      const selected = await inspectLegacyRecords(db, transaction)
      for (const access of selected.linkedAccess) transaction.delete(access.ref)
      for (const report of selected.reports) transaction.delete(report.ref)
      return { reports: selected.reports.length, access: selected.linkedAccess.length }
    })
    console.log(`Deleted ${result.reports} legacy reports and ${result.access} linked access records from ${PROJECT_ID}.`)
  } finally {
    try {
      if (app) await deleteApp(app)
    } finally {
      if (temporaryCredentialDir) fs.rmSync(temporaryCredentialDir, { recursive: true, force: true })
    }
  }
}

main().catch(error => {
  if (error instanceof SafeAbort) {
    console.error(error.message)
  } else {
    // SDK errors can contain document paths or credentials. Only print the code.
    console.error(`Retirement failed (${error?.code || error?.name || 'unknown error'}).`)
  }
  process.exitCode = 1
})
