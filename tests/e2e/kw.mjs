// Shared helpers for the browser tests.

/** The app under test; run.mjs starts a dev server here unless KWOON_URL points elsewhere. */
export const BASE = process.env.KWOON_URL ?? 'http://localhost:5199/'
/** A locally installed Chrome (playwright-core drives it; no browser download needed). */
export const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Tools live under modes in the tool row.
const TOOLS = {
  'Select (Esc)': [null, 'Select'],
  'Highlight text': ['Annotate', 'Highlight'],
  'Sticky note': ['Annotate', 'Comment'],
  'Text box': ['Annotate', 'Text box'],
  Rectangle: ['Annotate', 'shape:Rectangle'],
  Ellipse: ['Annotate', 'shape:Ellipse'],
  Line: ['Annotate', 'shape:Line'],
  Arrow: ['Annotate', 'shape:Arrow'],
  Freehand: ['Annotate', 'Draw'],
  'Mark text for redaction': ['Protect', 'Redact text'],
  'Mark an area for redaction': ['Protect', 'Redact area'],
  'Edit existing text': ['Edit', 'Edit text'],
}
export async function mode(page, name) {
  await page.click(`.kw-segmented__item:text-is("${name}")`)
}
export async function pickTool(page, label) {
  const [m, title] = TOOLS[label]
  if (m) await mode(page, m)
  if (title.startsWith('shape:')) {
    await page.click('[aria-label="Choose a shape"]')
    await page.click(`.kw-menu__item:has-text("${title.slice(6)}")`)
  } else {
    await page.click(`.kw-tool[title="${title}"]`)
  }
}
