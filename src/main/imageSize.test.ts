import { describe, expect, it } from 'vitest'
import { readImageSize } from './imageSize'

const u16be = (n: number): number[] => [n >> 8, n & 0xff]
const u16le = (n: number): number[] => [n & 0xff, n >> 8]
const u32be = (n: number): number[] => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
const u24le = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]
const text = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const bytes = (...parts: number[][]): Uint8Array => new Uint8Array(parts.flat())

/** JPEG minimo: eventuale segmento EXIF con l'orientamento, poi il marcatore SOF0 con le dimensioni. */
function jpeg(width: number, height: number, orientation?: number): Uint8Array {
  const exif = orientation
    ? [0xff, 0xe1, ...u16be(2 + 6 + 8 + 2 + 12), ...text('Exif'), 0, 0, ...text('MM'), 0, 42, ...u32be(8), ...u16be(1), ...u16be(0x0112), ...u16be(3), ...u32be(1), ...u16be(orientation), 0, 0]
    : []
  const comment = [0xff, 0xfe, ...u16be(2 + 4), ...text('ciao')]
  const sof = [0xff, 0xc0, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3]
  return bytes([0xff, 0xd8], exif, comment, sof, new Array(20).fill(0))
}

describe('readImageSize', () => {
  it('JPEG', () => {
    expect(readImageSize(jpeg(1920, 2951))).toEqual([1920, 2951])
  })

  it('JPEG ruotato tramite EXIF', () => {
    expect(readImageSize(jpeg(3000, 2000, 6))).toEqual([2000, 3000])
    expect(readImageSize(jpeg(3000, 2000, 3))).toEqual([3000, 2000])
  })

  it('PNG', () => {
    expect(readImageSize(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), text('IHDR'), u32be(1280), u32be(1905)))).toEqual([1280, 1905])
  })

  it('GIF', () => {
    expect(readImageSize(bytes(text('GIF89a'), u16le(640), u16le(480)))).toEqual([640, 480])
  })

  it('WebP con perdita, senza perdita ed esteso', () => {
    const riff = (chunk: string, body: number[]): Uint8Array => bytes(text('RIFF'), u32be(0), text('WEBP'), text(chunk), u32be(0), body)
    expect(readImageSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(1400), ...u16le(2160)]))).toEqual([1400, 2160])
    const lossless = (1400 - 1) | ((2160 - 1) << 14)
    expect(readImageSize(riff('VP8L', [0x2f, ...u16le(lossless & 0xffff), ...u16le(lossless >>> 16)]))).toEqual([1400, 2160])
    expect(readImageSize(riff('VP8X', [0, 0, 0, 0, ...u24le(1400 - 1), ...u24le(2160 - 1)]))).toEqual([1400, 2160])
  })

  it('BMP (anche con altezza negativa)', () => {
    expect(readImageSize(bytes(text('BM'), new Array(16).fill(0), u16le(800), [0, 0], u16le(0xffff - 600 + 1), [0xff, 0xff]))).toEqual([800, 600])
  })

  it('AVIF', () => {
    expect(readImageSize(bytes(u32be(24), text('ftypavif'), new Array(12).fill(0), u32be(20), text('ispe'), u32be(0), u32be(2000), u32be(3190)))).toEqual([2000, 3190])
  })

  it('restituisce null se non riconosce il formato o i byte non bastano', () => {
    expect(readImageSize(bytes(text('ciao a tutti')))).toBeNull()
    expect(readImageSize(jpeg(100, 100).subarray(0, 12))).toBeNull()
  })
})
