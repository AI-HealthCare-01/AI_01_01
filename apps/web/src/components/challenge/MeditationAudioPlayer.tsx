'use client'
import { useEffect, useRef, useState } from 'react'

type SoundType = 'forest' | 'rain' | 'white'

const SOUNDS = [
  { id: 'forest' as SoundType, label: '숲소리', icon: '🌲' },
  { id: 'rain' as SoundType, label: '빗소리', icon: '🌧' },
  { id: 'white' as SoundType, label: '화이트노이즈', icon: '💨' },
]

const MAX_GAIN = 0.12
const FADE_IN_SEC = 1.2
const FADE_OUT_SEC = 0.8

function createBrownNoiseBuffer(ctx: AudioContext, duration = 3) {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  let lastOut = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    lastOut = (lastOut + 0.02 * white) / 1.02
    data[i] = lastOut * 3.2
  }

  return buffer
}

function createSoftWhiteNoiseBuffer(ctx: AudioContext, duration = 3) {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  let prev = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    prev = prev * 0.85 + white * 0.15
    data[i] = prev * 0.9
  }

  return buffer
}

export function MeditationAudioPlayer() {
  const [selected, setSelected] = useState<SoundType>('forest')
  const [volume, setVolume] = useState(40)
  const [isPlaying, setIsPlaying] = useState(false)

  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const sourceRefs = useRef<AudioBufferSourceNode[]>([])
  const modOscRef = useRef<OscillatorNode | null>(null)
  const modGainRef = useRef<GainNode | null>(null)
  const animationTimeoutRef = useRef<number | null>(null)

  const baseSafe = (value: number) => Math.max(0.0001, value)
  const getTargetGain = (vol: number) => (vol / 100) * MAX_GAIN

  const createSource = (ctx: AudioContext, buffer: AudioBuffer) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    sourceRefs.current.push(src)
    return src
  }

  const buildForestChain = (ctx: AudioContext, gain: GainNode) => {
    const src = createSource(ctx, createBrownNoiseBuffer(ctx))

    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 80
    highpass.Q.value = 0.2

    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 550
    lowpass.Q.value = 0.2

    src.connect(highpass)
    highpass.connect(lowpass)
    lowpass.connect(gain)
  }

  const buildWhiteChain = (ctx: AudioContext, gain: GainNode) => {
    const src = createSource(ctx, createSoftWhiteNoiseBuffer(ctx))

    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 3200
    lowpass.Q.value = 0.1

    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 120
    highpass.Q.value = 0.1

    src.connect(highpass)
    highpass.connect(lowpass)
    lowpass.connect(gain)
  }

  const buildRainChain = (ctx: AudioContext, gain: GainNode) => {
    // 배경층: 부드러운 저중역 비의 질감
    const baseSrc = createSource(ctx, createSoftWhiteNoiseBuffer(ctx))
    const baseGain = ctx.createGain()
    baseGain.gain.value = 0.65

    const baseBand = ctx.createBiquadFilter()
    baseBand.type = 'bandpass'
    baseBand.frequency.value = 1100
    baseBand.Q.value = 0.45

    const baseLow = ctx.createBiquadFilter()
    baseLow.type = 'lowpass'
    baseLow.frequency.value = 2200
    baseLow.Q.value = 0.2

    baseSrc.connect(baseBand)
    baseBand.connect(baseLow)
    baseLow.connect(baseGain)
    baseGain.connect(gain)

    // 입자층: 빗방울의 가벼운 고역감
    const sparkleSrc = createSource(ctx, createSoftWhiteNoiseBuffer(ctx))
    const sparkleGain = ctx.createGain()
    sparkleGain.gain.value = 0.22

    const sparkleHigh = ctx.createBiquadFilter()
    sparkleHigh.type = 'highpass'
    sparkleHigh.frequency.value = 1800
    sparkleHigh.Q.value = 0.3

    const sparkleBand = ctx.createBiquadFilter()
    sparkleBand.type = 'bandpass'
    sparkleBand.frequency.value = 3000
    sparkleBand.Q.value = 0.28

    sparkleSrc.connect(sparkleHigh)
    sparkleHigh.connect(sparkleBand)
    sparkleBand.connect(sparkleGain)
    sparkleGain.connect(gain)

    // 빗소리는 살짝만 흔들리게
    const rainLfo = ctx.createOscillator()
    const rainLfoGain = ctx.createGain()
    rainLfo.type = 'sine'
    rainLfo.frequency.value = 0.18
    rainLfoGain.gain.value = 0.04

    rainLfo.connect(rainLfoGain)
    rainLfoGain.connect(baseGain.gain)
    rainLfo.start()

    modOscRef.current = rainLfo
    modGainRef.current = rainLfoGain
  }

  const buildSoundChain = (ctx: AudioContext, gain: GainNode, type: SoundType) => {
    if (type === 'forest') {
      buildForestChain(ctx, gain)
      return
    }

    if (type === 'rain') {
      buildRainChain(ctx, gain)
      return
    }

    buildWhiteChain(ctx, gain)
  }

  const addGentleMovement = (ctx: AudioContext, gain: GainNode, baseGain: number, type: SoundType) => {
    if (type === 'white' || type === 'rain') return

    const modOsc = ctx.createOscillator()
    const modGain = ctx.createGain()

    modOsc.type = 'sine'
    modOsc.frequency.value = 0.08
    modGain.gain.value = baseGain * 0.08

    modOsc.connect(modGain)
    modGain.connect(gain.gain)
    modOsc.start()

    modOscRef.current = modOsc
    modGainRef.current = modGain
  }

  const cleanupAudio = async () => {
    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }

    for (const src of sourceRefs.current) {
      try {
        src.stop()
      } catch {}
      src.disconnect()
    }
    sourceRefs.current = []

    try {
      modOscRef.current?.stop()
    } catch {}

    modOscRef.current?.disconnect()
    modGainRef.current?.disconnect()
    masterGainRef.current?.disconnect()

    modOscRef.current = null
    modGainRef.current = null
    masterGainRef.current = null

    if (ctxRef.current) {
      const ctx = ctxRef.current
      ctxRef.current = null
      await ctx.close()
    }
  }

  const play = async (soundType = selected) => {
    await cleanupAudio()

    const ctx = new AudioContext()
    const gain = ctx.createGain()
    const targetGain = getTargetGain(volume)

    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(baseSafe(targetGain), ctx.currentTime + FADE_IN_SEC)
    gain.connect(ctx.destination)

    buildSoundChain(ctx, gain, soundType)
    addGentleMovement(ctx, gain, targetGain, soundType)

    for (const src of sourceRefs.current) {
      src.start()
    }

    ctxRef.current = ctx
    masterGainRef.current = gain
    setIsPlaying(true)
  }

  const stop = async () => {
    const ctx = ctxRef.current
    const gain = masterGainRef.current

    if (!ctx || !gain) {
      await cleanupAudio()
      setIsPlaying(false)
      return
    }

    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(baseSafe(gain.gain.value), now)
    gain.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT_SEC)

    animationTimeoutRef.current = window.setTimeout(async () => {
      await cleanupAudio()
      setIsPlaying(false)
    }, (FADE_OUT_SEC + 0.1) * 1000)
  }

  const handleSelect = async (sound: SoundType) => {
    setSelected(sound)
    if (isPlaying) await play(sound)
  }

  useEffect(() => {
    const gain = masterGainRef.current
    const ctx = ctxRef.current
    if (!gain || !ctx || !isPlaying) return

    const targetGain = getTargetGain(volume)
    const now = ctx.currentTime

    gain.gain.cancelScheduledValues(now)
    gain.gain.linearRampToValueAtTime(baseSafe(targetGain), now + 0.2)

    if (modGainRef.current && selected === 'forest') {
      modGainRef.current.gain.setValueAtTime(baseSafe(targetGain * 0.08), now)
    }
  }, [volume, isPlaying, selected])

  useEffect(() => {
    return () => {
      void cleanupAudio()
    }
  }, [])

  return (
    <div className="map-wrap">
      <p className="ct-label">배경음</p>

      <div className="map-grid">
        {SOUNDS.map((s) => (
          <button
            key={s.id}
            className={`map-btn ${selected === s.id ? 'active' : ''}`}
            onClick={() => void handleSelect(s.id)}
            type="button"
          >
            <span className="map-icon">{s.icon}</span>
            <span className="map-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="map-volume">
        <span className="map-vol-label">볼륨</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          className="map-slider"
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <span className="map-vol-label">{volume}%</span>
      </div>

      <button
        className={isPlaying ? 'ct-btn-secondary map-play-btn' : 'ct-btn-primary map-play-btn'}
        onClick={() => void (isPlaying ? stop() : play())}
        type="button"
      >
        {isPlaying ? '⏸ 정지' : '▶ 재생'}
      </button>
    </div>
  )
}
