import { useLayoutEffect, useRef, useState } from 'react'
import { useWindowEvent } from '../hooks'

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onSelect: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: (MenuItem | 'separator')[]
  onClose: () => void
}

/** Menu a comparsa posizionato al punto del clic, sempre dentro la finestra. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const margin = 8
    setPosition({
      left: Math.min(x, window.innerWidth - menu.offsetWidth - margin),
      top: Math.min(y, window.innerHeight - menu.offsetHeight - margin)
    })
  }, [x, y])

  useWindowEvent('keydown', (e) => e.key === 'Escape' && onClose())
  useWindowEvent('blur', onClose)
  useWindowEvent('resize', onClose)

  return (
    <div
      className="menu-backdrop"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div ref={ref} className="menu" role="menu" style={position} onPointerDown={(e) => e.stopPropagation()}>
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={i} className="menu__separator" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
              onClick={() => {
                onClose()
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
