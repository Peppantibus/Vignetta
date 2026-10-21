import { useLayoutEffect, useState } from 'react'

export interface AvailableSpace {
  width: number
  height: number
}

/**
 * Spazio libero per un elemento della libreria: la sua larghezza e l'altezza dal suo inizio al fondo della finestra,
 * meno il margine in fondo al contenuto (con quello la pagina non deve scorrere). Le misure sono quelle dell'elemento,
 * cioè già divise per lo zoom della libreria, e si ripetono a ogni cambio di misura della finestra o di zoom.
 */
export function useAvailableSpace(ref: React.RefObject<HTMLElement | null>, active = true): AvailableSpace | null {
  const [space, setSpace] = useState<AvailableSpace | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    const content = element?.closest<HTMLElement>('.library__content')
    if (!active || !element || !content) return
    const measure = (): void => {
      const box = element.getBoundingClientRect()
      // Con lo zoom della libreria le misure sullo schermo sono più grandi di quelle dell'elemento.
      const scale = box.width / element.offsetWidth || 1
      const top = box.top + content.scrollTop * scale
      const height = (content.getBoundingClientRect().bottom - top) / scale - parseFloat(getComputedStyle(content).paddingBottom)
      const next = { width: element.clientWidth, height: Math.floor(height) }
      setSpace((current) => (current?.width === next.width && current.height === next.height ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [ref, active])
  return space
}
