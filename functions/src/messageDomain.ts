export const MAX_RECIPIENTS = 100
export const MAX_MMS_IMAGE_BYTES = 200 * 1024

export type MessageType = 'SMS' | 'MMS'
export type DeliveryStatus = 'QUEUED' | 'PENDING' | 'SENDING' | 'COMPLETE'
export type OverallStatus = 'PROCESSING' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED'

export interface DeliveryResult {
  messageId: string | null
  to: string
  type: string
  status: DeliveryStatus
  statusCode: string | null
  reason: string | null
  dateReceived: string | null
  dateReported: string | null
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[^0-9]/g, '')
}

export function normalizeRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normalizePhone).filter(Boolean))]
}

export function isValidPhone(phone: string): boolean {
  return /^[0-9]{8,15}$/.test(phone)
}

// SOLAPI의 국내 문자 기준(한글 2 byte, 영문/숫자 1 byte)에 맞춘 보수적 길이 계산입니다.
export function solapiTextBytes(text: string): number {
  return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x7f ? 2 : 1), 0)
}

export function summarizeDeliveries(deliveries: DeliveryResult[]): OverallStatus {
  if (deliveries.length === 0) return 'PROCESSING'
  if (deliveries.some(item => item.status !== 'COMPLETE')) return 'PROCESSING'
  const successCount = deliveries.filter(item => item.statusCode === '4000').length
  if (successCount === deliveries.length) return 'SUCCESS'
  if (successCount > 0) return 'PARTIAL_FAILURE'
  return 'FAILED'
}

export function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}
