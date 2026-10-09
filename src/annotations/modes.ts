import type { Tool } from './tools'

/** The editor's modes; each shows its own tools in the tool row. */
export type Mode = 'view' | 'annotate' | 'edit' | 'organize' | 'sign' | 'protect'

export const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: 'view', label: 'View', hint: 'Read, search and fill in forms. Click a form field to fill it in.' },
  { mode: 'annotate', label: 'Annotate', hint: 'Highlight, comment, draw and add text boxes. Choose a tool, then work on the page.' },
  { mode: 'edit', label: 'Edit', hint: 'Change the text on the page, add images and watermarks, or recognise text in scans.' },
  { mode: 'organize', label: 'Organize', hint: 'Select pages in the thumbnails, then rotate, delete, extract or insert. Drag thumbnails to reorder.' },
  { mode: 'sign', label: 'Sign', hint: 'Draw or type a signature, then place it on the page and move it into position.' },
  { mode: 'protect', label: 'Protect', hint: 'Mark text or areas, or find every match, then apply to remove them for good.' },
]

/** Which mode a tool belongs to, so picking a tool from anywhere shows its mode. */
export const TOOL_MODES: Record<Tool, Mode> = {
  select: 'view',
  highlight: 'annotate',
  underline: 'annotate',
  strikeout: 'annotate',
  note: 'annotate',
  text: 'annotate',
  rect: 'annotate',
  ellipse: 'annotate',
  line: 'annotate',
  arrow: 'annotate',
  ink: 'annotate',
  editText: 'edit',
  redactText: 'protect',
  redactArea: 'protect',
}
