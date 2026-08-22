export const MMS_IMAGE_MAX_BYTES = 200 * 1024
export const MMS_IMAGE_MAX_WIDTH = 1500
export const MMS_IMAGE_MAX_HEIGHT = 1440

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('JPG 인코딩에 실패했습니다.'))
    }, 'image/jpeg', quality)
  })
}

function resizeCanvas(source: HTMLCanvasElement, ratio: number) {
  if (ratio >= 1) return source
  const resized = document.createElement('canvas')
  resized.width = Math.max(1, Math.floor(source.width * ratio))
  resized.height = Math.max(1, Math.floor(source.height * ratio))
  const context = resized.getContext('2d')
  if (!context) throw new Error('JPG 크기 조정을 시작하지 못했습니다.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, resized.width, resized.height)
  context.drawImage(source, 0, 0, resized.width, resized.height)
  return resized
}

export async function createMmsJpeg(source: HTMLCanvasElement) {
  const dimensionRatio = Math.min(
    1,
    MMS_IMAGE_MAX_WIDTH / source.width,
    MMS_IMAGE_MAX_HEIGHT / source.height,
  )
  let canvas = resizeCanvas(source, dimensionRatio)

  // 입력 크기는 제한하지 않고, SOLAPI에 전달할 결과물만 규격에 맞춘다.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let oversizedBytes = MMS_IMAGE_MAX_BYTES
    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await canvasToJpegBlob(canvas, quality)
      oversizedBytes = blob.size
      if (blob.size <= MMS_IMAGE_MAX_BYTES) {
        return { blob, width: canvas.width, height: canvas.height }
      }
    }

    const ratio = Math.max(0.55, Math.min(0.9, Math.sqrt(MMS_IMAGE_MAX_BYTES / oversizedBytes) * 0.94))
    canvas = resizeCanvas(canvas, ratio)
  }

  throw new Error('이미지를 MMS 발송 규격으로 변환하지 못했습니다.')
}

function loadImage(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽지 못했습니다.'))
    }
    image.src = url
  })
}

export async function optimizeJpegFileForMms(file: File) {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('이미지 변환을 시작하지 못했습니다.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  return createMmsJpeg(canvas)
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}
