# Kwoon

A full PDF editor that runs entirely in the browser (repo name `klone`, product name **Kwoon**). React 19 + TypeScript + Vite, with [MuPDF.js](https://mupdf.readthedocs.io/) (WASM, AGPL — the repo is AGPL-3.0 because of it) doing all PDF work, and Tesseract.js for OCR. Files never leave the device; keep it that way (no uploads, no third-party requests except Tesseract's engine/language data on first OCR use).

Live: https://kwoon.pages.dev — every push to `main` deploys via `.github/workflows/deploy.yml` (Cloudflare Pages project `kwoon`). The owner works in this repo at `W:\Klone\workspaces\klone`, GitHub `jaytd27/klone`.

## Commands

- `npm run dev` — dev server (tests expect it on port 5199: `npx vite --port 5199`)
- `npm run build` — typecheck + production build
- `npm run lint` — oxlint; keep it at zero warnings
- `npm test` — fixtures, engine tests, then browser tests (starts a dev server on 5199 if none is running). `npm test -- redaction` runs matching tests only. Logs and screenshots land in `tests/.out/`.

## Architecture

**PDF engine in a Web Worker** — `src/pdf/pdf.worker.ts` owns the open document; `src/pdf/client.ts` is the promise wrapper; `src/pdf/protocol.ts` holds every message and data type. All coordinates are MuPDF page space: points, origin top-left of the page *as displayed* (after /Rotate), y down.

- Every change goes through `mutate(name, fn, scope)`: one MuPDF journal operation = one undo step. Scope says what to invalidate: a page id (that page re-renders, its text cache is kept), `'appearance'` (all pages re-render, text kept — forms), or `'document'` (default; everything).
- Pages are identified by **PDF object number** (`PageInfo.id`), stable across reorders and undo. Renders and edits are addressed by id, never index. `PageInfo.rev` changes whenever a page's look changes; `PageCanvas` re-renders on it.
- The worker posts `{ ready: true }` once MuPDF has loaded; the client queues messages until then (messages sent during MuPDF's top-level await are otherwise lost).
- Renders are queued newest-first with abort support so scrolling never backs up.
- `save()` runs `repairForExport()` first (see Acrobat notes below).

**UI** — `src/App.tsx` holds document state and every action; components are presentational.

- Layout per the Graphite theme: `TopBar` (brand, file + save state, mode switch, search, ⌘K, theme, Open, Export) → `ToolRow` (tools of the current mode, page nav, undo/redo, zoom) → `Sidebar` (thumbnails) · `Viewer` (canvas) · `Inspector` (properties, comments, page actions) → `StatusBar`. Dialogs use `Modal` (`<dialog>`); messages use `Toasts`.
- Modes (`src/annotations/modes.ts`): View, Annotate, Edit, Organize, Sign, Protect. Picking a tool switches to its mode.
- Per-page overlays inside `PageCanvas`: `AnnotationLayer` (SVG in page units: drawing previews, hit-testing, selection/resize handles, search hits, text-box editor), `FormLayer` (native controls over AcroForm widgets), `TextEditLayer` (edit-existing-text tool). They reach the app through `AnnotationContext` (`src/annotations/context.ts`).
- Long operations go through `run()` (one at a time, errors become toasts). Form edits use their own ordered queue so fast tabbing never drops a value.

## Design system (Graphite)

Theme files are in `src/theme/` (`tokens.css`, `base.css`, `components.css` from the Kwoon theme package; two width bugs fixed where marked "Kwoon fix"). App styles in `src/App.css` must use `--kw-*` tokens and `.kw-*` classes, never raw colours — except things drawn on the white page, which use the light-mode violet `#6B46E5`.

Rules that matter: dark is default (light/system via `src/theme/theme.ts`); violet means state only and **only the active tool gets the solid accent fill** (toggles use `.kw-tool--toggle`); numbers are mono; floating things are always dark; document colours come from `MARKERS` (highlighters, notes) and `INKS` (everything else) in `src/annotations/tools.ts` and never include violet; icons are in `src/components/Icon.tsx` (24 grid, 1.75 stroke — draw new ones the same way). Fonts are self-hosted with Fontsource (no Google Fonts requests). UI copy uses British spelling ("colour", "recognise"), short and concrete.

## MuPDF.js gotchas (learned the hard way)

- With the journal on, any change outside `beginOperation`/`endOperation` throws.
- `PDFObject.isStream()` / `readStream()` only work on the **indirect** reference, not on `.resolve()`d objects. `PDFObject.length` counts array items only; count dictionary entries with `forEach`.
- JS strings passed to `addObject` become PDF *names*; use `doc.newString()` for strings.
- `getRect()` throws for annotations without a Rect (markup); use `getBounds()`.
- `StructuredText.search()` is **case-sensitive** unless options are `'ignore-case'`, and returns at most 500 quads per page (we refuse rather than truncate).
- `applyRedactions()` leaves some annotation types (notes) and form fields under a mark; `applyRedactions` in the worker deletes overlapping annotations and clears/removes overlapping fields itself. `PDFAnnotation.applyRedaction()` applies a single mark (used to erase one line when editing text).
- PNG alpha is dropped when MuPDF stores an image; build images as colour pixmap + gray mask (`buildImage`).
- **Acrobat compatibility** (`makePortable`, run on create and on export): soft masks must be `DeviceGray` (MuPDF writes ICC gray → Acrobat says "an error exists on this page" and drops the image); `setIntent('StampImage')` writes `/IT null`; new FreeText annotations get a stray `/CL` callout from the page corner, re-added on every `setRect`. MuPDF itself tolerates all of these, so check structure, not just rendering.
- Text added by Kwoon (text boxes, watermarks, OCR, edited lines) uses the 14 standard fonts with WinAnsi encoding: Latin only. `appendContent` wraps existing page content in q/Q once (marked `/KloneWrap`) — don't wrap repeatedly.
- `setChoiceValue` wants the option's *export* value.

## Testing notes

Tests live in `tests/` (fixtures are generated, never committed — the folder must not contain anyone's real documents). Browser tests drive a locally installed Chrome through `playwright-core` (`CHROME_PATH` to override; `KWOON_URL` to test another deployment, e.g. production). They mostly print findings and verify the exported PDF with MuPDF; a test fails on a non-zero exit or browser errors, so read the log when behaviour changes. Helper `tests/e2e/kw.mjs` knows which mode each tool lives in.

## Working conventions

- Commit messages end with the `Co-Authored-By` line from the session; commit and push when a piece of work is done and tested (pushing deploys).
- Verify in the real app (and on exported files) before calling something done; keep lint clean.
- Known limitations are listed in `README.md`; update it when features change.
