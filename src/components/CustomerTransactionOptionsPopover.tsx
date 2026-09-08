import { useEffect, useRef } from 'react'
import './SkuOptionsPopover.css'

export type CustomerTransactionOption = 'pepsi' | 'smc' | 'magnolia'

type CustomerTransactionOptionsPopoverProps = {
  open: boolean
  top: number
  left: number
  onClose: () => void
  onSelect: (option: CustomerTransactionOption) => void
}

const OPTIONS: Array<{ id: CustomerTransactionOption; label: string }> = [
  { id: 'pepsi', label: 'Pepsi transaction' },
  { id: 'smc', label: 'SMC transaction' },
  { id: 'magnolia', label: 'Magnolia transaction' },
]

export function CustomerTransactionOptionsPopover({
  open,
  top,
  left,
  onClose,
  onSelect,
}: CustomerTransactionOptionsPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose])

  if (!open) return null

  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - 220 : left
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 180 : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  return (
    <div
      ref={panelRef}
      className="sku-options-popover"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label="Customer Transaction options"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          className={`sku-options-popover__item sku-options-popover__item--${option.id}`}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
