import { useEffect, useMemo, useState } from 'react'
import { formatPrice, listCatalogTree } from '../lib/catalog'
import { listFullGoodsMovements } from '../lib/fullGoods'
import type { FullGoodsMovement } from '../types/fullGoods'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'

export type PrintablesMode = 'fulls' | 'empties'
export type PrintablesPrintLayout = 'standard' | 'sku'

const FULLS_CATEGORIES = ['PCPPI', 'SMC', 'Magnolia'] as const
const EMPTIES_CATEGORIES = ['Pepsi MTS', 'SMC MTS', 'Magnolia MTS'] as const
const MOVEMENT_TYPE_OPTIONS = [
  { value: 'in' as const, label: 'In' },
  { value: 'out' as const, label: 'Out' },
]

function PrintIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 8V4.8c0-.4.3-.8.8-.8h8.4c.4 0 .8.4.8.8V8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6 14h12v5.2c0 .4-.3.8-.8.8H6.8c-.4 0-.8-.4-.8-.8V14Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4.8 8h14.4c.7 0 1.2.5 1.2 1.2v3.6c0 .7-.5 1.2-1.2 1.2H4.8c-.7 0-1.2-.5-1.2-1.2V9.2c0-.7.5-1.2 1.2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M17 11.2h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTimeAmPm(isoDateTime: string | null | undefined) {
  if (!isoDateTime) return ''
  const date = new Date(isoDateTime)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatPrintDateTime(movementDate: string, createdAt?: string | null) {
  const datePart = formatDisplayDate(movementDate)
  const timePart = formatTimeAmPm(createdAt)
  return timePart ? `${datePart} ${timePart}` : datePart
}

function normalizeCategoryName(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function isEmptiesLikeName(name: string) {
  return name === 'empties' || name.includes('mts')
}

function matchesPrintableCategory(
  movement: FullGoodsMovement,
  category: string,
  mode: PrintablesMode,
) {
  const target = normalizeCategoryName(category)
  const categoryName = normalizeCategoryName(movement.category_name)
  const brandName = normalizeCategoryName(movement.brand_name)

  if (mode === 'empties') {
    return [categoryName, brandName].some(
      (name) =>
        name === target ||
        name.startsWith(`${target} `) ||
        name.includes(target) ||
        (target === 'magnolia mts' && name.includes('magnoia mts')),
    )
  }

  if (!categoryName) return false
  if (categoryName === 'empties' || categoryName === 'pallets' || isEmptiesLikeName(categoryName)) {
    return false
  }
  return categoryName === target || categoryName.startsWith(`${target} `)
}

function getPrintItems(record: FullGoodsMovement) {
  return (record.items ?? []).filter((item) => Number(item.quantity) > 0)
}

function getCasesTotal(record: FullGoodsMovement) {
  return getPrintItems(record).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function monthStartIso(isoDate: string) {
  const [year, month] = isoDate.split('-')
  return `${year}-${month}-01`
}

function compareMovementOrder(a: FullGoodsMovement, b: FullGoodsMovement) {
  const byDate = a.movement_date.localeCompare(b.movement_date)
  if (byDate !== 0) return byDate
  const byCreated = (a.created_at ?? '').localeCompare(b.created_at ?? '')
  if (byCreated !== 0) return byCreated
  return a.id.localeCompare(b.id)
}

function sortMovementsChronologically(movements: FullGoodsMovement[]) {
  return [...movements].sort(compareMovementOrder)
}

function isAtOrBeforeMovement(movement: FullGoodsMovement, asOf: FullGoodsMovement) {
  return compareMovementOrder(movement, asOf) <= 0
}

/** Cumulative stock-in through this transaction (chronological order). */
function computeRunningStockInCasesThrough(
  movements: FullGoodsMovement[],
  category: string,
  mode: PrintablesMode,
  asOf: FullGoodsMovement,
) {
  return movements
    .filter(
      (movement) =>
        matchesPrintableCategory(movement, category, mode) &&
        movement.movement_type === 'in' &&
        isAtOrBeforeMovement(movement, asOf),
    )
    .reduce((sum, movement) => sum + getCasesTotal(movement), 0)
}

/** Cumulative month-to-date stock-out through this transaction (chronological order). */
function computeRunningStockOutCasesThrough(
  movements: FullGoodsMovement[],
  category: string,
  mode: PrintablesMode,
  asOf: FullGoodsMovement,
) {
  const monthStart = monthStartIso(asOf.movement_date)
  return movements
    .filter(
      (movement) =>
        matchesPrintableCategory(movement, category, mode) &&
        movement.movement_type === 'out' &&
        movement.movement_date >= monthStart &&
        isAtOrBeforeMovement(movement, asOf),
    )
    .reduce((sum, movement) => sum + getCasesTotal(movement), 0)
}

type ProductCatalogInfo = {
  price: number
  subcategoryName: string
}

type ProductCatalogLookup = {
  byId: Map<string, ProductCatalogInfo>
  byName: Map<string, ProductCatalogInfo>
}

const EMPTY_PRODUCT_CATALOG: ProductCatalogLookup = {
  byId: new Map(),
  byName: new Map(),
}

function buildProductCatalogLookup(
  catalog: Awaited<ReturnType<typeof listCatalogTree>>['data'],
): ProductCatalogLookup {
  const byId = new Map<string, ProductCatalogInfo>()
  const byName = new Map<string, ProductCatalogInfo>()

  for (const category of catalog) {
    for (const subcategory of category.subcategories) {
      for (const product of subcategory.products) {
        const info = {
          price: Number(product.price),
          subcategoryName: subcategory.name.trim(),
        }
        byId.set(product.id, info)
        byName.set(normalizeCategoryName(product.name), info)
      }
    }
  }

  return { byId, byName }
}

function getProductCatalogInfo(
  productId: string | null | undefined,
  productName: string,
  lookup: ProductCatalogLookup,
) {
  if (productId && lookup.byId.has(productId)) {
    return lookup.byId.get(productId) ?? null
  }
  return lookup.byName.get(normalizeCategoryName(productName)) ?? null
}

function shouldHidePrintSubcategory(category: string) {
  const normalized = normalizeCategoryName(category)
  return normalized === 'smc' || normalized === 'magnolia'
}

function formatPrintProductName(
  productId: string | null | undefined,
  productName: string,
  lookup: ProductCatalogLookup,
  category: string,
) {
  const name = productName.trim()
  if (shouldHidePrintSubcategory(category)) return name
  const info = getProductCatalogInfo(productId, productName, lookup)
  if (!info?.subcategoryName) return name
  return `${info.subcategoryName} ${name}`
}

function getItemPricePerCase(
  productId: string | null | undefined,
  productName: string,
  lookup: ProductCatalogLookup,
) {
  return getProductCatalogInfo(productId, productName, lookup)?.price ?? 0
}

type PrintSheetProps = {
  record: FullGoodsMovement
  fallbackCategory: string
  mode: PrintablesMode
  printLayout: PrintablesPrintLayout
  productCatalog: ProductCatalogLookup
  allMovements: FullGoodsMovement[]
  isLast: boolean
}

function PrintSheet({
  record,
  fallbackCategory,
  mode,
  printLayout,
  productCatalog,
  allMovements,
  isLast,
}: PrintSheetProps) {
  const printItems = getPrintItems(record)
  const printCasesTotal = getCasesTotal(record)
  const goodsLabel = mode === 'empties' ? 'Empties' : printLayout === 'sku' ? 'SKU' : 'Full Goods'
  const itemsLabel = mode === 'empties' ? 'Empties' : 'Fulls'
  const titleName = (
    mode === 'empties'
      ? (record.brand_name ?? record.category_name ?? fallbackCategory)
      : (record.category_name ?? fallbackCategory)
  ).trim()

  const skuRows = printItems.map((item) => {
    const cases = Number(item.quantity || 0)
    const pricePerCase = getItemPricePerCase(item.product_id, item.product_name, productCatalog)
    return {
      id: item.id,
      cases,
      name: formatPrintProductName(
        item.product_id,
        item.product_name,
        productCatalog,
        titleName,
      ),
      pricePerCase,
      amount: cases * pricePerCase,
    }
  })
  const skuAmountTotal = skuRows.reduce((sum, row) => sum + row.amount, 0)
  const runningStockTotal =
    record.movement_type === 'in'
      ? computeRunningStockInCasesThrough(allMovements, titleName, mode, record)
      : computeRunningStockOutCasesThrough(allMovements, titleName, mode, record)

  return (
    <div
      className={isLast ? 'fulls-print-sheet' : 'fulls-print-sheet fulls-print-sheet--followed'}
    >
      <header className="fulls-print-sheet__header">
        <p className="fulls-print-sheet__company">The CMJ Corporation</p>
        <p className="fulls-print-sheet__branch">CMJ Davao</p>
        <p
          className={
            record.movement_type === 'in'
              ? 'fulls-print-sheet__title is-in'
              : 'fulls-print-sheet__title is-out'
          }
        >
          {titleName} {goodsLabel} {record.movement_type === 'in' ? 'In' : 'Out'}
        </p>
      </header>

      <div className="fulls-print-sheet__body">
        <dl className="fulls-print-meta">
          <div className="fulls-print-meta__row">
            <dt>Date</dt>
            <dd>{formatPrintDateTime(record.movement_date, record.created_at)}</dd>
          </div>
          <div className="fulls-print-meta__row">
            <dt>Plate no.</dt>
            <dd>{record.truck_number}</dd>
          </div>
          <div className="fulls-print-meta__row">
            <dt>Load no.</dt>
            <dd>{record.load_number}</dd>
          </div>
          <div className="fulls-print-meta__row">
            <dt>Location</dt>
            <dd>{record.location}</dd>
          </div>
        </dl>

        <div className="fulls-print-items-wrap">
          <table
            className={
              printLayout === 'sku'
                ? 'fulls-print-items fulls-print-items--sku'
                : 'fulls-print-items'
            }
          >
            <thead>
              {printLayout === 'sku' ? (
                <tr>
                  <th>No. of cases</th>
                  <th>SKU name</th>
                  <th>Price/case</th>
                  <th>Amount</th>
                </tr>
              ) : (
                <tr>
                  <th>{itemsLabel}</th>
                  <th>No. of cases</th>
                </tr>
              )}
            </thead>
            <tbody>
              {printLayout === 'sku' ? (
                skuRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No items</td>
                  </tr>
                ) : (
                  skuRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.cases}</td>
                      <td>{row.name}</td>
                      <td>{formatPrice(row.pricePerCase)}</td>
                      <td>{formatPrice(row.amount)}</td>
                    </tr>
                  ))
                )
              ) : printItems.length === 0 ? (
                <tr>
                  <td colSpan={2}>No items</td>
                </tr>
              ) : (
                printItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {formatPrintProductName(
                        item.product_id,
                        item.product_name,
                        productCatalog,
                        titleName,
                      )}
                    </td>
                    <td>{item.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
            {printLayout === 'sku' ? (
              <tfoot>
                <tr>
                  <td>{printCasesTotal}</td>
                  <td />
                  <td />
                  <td className="fulls-print-sku-amount-total">{formatPrice(skuAmountTotal)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          {printLayout === 'sku' ? (
            <div className="fulls-print-sku-stock-total">
              <span className="fulls-print-sku-stock-total__label">
                {record.movement_type === 'in' ? 'Total stock-in' : 'Total stock-out'}:
              </span>{' '}
              <span className="fulls-print-sku-stock-total__value">{runningStockTotal}</span>
            </div>
          ) : null}
          {printLayout === 'sku' ? null : (
            <div className="fulls-print-items-total">
              <span>Total</span>
              <strong>{printCasesTotal}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="fulls-print-sheet__end" aria-hidden="true">
        <span className="fulls-print-sheet__end-line" />
        <span className="fulls-print-sheet__end-label">Nothing follows</span>
        <span className="fulls-print-sheet__end-line" />
      </div>
    </div>
  )
}

type PrintablesRecordsPanelProps = {
  mode?: PrintablesMode
  title?: string
  printLayout?: PrintablesPrintLayout
}

export function PrintablesRecordsPanel({
  mode = 'fulls',
  title,
  printLayout = 'standard',
}: PrintablesRecordsPanelProps) {
  const categories = mode === 'empties' ? [...EMPTIES_CATEGORIES] : [...FULLS_CATEGORIES]
  const [selectedCategory, setSelectedCategory] = useState(categories[0])
  const [selectedMovementType, setSelectedMovementType] = useState<'in' | 'out'>('in')
  const [filterDate, setFilterDate] = useState(todayIsoDate())
  const [movements, setMovements] = useState<FullGoodsMovement[]>([])
  const [productCatalog, setProductCatalog] = useState<ProductCatalogLookup>(EMPTY_PRODUCT_CATALOG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printRecords, setPrintRecords] = useState<FullGoodsMovement[]>([])

  useEffect(() => {
    setSelectedCategory(mode === 'empties' ? EMPTIES_CATEGORIES[0] : FULLS_CATEGORIES[0])
  }, [mode])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [movementsResult, catalogResult] = await Promise.all([
        listFullGoodsMovements(),
        listCatalogTree(),
      ])
      if (cancelled) return

      setMovements(movementsResult.data)
      setProductCatalog(buildProductCatalogLookup(catalogResult.data))
      setError(movementsResult.error ?? catalogResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onAfterPrint() {
      setPrintRecords([])
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  useEffect(() => {
    if (printRecords.length === 0) return
    const timer = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(timer)
  }, [printRecords])

  const records = useMemo(() => {
    return movements.filter((item) => {
      if (!matchesPrintableCategory(item, selectedCategory, mode)) return false
      if (printLayout === 'sku' && item.movement_type !== selectedMovementType) return false
      return item.movement_date === filterDate
    })
  }, [movements, selectedCategory, selectedMovementType, filterDate, mode, printLayout])

  const panelTitle =
    title ?? (mode === 'empties' ? 'Empties In/Out Printables' : 'Fulls In/Out Printables')
  const goodsLabel = mode === 'empties' ? 'Empties' : 'Full Goods'

  return (
    <section className="printables-panel fulls-printables" aria-label={panelTitle}>
      <header className="printables-panel__head fulls-printables-head no-print">
        <h1>{panelTitle}</h1>
      </header>

      <div className="fulls-printables-filters-row no-print">
        <div className="fulls-printables-filters">
          <fieldset className="fulls-printables-categories">
            <legend>Category</legend>
            <div className="fulls-printables-categories__row" role="radiogroup" aria-label="Category">
              {categories.map((category) => {
                const checked = selectedCategory === category
                return (
                  <label
                    key={category}
                    className={
                      checked
                        ? 'fulls-printables-check is-checked'
                        : 'fulls-printables-check'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelectedCategory(category)}
                    />
                    <span>{category}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {printLayout === 'sku' ? (
            <fieldset className="fulls-printables-categories">
              <legend>In/Out</legend>
              <div
                className="fulls-printables-categories__row"
                role="radiogroup"
                aria-label="In or Out"
              >
                {MOVEMENT_TYPE_OPTIONS.map((option) => {
                  const checked = selectedMovementType === option.value
                  return (
                    <label
                      key={option.value}
                      className={
                        checked
                          ? 'fulls-printables-check is-checked'
                          : 'fulls-printables-check'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedMovementType(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : null}

          <label className="fulls-printables-date">
            <span>Date</span>
            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className="fulls-printables-print-btn fulls-printables-print-all"
          disabled={loading || records.length === 0}
          onClick={() =>
            setPrintRecords(
              printLayout === 'sku' ? sortMovementsChronologically(records) : [...records],
            )
          }
        >
          <PrintIcon />
          Print all
        </button>
      </div>

      {error ? <p className="catalog-error no-print">{error}</p> : null}

      {loading ? <p className="catalog-empty no-print">Loading records…</p> : null}

      {!loading && records.length === 0 ? (
        <div className="printables-panel__empty no-print">
          <p className="printables-panel__empty-title">No records found</p>
          <p>
            No {selectedCategory} {goodsLabel}{' '}
            {printLayout === 'sku' ? (selectedMovementType === 'in' ? 'In' : 'Out') : ''} records for{' '}
            {filterDate}.
          </p>
        </div>
      ) : null}

      {!loading && records.length > 0 ? (
        <div className="fg-table-wrap fulls-printables-table no-print">
          <table className="fg-table">
            <thead>
              <tr>
                <th>Plate no.</th>
                <th>Load no.</th>
                <th>Location</th>
                {printLayout === 'sku' ? null : <th>In/Out</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((item) => (
                <tr key={item.id}>
                  <td>{item.truck_number}</td>
                  <td>{item.load_number}</td>
                  <td>{item.location}</td>
                  {printLayout === 'sku' ? null : (
                    <td>{item.movement_type === 'in' ? 'In' : 'Out'}</td>
                  )}
                  <td className="fg-row-actions">
                    <button
                      type="button"
                      className="fulls-printables-print-btn"
                      onClick={() => setPrintRecords([item])}
                    >
                      <PrintIcon />
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {printRecords.length > 0 ? (
        <div className="fulls-print-batch print-only" aria-hidden="true">
          {printRecords.map((record, index) => (
            <PrintSheet
              key={record.id}
              record={record}
              fallbackCategory={selectedCategory}
              mode={mode}
              printLayout={printLayout}
              productCatalog={productCatalog}
              allMovements={movements}
              isLast={index === printRecords.length - 1}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

type FullsPrintablesPanelProps = {
  mode?: PrintablesMode
  title?: string
  printLayout?: PrintablesPrintLayout
}

export function FullsPrintablesPanel(props: FullsPrintablesPanelProps) {
  return <PrintablesRecordsPanel {...props} />
}
