import { useEffect } from 'react'
import type { InventoryCategory } from '../lib/inventoryPreview'
import './AddUserModal.css'
import './InventoryChooserModal.css'

type FactoryTransactionChooserModalProps = {
  open: boolean
  onClose: () => void
  onSelect: (category: InventoryCategory) => void
  title?: string
  subtitle?: string
}

const OPTIONS: InventoryCategory[] = ['PCPPI', 'SMC', 'Magnolia']

export function FactoryTransactionChooserModal({
  open,
  onClose,
  onSelect,
  title = 'Fractory Transaction',
  subtitle = 'Choose a category',
}: FactoryTransactionChooserModalProps) {
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
        aria-labelledby="factory-transaction-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="factory-transaction-chooser-title">{title}</h2>
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
