import { useEffect, useRef } from 'react'
import type { InventoryCategory } from '../lib/inventoryPreview'
import './SkuOptionsPopover.css'

type FactoryTransactionChooserModalProps = {
  open: boolean
  top: number
  left: number
  onClose: () => void
  onSelect: (category: InventoryCategory) => void
}

const OPTIONS: Array<{ id: InventoryCategory; label: string; className: string }> = [
  { id: 'PCPPI', label: 'Pepsi', className: 'pepsi' },
  { id: 'SMC', label: 'SMC', className: 'smc' },
  { id: 'Magnolia', label: 'Magnolia', className: 'magnolia' },
]

export function FactoryTransactionChooserModal({
  open,
  top,
  left,
  onClose,
  onSelect,
}: FactoryTransactionChooserModalProps) {
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
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 160 : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  return (
    <div
      ref={panelRef}
      className="sku-options-popover"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label="Factory Transaction options"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          className={`sku-options-popover__item sku-options-popover__item--${option.className}`}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
