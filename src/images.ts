import type { ImagePayload } from './pdf/protocol'

/** Longest side, in pixels, that images are kept at when added to a PDF. */
const MAX_IMAGE_SIZE = 2400

export interface LoadedImage {
  payload: ImagePayload
  width: number
  height: number
}

/**
 * Prepares an image file for the PDF worker. JPEGs that are small enough are
 * passed through unchanged; everything else is decoded (and scaled down if
 * huge) so transparency is kept.
 */
export async function loadImage(blob: Blob): Promise<LoadedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('That file isn’t an image this browser can read')
  }
  try {
    const { width, height } = bitmap
    const shrink = Math.min(1, MAX_IMAGE_SIZE / Math.max(width, height))
    if (blob.type === 'image/jpeg' && shrink === 1) {
      return { payload: { jpeg: await blob.arrayBuffer() }, width, height }
    }
    const w = Math.max(1, Math.round(width * shrink))
    const h = Math.max(1, Math.round(height * shrink))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    return { payload: { rgba: data.buffer as ArrayBuffer, width: w, height: h }, width: w, height: h }
  } finally {
    bitmap.close()
  }
}

/** Crops a canvas to its non-transparent pixels plus a small margin. */
export function trimCanvas(source: HTMLCanvasElement, margin = 4): HTMLCanvasElement | null {
  const ctx = source.getContext('2d')!
  const { width, height } = source
  const { data } = ctx.getImageData(0, 0, width, height)
  let [x0, y0, x1, y1] = [width, height, -1, -1]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - margin)
  y0 = Math.max(0, y0 - margin)
  x1 = Math.min(width - 1, x1 + margin)
  y1 = Math.min(height - 1, y1 + margin)
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(source, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
