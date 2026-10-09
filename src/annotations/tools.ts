import type { AnnotStyle, RGB, TextFont } from '../pdf/protocol'

export type Tool =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'note'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'ink'
  | 'redactText'
  | 'redactArea'
  | 'editText'
export type DrawingTool = Exclude<Tool, 'select'>
export type ShapeTool = 'rect' | 'ellipse' | 'line' | 'arrow'

export const MARKUP_TOOLS: ReadonlySet<Tool> = new Set(['highlight', 'underline', 'strikeout'])
export const SHAPE_TOOLS: readonly ShapeTool[] = ['rect', 'ellipse', 'line', 'arrow']
export const REDACT_TOOLS: ReadonlySet<Tool> = new Set(['redactText', 'redactArea'])
/** Tools whose annotations have a stroke width. */
export const STROKE_TOOLS: ReadonlySet<Tool> = new Set(['rect', 'ellipse', 'line', 'arrow', 'ink'])

/**
 * Colours that go on the document. They are the same in dark and light mode,
 * and the UI accent (violet) is deliberately not among them.
 */
export const MARKERS = [
  { hex: '#FFE873', name: 'Yellow' },
  { hex: '#AAD65A', name: 'Green' },
  { hex: '#8ED0FF', name: 'Blue' },
  { hex: '#FFB3C7', name: 'Pink' },
  { hex: '#FFC27A', name: 'Orange' },
]
export const INKS = [
  { hex: '#1A1A1A', name: 'Black' },
  { hex: '#475569', name: 'Slate' },
  { hex: '#B42318', name: 'Red' },
  { hex: '#1D4ED8', name: 'Blue' },
  { hex: '#15803D', name: 'Green' },
]
/** How redaction marks are shown while drawing them. */
export const REDACT_COLOR = '#B42318'

/** Highlighters and notes take marker colours; everything else takes ink. */
export function paletteFor(toolOrType: string) {
  return toolOrType === 'highlight' || toolOrType === 'note' || toolOrType === 'Highlight' || toolOrType === 'Text' ? MARKERS : INKS
}

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
  return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

const style = (hex: string, width = 2, opacity = 1): AnnotStyle => ({ color: hexToRgb(hex), width, opacity })

export const DEFAULT_STYLES: Record<DrawingTool, AnnotStyle> = {
  highlight: style('#FFE873'),
  underline: style('#1D4ED8'),
  strikeout: style('#B42318'),
  note: style('#FFE873'),
  text: { ...style('#1A1A1A'), font: 'Helv', fontSize: 14 },
  rect: style('#B42318'),
  ellipse: style('#B42318'),
  line: style('#B42318'),
  arrow: style('#B42318'),
  ink: style('#1D4ED8'),
  // Redaction marks and text editing have no style of their own; placeholders.
  redactText: style(REDACT_COLOR),
  redactArea: style(REDACT_COLOR),
  editText: style('#1A1A1A'),
}
