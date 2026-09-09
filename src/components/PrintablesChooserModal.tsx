import { useEffect, useRef } from 'react'
import './SkuOptionsPopover.css'
import './PrintablesChooserModal.css'

export type PrintablesChooserKind = 'fulls' | 'empties'

export type PrintableOption =
  | 'fullsPrintables'
  | 'emptiesPrintables'
  | 'bLiquidationFulls'
  | 'bLiquidationEmpties'

type PrintablesChooserModalProps = {
  open: boolean
  kind: PrintablesChooserKind
  top: number
  left: number
  onClose: () => void
  onSelect: (option: PrintableOption) => void
}

export function PrintablesChooserModal({
  open,
  kind,
  top,
  left,
  onClose,
  onSelect,
}: PrintablesChooserModalProps) {
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

  const isEmpties = kind === 'empties'
  const title = isEmpties ? 'Empties In/Out Printables' : 'Fulls In/Out Printables'
  const primaryLabel = isEmpties ? 'Empties In/Out' : 'Fulls In/Out'
  const primaryOption: PrintableOption = isEmpties ? 'emptiesPrintables' : 'fullsPrintables'
  const liquidationOption: PrintableOption = isEmpties
    ? 'bLiquidationEmpties'
    : 'bLiquidationFulls'
  const liquidationLabel = isEmpties ? 'Empties B-Liquidation' : 'Full B-Liquidation'
  const primaryClass = isEmpties
    ? 'sku-options-popover__item printables-chooser__item printables-chooser__item--empties'
    : 'sku-options-popover__item printables-chooser__item printables-chooser__item--fulls'

  const menuWidth = 220
  const menuHeight = 140
  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - menuWidth : left
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - menuHeight : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  return (
    <div
      ref={panelRef}
      className="sku-options-popover printables-chooser"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label={title}
    >
      <button
        type="button"
        role="menuitem"
        className={primaryClass}
        onClick={() => onSelect(primaryOption)}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="sku-options-popover__item printables-chooser__item printables-chooser__item--liquidation"
        onClick={() => onSelect(liquidationOption)}
      >
        {liquidationLabel}
      </button>
    </div>
  )
}
