import { useEffect, useState, type FormEvent } from 'react'
import { capitalizeFirst } from '../lib/catalog'
import './AddUserModal.css'

type NameModalProps = {
  open: boolean
  submitting?: boolean
  title: string
  description: string
  fieldLabel: string
  placeholder: string
  submitLabel: string
  initialName?: string
  onClose: () => void
  onSave: (name: string) => Promise<string | null>
}

export function NameModal({
  open,
  submitting = false,
  title,
  description,
  fieldLabel,
  placeholder,
  submitLabel,
  initialName = '',
  onClose,
  onSave,
}: NameModalProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setError(null)
  }, [open, initialName])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(`${fieldLabel} is required.`)
      return
    }

    setError(null)
    const saveError = await onSave(capitalizeFirst(trimmed))
    if (saveError) {
      setError(saveError)
      return
    }

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="name-modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="modal-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label className="field">
            <span>{fieldLabel}</span>
            <input
              type="text"
              name="entityName"
              placeholder={placeholder}
              value={name}
              onChange={(event) => setName(capitalizeFirst(event.target.value))}
              autoFocus
              required
            />
          </label>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type AddCategoryModalProps = {
  open: boolean
  submitting?: boolean
  onClose: () => void
  onSave: (name: string) => Promise<string | null>
}

export function AddCategoryModal({ open, submitting = false, onClose, onSave }: AddCategoryModalProps) {
  return (
    <NameModal
      open={open}
      submitting={submitting}
      title="Add category"
      description="Enter the category name you want to save, like PCPPI, SMC, or MAGNOLIA."
      fieldLabel="Category name"
      placeholder="PCPPI"
      submitLabel="Save category"
      onClose={onClose}
      onSave={onSave}
    />
  )
}
