import { createContext, useContext } from 'react'
import type { AnnotInfo, AnnotSpec, AnnotStyle, FieldChange, Point } from '../pdf/protocol'
import type { Tool } from './tools'

export interface AnnotSelection {
  pageId: number
  annotId: number
  /** Filled in once the page's annotation list has been loaded. */
  info: AnnotInfo | null
}

/** What the per-page annotation and form layers need from the app. */
export interface AnnotationController {
  tool: Tool
  style: AnnotStyle
  busy: boolean
  selection: AnnotSelection | null
  select(pageId: number, annot: AnnotInfo | null): void
  /** Called by a page layer whenever its annotation list is (re)loaded. */
  syncAnnotations(pageId: number, annots: AnnotInfo[]): void
  create(pageId: number, spec: AnnotSpec): void
  moveSelected(offset: Point): void
  fillField(pageId: number, widgetId: number, change: FieldChange): void
}

export const AnnotationContext = createContext<AnnotationController | null>(null)

export function useAnnotations(): AnnotationController {
  const ctx = useContext(AnnotationContext)
  if (!ctx) throw new Error('useAnnotations must be used inside AnnotationContext')
  return ctx
}
