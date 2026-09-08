import { useEffect, useRef } from 'react'
import './SkuOptionsPopover.css'

export type DailyGoodsCompany = 'Pepsi' | 'SMC' | 'Magnolia'

export type DailyGoodsMenuKind = 'fullGoodsDailyIn' | 'emptiesDailyIn' | 'emptiesDailyOut'

type DailyGoodsOptionsPopoverProps = {
  open: boolean
  kind: DailyGoodsMenuKind
  top: number
  left: number
  onClose: () => void
  onSelect: (company: DailyGoodsCompany) => void
}

const COMPANIES: DailyGoodsCompany[] = ['Pepsi', 'SMC', 'Magnolia']

function optionLabel(kind: DailyGoodsMenuKind, company: DailyGoodsCompany) {
  if (kind === 'fullGoodsDailyIn') return `${company} FG daily in`
  if (kind === 'emptiesDailyIn') return `${company} empties daily in`
  return `${company} empties daily out`
}

function optionClass(company: DailyGoodsCompany) {
  if (company === 'Pepsi') return 'pepsi'
  if (company === 'SMC') return 'smc'
  return 'magnolia'
}

export function DailyGoodsOptionsPopover({
  open,
  kind,
  top,
  left,
  onClose,
  onSelect,
}: DailyGoodsOptionsPopoverProps) {
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

  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - 240 : left
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 180 : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  const ariaLabel =
    kind === 'fullGoodsDailyIn'
      ? 'Full Goods Daily In options'
      : kind === 'emptiesDailyIn'
        ? 'Empties Daily In options'
        : 'Empties Daily Out options'

  return (
    <div
      ref={panelRef}
      className="sku-options-popover"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label={ariaLabel}
    >
      {COMPANIES.map((company) => (
        <button
          key={company}
          type="button"
          role="menuitem"
          className={`sku-options-popover__item sku-options-popover__item--${optionClass(company)}`}
          onClick={() => onSelect(company)}
        >
          {optionLabel(kind, company)}
        </button>
      ))}
    </div>
  )
}
