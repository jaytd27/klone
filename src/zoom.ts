export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export const MIN_SCALE = 0.1
export const MAX_SCALE = 8

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
