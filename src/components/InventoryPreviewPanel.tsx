import { useEffect, useMemo, useState } from 'react'
import { listCatalogTree } from '../lib/catalog'
import { listFullGoodsMovements } from '../lib/fullGoods'
import {
  buildActualBeginningLookup,
  listActualInventoriesForMonth,
  previousMonthStart,
} from '../lib/actualInventory'
import {
  buildInventoryPreviewRows,
  formatInventoryValue,
  inventoryDateBounds,
  inventoryPreviewTitle,
  inventoryPrintReportPeriod,
  splitInventoryPreviewRows,
  type InventoryCategory,
  type InventoryMetricRow,
} from '../lib/inventoryPreview'
import './InventoryPreviewPanel.css'

type InventoryPreviewPanelProps = {
  category: InventoryCategory
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
  if (row.kind === 'subcategory' || row.kind === 'section') {
    return (
      <>
        <td className="inventory-preview-table__metric" />
        <td className="inventory-preview-table__metric" />
        <td className="inventory-preview-table__metric" />
        <td className="inventory-preview-table__metric" />
        <td className="inventory-preview-table__metric" />
        <td className="inventory-preview-table__metric" />
        <td className="inventory-preview-table__metric" />
      </>
    )
  }

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

function InventoryTableHead() {
  return (
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

function InventoryTableRow({ entry }: { entry: InventoryRenderRow }) {
  if (entry.type === 'other') {
    const { row } = entry
    return (
      <tr
        className={
          row.kind === 'section'
            ? 'is-section'
            : row.kind === 'total'
              ? 'is-total'
              : row.kind === 'subcategory'
                ? 'is-subcategory'
                : 'is-product'
        }
      >
        <td
          colSpan={2}
          className={
            row.kind === 'section'
              ? 'inventory-preview-table__section'
              : row.kind === 'total'
                ? 'inventory-preview-table__total-label'
                : row.kind === 'subcategory'
                  ? 'inventory-preview-table__subcategory'
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
    <tr className="is-product">
      {showSubcategory ? (
        <td className="inventory-preview-table__subcategory" rowSpan={rowSpan}>
          {subcategoryName}
        </td>
      ) : null}
      <td className="inventory-preview-table__product">{row.label}</td>
      <InventoryMetricCells row={row} />
    </tr>
  )
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
        <InventoryTableHead />
        <tbody>
          {rows.length === 0 && emptyMessage ? (
            <tr>
              <td colSpan={9} className="inventory-preview-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            renderRows.map((entry) => (
              <InventoryTableRow key={entry.row.id} entry={entry} />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function InventoryPreviewPanel({ category }: InventoryPreviewPanelProps) {
  const [dateFrom, setDateFrom] = useState(todayIsoDate())
  const [dateTo, setDateTo] = useState(todayIsoDate())
  const [appliedRange, setAppliedRange] = useState({ dateFrom: todayIsoDate(), dateTo: todayIsoDate() })
  const [movements, setMovements] = useState<Awaited<ReturnType<typeof listFullGoodsMovements>>['data']>([])
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listCatalogTree>>['data']>([])
  const [actualBeginning, setActualBeginning] = useState<ReturnType<
    typeof buildActualBeginningLookup
  > | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [hasViewed, setHasViewed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setHasViewed(false)
      const [movementsResult, catalogResult] = await Promise.all([
        listFullGoodsMovements(),
        listCatalogTree(),
      ])
      if (cancelled) return
      setMovements(movementsResult.data)
      setCatalog(catalogResult.data)
      setError(movementsResult.error ?? catalogResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [category])

  useEffect(() => {
    let cancelled = false

    async function loadActuals() {
      const result = await listActualInventoriesForMonth(previousMonthStart(appliedRange.dateFrom))
      if (cancelled) return
      if (result.missingTable) {
        setActualBeginning(null)
        return
      }
      setActualBeginning(
        buildActualBeginningLookup(result.data.flatMap((detail) => detail.items)),
      )
    }

    void loadActuals()
    return () => {
      cancelled = true
    }
  }, [category, appliedRange.dateFrom])

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

  const { fullRows, emptiesRows } = useMemo(() => {
    if (!hasViewed) return { fullRows: [], emptiesRows: [] }
    const allRows = buildInventoryPreviewRows(
      movements,
      catalog,
      category,
      appliedRange.dateFrom,
      appliedRange.dateTo,
      actualBeginning,
    )
    return splitInventoryPreviewRows(allRows)
  }, [movements, catalog, category, appliedRange, hasViewed, actualBeginning])

  const hasRows = fullRows.length > 0 || emptiesRows.length > 0

  function handleView() {
    setAppliedRange(inventoryDateBounds(dateFrom, dateTo))
    setHasViewed(true)
  }

  const panelTitle = inventoryPreviewTitle(category)
  const printPeriod = inventoryPrintReportPeriod(appliedRange.dateTo)

  return (
    <section className="inventory-preview-panel" aria-label={panelTitle}>
      <div className={`inventory-preview-card${printing ? ' is-printing' : ''}`}>
        <header className="inventory-preview-header no-print">
          <div className="inventory-preview-header__title">
            <h1>{panelTitle}</h1>
            <span className="inventory-preview-header__subtitle">{category} inventory report</span>
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
              disabled={loading}
              onClick={handleView}
            >
              <ViewIcon />
              <span>View</span>
            </button>
            <button
              type="button"
              className="inventory-preview-action inventory-preview-action--print"
              disabled={loading || !hasViewed || !hasRows}
              onClick={() => setPrinting(true)}
            >
              <PrintIcon />
              <span>Print</span>
            </button>
          </div>
        </header>

        {error ? <p className="catalog-error inventory-preview-status no-print">{error}</p> : null}
        {loading ? <p className="catalog-empty inventory-preview-status no-print">Loading inventory…</p> : null}

        <div className="inventory-preview-body">
          <header className="inventory-preview-print-header">
            <h2 className="inventory-preview-print-header__title">DAVAO INVENTORY REPORT</h2>
            <p className="inventory-preview-print-header__period">
              for the month of {printPeriod.monthName}, {printPeriod.year}
            </p>
            <p className="inventory-preview-print-header__category">{category}</p>
          </header>

          {!hasViewed ? (
            <InventoryTable emptyMessage="Select dates and click View." rows={[]} />
          ) : !hasRows ? (
            <InventoryTable emptyMessage="No inventory rows found for this category." rows={[]} />
          ) : (
            <>
              <div className="inventory-preview-table-section inventory-preview-table-section--fulls">
                <div className="inventory-preview-table-section__title print-only">FULLS</div>
                <InventoryTable rows={fullRows} />
              </div>

              {emptiesRows.length > 0 ? (
                <div className="inventory-preview-table-section inventory-preview-table-section--empties">
                  <div className="inventory-preview-table-section__title">EMPTIES</div>
                  <InventoryTable rows={emptiesRows} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
