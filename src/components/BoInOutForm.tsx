import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listCatalogTree } from '../lib/catalog'
import { listLocations } from '../lib/fullGoods'
import type { FullGoodsLocation } from '../types/fullGoods'
import {
  boCompanyToInventoryCategory,
  buildBoBrandGroupsFromCatalog,
  emptyBoQtyMap,
  todayBoDateInput,
  type BoBrandGroup,
  type BoInOutMeta,
} from '../lib/boBadOrder'
import {
  buildBoItemsFromQtys,
  firstDayOfMonthIso,
  lastDayOfMonthIso,
  qtysFromBoMovement,
  saveBoMovement,
  searchBoMovements,
  type BoMovement,
} from '../lib/boTransactions'
import { BoPrintSheet } from './BoPrintSheet'
import { buildBoPrintData, type BoPrintData } from '../lib/boPrint'
import schemaSql from '../../supabase/bo_bad_order_schema.sql?raw'
import './BoInOutForm.css'
import './AddUserModal.css'
import './CatalogPanel.css'
import './FullGoodsPanel.css'

type BoInOutFormProps = {
  meta: BoInOutMeta
  onClose: () => void
}

function SaveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 3h11l3 3v15H5V3Z"
        fill="#3b82f6"
        stroke="#1d4ed8"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8 3v6h8V3M8 17h8" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="#334155" strokeWidth="1.8" />
      <path d="M20 20l-3.6-3.6" stroke="#334155" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 15l7-7 5 5-7 7H4v-5Z"
        fill="#93c5fd"
        stroke="#2563eb"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M14 5l5 5" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
        stroke="#334155"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6 14h12v7H6v-7Z" fill="#e2e8f0" stroke="#334155" strokeWidth="1.4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function formatQtyDisplay(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return trimmed
  return num.toFixed(1)
}

function isFilledQty(value: string) {
  const num = Number(value)
  return Number.isFinite(num) && num !== 0
}

function parsePallets(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : 0
}

function formatDateAdded(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export function BoInOutForm({ meta, onClose }: BoInOutFormProps) {
  const { user } = useAuth()
  const [date, setDate] = useState(todayBoDateInput)
  const [truckNo, setTruckNo] = useState('')
  const [loadNo, setLoadNo] = useState('')
  const [from, setFrom] = useState('')
  const [locations, setLocations] = useState<FullGoodsLocation[]>([])
  const [brandGroups, setBrandGroups] = useState<BoBrandGroup[]>([])
  const [qtys, setQtys] = useState<Record<string, string>>(() => emptyBoQtyMap())
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [recordUpdatedAt, setRecordUpdatedAt] = useState<string | null>(null)
  const [printData, setPrintData] = useState<BoPrintData | null>(null)
  const [savePopup, setSavePopup] = useState<{
    updated: boolean
    truckNo: string
    loadNo: string
    from: string
    direction: string
  } | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchDateFrom, setSearchDateFrom] = useState(firstDayOfMonthIso)
  const [searchDateTo, setSearchDateTo] = useState(lastDayOfMonthIso)
  const [searchResults, setSearchResults] = useState<BoMovement[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const brandsRef = useRef<HTMLDivElement | null>(null)

  const title = useMemo(() => `BO - ${meta.company}`, [meta.company])
  const catalogCategory = boCompanyToInventoryCategory(meta.company)

  useLayoutEffect(() => {
    const root = brandsRef.current
    if (!root || loadingCatalog || brandGroups.length === 0) return

    function equalizeCardHeights() {
      const cards = Array.from(root!.querySelectorAll<HTMLElement>('.bo-brand-card'))
      if (cards.length === 0) return
      for (const card of cards) card.style.minHeight = ''
      const tallest = Math.max(...cards.map((card) => card.getBoundingClientRect().height), 0)
      if (tallest <= 0) return
      for (const card of cards) card.style.minHeight = `${Math.ceil(tallest)}px`
    }

    equalizeCardHeights()
    const frame = window.requestAnimationFrame(equalizeCardHeights)
    window.addEventListener('resize', equalizeCardHeights)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', equalizeCardHeights)
    }
  }, [brandGroups, loadingCatalog, meta.company])

  useEffect(() => {
    let cancelled = false

    async function loadCatalogAndLocations() {
      setLoadingCatalog(true)
      setCatalogError(null)
      const [catalogResult, locationsResult] = await Promise.all([listCatalogTree(), listLocations()])
      if (cancelled) return

      if (locationsResult.error && !locationsResult.missingTable) {
        setCatalogError(locationsResult.error)
      }

      const nextLocations = locationsResult.data ?? []
      setLocations(nextLocations)
      setFrom((current) => {
        if (current && nextLocations.some((item) => item.name === current)) return current
        return nextLocations[0]?.name ?? ''
      })

      if (catalogResult.error) {
        setBrandGroups([])
        setQtys(emptyBoQtyMap())
        setCatalogError(catalogResult.error)
        setLoadingCatalog(false)
        return
      }

      const groups = buildBoBrandGroupsFromCatalog(catalogResult.data, meta.company)
      setBrandGroups(groups)
      setQtys(emptyBoQtyMap(groups))
      if (groups.length === 0) {
        setCatalogError(
          `No SKU products found for ${catalogCategory}. Add subcategories and products under that category in Stock Keeping Unit.`,
        )
      } else if (nextLocations.length === 0) {
        setCatalogError(
          'No locations saved yet. Add locations in Full Goods In/Out (or Empties), then return here for the FROM list.',
        )
      }
      setLoadingCatalog(false)
    }

    void loadCatalogAndLocations()
    return () => {
      cancelled = true
    }
  }, [meta.company, catalogCategory])

  function setQty(id: string, value: string) {
    setQtys((prev) => ({ ...prev, [id]: value }))
  }

  function clearForm(message = 'Form cleared.') {
    setEditingId(null)
    setRecordUpdatedAt(null)
    setPrintData(null)
    setDate(todayBoDateInput())
    setTruckNo('')
    setLoadNo('')
    setFrom(locations[0]?.name ?? '')
    setQtys(emptyBoQtyMap(brandGroups))
    setError(null)
    setStatus(message)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setStatus(null)

    const wasEditing = Boolean(editingId)
    const savedTruck = truckNo
    const savedLoad = loadNo
    const savedFrom = from

    const result = await saveBoMovement(
      {
        company: meta.company,
        direction: meta.direction,
        movementDate: date,
        truckNumber: truckNo,
        loadNumber: loadNo,
        fromLocation: from,
        pallets: parsePallets(qtys.pallets ?? ''),
        items: buildBoItemsFromQtys(brandGroups, qtys),
        createdBy: user?.id,
      },
      editingId,
    )

    setSaving(false)

    if (result.missingTable) {
      setMissingTable(true)
      setError(result.error)
      return
    }

    if (result.error) {
      setError(result.error)
      return
    }

    setEditingId(null)
    setRecordUpdatedAt(null)
    setTruckNo('')
    setLoadNo('')
    setFrom(locations[0]?.name ?? '')
    setQtys(emptyBoQtyMap(brandGroups))
    setDate(todayBoDateInput())
    setSavePopup({
      updated: wasEditing,
      truckNo: savedTruck,
      loadNo: savedLoad,
      from: savedFrom,
      direction: meta.direction,
    })
  }

  async function openSearch() {
    const fromDate = firstDayOfMonthIso()
    const toDate = lastDayOfMonthIso()
    setSearchDateFrom(fromDate)
    setSearchDateTo(toDate)
    setSearchOpen(true)
    setSearchError(null)
    await runSearch(fromDate, toDate)
  }

  async function runSearch(dateFrom = searchDateFrom, dateTo = searchDateTo) {
    setSearching(true)
    setSearchError(null)
    const result = await searchBoMovements({
      company: meta.company,
      direction: meta.direction,
      dateFrom,
      dateTo,
    })
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

  function loadMovement(movement: BoMovement) {
    setEditingId(movement.id)
    setRecordUpdatedAt(movement.created_at)
    setDate(movement.movement_date)
    setTruckNo(movement.truck_number)
    setLoadNo(movement.load_number)
    setFrom(movement.from_location)
    setQtys(qtysFromBoMovement(movement, brandGroups))
    setSearchOpen(false)
    setError(null)
    setStatus('Record loaded. Click Update to save changes, or Clear to start new.')
  }

  async function copySchemaSql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  function handlePrint() {
    const data = buildBoPrintData({
      meta,
      groups: brandGroups,
      qtys,
      truckNo,
      loadNo,
      from,
      dateUpdated: recordUpdatedAt,
    })
    if (!data) {
      setError('Enter at least one product quantity or pallets before printing.')
      return
    }
    setError(null)
    setPrintData(data)
    window.setTimeout(() => {
      window.print()
    }, 50)
  }

  return (
    <section className="bo-form" aria-label={`${title} ${meta.direction}`}>
      {printData ? <BoPrintSheet data={printData} /> : null}

      <div className="bo-form__screen">
      {missingTable ? (
        <div className="bo-form__setup" role="status">
          <p>
            BO tables are missing. Click <b>Copy SQL</b>, paste it in the Supabase SQL Editor, run it, then
            refresh.
          </p>
          <button type="button" className="btn-secondary" onClick={() => void copySchemaSql()}>
            {copied ? 'Copied' : 'Copy SQL'}
          </button>
        </div>
      ) : null}

      {editingId ? (
        <div className="bo-form__edit-banner">
          <span>Editing saved record</span>
          <button type="button" className="btn-ghost-mini" onClick={() => clearForm('Edit cancelled.')}>
            Cancel edit
          </button>
        </div>
      ) : null}

      <div className="bo-form__frame">
        <aside className="bo-form__meta">
          <p className="bo-form__meta-title">Trip details</p>
          <label className="bo-form__field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="bo-form__field">
            <span>Truck no</span>
            <input
              value={truckNo}
              onChange={(event) => setTruckNo(event.target.value)}
              placeholder="e.g. 587"
            />
          </label>
          <label className="bo-form__field">
            <span>Load no</span>
            <input
              value={loadNo}
              onChange={(event) => setLoadNo(event.target.value)}
              placeholder="Load no"
            />
          </label>
          <label className="bo-form__field">
            <span>FROM</span>
            <select
              value={from}
              disabled={locations.length === 0 && !from}
              onChange={(event) => setFrom(event.target.value)}
            >
              {locations.length === 0 && !from ? (
                <option value="">No locations yet</option>
              ) : null}
              {from && !locations.some((location) => location.name === from) ? (
                <option value={from}>{from}</option>
              ) : null}
              {locations.map((location) => (
                <option key={location.id} value={location.name}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <div className="bo-form__badge" aria-hidden="true">
            <div className="bo-form__badge-title">{title}</div>
            <div className="bo-form__badge-rule" />
            <div
              className={
                meta.direction === 'in' ? 'bo-form__badge-dir is-in' : 'bo-form__badge-dir is-out'
              }
            >
              {meta.direction}
            </div>
          </div>
        </aside>

        <div className="bo-form__body">
          <div className="bo-form__pallets">
            <span>PALLETS</span>
            <input
              className={isFilledQty(qtys.pallets ?? '') ? 'is-filled' : undefined}
              inputMode="decimal"
              value={qtys.pallets ?? ''}
              onChange={(event) => setQty('pallets', event.target.value)}
              onBlur={() => setQty('pallets', formatQtyDisplay(qtys.pallets ?? ''))}
            />
          </div>

          {loadingCatalog ? (
            <p className="bo-form__hint">Loading {catalogCategory} products…</p>
          ) : catalogError && brandGroups.length === 0 ? (
            <p className="bo-form__hint">{catalogError}</p>
          ) : (
            <div className="bo-form__brands" ref={brandsRef}>
              {brandGroups.map((group) => (
                <section key={group.id} className="bo-brand-card" aria-label={group.title}>
                  <h2>{group.title}</h2>
                  <ul>
                    {group.items.map((item) => {
                      const value = qtys[item.id] ?? ''
                      return (
                        <li key={item.id}>
                          <span title={item.label}>{item.label}</span>
                          <input
                            className={isFilledQty(value) ? 'is-filled' : undefined}
                            inputMode="decimal"
                            value={value}
                            onChange={(event) => setQty(item.id, event.target.value)}
                            onBlur={() => setQty(item.id, formatQtyDisplay(qtys[item.id] ?? ''))}
                            aria-label={`${group.title} ${item.label}`}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="bo-form__actions">
          <button
            type="button"
            className="bo-form__action bo-form__action--save"
            disabled={saving || loadingCatalog || missingTable}
            onClick={() => void handleSave()}
          >
            <SaveIcon />
            <span>{saving ? (editingId ? 'Updating…' : 'Saving…') : editingId ? 'Update' : 'Save'}</span>
          </button>
          <button
            type="button"
            className="bo-form__action"
            disabled={searching || missingTable}
            onClick={() => void openSearch()}
          >
            <SearchIcon />
            <span>Search</span>
          </button>
          <button type="button" className="bo-form__action" onClick={() => clearForm()}>
            <ClearIcon />
            <span>Clear</span>
          </button>
          <button type="button" className="bo-form__action" onClick={handlePrint}>
            <PrintIcon />
            <span>Print</span>
          </button>
          <button type="button" className="bo-form__action bo-form__action--close" onClick={onClose}>
            <CloseIcon />
            <span>Close</span>
          </button>
        </div>
      </div>

      {error ? (
        <p className="bo-form__status bo-form__status--error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="bo-form__status" role="status">
          {status}
        </p>
      ) : null}

      {savePopup ? (
        <div
          className="modal-backdrop fg-toast-backdrop bo-toast-backdrop"
          onClick={() => setSavePopup(null)}
          role="presentation"
        >
          <div
            className="fg-toast bo-toast"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bo-toast-title"
            aria-describedby="bo-toast-detail"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="fg-toast-check" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="bo-toast__eyebrow">Success</p>
            <h2 id="bo-toast-title">{savePopup.updated ? 'Record updated' : 'Record saved'}</h2>
            <p id="bo-toast-detail">
              {savePopup.updated
                ? 'Your changes were written to the selected Bad Order record.'
                : 'This Bad Order entry is stored and ready to search later.'}
            </p>

            <div className="bo-toast__meta" aria-label="Saved record summary">
              <div className="bo-toast__chip">
                <span>Truck</span>
                <strong>{savePopup.truckNo.trim() || '—'}</strong>
              </div>
              <div className="bo-toast__chip">
                <span>Load</span>
                <strong>{savePopup.loadNo.trim() || '—'}</strong>
              </div>
              <div className="bo-toast__chip">
                <span>FROM</span>
                <strong>{savePopup.from.trim() || '—'}</strong>
              </div>
              <div className="bo-toast__chip">
                <span>In/Out</span>
                <strong>{savePopup.direction}</strong>
              </div>
            </div>

            <div className="bo-toast__actions">
              <button
                type="button"
                className="bo-toast__btn bo-toast__btn--ghost"
                onClick={() => {
                  setSavePopup(null)
                  void openSearch()
                }}
              >
                Find saved
              </button>
              <button
                type="button"
                className="bo-toast__btn bo-toast__btn--primary"
                onClick={() => setSavePopup(null)}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="modal-backdrop" onClick={() => setSearchOpen(false)} role="presentation">
          <div
            className="modal-panel modal-panel--wide bo-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bo-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="bo-search-title">Search {title} {meta.direction}</h2>
                <p>Click a row to select it. Date range defaults to this month.</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSearchOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="bo-search-modal__body">
              <div className="bo-search-modal__filters">
                <label>
                  <span>Date from</span>
                  <input
                    type="date"
                    value={searchDateFrom}
                    onChange={(event) => setSearchDateFrom(event.target.value)}
                  />
                </label>
                <label>
                  <span>Date to</span>
                  <input
                    type="date"
                    value={searchDateTo}
                    onChange={(event) => setSearchDateTo(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-mini"
                  disabled={searching}
                  onClick={() => void runSearch()}
                >
                  {searching ? '…' : 'Go'}
                </button>
              </div>

              {searchError ? <p className="bo-form__status bo-form__status--error">{searchError}</p> : null}
              {searching ? <p className="catalog-empty">Loading…</p> : null}

              {!searching && searchResults.length === 0 ? (
                <p className="catalog-empty">
                  <span className="catalog-empty-title">No matching records</span>
                  No {title} {meta.direction} records in this date range.
                </p>
              ) : null}

              {!searching && searchResults.length > 0 ? (
                <div className="bo-search-table-wrap">
                  <table className="bo-search-table">
                    <thead>
                      <tr>
                        <th>Truck no</th>
                        <th>Load no</th>
                        <th>FROM / Location</th>
                        <th>Date added</th>
                        <th>In/Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((row) => {
                        const isSelected = editingId === row.id
                        return (
                          <tr
                            key={row.id}
                            className={
                              isSelected
                                ? 'bo-search-table__row is-selected'
                                : 'bo-search-table__row'
                            }
                            tabIndex={0}
                            aria-selected={isSelected}
                            onClick={() => loadMovement(row)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                loadMovement(row)
                              }
                            }}
                          >
                            <td>{row.truck_number}</td>
                            <td>{row.load_number}</td>
                            <td>{row.from_location}</td>
                            <td>{formatDateAdded(row.created_at)}</td>
                            <td className="bo-search-table__dir">{row.direction}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </section>
  )
}
