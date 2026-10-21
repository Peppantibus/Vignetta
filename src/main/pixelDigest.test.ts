import { expect, it } from 'vitest'
import { pixelDigest } from './pixelDigest'

it('confronta ogni pixel e le dimensioni, senza tolleranze', () => {
  const pixels = Buffer.from([0, 10, 20, 255, 200, 210, 220, 255, 4, 5, 6, 255, 7, 8, 9, 255])
  const changed = Buffer.from(pixels)
  changed[14]!++
  expect(pixelDigest(2, 2, pixels)).toBe(pixelDigest(2, 2, Buffer.from(pixels)))
  expect(pixelDigest(2, 2, changed)).not.toBe(pixelDigest(2, 2, pixels))
  expect(pixelDigest(1, 4, pixels)).not.toBe(pixelDigest(2, 2, pixels))
})
it('conserva pagine bianche uniformi e bitmap non valide', () => {
  expect(pixelDigest(2, 2, Buffer.alloc(16, 255))).toBeNull()
  expect(pixelDigest(0, 2, Buffer.alloc(0))).toBeNull()
  expect(pixelDigest(20, 2, Buffer.alloc(16))).toBeNull()
})
