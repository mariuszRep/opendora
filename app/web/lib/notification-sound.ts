"use client"

// Lightweight WebAudio-based notification chime. No external audio asset is
// shipped — the tone is synthesized on the fly so it works offline and adds
// no bundle weight. Mute state is persisted in localStorage.

const MUTE_KEY = "opendora:notifications:muted"

let ctx: AudioContext | null = null
let lastPlayed = 0

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    const Ctor: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) ctx = new Ctor()
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

export function isNotificationsMuted(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1"
  } catch {
    return false
  }
}

export function setNotificationsMuted(muted: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0")
    window.dispatchEvent(new CustomEvent("opendora:notifications:muted", { detail: muted }))
  } catch {
    // ignore
  }
}

export function playNotificationSound(opts?: { force?: boolean; variant?: "default" | "alert" }): void {
  if (typeof window === "undefined") return
  if (!opts?.force && isNotificationsMuted()) return

  // Throttle: never play more than once per 200ms.
  const now = Date.now()
  if (now - lastPlayed < 200) return
  lastPlayed = now

  const audio = getCtx()
  if (!audio) return

  const variant = opts?.variant ?? "default"
  // A pleasant two-tone chime (C6 -> E6 by default, or higher pair for alerts).
  const tones = variant === "alert"
    ? [{ freq: 988, start: 0 }, { freq: 1318.5, start: 0.09 }, { freq: 988, start: 0.22 }]
    : [{ freq: 880, start: 0 }, { freq: 1318.5, start: 0.12 }]

  const t0 = audio.currentTime
  for (const tone of tones) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = "sine"
    osc.frequency.value = tone.freq
    const start = t0 + tone.start
    const peak = 0.18
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
    osc.connect(gain).connect(audio.destination)
    osc.start(start)
    osc.stop(start + 0.4)
  }
}
