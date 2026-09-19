import sleepFrames from './assets/score-battery-cat-sleep-frames.png'
import wakeFrames from './assets/score-battery-cat-wake-frames.png'
import alertFrames from './assets/score-battery-cat-alert-frames.png'
import hopFrames from './assets/score-battery-cat-hop-frames.png'
import crownFrames from './assets/score-battery-cat-crown-frames.png'
import { scoreBandFor, type ScoreBand } from './scorePresentation'
import './batteryCat.css'

const BATTERY_CATS: Record<ScoreBand, {
  energy: number
  action: string
  message: string
  frames: string
  duration: string
}> = {
  '59–0': {
    energy: 1,
    action: '잠자는 고양이',
    message: '지금은 충전 중이에요!',
    frames: sleepFrames,
    duration: '3s',
  },
  '69–60': {
    energy: 2,
    action: '눈을 뜨는 고양이',
    message: '천천히 깨어나요!',
    frames: wakeFrames,
    duration: '2.8s',
  },
  '79–70': {
    energy: 3,
    action: '귀를 쫑긋 세운 고양이',
    message: '좋은 리듬을 찾았어요!',
    frames: alertFrames,
    duration: '2.6s',
  },
  '89–80': {
    energy: 4,
    action: '제자리에서 통통 뛰는 고양이',
    message: '힘이 붙었어요!',
    frames: hopFrames,
    duration: '2.4s',
  },
  '100–90': {
    energy: 5,
    action: '왕관을 쓰고 반짝이는 고양이',
    message: '멋지게 해냈어요!',
    frames: crownFrames,
    duration: '2.5s',
  },
}

export function BatteryCatMascot({ totalScore, compact = false }: { totalScore: number | null; compact?: boolean }) {
  const band = scoreBandFor(totalScore)
  if (!band) return null

  const cat = BATTERY_CATS[band]

  return (
    <span
      className={`m3-battery-cat${compact ? ' m3-battery-cat-compact' : ''}`}
      data-score-band={band}
      data-energy={cat.energy}
      role="img"
      aria-label={`${band}점 구간, 학습 에너지 ${cat.energy}/5, ${cat.action}. ${cat.message}`}
    >
      <span className="m3-battery-cat-battery" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className={`m3-battery-cat-segment${index < cat.energy ? ' m3-battery-cat-segment-filled' : ''}`} key={index} />
        ))}
      </span>
      <span
        className="m3-battery-cat-art"
        aria-hidden="true"
        style={{ backgroundImage: `url(${cat.frames})`, animationDuration: cat.duration }}
      />
      {!compact && <span className="m3-battery-cat-message" aria-hidden="true">{cat.message}</span>}
    </span>
  )
}
