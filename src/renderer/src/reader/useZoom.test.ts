import { describe, expect, it } from 'vitest'
import { FIT_ZOOM, MAX_ZOOM, MIN_ZOOM, nextZoom, ZOOM_STEP } from './useZoom'

/** I livelli toccati partendo da `start` e applicando `factor` per `times` volte. */
function steps(start: number, factor: number, times: number): number[] {
  const levels: number[] = []
  let zoom = start
  for (let i = 0; i < times; i++) levels.push((zoom = nextZoom(zoom, factor)))
  return levels.map((z) => Math.round(z * 1000) / 1000)
}

describe('zoom delle pagine', () => {
  it('rimpicciolisce sotto la pagina adattata fino al 50%', () => {
    expect(steps(FIT_ZOOM, 1 / ZOOM_STEP, 4)).toEqual([0.8, 0.64, MIN_ZOOM, MIN_ZOOM])
  })

  it('risalendo dal minimo si ferma esattamente al 100% prima di ingrandire', () => {
    expect(steps(MIN_ZOOM, ZOOM_STEP, 4)).toEqual([0.625, 0.781, FIT_ZOOM, 1.25])
  })

  it('scendendo da un ingrandimento si ferma al 100% prima di rimpicciolire', () => {
    expect(nextZoom(1.1, 1 / ZOOM_STEP)).toBe(FIT_ZOOM)
    expect(nextZoom(FIT_ZOOM, 1 / ZOOM_STEP)).toBeCloseTo(0.8)
  })

  it('non supera il massimo e non lascia scatti quasi nulli vicino agli estremi', () => {
    expect(nextZoom(4.5, ZOOM_STEP)).toBe(MAX_ZOOM)
    expect(nextZoom(0.64, 1 / ZOOM_STEP)).toBe(MIN_ZOOM) // 0,512 → 50%
  })
})
