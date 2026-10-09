import type { AnnotStyle, RGB, TextFont } from '../pdf/protocol'

export type Tool = 'select' | 'highlight' | 'underline' | 'strikeout' | 'note' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'ink'
export type DrawingTool = Exclude<Tool, 'select'>

export const MARKUP_TOOLS: ReadonlySet<Tool> = new Set(['highlight', 'underline', 'strikeout'])
/** Tools whose annotations have a stroke width. */
export const STROKE_TOOLS: ReadonlySet<Tool> = new Set(['rect', 'ellipse', 'line', 'arrow', 'ink'])

export const PALETTE = ['#ffd400', '#ff9f1c', '#e5383b', '#f15bb5', '#2ecc71', '#2f6fde', '#7b2cbf', '#1c1f24']
export const WIDTHS = [1, 2, 3, 5, 8]
export const OPACITIES = [1, 0.75, 0.5, 0.25]
export const FONT_SIZES = [8, 10, 12, 14, 18, 24, 36, 48, 72]
export const FONTS: { font: TextFont; label: string; css: string }[] = [
  { font: 'Helv', label: 'Sans', css: 'Helvetica, Arial, sans-serif' },
  { font: 'TiRo', label: 'Serif', css: "'Times New Roman', Times, serif" },
  { font: 'Cour', label: 'Mono', css: "'Courier New', Courier, monospace" },
]
/** Annotation types that can be resized with handles (text boxes size to their text). */
export const RESIZABLE_TYPES: ReadonlySet<string> = new Set(['Square', 'Circle', 'Stamp'])

export function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex(rgb: RGB): string {
  return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
}

const style = (hex: string, width = 2, opacity = 1): AnnotStyle => ({ color: hexToRgb(hex), width, opacity })

export const DEFAULT_STYLES: Record<DrawingTool, AnnotStyle> = {
  highlight: style('#ffd400'),
  underline: style('#2f6fde'),
  strikeout: style('#e5383b'),
  note: style('#ffd400'),
  text: { ...style('#1c1f24'), font: 'Helv', fontSize: 14 },
  rect: style('#e5383b'),
  ellipse: style('#e5383b'),
  line: style('#e5383b'),
  arrow: style('#e5383b'),
  ink: style('#2f6fde'),
}
