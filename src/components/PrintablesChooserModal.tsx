import { useEffect } from 'react'
import './AddUserModal.css'
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
  onClose: () => void
  onSelect: (option: PrintableOption) => void
}

export function PrintablesChooserModal({
  open,
  kind,
  onClose,
  onSelect,
}: PrintablesChooserModalProps) {
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
    ? 'printables-chooser__option printables-chooser__option--empties'
    : 'printables-chooser__option printables-chooser__option--fulls'

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel printables-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="printables-chooser-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="printables-chooser-title">{title}</h2>
            <p>Choose a printable form</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="printables-chooser__options">
          <button type="button" className={primaryClass} onClick={() => onSelect(primaryOption)}>
            <span className="printables-chooser__option-label">{primaryLabel}</span>
          </button>
          <button
            type="button"
            className="printables-chooser__option printables-chooser__option--liquidation"
            onClick={() => onSelect(liquidationOption)}
          >
            <span className="printables-chooser__option-label">{liquidationLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
