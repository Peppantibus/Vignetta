import { describe, expect, it } from 'vitest'
import { croppedAspect, detectBorders, NO_BORDERS, pairBorders, type Pixels } from './borders'

type Rgb = [number, number, number]

const WHITE: Rgb = [255, 255, 255]
const CREAM: Rgb = [238, 228, 202]
const BLACK: Rgb = [12, 12, 12]

/** Miniatura di prova: fondo uniforme e un riquadro di "disegno" non uniforme. */
function page(width: number, height: number, background: Rgb, art: { x: number; y: number; w: number; h: number } | null): Pixels & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 7
  const random = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = art && x >= art.x && x < art.x + art.w && y >= art.y && y < art.y + art.h
      const color: Rgb = inside ? [Math.floor(random() * 255), Math.floor(random() * 255), Math.floor(random() * 255)] : background
      data.set([...color, 255], (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

function paint(pixels: { data: Uint8ClampedArray; width: number }, x: number, y: number, w: number, h: number, color: Rgb): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) pixels.data.set([...color, 255], (row * pixels.width + col) * 4)
  }
}

describe('rilevamento dei bordi delle scansioni', () => {
  it('non ritaglia una pagina disegnata fino al bordo', () => {
    expect(detectBorders(page(200, 300, WHITE, { x: 0, y: 0, w: 200, h: 300 }))).toEqual(NO_BORDERS)
  })

  it('toglie i margini bianchi lasciando un margine di sicurezza dell’1%', () => {
    const borders = detectBorders(page(200, 300, WHITE, { x: 20, y: 15, w: 170, h: 255 }))
    expect(borders.left).toBeCloseTo(0.1 - 0.01)
    expect(borders.right).toBeCloseTo(0.05 - 0.01)
    expect(borders.top).toBeCloseTo(0.05 - 0.01)
    expect(borders.bottom).toBeCloseTo(0.1 - 0.01)
  })

  it('riconosce la carta ingiallita e i bordi neri', () => {
    for (const background of [CREAM, BLACK]) {
      const borders = detectBorders(page(200, 300, background, { x: 10, y: 30, w: 180, h: 240 }))
      expect(borders.left).toBeCloseTo(0.04)
      expect(borders.top).toBeCloseTo(0.09)
    }
  })

  it('ignora qualche puntino di polvere nel margine', () => {
    const pixels = page(200, 300, WHITE, { x: 20, y: 30, w: 160, h: 240 })
    paint(pixels, 50, 5, 1, 1, BLACK)
    paint(pixels, 3, 100, 1, 1, BLACK)
    const borders = detectBorders(pixels)
    expect(borders.top).toBeCloseTo(0.09)
    expect(borders.left).toBeCloseTo(0.09)
  })

  it("supera l'ombra scura dello scanner fino al margine chiaro del foglio", () => {
    const pixels = page(200, 300, WHITE, { x: 30, y: 30, w: 150, h: 240 })
    paint(pixels, 0, 0, 8, 300, BLACK) // fascia scura su tutto il lato sinistro
    const borders = detectBorders(pixels)
    expect(borders.left).toBeCloseTo(0.14)
    expect(borders.top).toBeCloseTo(0.09)
  })

  it('non scambia per bordo una zona scura del disegno su un lato solo', () => {
    const pixels = page(200, 300, WHITE, { x: 0, y: 0, w: 200, h: 300 })
    paint(pixels, 0, 255, 200, 45, BLACK) // ombra al vivo in fondo alla tavola
    expect(detectBorders(pixels)).toEqual(NO_BORDERS)
  })

  it('lascia intera una pagina bianca', () => {
    expect(detectBorders(page(200, 300, WHITE, null))).toEqual(NO_BORDERS)
  })

  it('non tocca un lato con più di un quarto di bianco (fondo del disegno)', () => {
    const borders = detectBorders(page(200, 300, WHITE, { x: 10, y: 15, w: 180, h: 165 }))
    expect(borders.bottom).toBe(0)
    expect(borders.top).toBeCloseTo(0.04)
    expect(borders.left).toBeCloseTo(0.04)
  })

  it('non ritaglia un colore deciso che arriva al bordo, come un cielo', () => {
    expect(detectBorders(page(200, 300, [90, 160, 230], { x: 20, y: 30, w: 160, h: 240 }))).toEqual(NO_BORDERS)
  })

  it('si ferma al primo segno di un balloon vicino al margine', () => {
    const pixels = page(200, 300, WHITE, { x: 20, y: 60, w: 160, h: 220 })
    paint(pixels, 60, 30, 60, 2, BLACK) // contorno del balloon sopra la vignetta
    expect(detectBorders(pixels).top).toBeCloseTo(0.09)
  })
})

describe('pagine affiancate', () => {
  it('in alto e in basso si toglie solo il bordo comune, i lati restano indipendenti', () => {
    const [left, right] = pairBorders(
      { top: 0.05, right: 0.02, bottom: 0.01, left: 0.06 },
      { top: 0.03, right: 0.07, bottom: 0.04, left: 0 }
    )
    expect(left).toEqual({ top: 0.03, right: 0.02, bottom: 0.01, left: 0.06 })
    expect(right).toEqual({ top: 0.03, right: 0.07, bottom: 0.01, left: 0 })
  })

  it('calcola le proporzioni della parte visibile', () => {
    expect(croppedAspect([1000, 1500], NO_BORDERS)).toBeCloseTo(2 / 3)
    expect(croppedAspect([1000, 1500], { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 })).toBeCloseTo(2 / 3)
    expect(croppedAspect([1000, 1500], { top: 0, right: 0.25, bottom: 0, left: 0 })).toBeCloseTo(0.5)
  })
})
