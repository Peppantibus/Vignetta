import { describe, expect, it } from 'vitest'
import { nightColor } from './nightMode'

describe('colore della modalità notte', () => {
  it('a zero lascia intatti tutti i canali', () => {
    expect(nightColor(0)).toBe('rgb(255, 255, 255)')
  })

  it('al 60% e al 100% abbassa la luminosità con un avorio più caldo', () => {
    expect(nightColor(0.6)).toBe('rgb(218, 206, 188)')
    expect(nightColor(1)).toBe('rgb(194, 173, 143)')
  })

  it('limita i valori fuori intervallo e ignora quelli non finiti', () => {
    expect(nightColor(-1)).toBe(nightColor(0))
    expect(nightColor(2)).toBe(nightColor(1))
    for (const value of [NaN, Infinity, -Infinity]) expect(nightColor(value)).toBe(nightColor(0))
  })

  it('scurisce progressivamente ogni canale, mantenendo il rosso sopra il verde e il blu', () => {
    let previous = [255, 255, 255]
    for (let i = 0; i <= 100; i++) {
      const channels = nightColor(i / 100).match(/\d+/g)!.map(Number)
      channels.forEach((channel, index) => {
        expect(channel).toBeLessThanOrEqual(previous[index]!)
        expect(channel).toBeGreaterThan(0)
      })
      expect(channels[0]).toBeGreaterThanOrEqual(channels[1]!)
      expect(channels[1]).toBeGreaterThanOrEqual(channels[2]!)
      previous = channels
    }
  })
})
