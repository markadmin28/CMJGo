import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserBranch } from '../lib/branches'
import { toIsoDateInput } from '../lib/customerTxSave'
import {
  getMtsCollectionDetail,
  listMtsCollectionsInRange,
  saveMtsCollection,
  type MtsCollectionRecord,
} from '../lib/mtsCollections'
import schemaSql from '../../supabase/mts_collections_schema.sql?raw'
import { CollectionSaveToast } from './CollectionSaveToast'
import './MtsCollectionsPanel.css'

type LineRow = {
  id: string
  qty: number
  unit: string
  description: string
  lacking: number
  remarks: string
}

type FullsReturnLackingPanelProps = {
  branch?: UserBranch | null
  onClose?: () => void
}

function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${year}`
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h7.5L19 8v12.5H7V3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 11v6M9 14h6" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7l3 10h7l2-7H9"
        stroke="#2563eb"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 7h9" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 4.5h11.5L19 8v11.5H5V4.5Z"
        stroke="#2563eb"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 4.5V9h7V4.5" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 14.5h8V19.5H8v-5Z" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function newLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function FullsReturnLackingPanel({
  branch = 'Nabunturan',
  onClose,
}: FullsReturnLackingPanelProps) {
  const { user } = useAuth()
  const activeBranch = branch ?? 'Nabunturan'
  const kind = 'fulls_return_lacking' as const

  const [collectionDate, setCollectionDate] = useState(toIsoDateInput())
  const [fromName, setFromName] = useState('')
  const [lines, setLines] = useState<LineRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftQty, setDraftQty] = useState('')
  const [draftUnit, setDraftUnit] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftLacking, setDraftLacking] = useState('')
  const [draftRemarks, setDraftRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchFrom, setSearchFrom] = useState(toIsoDateInput())
  const [searchTo, setSearchTo] = useState(toIsoDateInput())
  const [searchResults, setSearchResults] = useState<MtsCollectionRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [savePopup, setSavePopup] = useState<{ title: string; detail: string } | null>(null)

  const totalLacking = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.lacking) || 0), 0),
    [lines],
  )

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !searchOpen) onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, searchOpen])

  function clearDraft() {
    setDraftQty('')
    setDraftUnit('')
    setDraftDescription('')
    setDraftLacking('')
    setDraftRemarks('')
  }

  function resetForm() {
    setCollectionDate(toIsoDateInput())
    setFromName('')
    setLines([])
    setEditingId(null)
    clearDraft()
    setError(null)
  }

  function handleAddLine() {
    const qty = Number(draftQty)
    const lackingRaw = draftLacking.trim()
    const lacking = lackingRaw === '' ? 0 : Number(lackingRaw)
    const unit = draftUnit.trim()
    const description = draftDescription.trim()
    const remarks = draftRemarks.trim()

    if (!Number.isFinite(qty) || qty === 0) {
      setError('Enter a valid quantity.')
      return
    }
    if (!description) {
      setError('Enter a description.')
      return
    }
    if (!Number.isFinite(lacking)) {
      setError('Enter a valid lacking amount.')
      return
    }

    setError(null)
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        qty,
        unit,
        description,
        lacking,
        remarks,
      },
    ])
    clearDraft()
  }

  function handleEntryKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAddLine()
    }
  }

  function handleRemoveLine(id: string) {
    setLines((prev) => prev.filter((line) => line.id !== id))
  }

  async function handleSave() {
    if (lines.length === 0) {
      setError('Add at least one line before saving.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await saveMtsCollection({
      branch: activeBranch,
      kind,
      collectionDate,
      fromName,
      items: lines.map((line) => ({
        qty: line.qty,
        unit: line.unit,
        description: line.description,
        price: 0,
        totalAmount: 0,
        lacking: line.lacking,
        remarks: line.remarks,
      })),
      createdBy: user?.id ?? null,
      existingId: editingId,
    })
    setSaving(false)
    if (result.missingTable) {
      setMissingTable(true)
      setError(result.error)
      return
    }
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to save Fulls return with lacking/missing.')
      return
    }
    const wasUpdate = Boolean(editingId)
    setEditingId(result.data.id)
    setError(null)
    setSavePopup({
      title: wasUpdate ? 'Updated successfully' : 'Saved successfully',
      detail: wasUpdate
        ? `FULLS RETURN WITH LACKING/MISSING was updated for ${activeBranch}.`
        : `FULLS RETURN WITH LACKING/MISSING was saved for ${activeBranch}.`,
    })
    resetForm()
  }

  async function openSearch() {
    setSearchOpen(true)
    setSearchError(null)
    await runSearch(searchFrom, searchTo)
  }

  async function runSearch(dateFrom = searchFrom, dateTo = searchTo) {
    setSearching(true)
    setSearchError(null)
    const result = await listMtsCollectionsInRange(activeBranch, dateFrom, dateTo, kind)
    setSearching(false)
    if (result.missingTable) {
      setMissingTable(true)
      setSearchError(result.error)
      setSearchResults([])
      return
    }
    if (result.error) {
      setSearchError(result.error)
      setSearchResults([])
      return
    }
    setSearchResults(result.data)
  }

  async function loadRecord(id: string) {
    const detail = await getMtsCollectionDetail(id, kind)
    if (detail.missingTable) {
      setMissingTable(true)
      setSearchError(detail.error)
      return
    }
    if (detail.error || !detail.data) {
      setSearchError(detail.error ?? 'Failed to load record.')
      return
    }
    setEditingId(detail.data.collection.id)
    setCollectionDate(detail.data.collection.collection_date)
    setFromName(detail.data.collection.from_name)
    setLines(
      detail.data.items.map((item) => ({
        id: item.id,
        qty: Number(item.qty) || 0,
        unit: item.unit,
        description: item.description,
        lacking: Number(item.lacking) || 0,
        remarks: item.remarks ?? '',
      })),
    )
    setSearchOpen(false)
    setError(null)
  }

  return (
    <section
      className="mts-collections mts-collections--lacking"
      aria-label="FULLS RETURN WITH LACKING/MISSING"
    >
      <header className="mts-collections__titlebar">
        <h1>FULLS RETURN WITH LACKING/MISSING</h1>
        {onClose ? (
          <button
            type="button"
            className="mts-collections__close"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        ) : null}
      </header>

      <div className="mts-collections__body">
        <div className="mts-collections__fields">
          <label className="mts-collections__field mts-collections__field--date">
            <span>DATE</span>
            <input
              type="date"
              value={collectionDate}
              onChange={(event) => setCollectionDate(event.target.value)}
            />
          </label>
          <label className="mts-collections__field mts-collections__field--from">
            <span>FROM</span>
            <input
              type="text"
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
            />
          </label>
        </div>

        <div className="mts-collections__table-wrap">
          <table className="mts-collections__table">
            <thead>
              <tr>
                <th className="is-qty">QTY</th>
                <th className="is-unit">UNIT</th>
                <th className="is-desc">DESC.</th>
                <th className="is-lacking">(Lacking)</th>
                <th className="is-remarks">REMARKS</th>
                <th className="is-actions" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr className="is-empty">
                  <td colSpan={6} />
                </tr>
              ) : (
                lines.map((line) => (
                  <tr key={line.id}>
                    <td className="is-qty">{line.qty}</td>
                    <td className="is-unit">{line.unit || '—'}</td>
                    <td className="is-desc">{line.description}</td>
                    <td className="is-lacking">{line.lacking}</td>
                    <td className="is-remarks">{line.remarks || '—'}</td>
                    <td className="is-actions">
                      <button
                        type="button"
                        className="mts-collections__remove"
                        onClick={() => handleRemoveLine(line.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="mts-collections__total">
            <span>TOTAL LACKING :</span>
            <strong>{totalLacking}</strong>
          </div>
        </div>

        <div className="mts-collections__entry mts-collections__entry--lacking" onKeyDown={handleEntryKeyDown}>
          <label>
            <span>QTY</span>
            <input
              type="number"
              inputMode="decimal"
              value={draftQty}
              onChange={(event) => setDraftQty(event.target.value)}
            />
          </label>
          <label>
            <span>UNIT</span>
            <input
              type="text"
              value={draftUnit}
              onChange={(event) => setDraftUnit(event.target.value)}
            />
          </label>
          <label className="is-wide">
            <span>DESCRIPTION</span>
            <input
              type="text"
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
            />
          </label>
          <label>
            <span>LACKING</span>
            <input
              type="number"
              inputMode="decimal"
              value={draftLacking}
              onChange={(event) => setDraftLacking(event.target.value)}
            />
          </label>
          <label className="is-wide">
            <span>REMARKS</span>
            <input
              type="text"
              value={draftRemarks}
              onChange={(event) => setDraftRemarks(event.target.value)}
            />
          </label>
          <button type="button" className="mts-collections__add" onClick={handleAddLine}>
            <AddIcon />
            ADD
          </button>
        </div>

        {error ? <p className="mts-collections__error">{error}</p> : null}

        {missingTable ? (
          <div className="mts-collections__setup">
            <p>Run this SQL in Supabase, then refresh:</p>
            <pre>{schemaSql}</pre>
          </div>
        ) : null}

        <div className="mts-collections__actions">
          <button type="button" className="mts-collections__action" onClick={() => void openSearch()}>
            <SearchIcon />
            Search
          </button>
          <button type="button" className="mts-collections__action" onClick={resetForm}>
            <CancelIcon />
            Cancel
          </button>
          <button
            type="button"
            className="mts-collections__action"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            <SaveIcon />
            {saving ? (editingId ? 'Updating…' : 'Saving…') : editingId ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="modal-backdrop" onClick={() => setSearchOpen(false)} role="presentation">
          <div
            className="mts-collections-search"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fulls-lacking-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mts-collections-search__head">
              <h2 id="fulls-lacking-search-title">Search Fulls Return (Lacking/Missing)</h2>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search">
                <CloseIcon />
              </button>
            </header>
            <div className="mts-collections-search__filters">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={searchFrom}
                  onChange={(event) => setSearchFrom(event.target.value)}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={searchTo}
                  onChange={(event) => setSearchTo(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => void runSearch()}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            {searchError ? <p className="mts-collections__error">{searchError}</p> : null}
            <div className="mts-collections-search__list">
              {searchResults.length === 0 && !searching ? (
                <p className="mts-collections-search__empty">No records found.</p>
              ) : (
                searchResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="mts-collections-search__row"
                    onClick={() => void loadRecord(row.id)}
                  >
                    <strong>{formatDisplayDate(row.collection_date)}</strong>
                    <span>{row.from_name || '—'}</span>
                    <em>Open</em>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {savePopup ? (
        <CollectionSaveToast
          title={savePopup.title}
          detail={savePopup.detail}
          onClose={() => setSavePopup(null)}
        />
      ) : null}
    </section>
  )
}
