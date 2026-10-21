import { useEffect, useRef, useState, type RefObject } from 'react'
import { api } from './api'

/** Ascolta un evento della finestra usando sempre l'ultima versione del gestore, senza riattaccarlo. */
export function useWindowEvent<K extends keyof WindowEventMap>(type: K, handler: (event: WindowEventMap[K]) => void): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const listener = (event: WindowEventMap[K]): void => latest.current(event)
    window.addEventListener(type, listener)
    return () => window.removeEventListener(type, listener)
  }, [type])
}

/** Vero finché il mouse si è mosso negli ultimi `timeout` millisecondi. */
export function useMouseActivity(timeout: number): boolean {
  const [active, setActive] = useState(true)
  useEffect(() => {
    let timer = setTimeout(() => setActive(false), timeout)
    const onMove = (): void => {
      setActive(true)
      clearTimeout(timer)
      timer = setTimeout(() => setActive(false), timeout)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
    }
  }, [timeout])
  return active
}

/** Dimensioni interne di un elemento, aggiornate quando cambia la finestra. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (): void => setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

export function useFullscreen(): [boolean, () => void] {
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement !== null)
  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }
  return [fullscreen, toggle]
}

/** Gestisce il trascinamento di file nella finestra; restituisce true mentre si sta trascinando. */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false

  useWindowEvent('dragenter', (e) => {
    if (!hasFiles(e)) return
    depth.current++
    setDragging(true)
  })
  useWindowEvent('dragleave', (e) => {
    if (!hasFiles(e)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragging(false)
  })
  useWindowEvent('dragover', (e) => e.preventDefault())
  useWindowEvent('drop', (e) => {
    e.preventDefault()
    depth.current = 0
    setDragging(false)
    const paths = [...(e.dataTransfer?.files ?? [])].map((file) => api.pathForFile(file)).filter(Boolean)
    if (paths.length > 0) onDrop(paths)
  })
  return dragging
}
