import type { JSX } from 'preact'

type Props = { size?: number; class?: string; strokeWidth?: number }

function icon(body: JSX.Element, filled = false) {
  return ({ size = 22, class: className, strokeWidth = 2.2 }: Props) => (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {body}
    </svg>
  )
}

export const Play = icon(<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />, true)
export const Pause = icon(
  <>
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.4" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.4" />
  </>,
  true,
)
export const SkipBack = icon(<path d="M19 20 9 12l10-8v16zM5 19V5" />)
export const SkipForward = icon(<path d="m5 4 10 8-10 8V4zM19 5v14" />)
export const Back10 = icon(
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.2" />
    <path d="M3.5 3.5v4.7h4.7" />
    <text x="12.4" y="15.6" font-size="7.4" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none" font-family="inherit">10</text>
  </>,
)
export const Forward10 = icon(
  <>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3l2.8 2.5" />
    <path d="M20.5 3.5v4.7h-4.7" />
    <text x="11.6" y="15.6" font-size="7.4" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none" font-family="inherit">10</text>
  </>,
)
export const Restart = icon(<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />)
export const ChevronDown = icon(<path d="m6 9 6 6 6-6" />)
export const ChevronRight = icon(<path d="m9 6 6 6-6 6" />)
export const ChevronLeft = icon(<path d="m15 6-6 6 6 6" />)
export const Ellipsis = icon(
  <>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </>,
  true,
)
export const List = icon(<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />)
export const BookOpen = icon(<path d="M2 4.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2zM22 4.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z" />)
export const FileText = icon(<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8zM14 2.5V8h5.5M15.5 13h-7M15.5 17h-7M10.5 9h-2" />)
export const Gauge = icon(<path d="m12 14 4-4M3.3 19a10 10 0 1 1 17.4 0" />)
export const Flame = icon(
  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
)
export const Check = icon(<path d="M20 6 9 17l-5-5" />)
export const Cap = icon(<path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5" />)
export const User = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </>,
)
export const FolderPlus = icon(
  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2zM12 10v6M9 13h6" />,
)
export const Close = icon(<path d="M18 6 6 18M6 6l12 12" />)
export const Car = icon(
  <>
    <path d="M5 16H3v-3.5L5 7h14l2 5.5V16h-2M7 16h10" />
    <circle cx="7" cy="16.5" r="2" />
    <circle cx="17" cy="16.5" r="2" />
  </>,
)
export const Globe = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </>,
)
export const Trash = icon(<path d="M3 6h18M8 6V4h8v2M5.5 6l1 14h11l1-14" />)
export const Translate = icon(<path d="M4 5h8M8 3v2c0 4-2 7-5 9M5 9c1 2 3 4 6 5M13 21l4-9 4 9M14.5 18h5" />)
export const Download = icon(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />)
export const Upload = icon(<path d="M12 16V4M7 9l5-5 5 5M5 21h14" />)
export const Headphones = icon(<path d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />)
export const Pencil = icon(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />)
export const Repeat = icon(<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />)
