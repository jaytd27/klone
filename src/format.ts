// Formatting helpers shared by components.

/** Human names for PDF annotation types. */
export const TYPE_LABELS: Record<string, string> = {
  Highlight: 'Highlight',
  Underline: 'Underline',
  StrikeOut: 'Strikeout',
  Squiggly: 'Squiggly underline',
  Text: 'Comment',
  Square: 'Rectangle',
  Circle: 'Ellipse',
  Line: 'Line',
  Ink: 'Drawing',
  FreeText: 'Text box',
  Stamp: 'Image',
  Polygon: 'Polygon',
  PolyLine: 'Polyline',
  Redact: 'Redaction mark',
}

/** "512 B", "48 KB", "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const PAPER_SIZES: [string, number, number][] = [
  ['A3', 842, 1191],
  ['A4', 595, 842],
  ['A5', 420, 595],
  ['Letter', 612, 792],
  ['Legal', 612, 1008],
  ['Tabloid', 792, 1224],
]

/** Names standard paper sizes (either orientation); otherwise gives millimetres. */
export function paperSize({ width, height }: { width: number; height: number }): string {
  const [short, long] = width < height ? [width, height] : [height, width]
  const named = PAPER_SIZES.find(([, w, h]) => Math.abs(w - short) < 3 && Math.abs(h - long) < 3)
  const orientation = width > height ? ' landscape' : ''
  if (named) return `${named[0]}${orientation}`
  const mm = (pt: number) => Math.round((pt / 72) * 25.4)
  return `${mm(width)} × ${mm(height)} mm`
}

