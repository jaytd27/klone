import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useAnnotations } from '../annotations/context'
import { pdf } from '../pdf/client'
import type { FieldInfo, PageInfo } from '../pdf/protocol'

interface Props {
  page: PageInfo
  /** CSS pixels per PDF point. */
  scale: number
}

/**
 * Native controls laid over a page's form fields. They stay see-through so
 * the PDF's own rendering of each field shows; text fields turn opaque only
 * while being edited.
 */
export function FormLayer({ page, scale }: Props) {
  const ctx = useAnnotations()
  const [fields, setFields] = useState<FieldInfo[]>([])

  useEffect(() => {
    let live = true
    pdf.listFields(page.id).then(
      (list) => {
        if (live) setFields(list)
      },
      (err) => {
        if (err?.name !== 'AbortError') console.error('Failed to load form fields', err)
      },
    )
    return () => {
      live = false
    }
  }, [page.id, page.rev])

  if (!fields.length) return null

  const fill = ctx.fillField.bind(null, page.id)

  return (
    <div className={`form-layer ${ctx.tool === 'select' ? 'form-layer--active' : ''}`}>
      {fields.map((field) => {
        const [x0, y0, x1, y1] = field.bounds
        const box: CSSProperties = { left: x0 * scale, top: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale }
        const label = field.name || 'Form field'
        if (field.readOnly || field.kind === 'button') return null

        switch (field.kind) {
          case 'text':
            return (
              <TextField
                key={`${field.id}:${field.value}`}
                field={field}
                scale={scale}
                style={box}
                onCommit={(text) => fill(field.id, { text })}
              />
            )
          case 'checkbox':
          case 'radio':
            return (
              <button
                key={field.id}
                className="form-field form-field--toggle"
                style={box}
                role={field.kind === 'radio' ? 'radio' : 'checkbox'}
                aria-checked={field.checked}
                aria-label={label}
                title={label}
                onClick={() => {
                  // Clicking the chosen radio button again keeps it chosen.
                  if (!(field.kind === 'radio' && field.checked)) fill(field.id, { toggle: true })
                }}
              />
            )
          case 'combo':
          case 'list': {
            const current = field.options.find((o) => o.value === field.value || o.label === field.value)
            // MuPDF draws list boxes without marking the chosen option, so
            // list boxes show the native list on top instead.
            const isList = field.kind === 'list'
            return (
              <select
                key={field.id}
                className={`form-field ${isList ? 'form-field--list' : 'form-field--choice'}`}
                style={isList ? { ...box, fontSize: (field.fontSize || 12) * scale } : box}
                size={isList ? Math.max(field.options.length, 2) : undefined}
                aria-label={label}
                title={label}
                value={current?.value ?? ''}
                onChange={(e) => fill(field.id, { choice: e.target.value })}
              >
                {!current && !isList && <option value="">—</option>}
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )
          }
          case 'signature':
            return <div key={field.id} className="form-field form-field--signature" style={box} title={`${label} (signature field)`} />
        }
      })}
    </div>
  )
}

function TextField({ field, scale, style, onCommit }: { field: FieldInfo; scale: number; style: CSSProperties; onCommit(text: string): void }) {
  const [draft, setDraft] = useState(field.value)
  const [editing, setEditing] = useState(false)
  const height = field.bounds[3] - field.bounds[1]
  // Size 0 means "auto"; approximate MuPDF's fit-to-field sizing.
  const fontSize = (field.fontSize || (field.multiline ? 12 : Math.min(12, height * 0.65))) * scale
  // Stay opaque until the page re-renders with the committed value.
  const opaque = editing || draft !== field.value
  const props = {
    className: `form-field form-field--text ${opaque ? 'form-field--editing' : ''}`,
    style: { ...style, fontSize, padding: `0 ${2 * scale}px` },
    value: draft,
    'aria-label': field.name || 'Text field',
    title: field.name,
    maxLength: field.maxLength || undefined,
    spellCheck: false,
    onFocus: () => setEditing(true),
    onBlur: () => {
      setEditing(false)
      if (draft !== field.value) onCommit(draft)
    },
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setDraft(field.value)
        // Blur after the reset has rendered so it doesn't commit the old draft.
        const el = e.currentTarget
        requestAnimationFrame(() => el.blur())
      } else if (e.key === 'Enter' && !field.multiline) {
        e.currentTarget.blur()
      }
    },
  }
  return field.multiline ? <textarea {...props} /> : <input type={field.password ? 'password' : 'text'} {...props} />
}
