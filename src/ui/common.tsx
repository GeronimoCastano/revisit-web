import { useEffect, useRef, useState } from 'preact/hooks'
import { importPicked } from '../model/app'
import { pickedFromInput } from '../storage/importer'
import { type ArtSeed, artSVG } from './art'
import { clock } from './format'

export function Art({ seed, class: className = 'art' }: { seed: ArtSeed; class?: string }) {
  return <div class={className} dangerouslySetInnerHTML={{ __html: artSVG(seed) }} />
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button class={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
  )
}

/** A draggable progress bar with elapsed and remaining time. */
export function ScrubBar({ value, duration, onSeek }: { value: number; duration: number; onSeek: (s: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | undefined>(undefined)
  const shown = drag ?? value
  const f = duration > 0 ? Math.min(Math.max(shown / duration, 0), 1) : 0
  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * duration
  }
  return (
    <div>
      <div
        ref={ref}
        class="scrub"
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={clock(shown)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onSeek(value - 10)
          if (e.key === 'ArrowRight') onSeek(value + 10)
        }}
        onPointerDown={(e) => {
          if (!(duration > 0)) return
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          setDrag(at(e))
        }}
        onPointerMove={(e) => drag !== undefined && setDrag(at(e))}
        onPointerUp={(e) => {
          if (drag === undefined) return
          onSeek(at(e))
          setDrag(undefined)
        }}
        onPointerCancel={() => setDrag(undefined)}
      >
        <div class="scrub-rail" />
        <div class="scrub-fill" style={{ width: `${f * 100}%` }} />
        <div class="scrub-knob" style={{ left: `${f * 100}%` }} />
      </div>
      <div class="scrub-times">
        <span>{clock(shown)}</span>
        <span>-{clock(Math.max(duration - shown, 0))}</span>
      </div>
    </div>
  )
}

/** Small progress ring drawn around a lesson number. */
export function MiniRing({ fraction, size = 48, color = 'var(--primary)' }: { fraction: number; size?: number; color?: string }) {
  const r = size / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <svg class="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pale)" stroke-width="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray={`${c * fraction} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

// MARK: - Import pickers

let folderInput: HTMLInputElement | null = null
let filesInput: HTMLInputElement | null = null

export function openImporter(kind: 'folder' | 'files') {
  ;(kind === 'folder' ? folderInput : filesInput)?.click()
}

/** Phones can't pick folders, so there offer the file picker first. */
export const canPickFolders = !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

export function ImportInputs() {
  const folder = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  useEffect(() => {
    folderInput = folder.current
    filesInput = files.current
    folder.current?.setAttribute('webkitdirectory', '')
  }, [])
  const onChange = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    if (input.files?.length) void importPicked(pickedFromInput(input.files))
    input.value = ''
  }
  return (
    <>
      <input ref={folder} class="visually-hidden" type="file" multiple onChange={onChange} tabIndex={-1} aria-hidden="true" />
      <input
        ref={files}
        class="visually-hidden"
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.m4b,.aac,.wav,.flac,.ogg,.opus,.pdf,application/pdf,.zip,application/zip"
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  )
}

/** Closes an overlay with the Escape key. */
export function useEscape(close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [close])
}
