import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { AlertCircle, CheckCircle2, Clock3, ImagePlus, Loader2, MessageSquareText, RefreshCw, Send, XCircle } from 'lucide-react'
import { functions } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { messageLogsCollection } from '../utils/firestorePaths'
import { blobToDataUrl, optimizeJpegFileForMms } from '../utils/mmsImage'

type MessageType = 'SMS' | 'MMS'
type LogStatus = 'PROCESSING' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED'

interface DeliveryLog {
  messageId: string | null
  to: string
  type: string
  status: string
  statusCode: string | null
  reason: string | null
  dateReceived: string | null
}

interface MessageLog {
  id: string
  type: MessageType
  subject?: string | null
  text: string
  recipientCount: number
  status: LogStatus
  successCount?: number
  failureCount?: number
  groupId?: string
  deliveries?: DeliveryLog[]
  error?: { code?: string; message?: string }
  createdBy?: { displayName?: string }
  createdAt?: Timestamp
}

const sendMessage = httpsCallable<{
  academyId: string
  clientRequestId: string
  type: MessageType
  recipients: string[]
  text: string
  subject?: string
  imageBase64?: string
  imageName?: string
}, { logId: string; status: LogStatus; duplicate: boolean }>(functions, 'sendSolapiMessage')

const refreshMessage = httpsCallable<{ academyId: string; logId: string }, { logId: string; status: LogStatus }>(functions, 'refreshSolapiMessageStatus')

function textBytes(text: string) {
  return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x7f ? 2 : 1), 0)
}

function parseRecipients(value: string) {
  return [...new Set(value.split(/[\s,;]+/).map(item => item.replace(/[^0-9]/g, '')).filter(Boolean))]
}

function formatDate(value?: Timestamp) {
  return value?.toDate().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) ?? '-'
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return '문자 발송 중 오류가 발생했습니다.'
  const value = error as { message?: string; details?: { message?: string } }
  return value.details?.message ?? value.message?.replace(/^Firebase: /, '') ?? '문자 발송 중 오류가 발생했습니다.'
}

const STATUS_STYLE: Record<LogStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  PROCESSING: { label: '처리 중', className: 'bg-blue-50 text-blue-700', icon: Clock3 },
  SUCCESS: { label: '발송 성공', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  PARTIAL_FAILURE: { label: '일부 실패', className: 'bg-amber-50 text-amber-700', icon: AlertCircle },
  FAILED: { label: '발송 실패', className: 'bg-red-50 text-red-700', icon: XCircle },
}

export default function MessagesPage() {
  const { user } = useAuth()
  const academyId = user?.academyId ?? ''
  const [type, setType] = useState<MessageType>('SMS')
  const [recipientText, setRecipientText] = useState('')
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [refreshingId, setRefreshingId] = useState('')

  const recipients = useMemo(() => parseRecipients(recipientText), [recipientText])
  const bytes = useMemo(() => textBytes(text), [text])
  const maxBytes = type === 'SMS' ? 90 : 2000

  useEffect(() => {
    if (!academyId) return
    const messageQuery = query(messageLogsCollection(academyId), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(messageQuery, snapshot => {
      setLogs(snapshot.docs.map(document => ({ id: document.id, ...document.data() } as MessageLog)))
      setHistoryLoading(false)
    }, () => {
      setError('발송 이력을 불러오지 못했습니다.')
      setHistoryLoading(false)
    })
  }, [academyId])

  const changeType = (nextType: MessageType) => {
    setType(nextType)
    setError('')
    if (nextType === 'SMS') {
      setImage(null)
      setSubject('')
    }
  }

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) return setImage(null)
    if (file.type !== 'image/jpeg') {
      event.target.value = ''
      setImage(null)
      setError('MMS 이미지는 JPG 파일을 선택해 주세요.')
      return
    }
    setError('')
    setImage(file)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!academyId || recipients.length === 0) return setError('수신번호를 한 개 이상 입력해 주세요.')
    if (recipients.length > 100 || recipients.some(phone => !/^[0-9]{8,15}$/.test(phone))) return setError('수신번호는 숫자 8~15자리로 한 번에 100개까지 입력할 수 있습니다.')
    if (!text.trim() || bytes > maxBytes) return setError(`${type} 내용은 ${maxBytes.toLocaleString()} byte 이하여야 합니다.`)
    if (type === 'MMS' && !image) return setError('MMS로 발송할 JPG 이미지를 선택해 주세요.')
    if (!window.confirm(`${recipients.length}명에게 ${type}를 발송하시겠습니까?\n발송 비용이 발생할 수 있습니다.`)) return

    setSending(true)
    try {
      const optimizedImage = image ? await optimizeJpegFileForMms(image) : undefined
      const imageBase64 = optimizedImage ? await blobToDataUrl(optimizedImage.blob) : undefined
      const response = await sendMessage({
        academyId,
        clientRequestId: crypto.randomUUID(),
        type,
        recipients,
        text: text.trim(),
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        ...(imageBase64 && image ? { imageBase64, imageName: image.name } : {}),
      })
      setNotice(response.data.duplicate ? '이미 처리된 요청입니다.' : `${recipients.length}건의 발송 요청이 접수되었습니다.`)
      setRecipientText('')
      setText('')
      setSubject('')
      setImage(null)
    } catch (sendError) {
      setError(errorMessage(sendError))
    } finally {
      setSending(false)
    }
  }

  const refresh = async (logId: string) => {
    setRefreshingId(logId)
    setError('')
    try {
      await refreshMessage({ academyId, logId })
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    } finally {
      setRefreshingId('')
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <MessageSquareText className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-slate-800">문자 발송</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">관리자·원장만 발송할 수 있으며 실제 전송 결과는 자동으로 갱신됩니다.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(['SMS', 'MMS'] as const).map(item => (
              <button key={item} type="button" onClick={() => changeType(item)} className={`rounded-lg py-2 text-sm font-semibold transition-colors ${type === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
                {item}{item === 'SMS' ? ' 단문' : ' 이미지'}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">수신번호</span>
            <textarea value={recipientText} onChange={event => setRecipientText(event.target.value)} rows={4} placeholder={'010-1234-5678\n010-9876-5432'} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            <span className="mt-1 block text-xs text-slate-400">줄바꿈, 쉼표로 구분 · 중복 제외 {recipients.length}명 / 최대 100명</span>
          </label>

          {type === 'MMS' && (
            <>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">제목 <span className="font-normal text-slate-400">(선택)</span></span>
                <input value={subject} onChange={event => setSubject(event.target.value)} maxLength={40} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 hover:border-blue-300 hover:bg-blue-50">
                <ImagePlus size={20} className="text-slate-500" />
                <span className="min-w-0 text-sm text-slate-600"><span className="font-semibold">JPG 이미지 선택</span><span className="block truncate text-xs text-slate-400">{image ? `${image.name} · 발송 시 자동 최적화` : '크기 제한 없이 선택 · 발송 시 자동 최적화'}</span></span>
                <input type="file" accept="image/jpeg,.jpg,.jpeg" onChange={selectImage} className="sr-only" />
              </label>
            </>
          )}

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">내용</span>
            <textarea value={text} onChange={event => setText(event.target.value)} rows={8} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            <span className={`mt-1 block text-right text-xs ${bytes > maxBytes ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{bytes.toLocaleString()} / {maxBytes.toLocaleString()} byte</span>
          </label>

          {error && <div className="flex gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={16} />{error}</div>}
          {notice && <div className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 shrink-0" size={16} />{notice}</div>}

          <button disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            {sending ? '발송 요청 중...' : `${recipients.length || 0}명에게 발송`}
          </button>
          <p className="text-xs leading-5 text-slate-400">발신번호와 SOLAPI 인증키는 서버의 Secret Manager에서 관리되며 브라우저에 노출되지 않습니다.</p>
        </form>

        <section className="min-w-0 space-y-3">
          <div className="flex items-end justify-between">
            <div><h2 className="font-bold text-slate-800">최근 발송 이력</h2><p className="text-xs text-slate-400">최대 50건</p></div>
          </div>
          {historyLoading ? (
            <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">아직 발송 기록이 없습니다.</div>
          ) : logs.map(log => {
            const status = STATUS_STYLE[log.status] ?? STATUS_STYLE.PROCESSING
            const StatusIcon = status.icon
            return (
              <article key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{log.type}</span><span className="text-xs text-slate-400">{formatDate(log.createdAt)} · {log.createdBy?.displayName ?? '-'}</span></div>
                    {log.subject && <p className="mt-2 text-sm font-semibold text-slate-800">{log.subject}</p>}
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{log.text}</p>
                  </div>
                  <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}><StatusIcon size={13} />{status.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>요청 {log.recipientCount}건</span><span className="text-emerald-600">성공 {log.successCount ?? 0}</span><span className="text-red-600">실패 {log.failureCount ?? 0}</span>
                  {log.status === 'PROCESSING' && log.groupId && <button type="button" disabled={refreshingId === log.id} onClick={() => refresh(log.id)} className="ml-auto flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"><RefreshCw size={13} className={refreshingId === log.id ? 'animate-spin' : ''} />결과 갱신</button>}
                </div>
                {log.error?.message && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{log.error.message}</p>}
                {!!log.deliveries?.length && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-semibold text-slate-500">수신번호별 결과 보기</summary>
                    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2">
                      {log.deliveries.map((item, index) => (
                        <div key={`${item.messageId ?? item.to}-${index}`} className="flex items-start justify-between gap-3 rounded-md bg-white px-2.5 py-2">
                          <span className="font-medium text-slate-700">{item.to}</span>
                          <span className={`text-right ${item.status === 'COMPLETE' && item.statusCode === '4000' ? 'text-emerald-600' : item.status === 'COMPLETE' ? 'text-red-600' : 'text-blue-600'}`}>{item.reason ?? (item.status === 'COMPLETE' ? item.statusCode : '처리 중')}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
