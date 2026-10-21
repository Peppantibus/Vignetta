import { createHash } from 'node:crypto'

/** Confronto esatto BGRA a risoluzione intera. Le pagine uniformi (es. bianche) restano. */
export function pixelDigest(width: number, height: number, pixels: Buffer): string | null {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4) return null
  let uniform = true
  for (let i = 4; i < pixels.length; i += 4) {
    if (pixels[i] !== pixels[0] || pixels[i + 1] !== pixels[1] || pixels[i + 2] !== pixels[2] || pixels[i + 3] !== pixels[3]) { uniform = false; break }
  }
  return uniform ? null : createHash('sha256').update(`${width}x${height}:`).update(pixels).digest('hex')
}
