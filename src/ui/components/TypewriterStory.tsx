import { useEffect, useRef, useState } from 'react'

/** Mounted once per scene, so previews and status updates do not restart the text. */
export function TypewriterStory({ paragraphs, muted, volume }: { paragraphs: readonly string[], muted: boolean; volume: number }) {
  const [visible, setVisible] = useState(0)
  const audio = useRef<HTMLAudioElement>(null)
  const tone = useRef<AudioContext | null>(null)
  const letters = paragraphs.map(text => Array.from(text))
  const total = letters.reduce((sum, text) => sum + text.length, 0)
  const complete = visible >= total
  useEffect(() => {
    if (audio.current) audio.current.volume = volume * 0.3
  }, [volume])

  useEffect(() => {
    const player = audio.current
    if (!player) return
    // Attenuate sharp upper frequencies while preserving playback timing.
    if (!tone.current) {
      const context = new AudioContext()
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 2000
      filter.Q.value = 0.5
      context.createMediaElementSource(player).connect(filter).connect(context.destination)
      tone.current = context
    }
    const resume = () => { void tone.current?.resume().catch(() => {}) }
    resume()
    document.addEventListener('pointerdown', resume)
    document.addEventListener('keydown', resume)
    return () => {
      document.removeEventListener('pointerdown', resume)
      document.removeEventListener('keydown', resume)
      void tone.current?.suspend()
    }
  }, [])

  useEffect(() => {
    if (complete) return
    const timer = window.setInterval(() => setVisible(count => Math.min(total, count + 1)), 30)
    return () => window.clearInterval(timer)
  }, [complete, total])

  useEffect(() => {
    const player = audio.current
    if (!player) return
    if (muted) {
      player.pause()
      player.currentTime = 0
      return
    }
    // Finish the current sound naturally instead of cutting it mid-sample.
    player.loop = !complete
    if (complete) return
    player.playbackRate = 3
    void player.play().catch(() => { /* Browser may require a user gesture. */ })
  }, [muted, complete])

  useEffect(() => {
    const player = audio.current
    return () => { player?.pause() }
  }, [])

  return <div className="story">
    <audio ref={audio} src={`${import.meta.env.BASE_URL}audio/keyboard-type.mp3`} preload="auto" />
    {letters.map((text, index) => {
      const offset = letters.slice(0, index).reduce((sum, line) => sum + line.length, 0)
      const count = Math.max(0, Math.min(text.length, visible - offset))
      return <p key={index} aria-label={paragraphs[index]}><span aria-hidden="true">{text.slice(0, count).join('')}<span style={{ visibility: 'hidden' }}>{text.slice(count).join('')}</span></span></p>
    })}
  </div>
}
