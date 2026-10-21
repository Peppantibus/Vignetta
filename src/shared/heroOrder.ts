/** Chiave dell'ordine personale di un personaggio: lo stesso eroe può stare in più schede. */
export function heroOrderKey(tab: string, heroId: string): string {
  return `${tab}/${heroId}`
}

/** Mette per primi gli elementi dell'ordine salvato; i nuovi restano in coda nella sequenza data. */
export function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[] | undefined): T[] {
  if (!order?.length) return [...items]
  const position = new Map(order.map((id, index) => [id, index]))
  const saved = items.filter((item) => position.has(item.id)).sort((a, b) => position.get(a.id)! - position.get(b.id)!)
  return [...saved, ...items.filter((item) => !position.has(item.id))]
}

/** Sposta `dragged` nella posizione di `target`: gli altri scorrono. Senza cambiamenti restituisce null. */
export function moveToTarget(ids: readonly string[], dragged: string, target: string): string[] | null {
  const from = ids.indexOf(dragged)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return null
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, dragged)
  return next
}

/** Sposta un elemento di `offset` posizioni (anche oltre i bordi: si ferma al primo o all'ultimo posto). */
export function moveBy(ids: readonly string[], id: string, offset: number): string[] | null {
  const from = ids.indexOf(id)
  if (from < 0) return null
  const to = Math.min(ids.length - 1, Math.max(0, from + offset))
  return moveToTarget(ids, id, ids[to]!)
}

/**
 * Applica il nuovo ordine di una parte degli elementi (es. i fumetti ancora sul disco) lasciando gli altri
 * (gli archiviati) al loro posto: così, se un albo archiviato torna, riprende la sua posizione.
 */
export function reorderWithin(all: readonly string[], reordered: readonly string[]): string[] {
  const moving = new Set(reordered)
  let next = 0
  return all.map((id) => (moving.has(id) ? reordered[next++]! : id))
}
