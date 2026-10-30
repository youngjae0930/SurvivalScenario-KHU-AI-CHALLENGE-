import { useEffect, useRef } from 'react'

export function BackgroundMusic({ volume, onVolumeChange }: { volume: number; onVolumeChange: (volume: number) => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const level = useRef(volume)

  useEffect(() => {
    level.current = volume
    const player = audio.current
    if (!player) return
    player.volume = volume * 0.35
    if (volume === 0) player.pause()
    else void player.play().catch(() => {})
  }, [volume])

  useEffect(() => {
    const player = audio.current
    if (!player) return
    const start = () => {
      if (level.current > 0 && player.paused) void player.play().catch(() => {})
    }
    document.addEventListener('pointerdown', start)
    document.addEventListener('keydown', start)
    return () => {
      document.removeEventListener('pointerdown', start)
      document.removeEventListener('keydown', start)
      player.pause()
    }
  }, [])

  return <div className="volume-control">
    <audio ref={audio} src={`${import.meta.env.BASE_URL}audio/the-weight-of-concrete.mp3`} loop preload="none" />
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {volume > 0 ? <path d="M16 9a4 4 0 0 1 0 6" /> : <path d="m16 9 5 6m0-6-5 6" />}
    </svg>
    <input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)} aria-label="전체 음량" aria-valuetext={`${Math.round(volume * 100)}%`} onChange={event => onVolumeChange(Number(event.target.value) / 100)} />
    <output>{Math.round(volume * 100)}%</output>
  </div>
}