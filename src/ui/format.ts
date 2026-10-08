export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function minutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  return `${m} min`
}

export function hours(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 ** 3) return `${Math.round(n / 1024 / 1024)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
