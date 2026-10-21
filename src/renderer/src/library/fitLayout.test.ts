import { describe, expect, it } from 'vitest'
import { COVER_MAX_WIDTH, COVER_MIN_WIDTH, coverLayout, HERO_MAX_WIDTH, HERO_MIN_WIDTH, heroLayout } from './fitLayout'

const GAP = 22

describe('heroLayout', () => {
  it('con 8 personaggi su uno schermo largo usa due righe grandi invece di una riga piccola', () => {
    const layout = heroLayout(8, 2496, 1150, GAP)!
    expect(layout.columns).toBe(4)
    expect(layout.width).toBeGreaterThan(550)
    expect(2 * layout.height + GAP).toBeLessThanOrEqual(1150)
  })

  it('con più personaggi i riquadri si rimpiccioliscono e le righe aumentano', () => {
    const sizes = [8, 12, 18].map((count) => heroLayout(count, 2496, 1150, GAP)!)
    const side = (i: number): number => Math.min(sizes[i]!.width, sizes[i]!.height)
    expect(side(0)).toBeGreaterThan(side(1))
    expect(side(1)).toBeGreaterThan(side(2))
    for (const [i, count] of [8, 12, 18].entries()) {
      const rows = Math.ceil(count / sizes[i]!.columns)
      expect(rows * sizes[i]!.height + (rows - 1) * GAP).toBeLessThanOrEqual(1150)
    }
  })

  it('con pochi personaggi i riquadri non superano la larghezza massima', () => {
    const layout = heroLayout(1, 2496, 1150, GAP)!
    expect(layout).toMatchObject({ columns: 1, width: HERO_MAX_WIDTH })
    expect(layout.height).toBeLessThanOrEqual(HERO_MAX_WIDTH * 1.3)
  })

  it('quando non entrano più nemmeno piccoli torna alla griglia che scorre', () => {
    expect(heroLayout(40, 1216, 760, GAP)).toBeNull()
    const small = heroLayout(8, 1216, 760, GAP)
    expect(small === null || small.width >= HERO_MIN_WIDTH).toBe(true)
  })

  it('senza spazio misurato non calcola niente', () => {
    expect(heroLayout(0, 1000, 800, GAP)).toBeNull()
    expect(heroLayout(5, 0, 800, GAP)).toBeNull()
  })
})

describe('coverLayout', () => {
  const ROW_GAP = 38

  it('con pochi albi le copertine crescono fino al massimo, su una riga', () => {
    expect(coverLayout(6, 2496, 800, GAP, ROW_GAP)).toEqual({ columns: 6, width: COVER_MAX_WIDTH })
    expect(coverLayout(1, 2496, 800, GAP, ROW_GAP)).toEqual({ columns: 1, width: COVER_MAX_WIDTH })
  })

  it('con più albi usa più righe e copertine più piccole, senza uscire dallo spazio', () => {
    const layout = coverLayout(17, 2496, 800, GAP, ROW_GAP)!
    const rows = Math.ceil(17 / layout.columns)
    expect(rows).toBeGreaterThan(1)
    expect(layout.width).toBeLessThan(COVER_MAX_WIDTH)
    expect(layout.width).toBeGreaterThanOrEqual(COVER_MIN_WIDTH)
    expect(rows * (layout.width * 1.5 + 90) + (rows - 1) * ROW_GAP).toBeLessThanOrEqual(800)
    expect(layout.columns * layout.width + (layout.columns - 1) * GAP).toBeLessThanOrEqual(2496)
  })

  it('in uno spazio basso le copertine non superano l’altezza disponibile', () => {
    const layout = coverLayout(3, 2496, 420, GAP, ROW_GAP)!
    expect(layout.width * 1.5 + 90).toBeLessThanOrEqual(420)
  })

  it('quando non entrano nemmeno alla misura normale torna alla griglia che scorre', () => {
    expect(coverLayout(40, 1216, 600, GAP, ROW_GAP)).toBeNull()
    expect(coverLayout(0, 1216, 600, GAP, ROW_GAP)).toBeNull()
  })
})
