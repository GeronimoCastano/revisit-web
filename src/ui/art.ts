/**
 * Generated cover art: a warm field with a banded sun and two diagonal bands.
 * Every lesson gets its own palette and composition, seeded by its id.
 */

export interface ArtSeed {
  key: string
  index: number
  level: number
}

const palettes = [
  { bg: '#E9825F', ring: '#F09A74', glow: '#FFD9A8', sun: '#F2B134', band: '#C8553D', deep: '#8E3B2E' },
  { bg: '#9BA66B', ring: '#B3BC83', glow: '#EFE3B8', sun: '#F2B134', band: '#5E6B3A', deep: '#3E4827' },
  { bg: '#B0607A', ring: '#C77A92', glow: '#F6D3C4', sun: '#F2B134', band: '#7E3A55', deep: '#4E2336' },
  { bg: '#4F8C87', ring: '#6AA59F', glow: '#F3DDB3', sun: '#F2B134', band: '#2F5F5B', deep: '#1E3F3D' },
  { bg: '#D9A441', ring: '#E5B865', glow: '#FFF0CF', sun: '#C8553D', band: '#A8742A', deep: '#6E4A1C' },
  { bg: '#6C7FB0', ring: '#8697C4', glow: '#F7D9C4', sun: '#F2B134', band: '#45558A', deep: '#2D3A63' },
  { bg: '#E58F87', ring: '#EEA9A1', glow: '#FFE6D5', sun: '#F2B134', band: '#B8574E', deep: '#7E3530' },
  { bg: '#5E8B6A', ring: '#78A383', glow: '#F4E5C2', sun: '#E88A4A', band: '#3C6448', deep: '#264232' },
]

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cache = new Map<string, string>()

/** A square SVG (viewBox 0 0 100 100) that crops nicely to any shape. */
export function artSVG(seed: ArtSeed): string {
  const cacheKey = `${seed.key}|${seed.index}|${seed.level}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const rnd = random(hash(cacheKey))
  const p = palettes[(seed.index + seed.level * 3) % palettes.length]
  const sx = 62 + rnd() * 22
  const sy = 12 + rnd() * 16
  const r = 30 + rnd() * 10
  const angle = -(5 + rnd() * 10)
  const bandY = 50 + rnd() * 10
  const bandH = 12 + rnd() * 6
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
<rect width="100" height="100" fill="${p.bg}"/>
<circle cx="${sx}" cy="${sy}" r="${r}" fill="${p.ring}"/>
<circle cx="${sx}" cy="${sy}" r="${r * 0.68}" fill="${p.glow}"/>
<circle cx="${sx}" cy="${sy}" r="${r * 0.38}" fill="${p.sun}"/>
<g transform="rotate(${angle} 50 ${bandY})">
<rect x="-30" y="${bandY}" width="160" height="${bandH}" rx="${bandH / 2}" fill="${p.band}"/>
<rect x="-30" y="${bandY + bandH - 1}" width="160" height="80" fill="${p.deep}"/>
</g>
</svg>`
  cache.set(cacheKey, svg)
  return svg
}

export const artDataURL = (seed: ArtSeed) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artSVG(seed))}`

/** A PNG of the art for the lock screen, which can't show SVG. */
export async function artPNG(seed: ArtSeed, size = 512): Promise<string | undefined> {
  try {
    const image = new Image()
    image.src = artDataURL(seed)
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    canvas.getContext('2d')!.drawImage(image, 0, 0, size, size)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? URL.createObjectURL(blob) : undefined
  } catch {
    return undefined
  }
}

export function seedFor(track: { id: string; number: number; kind: string; levelNumber: number }): ArtSeed {
  return {
    key: track.id,
    index: track.number + (track.kind === 'reading' ? 11 : track.kind === 'guide' ? 23 : 0),
    level: track.levelNumber,
  }
}
