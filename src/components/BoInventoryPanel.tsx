import { useEffect, useMemo, useState } from 'react'
import { listCatalogTree } from '../lib/catalog'
import {
  boActualInventoryCategory,
  type BoInOutMeta,
} from '../lib/boBadOrder'
import {
  buildActualBeginningLookup,
  getActualInventory,
  previousMonthStart,
} from '../lib/actualInventory'
import {
  buildBoInventoryPreviewRows,
  boInventoryPreviewTitle,
} from '../lib/boInventoryPreview'
import { listBoMovementsForCompany } from '../lib/boTransactions'
import {
  formatInventoryValue,
  inventoryDateBounds,
  inventoryPrintReportPeriod,
  type InventoryMetricRow,
} from '../lib/inventoryPreview'
import boSchemaSql from '../../supabase/bo_bad_order_schema.sql?raw'
import actualSchemaSql from '../../supabase/actual_inventory_schema.sql?raw'
import './InventoryPreviewPanel.css'
import './CatalogPanel.css'

type BoInventoryPanelProps = {
  company: BoInOutMeta['company']
  onClose: () => void
}

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function ViewIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M6 14h12v7H6v-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function InventoryMetricCells({ row }: { row: InventoryMetricRow }) {
  return (
    <>
      <td className="inventory-preview-table__metric">{formatInventoryValue(row.beginning)}</td>
      <td className="inventory-preview-table__metric">{formatInventoryValue(row.stockIn)}</td>
      <td className="inventory-preview-table__metric">{formatInventoryValue(row.totalStocks)}</td>
      <td className="inventory-preview-table__metric">{formatInventoryValue(row.totalSales)}</td>
      <td className="inventory-preview-table__metric">{formatInventoryValue(row.remain)}</td>
      <td className="inventory-preview-table__metric">{formatInventoryValue(row.inventory)}</td>
      <td className="inventory-preview-table__metric">{row.remarks}</td>
    </>
  )
}

type InventoryRenderRow =
  | {
      type: 'product'
      row: InventoryMetricRow
      subcategoryName: string
      rowSpan: number
      showSubcategory: boolean
    }
  | { type: 'other'; row: InventoryMetricRow }

function buildInventoryRenderRows(rows: InventoryMetricRow[]): InventoryRenderRow[] {
  const result: InventoryRenderRow[] = []
  let index = 0

  while (index < rows.length) {
    const row = rows[index]
    if (row.kind !== 'product') {
      result.push({ type: 'other', row })
      index += 1
      continue
    }

    const subcategoryName = row.subcategoryName?.trim() || ''
    let span = 1
    while (
      index + span < rows.length &&
      rows[index + span].kind === 'product' &&
      (rows[index + span].subcategoryName?.trim() || '') === subcategoryName
    ) {
      span += 1
    }

    for (let offset = 0; offset < span; offset += 1) {
      result.push({
        type: 'product',
        row: rows[index + offset],
        subcategoryName,
        rowSpan: span,
        showSubcategory: offset === 0,
      })
    }
    index += span
  }

  return result
}

function InventoryTable({
  rows,
  emptyMessage,
}: {
  rows: InventoryMetricRow[]
  emptyMessage?: string
}) {
  const renderRows = buildInventoryRenderRows(rows)

  return (
    <div className="inventory-preview-table-wrap">
      <table className="inventory-preview-table">
        <thead>
          <tr>
            <th className="inventory-preview-table__item-head inventory-preview-table__subcat-head" />
            <th className="inventory-preview-table__item-head" />
            <th>BEGINNING</th>
            <th>STOCK IN</th>
            <th>TOTAL STOCKS</th>
            <th>TOTAL SALES</th>
            <th>REMAIN</th>
            <th>INVENTORY</th>
            <th>REMARKS</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyMessage ? (
            <tr>
              <td colSpan={9} className="inventory-preview-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            renderRows.map((entry) => {
              if (entry.type === 'other') {
                const { row } = entry
                return (
                  <tr key={row.id} className={row.kind === 'total' ? 'is-total' : 'is-product'}>
                    <td
                      colSpan={2}
                      className={
                        row.kind === 'total'
                          ? 'inventory-preview-table__total-label'
                          : 'inventory-preview-table__product'
                      }
                    >
                      {row.label}
                    </td>
                    <InventoryMetricCells row={row} />
                  </tr>
                )
              }

              const { row, subcategoryName, rowSpan, showSubcategory } = entry
              return (
                <tr key={row.id} className="is-product">
                  {showSubcategory ? (
                    <td className="inventory-preview-table__subcategory" rowSpan={rowSpan}>
                      {subcategoryName}
                    </td>
                  ) : null}
                  <td className="inventory-preview-table__product">{row.label}</td>
                  <InventoryMetricCells row={row} />
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

export function BoInventoryPanel({ company, onClose }: BoInventoryPanelProps) {
  const categoryKey = boActualInventoryCategory(company)
  const panelTitle = boInventoryPreviewTitle(company)
  const [dateFrom, setDateFrom] = useState(todayIsoDate())
  const [dateTo, setDateTo] = useState(todayIsoDate())
  const [appliedRange, setAppliedRange] = useState({
    dateFrom: todayIsoDate(),
    dateTo: todayIsoDate(),
  })
  const [movements, setMovements] = useState<
    Awaited<ReturnType<typeof listBoMovementsForCompany>>['data']
  >([])
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listCatalogTree>>['data']>([])
  const [actualBeginning, setActualBeginning] = useState<ReturnType<
    typeof buildActualBeginningLookup
  > | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingBoTable, setMissingBoTable] = useState(false)
  const [missingActualTable, setMissingActualTable] = useState(false)
  const [copiedBo, setCopiedBo] = useState(false)
  const [copiedActual, setCopiedActual] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [hasViewed, setHasViewed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setHasViewed(false)
      const [movementsResult, catalogResult] = await Promise.all([
        listBoMovementsForCompany(company),
        listCatalogTree(),
      ])
      if (cancelled) return
      setMovements(movementsResult.data)
      setCatalog(catalogResult.data)
      setMissingBoTable(movementsResult.missingTable)
      setError(movementsResult.error ?? catalogResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [company])

  useEffect(() => {
    let cancelled = false

    async function loadActuals() {
      const result = await getActualInventory(
        categoryKey,
        previousMonthStart(appliedRange.dateFrom),
      )
      if (cancelled) return
      if (result.missingTable) {
        setMissingActualTable(true)
        setActualBeginning(null)
        return
      }
      setMissingActualTable(false)
      if (!result.data) {
        setActualBeginning(null)
        return
      }
      setActualBeginning(buildActualBeginningLookup(result.data.items))
    }

    void loadActuals()
    return () => {
      cancelled = true
    }
  }, [categoryKey, appliedRange.dateFrom])

  useEffect(() => {
    function onAfterPrint() {
      setPrinting(false)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(timer)
  }, [printing])

  const rows = useMemo(() => {
    if (!hasViewed) return []
    return buildBoInventoryPreviewRows(
      movements,
      catalog,
      company,
      appliedRange.dateFrom,
      appliedRange.dateTo,
      actualBeginning,
    )
  }, [movements, catalog, company, appliedRange, hasViewed, actualBeginning])

  function handleView() {
    setAppliedRange(inventoryDateBounds(dateFrom, dateTo))
    setHasViewed(true)
  }

  const printPeriod = inventoryPrintReportPeriod(appliedRange.dateTo)

  async function copyBoSql() {
    await navigator.clipboard.writeText(boSchemaSql)
    setCopiedBo(true)
    window.setTimeout(() => setCopiedBo(false), 2000)
  }

  async function copyActualSql() {
    await navigator.clipboard.writeText(actualSchemaSql)
    setCopiedActual(true)
    window.setTimeout(() => setCopiedActual(false), 2000)
  }

  return (
    <section className="inventory-preview-panel" aria-label={panelTitle}>
      <div className={`inventory-preview-card${printing ? ' is-printing' : ''}`}>
        <header className="inventory-preview-header no-print">
          <div className="inventory-preview-header__title">
            <h1>{panelTitle}</h1>
            <span className="inventory-preview-header__subtitle">
              Bad Order inventory from BO in/out ({categoryKey} beginning)
            </span>
          </div>

          <div className="inventory-preview-filters">
            <label className="inventory-preview-date">
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => {
                  const next = event.target.value
                  setDateFrom(next)
                  if (dateTo && next > dateTo) setDateTo(next)
                }}
              />
            </label>

            <label className="inventory-preview-date">
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => {
                  const next = event.target.value
                  setDateTo(next)
                  if (dateFrom && next && next < dateFrom) setDateFrom(next)
                }}
              />
            </label>
          </div>

          <div className="inventory-preview-actions">
            <button
              type="button"
              className="inventory-preview-action inventory-preview-action--view"
              disabled={loading || missingBoTable}
              onClick={handleView}
            >
              <ViewIcon />
              <span>View</span>
            </button>
            <button
              type="button"
              className="inventory-preview-action inventory-preview-action--print"
              disabled={loading || !hasViewed || rows.length === 0}
              onClick={() => setPrinting(true)}
            >
              <PrintIcon />
              <span>Print</span>
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              ← Back
            </button>
          </div>
        </header>

        {missingBoTable ? (
          <div className="catalog-setup no-print">
            <div>
              <strong>BO tables required</strong>
              <p>Run the Bad Order SQL in Supabase, then refresh.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => void copyBoSql()}>
              {copiedBo ? 'Copied' : 'Copy BO SQL'}
            </button>
          </div>
        ) : null}

        {missingActualTable ? (
          <div className="catalog-setup no-print">
            <div>
              <strong>Actual Inventory optional setup</strong>
              <p>
                Without Actual Inventory tables, beginning uses computed BO in/out history only. Run
                SQL to enable AI - BO month counts as beginning.
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => void copyActualSql()}>
              {copiedActual ? 'Copied' : 'Copy Actual SQL'}
            </button>
          </div>
        ) : null}

        {error ? <p className="catalog-error inventory-preview-status no-print">{error}</p> : null}
        {loading ? (
          <p className="catalog-empty inventory-preview-status no-print">Loading inventory…</p>
        ) : null}

        <div className="inventory-preview-body">
          <header className="inventory-preview-print-header">
            <h2 className="inventory-preview-print-header__title">DAVAO BO INVENTORY REPORT</h2>
            <p className="inventory-preview-print-header__period">
              for the month of {printPeriod.monthName}, {printPeriod.year}
            </p>
            <p className="inventory-preview-print-header__category">BO {company}</p>
          </header>

          {!hasViewed ? (
            <InventoryTable emptyMessage="Select dates and click View." rows={[]} />
          ) : (
            <InventoryTable
              emptyMessage="No BO inventory rows found for this company."
              rows={rows}
            />
          )}
        </div>
      </div>
    </section>
  )
}
