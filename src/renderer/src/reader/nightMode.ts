/**
 * Colore del velo in moltiplicazione: il bianco diventa avorio, il nero resta nero.
 * A piena intensità riduce i canali R/G/B del 24/32/44%, senza invertire i colori.
 */
export function nightColor(intensity: number): string {
  const t = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0
  const channels = [0.24, 0.32, 0.44].map((reduction) => Math.round(255 * (1 - reduction * t)))
  return `rgb(${channels.join(', ')})`
}
