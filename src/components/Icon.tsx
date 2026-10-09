/**
 * Kwoon's icon set: the Graphite theme icons (24 grid, 1.75 stroke, round
 * caps and joins, currentColor), plus a few drawn the same way for actions
 * the theme package doesn't cover. Don't mix in other icon sets.
 */
const paths = {
  // From the theme package (icons/)
  check: 'M5 12l4 4L19 7',
  chevronDown: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  comment: 'M4 5h16v11H9l-5 4z',
  draw: 'M3 17c3-6 6 2 9-4s6 2 9-4',
  editText: 'M5 6V4h14v2M12 4v16M9 20h6',
  export: 'M12 4v11M8 11l4 4 4-4M4 20h16',
  extract: 'M12 3v12M8 11l4 4 4-4M4 17v3h16v-3',
  highlight: 'M15 5l4 4L9 19H5v-4zM4 21h16',
  merge: 'M6 4v6a4 4 0 0 0 4 4h4M18 4v6a4 4 0 0 1-4 4M12 14v6M9 17l3 3 3-3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  ocr: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 12h8',
  organize: 'M8 4h11v14H8zM5 7v13h11',
  plus: 'M12 5v14M5 12h14',
  protect: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  redact: 'M4 6h16v5H4zM4 15h10M4 19h7',
  revert: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  rotate: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  search: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM20 20l-4-4',
  select: 'M5 3l13 8-6 1.5L9.5 19z',
  shapes: 'M4 4h8v8H4zM17 12a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  sign: 'M3 18c4 0 5-10 8-10s-1 10 3 10 3-4 7-4',
  zoomIn: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM20 20l-4-4M8 11h6',
  // Drawn for Kwoon in the same style
  underline: 'M7 4v6a5 5 0 0 0 10 0V4M5 20h14',
  strikeout: 'M4 12h16M16.5 7.5A4 3 0 0 0 12 5c-2.8 0-4.5 1.4-4.5 3.2M7.5 16.5A4.5 3 0 0 0 12 19c2.8 0 4.5-1.4 4.5-3.2',
  textBox: 'M4 4h16v16H4zM8 8h8M12 8v8',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M10 5h9v9',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
  watermark: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  redactArea: 'M4 4h16v16H4zM8 9h8v6H8z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  fitWidth: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  chevronUp: 'M6 15l6-6 6 6',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  inspector: 'M4 5h16v14H4zM15 5v14',
  filePlus: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15h6',
  command: 'M4 12h12M12 6l6 6-6 6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  )
}
