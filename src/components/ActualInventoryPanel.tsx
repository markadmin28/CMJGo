import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserBranch } from '../lib/branches'
import { listCatalogTree, type CatalogTreeCategory } from '../lib/catalog'
import {
  deleteActualInventoriesForMonth,
  formatMonthLabel,
  listActualInventoriesForMonth,
  listActualInventoryMonthSummaries,
  saveActualInventoriesForMonth,
  type ActualInventoryMonthSummary,
} from '../lib/actualInventory'
import type { ActualInventoryCompany } from './ActualInventoryOptionsPopover'
import schemaSql from '../../supabase/actual_inventory_schema.sql?raw'
import schemaBranchSql from '../../supabase/actual_inventory_branch_schema.sql?raw'
import './CatalogPanel.css'
import './FthDiscountPanel.css'
import './ActualInventoryPanel.css'

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nameMatchesCompany(name: string, company: ActualInventoryCompany) {
  const n = normalizeName(name)
  if (company === 'Pepsi') {
    return n.includes('pepsi') || n === 'pcppi' || n.startsWith('pcppi ')
  }
  if (company === 'SMC') return n.includes('smc')
  return n.includes('magnolia') || n.includes('magnoia')
}

/** Limit catalog to FG + matching Empties MTS for one company (Nabunturan). */
function filterTreeForCompany(
  tree: CatalogTreeCategory[],
  company: ActualInventoryCompany | null | undefined,
) {
  if (!company) return tree
  const next: CatalogTreeCategory[] = []
  for (const category of tree) {
    const catName = normalizeName(category.name)
    if (catName === 'empties') {
      const subcategories = category.subcategories.filter((sub) =>
        nameMatchesCompany(sub.name, company),
      )
      if (subcategories.length > 0) {
        next.push({ ...category, subcategories })
      }
      continue
    }
    if (nameMatchesCompany(category.name, company)) {
      next.push(category)
    }
  }
  return next
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function matchesRecordSearch(query: string, record: ActualInventoryMonthSummary) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const monthLabel = formatMonthLabel(record.monthValue).toLowerCase()
  return (
    record.monthValue.includes(normalized) ||
    monthLabel.includes(normalized) ||
    record.categories.some((category) => category.toLowerCase().includes(normalized))
  )
}

export function ActualInventoryPanel({
  branch = 'Davao',
  company = null,
}: {
  branch?: UserBranch | null
  /** When set (Nabunturan), only show that company's FG + MTS products. */
  company?: ActualInventoryCompany | null
}) {
  const { user } = useAuth()
  const catalogBranch = branch ?? 'Davao'
  const [tree, setTree] = useState<CatalogTreeCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [monthValue, setMonthValue] = useState(currentMonthValue)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveToast, setSaveToast] = useState<{
    updated: boolean
    monthLabel: string
    branch: string
    companyLabel: string
    categoryCount: number
    productCount: number
  } | null>(null)
  const [saveToastPaused, setSaveToastPaused] = useState(false)
  const [monthHasSavedRecord, setMonthHasSavedRecord] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [recordSearch, setRecordSearch] = useState('')
  const [recordSummaries, setRecordSummaries] = useState<ActualInventoryMonthSummary[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null)

  const activeCategory = tree.find((item) => item.id === activeCategoryId) ?? null
  const title = company ? `${company} Actual Inventory` : 'Actual Inventory'

  const filteredRecordSummaries = useMemo(
    () => recordSummaries.filter((record) => matchesRecordSearch(recordSearch, record)),
    [recordSummaries, recordSearch],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setSaveToast(null)

      const catalogResult = await listCatalogTree(catalogBranch, { forTransactions: true })
      if (cancelled) return

      if (catalogResult.error) {
        setTree([])
        setMissingTable(catalogResult.missingTable)
        setError(catalogResult.error)
        setLoading(false)
        return
      }

      setTree(filterTreeForCompany(catalogResult.data, company))
      setActiveCategoryId((prev) => {
        const filtered = filterTreeForCompany(catalogResult.data, company)
        return prev && filtered.some((item) => item.id === prev)
          ? prev
          : filtered[0]?.id ?? null
      })

      const savedResult = await listActualInventoriesForMonth(monthValue, catalogBranch)
      if (cancelled) return

      setMissingTable(savedResult.missingTable)
      if (savedResult.error) {
        setError(savedResult.error)
        setQuantities({})
        setMonthHasSavedRecord(false)
        setLoading(false)
        return
      }

      const nextQuantities: Record<string, string> = {}
      for (const detail of savedResult.data) {
        for (const item of detail.items) {
          if (!item.product_id) continue
          const qty = Number(item.quantity) || 0
          nextQuantities[item.product_id] = qty ? String(qty) : ''
        }
      }
      setQuantities(nextQuantities)
      setMonthHasSavedRecord(savedResult.data.length > 0)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [monthValue, catalogBranch, company])

  async function copySql() {
    await navigator.clipboard.writeText(`${schemaSql}\n\n${schemaBranchSql}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function loadRecordSummaries() {
    setRecordsLoading(true)
    setRecordsError(null)

    const result = await listActualInventoryMonthSummaries(catalogBranch)
    setRecordsLoading(false)

    if (result.missingTable) {
      setMissingTable(true)
      setRecordsError(result.error)
      setRecordSummaries([])
      return
    }
    if (result.error) {
      setRecordsError(result.error)
      setRecordSummaries([])
      return
    }

    setRecordSummaries(result.data)
  }

  async function openSearch() {
    setSearchOpen(true)
    setRecordSearch('')
    await loadRecordSummaries()
  }

  function loadRecordMonth(record: ActualInventoryMonthSummary) {
    setMonthValue(record.monthValue)
    setSearchOpen(false)
  }

  async function handleDeleteRecord(record: ActualInventoryMonthSummary) {
    const label = formatMonthLabel(record.monthValue)
    const confirmed = window.confirm(
      `Delete actual inventory for ${label}? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingMonth(record.monthValue)
    setRecordsError(null)

    const result = await deleteActualInventoriesForMonth(record.monthValue, catalogBranch)
    setDeletingMonth(null)

    if (result.missingTable) {
      setMissingTable(true)
      setRecordsError(result.error)
      return
    }
    if (result.error) {
      setRecordsError(result.error)
      return
    }

    setRecordSummaries((prev) => prev.filter((item) => item.monthValue !== record.monthValue))
    if (record.monthValue === monthValue) {
      setQuantities({})
      setMonthHasSavedRecord(false)
    }
  }

  function dismissSaveToast() {
    setSaveToast(null)
    setSaveToastPaused(false)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    setSaveToast(null)

    const wasUpdate = monthHasSavedRecord
    const productCount = Object.values(quantities).filter((value) => Number(value) > 0).length

    const result = await saveActualInventoriesForMonth({
      monthValue,
      categories: tree,
      quantities,
      createdBy: user?.id,
      branch: catalogBranch,
    })
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

    setMonthHasSavedRecord(true)
    setSaveToast({
      updated: wasUpdate,
      monthLabel: formatMonthLabel(monthValue),
      branch: catalogBranch,
      companyLabel: company ?? 'All companies',
      categoryCount: tree.length,
      productCount,
    })
    if (searchOpen) {
      await loadRecordSummaries()
    }
  }

  return (
    <section className="actual-inventory" aria-label={title}>
      <header className="fth-head actual-inventory-head">
        <div>
          <h1>{title}</h1>
          <p>Enter end-of-month counts. Saved actuals become next month beginning inventory.</p>
        </div>
        <div className="actual-inventory-head-actions">
          <button
            type="button"
            className="btn-secondary actual-inventory-search-btn"
            onClick={() => void openSearch()}
            disabled={missingTable}
          >
            <SearchIcon />
            Search records
          </button>
          <label className="actual-inventory-month">
            <span>Month</span>
            <input
              type="month"
              value={monthValue}
              onChange={(event) => setMonthValue(event.target.value)}
            />
          </label>
        </div>
      </header>

      {missingTable ? (
        <div className="catalog-setup">
          <div>
            <strong>Actual Inventory setup required</strong>
            <p>
              Actual Inventory tables are missing. Click <b>Copy SQL</b>, paste it in the{' '}
              <a
                href="https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new"
                target="_blank"
                rel="noreferrer"
              >
                SQL Editor
              </a>
              , press <b>Run</b>, then try Save again.
            </p>
          </div>
          <div className="catalog-setup-actions">
            <button type="button" className="btn-secondary" onClick={() => void copySql()}>
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <p className="catalog-empty">Loading products…</p> : null}

      {!loading && !missingTable && tree.length === 0 ? (
        <p className="catalog-empty">
          <span className="catalog-empty-title">No SKU products yet</span>
          Add categories and products in Stock Keeping Unit first.
        </p>
      ) : null}

      {!loading && tree.length > 0 ? (
        <form className="fth-sku-discount" onSubmit={(event) => void handleSave(event)}>
          {error ? <p className="catalog-error">{error}</p> : null}

          <div className="category-section">
            <div className="category-tabs-row">
              <div className="category-tabs" role="tablist" aria-label="SKU categories">
                {tree.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={category.id === activeCategoryId}
                    className={
                      category.id === activeCategoryId ? 'category-tab is-active' : 'category-tab'
                    }
                    onClick={() => setActiveCategoryId(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {activeCategory ? (
              <div className="category-panel" role="tabpanel">
                <div className="subcategory-stack">
                  {activeCategory.subcategories.length === 0 ? (
                    <p className="group-empty">No subcategories in this SKU category.</p>
                  ) : null}

                  {activeCategory.subcategories.map((subcategory) => (
                    <section key={subcategory.id} className="subcategory-group">
                      <header className="subcategory-group__header">
                        <h3>{subcategory.name}</h3>
                      </header>

                      <div className="product-list">
                        {subcategory.products.length === 0 ? (
                          <p className="product-empty">No products yet.</p>
                        ) : null}
                        {subcategory.products.map((product) => (
                          <div key={product.id} className="product-chip fth-discount-chip">
                            <span className="product-name">{product.name}</span>
                            <input
                              className={`fth-discount-input${
                                String(quantities[product.id] ?? '').trim() !== ''
                                  ? ' fg-qty-filled'
                                  : ''
                              }`}
                              type="number"
                              min="0"
                              step="0.001"
                              value={quantities[product.id] ?? ''}
                              onChange={(event) =>
                                setQuantities((prev) => ({
                                  ...prev,
                                  [product.id]: event.target.value,
                                }))
                              }
                              placeholder="0.00"
                              aria-label={`Actual inventory for ${product.name}`}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="fth-save-bar">
            <button type="submit" className="btn-mini" disabled={saving || missingTable}>
              {saving ? 'Saving…' : monthHasSavedRecord ? 'Update actual inventory' : 'Save actual inventory'}
            </button>
          </div>
        </form>
      ) : null}

      {saveToast ? (
        <div className="ai-toast-backdrop no-print" onClick={dismissSaveToast} role="presentation">
          <div
            className={`ai-toast${saveToastPaused ? ' is-paused' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-toast-title"
            aria-describedby="ai-toast-detail"
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => setSaveToastPaused(true)}
            onMouseLeave={() => setSaveToastPaused(false)}
            onFocusCapture={() => setSaveToastPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSaveToastPaused(false)
              }
            }}
          >
            <div className="ai-toast__glow" aria-hidden="true" />
            <div className="ai-toast__check" aria-hidden="true">
              <svg viewBox="0 0 52 52" width="52" height="52">
                <path
                  className="ai-toast__check-path"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 27l8 8 16-18"
                />
              </svg>
            </div>
            <p className="ai-toast__eyebrow">Success</p>
            <h2 id="ai-toast-title">
              {saveToast.updated ? 'Actual inventory updated' : 'Actual inventory saved'}
            </h2>
            <p id="ai-toast-detail">
              These counts become beginning inventory for the next month.
            </p>
            <div className="ai-toast__meta" aria-label="Saved record summary">
              <div className="ai-toast__chip">
                <span>Branch</span>
                <strong>{saveToast.branch}</strong>
              </div>
              <div className="ai-toast__chip">
                <span>Company</span>
                <strong>{saveToast.companyLabel}</strong>
              </div>
              <div className="ai-toast__chip">
                <span>Month</span>
                <strong>{saveToast.monthLabel}</strong>
              </div>
              <div className="ai-toast__chip is-count">
                <span>Counted</span>
                <strong>
                  {saveToast.productCount} SKU · {saveToast.categoryCount} cat.
                </strong>
              </div>
            </div>
            <div className="ai-toast__actions">
              <button
                type="button"
                className="ai-toast__btn ai-toast__btn--ghost"
                onClick={() => {
                  dismissSaveToast()
                  void openSearch()
                }}
              >
                View records
              </button>
              <button
                type="button"
                className="ai-toast__btn ai-toast__btn--primary"
                onClick={dismissSaveToast}
              >
                OK
              </button>
            </div>
            <div className="ai-toast__progress" aria-hidden="true">
              <span
                onAnimationEnd={() => {
                  if (!saveToastPaused) dismissSaveToast()
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div
          className="modal-backdrop no-print"
          onClick={() => setSearchOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel actual-inventory-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="actual-inventory-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="actual-inventory-search-title">Saved actual inventory</h2>
                <p>Search by month or category. Load a record to edit, or delete it.</p>
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

            <div className="actual-inventory-search-body">
              <label className="actual-inventory-search-filter">
                <span>Search</span>
                <input
                  type="search"
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="Month or category"
                />
              </label>

              {recordsError ? <p className="catalog-error">{recordsError}</p> : null}
              {recordsLoading ? <p className="catalog-empty">Loading saved records…</p> : null}

              {!recordsLoading && filteredRecordSummaries.length === 0 ? (
                <p className="catalog-empty">No saved actual inventory records found.</p>
              ) : null}

              {!recordsLoading && filteredRecordSummaries.length > 0 ? (
                <div className="actual-inventory-search-table-wrap">
                  <table className="actual-inventory-search-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Categories</th>
                        <th>Products</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecordSummaries.map((record) => {
                        const isDeleting = deletingMonth === record.monthValue
                        const isCurrent = record.monthValue === monthValue
                        return (
                          <tr key={record.monthValue}>
                            <td>
                              <strong>{formatMonthLabel(record.monthValue)}</strong>
                              {isCurrent ? (
                                <span className="actual-inventory-current-tag">Editing</span>
                              ) : null}
                            </td>
                            <td>{record.categories.join(', ')}</td>
                            <td>{record.productCount}</td>
                            <td className="actual-inventory-search-actions">
                              <button
                                type="button"
                                className="btn-mini"
                                onClick={() => loadRecordMonth(record)}
                                disabled={isDeleting}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-secondary actual-inventory-delete-btn"
                                onClick={() => void handleDeleteRecord(record)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? 'Deleting…' : 'Delete'}
                              </button>
                            </td>
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
    </section>
  )
}
