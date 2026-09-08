import { useEffect, useRef } from 'react'
import './SkuOptionsPopover.css'
import './CollectionOptionsPopover.css'

export type CollectionOptionId =
  | 'mtsCollections'
  | 'mtsFund'
  | 'fullRet'
  | 'fullsRetLacking'
  | 'palletsRet'
  | 'palletsPayables'
  | 'cashPayment'
  | 'cashPaymentForShort'
  | 'chequePayment'
  | 'accRoute'
  | 'discountBreakdown'
  | 'others'
  | 'collectionPrintables'

export type CollectionOption = {
  id: CollectionOptionId
  label: string
}

const COLLECTION_GROUPS: CollectionOption[][] = [
  [
    { id: 'mtsCollections', label: 'MTS COLLECTIONS' },
    { id: 'mtsFund', label: 'MTS FUND' },
  ],
  [
    { id: 'fullRet', label: 'FULL RET.' },
    { id: 'fullsRetLacking', label: 'FULLS RET. W/lacking/missing' },
  ],
  [
    { id: 'palletsRet', label: 'PALLETS RET.' },
    { id: 'palletsPayables', label: 'PALLETS PAYABLES' },
  ],
  [
    { id: 'cashPayment', label: 'CASH PAYMENT' },
    { id: 'cashPaymentForShort', label: 'CASH PAYMENT FOR SHORT' },
  ],
  [{ id: 'chequePayment', label: 'CHEQUE PAYMENT' }],
  [{ id: 'accRoute', label: 'ACC. ROUTE' }],
  [{ id: 'discountBreakdown', label: 'DISCOUNT BREAKDOWN' }],
  [{ id: 'others', label: 'OTHERS' }],
  [{ id: 'collectionPrintables', label: 'COLLECTION PRINTABLES' }],
]

export const COLLECTION_OPTIONS: CollectionOption[] = COLLECTION_GROUPS.flat()

export function collectionOptionLabel(id: CollectionOptionId) {
  return COLLECTION_OPTIONS.find((option) => option.id === id)?.label ?? id
}

type CollectionOptionsPopoverProps = {
  open: boolean
  top: number
  left: number
  onClose: () => void
  onSelect: (option: CollectionOptionId) => void
}

export function CollectionOptionsPopover({
  open,
  top,
  left,
  onClose,
  onSelect,
}: CollectionOptionsPopoverProps) {
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

  const menuWidth = 250
  const menuHeight = 430
  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - menuWidth : left
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - menuHeight : top
  const safeLeft = Math.max(8, Math.min(left, maxLeft))
  const safeTop = Math.max(8, Math.min(top, maxTop))

  return (
    <div
      ref={panelRef}
      className="sku-options-popover collection-options-popover"
      style={{ top: safeTop, left: safeLeft }}
      role="menu"
      aria-label="Collection options"
    >
      {COLLECTION_GROUPS.map((group, groupIndex) => (
        <div key={`group-${groupIndex}`} className="collection-options-popover__group">
          {groupIndex > 0 ? <div className="collection-options-popover__sep" role="separator" /> : null}
          {group.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className="sku-options-popover__item collection-options-popover__item"
              onClick={() => onSelect(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
