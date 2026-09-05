import { useEffect } from 'react'
import type { InventoryCategory } from '../lib/inventoryPreview'
import './AddUserModal.css'
import './InventoryChooserModal.css'

type InventoryChooserModalProps = {
  open: boolean
  title?: string
  subtitle?: string
  onClose: () => void
  onSelect: (category: InventoryCategory) => void
}

const OPTIONS: InventoryCategory[] = ['PCPPI', 'SMC', 'Magnolia']

export function InventoryChooserModal({
  open,
  title = 'Inventory',
  subtitle = 'Choose a category',
  onClose,
  onSelect,
}: InventoryChooserModalProps) {
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel inventory-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="inventory-chooser-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="inventory-chooser__options">
          {OPTIONS.map((category) => (
            <button
              key={category}
              type="button"
              className={`inventory-chooser__option inventory-chooser__option--${category.toLowerCase()}`}
              onClick={() => onSelect(category)}
            >
              <span className="inventory-chooser__option-label">{category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
