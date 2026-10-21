import { expect, it } from 'vitest'
import { LIBRARY_ZOOM_MAX, LIBRARY_ZOOM_MIN } from '../../../shared/settings'
import { stepLibraryZoom } from './libraryZoom'

it('avanza a passi del 10% senza errori di arrotondamento e resta nei limiti', () => {
  expect(stepLibraryZoom(1, 1)).toBe(1.1)
  expect(stepLibraryZoom(1.1, 1)).toBe(1.2)
  expect(stepLibraryZoom(1.2, -1)).toBe(1.1)
  expect(stepLibraryZoom(LIBRARY_ZOOM_MAX, 1)).toBe(LIBRARY_ZOOM_MAX)
  expect(stepLibraryZoom(LIBRARY_ZOOM_MIN, -1)).toBe(LIBRARY_ZOOM_MIN)
  expect(stepLibraryZoom(Number.NaN, 1)).toBe(1.1)
})
