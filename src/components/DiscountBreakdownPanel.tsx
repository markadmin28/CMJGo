import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserBranch } from '../lib/branches'
import { toIsoDateInput } from '../lib/customerTxSave'
import {
  getDiscountBreakdownDetail,
  listDiscountBreakdownsInRange,
  saveDiscountBreakdown,
  type DiscountBreakdownRecord,
} from '../lib/discountBreakdown'
import schemaSql from '../../supabase/discount_breakdown_schema.sql?raw'
import { CollectionSaveToast } from './CollectionSaveToast'
import './MtsCollectionsPanel.css'
import './DiscountBreakdownPanel.css'

type LineRow = {
  id: string
  qty: number
  unit: string
  discount: number
  totalAmount: number
}

type CustomerEntry = {
  id: string
  cusCode: string
  name: string
  lines: LineRow[]
}

type DiscountBreakdownPanelProps = {
  branch?: UserBranch | null
  onClose?: () => void
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="#2563eb" strokeWidth="1.7" />
      <path d="M12 8v8M8 12h8" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
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

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 12.5l6-6a3 3 0 114.2 4.2l-7.5 7.5a4.2 4.2 0 11-5.9-5.9l7-7"
        stroke="#2563eb"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function ClearIcon() {
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function DiscountBreakdownPanel({
  branch = 'Nabunturan',
  onClose,
}: DiscountBreakdownPanelProps) {
  const { user } = useAuth()
  const activeBranch = branch ?? 'Nabunturan'

  const [active, setActive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [transactionDate, setTransactionDate] = useState(toIsoDateInput())
  const [plateNo, setPlateNo] = useState('')
  const [customers, setCustomers] = useState<CustomerEntry[]>([])
  const [customerOpen, setCustomerOpen] = useState(false)
  const [fromName, setFromName] = useState('')
  const [lines, setLines] = useState<LineRow[]>([])
  const [draftQty, setDraftQty] = useState('')
  const [draftUnit, setDraftUnit] = useState('')
  const [draftDiscount, setDraftDiscount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchFrom, setSearchFrom] = useState(toIsoDateInput())
  const [searchTo, setSearchTo] = useState(toIsoDateInput())
  const [searchResults, setSearchResults] = useState<DiscountBreakdownRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [savePopup, setSavePopup] = useState<{ title: string; detail: string } | null>(null)

  const lineTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.totalAmount) || 0), 0),
    [lines],
  )

  const draftTotal = useMemo(() => {
    const qty = Number(draftQty)
    const discount = Number(draftDiscount)
    if (!Number.isFinite(qty) || !Number.isFinite(discount)) return null
    return qty * discount
  }, [draftQty, draftDiscount])

  const grandTotal = useMemo(
    () =>
      customers.reduce(
        (sum, customer) =>
          sum + customer.lines.reduce((lineSum, line) => lineSum + (Number(line.totalAmount) || 0), 0),
        0,
      ),
    [customers],
  )

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (customerOpen) {
          setCustomerOpen(false)
          return
        }
        if (!searchOpen) onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, customerOpen, searchOpen])

  function startNewTransaction() {
    setActive(true)
    setEditingId(null)
    setTransactionDate(toIsoDateInput())
    setPlateNo('')
    setCustomers([])
    setCustomerOpen(false)
    clearEditor()
    setError(null)
  }

  function clearEditor() {
    setFromName('')
    setLines([])
    setDraftQty('')
    setDraftUnit('')
    setDraftDiscount('')
    setEditorError(null)
  }

  function handleAddLine() {
    const qty = Number(draftQty)
    const discount = Number(draftDiscount)
    const unit = draftUnit.trim()
    if (!Number.isFinite(qty) || qty === 0) {
      setEditorError('Enter a valid quantity.')
      return
    }
    if (!Number.isFinite(discount)) {
      setEditorError('Enter a valid discount.')
      return
    }
    setEditorError(null)
    setLines((prev) => [
      ...prev,
      {
        id: newId('line'),
        qty,
        unit,
        discount,
        totalAmount: qty * discount,
      },
    ])
    setDraftQty('')
    setDraftUnit('')
    setDraftDiscount('')
  }

  function handleEntryKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAddLine()
    }
  }

  function handleSaveCustomer() {
    const name = fromName.trim()
    if (!name) {
      setEditorError('Enter a customer name in FROM.')
      return
    }
    if (lines.length === 0) {
      setEditorError('Add at least one discount line.')
      return
    }
    const nextCode = String(customers.length + 1).padStart(4, '0')
    setCustomers((prev) => [
      ...prev,
      {
        id: newId('cus'),
        cusCode: nextCode,
        name,
        lines,
      },
    ])
    clearEditor()
    setEditorError(null)
  }

  async function handleCloseTransaction() {
    if (!active) {
      setError('Start a new transaction first.')
      return
    }
    if (customers.length === 0) {
      setError('Add at least one customer before closing.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await saveDiscountBreakdown({
      branch: activeBranch,
      transactionDate,
      plateNo,
      status: 'closed',
      customers: customers.map((customer) => ({
        cusCode: customer.cusCode,
        customerName: customer.name,
        items: customer.lines.map((line) => ({
          qty: line.qty,
          unit: line.unit,
          discount: line.discount,
          totalAmount: line.totalAmount,
        })),
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
      setError(result.error ?? 'Failed to close discount breakdown.')
      return
    }
    const wasUpdate = Boolean(editingId)
    setEditingId(null)
    setActive(false)
    setCustomerOpen(false)
    setCustomers([])
    setPlateNo('')
    setTransactionDate(toIsoDateInput())
    clearEditor()
    setError(null)
    setSavePopup({
      title: wasUpdate ? 'Updated successfully' : 'Saved successfully',
      detail: wasUpdate
        ? `Transaction was closed and updated for ${activeBranch}.`
        : `Transaction was closed and saved for ${activeBranch}.`,
    })
  }

  async function openSearch() {
    setSearchOpen(true)
    setSearchError(null)
    await runSearch(searchFrom, searchTo)
  }

  async function runSearch(dateFrom = searchFrom, dateTo = searchTo) {
    setSearching(true)
    setSearchError(null)
    const result = await listDiscountBreakdownsInRange(activeBranch, dateFrom, dateTo)
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
    const detail = await getDiscountBreakdownDetail(id)
    if (detail.missingTable) {
      setMissingTable(true)
      setSearchError(detail.error)
      return
    }
    if (detail.error || !detail.data) {
      setSearchError(detail.error ?? 'Failed to load record.')
      return
    }
    setEditingId(detail.data.breakdown.id)
    setActive(true)
    setTransactionDate(detail.data.breakdown.transaction_date)
    setPlateNo(detail.data.breakdown.plate_no)
    setCustomers(
      detail.data.customers.map((customer) => ({
        id: customer.id,
        cusCode: customer.cus_code,
        name: customer.customer_name,
        lines: customer.items.map((item) => ({
          id: item.id,
          qty: Number(item.qty) || 0,
          unit: item.unit,
          discount: Number(item.discount) || 0,
          totalAmount: Number(item.total_amount) || 0,
        })),
      })),
    )
    setSearchOpen(false)
    setCustomerOpen(false)
    clearEditor()
    setError(null)
  }

  return (
    <div className="discount-breakdown" aria-label="DISCOUNT BREAKDOWN">
      <section className="mts-collections discount-breakdown__shell">
        <header className="mts-collections__titlebar">
          <h1>DISCOUNT BREAKDOWN</h1>
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

        <div className="mts-collections__body discount-breakdown__shell-body">
          <button type="button" className="discount-breakdown__primary" onClick={startNewTransaction}>
            <PlusIcon />
            NEW TRANSACTION
          </button>

          <label className="mts-collections__field">
            <span>DATE</span>
            <input
              type="date"
              value={transactionDate}
              disabled={!active}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </label>

          <label className="mts-collections__field">
            <span>PLATE NO</span>
            <input
              type="text"
              value={plateNo}
              disabled={!active}
              onChange={(event) => setPlateNo(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="discount-breakdown__action-btn"
            disabled={!active}
            onClick={() => {
              clearEditor()
              setCustomerOpen(true)
            }}
          >
            <PaperclipIcon />
            ENTER CUSTOMERS
          </button>

          <button
            type="button"
            className="discount-breakdown__action-btn is-danger"
            disabled={!active || saving}
            onClick={() => void handleCloseTransaction()}
          >
            <CloseIcon />
            {saving ? 'Saving…' : 'CLOSE TRANSACTION'}
          </button>

          {active ? (
            <p className="discount-breakdown__meta">
              {customers.length} customer{customers.length === 1 ? '' : 's'} · TOTAL {money(grandTotal)}
            </p>
          ) : (
            <p className="discount-breakdown__meta">Start a new transaction or search past ones.</p>
          )}

          {error ? <p className="mts-collections__error">{error}</p> : null}

          {missingTable ? (
            <div className="mts-collections__setup">
              <p>Run this SQL in Supabase, then refresh:</p>
              <pre>{schemaSql}</pre>
            </div>
          ) : null}

          <button type="button" className="mts-collections__action discount-breakdown__search" onClick={() => void openSearch()}>
            <SearchIcon />
            Search
          </button>
        </div>
      </section>

      {customerOpen ? (
        <section className="mts-collections discount-breakdown__editor" aria-label="Enter customers">
          <header className="mts-collections__titlebar">
            <h1>ENTER CUSTOMERS</h1>
            <button
              type="button"
              className="mts-collections__close"
              onClick={() => setCustomerOpen(false)}
              aria-label="Close customer entry"
            >
              <CloseIcon />
            </button>
          </header>

          <div className="mts-collections__body">
            <label className="mts-collections__field mts-collections__field--from">
              <span>FROM</span>
              <input
                type="text"
                value={fromName}
                onChange={(event) => setFromName(event.target.value)}
                placeholder="Customer name"
              />
            </label>

            <div className="mts-collections__table-wrap">
              <table className="mts-collections__table">
                <thead>
                  <tr>
                    <th className="is-qty">QTY</th>
                    <th className="is-unit">UNIT</th>
                    <th className="is-discount">DISCOUNT</th>
                    <th className="is-total">TOTAL AM.</th>
                    <th className="is-actions" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr className="is-empty">
                      <td colSpan={5} />
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.id}>
                        <td className="is-qty">{line.qty}</td>
                        <td className="is-unit">{line.unit || '—'}</td>
                        <td className="is-discount">{money(line.discount)}</td>
                        <td className="is-total">{money(line.totalAmount)}</td>
                        <td className="is-actions">
                          <button
                            type="button"
                            className="mts-collections__remove"
                            onClick={() =>
                              setLines((prev) => prev.filter((row) => row.id !== line.id))
                            }
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
                <span>TOTAL :</span>
                <strong>{money(lineTotal)}</strong>
              </div>
            </div>

            <div
              className="mts-collections__entry discount-breakdown__entry"
              onKeyDown={handleEntryKeyDown}
            >
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
                <span>ENTER DISCOUNT</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={draftDiscount}
                  onChange={(event) => setDraftDiscount(event.target.value)}
                />
              </label>
              <div className="mts-collections__draft-total" aria-live="polite">
                <span>TOTAL AM.</span>
                <strong>{draftTotal == null ? '—' : money(draftTotal)}</strong>
              </div>
              <button type="button" className="mts-collections__add" onClick={handleAddLine}>
                <AddIcon />
                ADD
              </button>
            </div>

            {editorError ? <p className="mts-collections__error">{editorError}</p> : null}

            <div className="mts-collections__actions">
              <button type="button" className="mts-collections__action" onClick={handleSaveCustomer}>
                <SaveIcon />
                SAVE
              </button>
              <button type="button" className="mts-collections__action" onClick={clearEditor}>
                <ClearIcon />
                CLEAR
              </button>
            </div>

            <div className="discount-breakdown__customer-list">
              <h2>LIST OF CUSTOMERS ADDED</h2>
              <table className="mts-collections__table">
                <thead>
                  <tr>
                    <th className="is-cus-id">CUS-ID</th>
                    <th className="is-cus-name">NAME</th>
                    <th className="is-cus-total">TOTAL</th>
                    <th className="is-actions" />
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr className="is-empty is-empty-short">
                      <td colSpan={4} />
                    </tr>
                  ) : (
                    customers.map((customer) => {
                      const total = customer.lines.reduce(
                        (sum, line) => sum + (Number(line.totalAmount) || 0),
                        0,
                      )
                      return (
                        <tr key={customer.id}>
                          <td className="is-cus-id">{customer.cusCode}</td>
                          <td className="is-cus-name">{customer.name}</td>
                          <td className="is-cus-total">{money(total)}</td>
                          <td className="is-actions">
                            <button
                              type="button"
                              className="mts-collections__remove"
                              onClick={() =>
                                setCustomers((prev) => prev.filter((row) => row.id !== customer.id))
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {searchOpen ? (
        <div className="modal-backdrop" onClick={() => setSearchOpen(false)} role="presentation">
          <div
            className="mts-collections-search"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discount-breakdown-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mts-collections-search__head">
              <h2 id="discount-breakdown-search-title">Search Discount Breakdown</h2>
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
                    <strong>{formatDisplayDate(row.transaction_date)}</strong>
                    <span>{row.plate_no || '—'} · {row.status}</span>
                    <em>{money(Number(row.total_amount) || 0)}</em>
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
    </div>
  )
}
