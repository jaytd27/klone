const paths = {
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  fitWidth: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  chevronUp: 'm6 15 6-6 6 6',
  chevronDown: 'm6 9 6 6 6-6',
  rotateCw: 'M20 12a8 8 0 1 1-2.34-5.66L20 9M20 4v5h-5',
  rotateCcw: 'M4 12a8 8 0 1 0 2.34-5.66L4 9M4 4v5h5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  extract: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 18v-6M9 15l3-3 3 3',
  filePlus: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15h6',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  cursor: 'M6 3l12 9-5.5 1.2L15 19l-2.5 1.2-2.6-5.7L6 18z',
  highlight: 'm9 15-2 2v3h3l2-2M9 15l7-11 4 3-7 11zM4 21h4',
  underline: 'M7 4v6a5 5 0 0 0 10 0V4M5 20h14',
  strikeout: 'M4 12h16M16.5 7.5A4 3 0 0 0 12 5c-2.8 0-4.5 1.4-4.5 3.2M7.5 16.5A4.5 3 0 0 0 12 19c2.8 0 4.5-1.4 4.5-3.2',
  note: 'M4 5h16v11H10l-6 4z',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19 19 5',
  arrow: 'M5 19 19 5M10 5h9v9',
  ink: 'M3 17c2.5-5 4.5-7 6-4s2 6 4.5 1 3.5-7 7.5-6',
  textBox: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
  signature: 'M3 16c2-4 3.5-9 5.5-9s-1 9 1.5 9 3-6 4.5-6 .5 5 2.5 5 2-2 3-2M3 20h18',
  watermark: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  redactText: 'M4 6h16M4 18h9M4 10h16v4H4zM7 12h10',
  redactArea: 'M4 4h16v16H4zM4 12h16M12 4v16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 4 4',
  editText: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4M14 20h6',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5',
} as const

export type IconName = keyof typeof paths

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
