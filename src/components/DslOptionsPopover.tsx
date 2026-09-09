import { useEffect, useRef } from 'react'
import type { CustomerTransactionCompany } from '../lib/customerTransaction'
import './SkuOptionsPopover.css'

type DslOptionsPopoverProps = {
  open: boolean
  top: number
  left: number
  onClose: () => void
  onSelect: (company: CustomerTransactionCompany) => void
}

const COMPANIES: CustomerTransactionCompany[] = ['Pepsi', 'SMC', 'Magnolia']

function optionClass(company: CustomerTransactionCompany) {
  if (company === 'Pepsi') return 'pepsi'
  if (company === 'SMC') return 'smc'
  return 'magnolia'
}

export function DslOptionsPopover({
  open,
  top,
  left,
  onClose,
  onSelect,
}: DslOptionsPopoverProps) {
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

  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - 260 : left
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 180 : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  return (
    <div
      ref={panelRef}
      className="sku-options-popover"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label="Daily Sales Liquidation Report options"
    >
      {COMPANIES.map((company) => (
        <button
          key={company}
          type="button"
          role="menuitem"
          className={`sku-options-popover__item sku-options-popover__item--${optionClass(company)}`}
          onClick={() => onSelect(company)}
        >
          {company}
        </button>
      ))}
    </div>
  )
}
