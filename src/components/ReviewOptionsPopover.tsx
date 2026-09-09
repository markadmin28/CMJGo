import { useEffect, useRef } from 'react'
import './SkuOptionsPopover.css'

export type ReviewOptionId = 'fullGoodsReview' | 'emptiesReview'

type ReviewOptionsPopoverProps = {
  open: boolean
  top: number
  left: number
  onClose: () => void
  onSelect: (option: ReviewOptionId) => void
}

const REVIEW_OPTIONS: Array<{ id: ReviewOptionId; label: string; tone: string }> = [
  { id: 'fullGoodsReview', label: 'Full goods review', tone: 'pepsi' },
  { id: 'emptiesReview', label: 'Empties review', tone: 'smc' },
]

export function ReviewOptionsPopover({
  open,
  top,
  left,
  onClose,
  onSelect,
}: ReviewOptionsPopoverProps) {
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
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 140 : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  return (
    <div
      ref={panelRef}
      className="sku-options-popover"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label="Review options"
    >
      {REVIEW_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          className={`sku-options-popover__item sku-options-popover__item--${option.tone}`}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
