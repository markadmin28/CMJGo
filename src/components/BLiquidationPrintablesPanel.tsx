import { useEffect, useMemo, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import {
  buildActualBeginningLookup,
  previousMonthStart,
  listActualInventoriesForMonth,
  type ActualBeginningLookup,
} from '../lib/actualInventory'
import {
  computeFullBLiquidationSummary,
  computeProductRemains,
  formatLiquidationValue,
  formatRemainValue,
  formatShortDate,
  prepareEmptiesBreakdownRows,
  splitProductColumns,
  type ProductRemainRow,
} from '../lib/bLiquidation'
import { listCatalogTree } from '../lib/catalog'
import {
  customerTxToPrintableMovement,
  printableCategoryToCustomerCompany,
} from '../lib/customerTxAsMovement'
import { listCustomerTransactionsWithItemsInRange } from '../lib/customerTxSave'
import { routeSummaryToPrintableMovement } from '../lib/routeSummaryAsMovement'
import { listRouteSummariesWithItemsInRange } from '../lib/routeSummarySave'
import { listFullGoodsMovements } from '../lib/fullGoods'
import type { FullGoodsMovement } from '../types/fullGoods'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'
import './BLiquidationPrintablesPanel.css'

export type BLiquidationMode = 'fulls' | 'empties'

const FULLS_CATEGORIES = ['PCPPI', 'SMC', 'Magnolia'] as const
const EMPTIES_CATEGORIES = ['Pepsi MTS', 'SMC MTS', 'Magnolia MTS'] as const

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

type BLiquidationPrintablesPanelProps = {
  mode?: BLiquidationMode
  branch?: UserBranch | null
}

function GoodsLabel({ goodsLabel, suffix }: { goodsLabel: string; suffix: string }) {
  return (
    <>
      <span className="b-liq-print-fulls">({goodsLabel})</span>
      {suffix}
    </>
  )
}

function SummaryEmptyRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <tr key={`empty-${index}`} className="b-liquidation-print-row--empty">
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      ))}
    </>
  )
}

function BLiquidationPrintTables({
  summary,
  goodsLabel,
}: {
  summary: ReturnType<typeof computeFullBLiquidationSummary>
  goodsLabel: string
}) {
  return (
    <div className="b-liquidation-print-tables">
      <table className="b-liquidation-print-table b-liquidation-print-table--in">
        <tbody>
          <tr>
            <td>
              <GoodsLabel goodsLabel={goodsLabel} suffix=" today in" />
            </td>
            <td>{formatLiquidationValue(summary.todayIn)}</td>
          </tr>
          <tr>
            <td>({goodsLabel}) running in (month to date in)</td>
            <td>{formatLiquidationValue(summary.runningInMtd)}</td>
          </tr>
          <tr>
            <td>({goodsLabel} remain) previous month</td>
            <td className="b-liq-print-val--green">
              {formatLiquidationValue(summary.previousMonthRemain)}
            </td>
          </tr>
          <tr className="b-liquidation-print-row--no-outline">
            <td>Total stock(s) IN ({goodsLabel})</td>
            <td className="b-liq-print-val--blue">
              {formatLiquidationValue(summary.totalStockIn)}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="b-liquidation-print-table b-liquidation-print-table--out">
        <tbody>
          <tr>
            <td>
              <GoodsLabel goodsLabel={goodsLabel} suffix=" today out (sales)" />
            </td>
            <td>{formatLiquidationValue(summary.todayOut)}</td>
          </tr>
          <tr>
            <td>({goodsLabel}) running out (month to date sales)</td>
            <td className="b-liq-print-val--blue">
              {formatLiquidationValue(summary.runningOutMtd)}
            </td>
          </tr>
          <SummaryEmptyRows count={2} />
        </tbody>
      </table>

      <table className="b-liquidation-print-table b-liquidation-print-table--remain">
        <tbody>
          <tr>
            <td>({goodsLabel}) total stock remain</td>
            <td className="b-liq-print-val--red">
              {formatLiquidationValue(summary.totalStockRemain)}
            </td>
          </tr>
          <SummaryEmptyRows count={3} />
        </tbody>
      </table>
    </div>
  )
}

function groupRowsBySubcategory(rows: ProductRemainRow[]) {
  const groups: Array<{ subcategoryName: string; products: ProductRemainRow[] }> = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.subcategoryName === row.subcategoryName) {
      last.products.push(row)
    } else {
      groups.push({ subcategoryName: row.subcategoryName, products: [row] })
    }
  }
  return groups
}

const SUBCATEGORY_ORDER = [
  'pepsi',
  'mirinda',
  '7 up',
  '7up',
  'mt. dew',
  'mt dew',
  'mountain dew',
  'sting',
  'gatorade',
  'tropicana',
  'cheetos',
  'premier',
  'a-fina',
  'a fina',
  'afina',
]

function subcategorySortRank(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  const exact = SUBCATEGORY_ORDER.indexOf(normalized)
  if (exact !== -1) return exact
  const partial = SUBCATEGORY_ORDER.findIndex(
    (item) => normalized.startsWith(item) || normalized.includes(item),
  )
  return partial === -1 ? 1000 : partial
}

function sortRowsBySubcategory(rows: ProductRemainRow[]) {
  const groups = groupRowsBySubcategory(rows)
  groups.sort((a, b) => {
    const rankDiff =
      subcategorySortRank(a.subcategoryName) - subcategorySortRank(b.subcategoryName)
    if (rankDiff !== 0) return rankDiff
    return a.subcategoryName.localeCompare(b.subcategoryName)
  })
  return groups.flatMap((group) => group.products)
}

function splitBreakdownColumns(rows: ProductRemainRow[], category: string) {
  const normalized = category.trim().toLowerCase()
  const isSmc = normalized === 'smc' || normalized === 'smc mts'

  // SMC / SMC MTS: move the last 12 products into table 2 as the "other" group.
  if (isSmc && rows.length > 12) {
    return [rows.slice(0, rows.length - 12), rows.slice(rows.length - 12), []]
  }

  return splitProductColumns(rows, 3)
}

function BLiquidationBreakdown({
  category,
  dateTo,
  rows,
  goodsLabel,
  summaryRemain,
}: {
  category: string
  dateTo: string
  rows: ProductRemainRow[]
  goodsLabel: string
  summaryRemain: number
}) {
  const sortedRows = sortRowsBySubcategory(rows)
  const columns = splitBreakdownColumns(sortedRows, category)
  // Use the same remain as the summary table so footer never drifts from
  // "(Empties) total stock remain" when SKU matching is imperfect.
  const totalRemain = summaryRemain
  const normalizedCategory = category.trim().toLowerCase()
  const hideSubcategory =
    goodsLabel.trim().toLowerCase() === 'empties' ||
    (goodsLabel.trim().toLowerCase() === 'fulls' &&
      (normalizedCategory === 'smc' || normalizedCategory === 'magnolia'))

  return (
    <section className="b-liquidation-breakdown">
      <header className="b-liquidation-breakdown__header">
        <h2>
          {category.toUpperCase()} - {goodsLabel.toUpperCase()} BREAKDOWN LIQUIDATION
        </h2>
        <p>{formatShortDate(dateTo)}</p>
      </header>

      <div className="b-liquidation-breakdown__tables">
        {columns
          .filter((column) => column.length > 0)
          .map((column, index) => {
            const groups = groupRowsBySubcategory(column)
            return (
              <table
                key={index}
                className={
                  hideSubcategory
                    ? 'b-liquidation-breakdown-table b-liquidation-breakdown-table--no-subcat'
                    : 'b-liquidation-breakdown-table'
                }
              >
                <thead>
                  <tr>
                    <th colSpan={hideSubcategory ? 1 : 2}>PRODUCTS</th>
                    <th>REMAIN(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.flatMap((group) =>
                    group.products.map((row, productIndex) => (
                      <tr key={row.productId}>
                        {!hideSubcategory && productIndex === 0 ? (
                          <td
                            className="b-liquidation-subcat-cell"
                            rowSpan={group.products.length}
                          >
                            {group.subcategoryName}
                          </td>
                        ) : null}
                        <td>{row.productName}</td>
                        <td className="b-liq-print-val--red">
                          {formatRemainValue(row.remain)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            )
          })}
      </div>

      <p className="b-liquidation-breakdown__total">
        TOTAL REMAIN : {formatRemainValue(totalRemain)}
      </p>
    </section>
  )
}

function matchesEmptiesCatalogName(name: string, selectedCategory: string) {
  const target = selectedCategory.trim().toLowerCase().replace(/\s+/g, ' ')
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return (
    normalized === target ||
    normalized.startsWith(`${target} `) ||
    normalized.includes(target) ||
    (target === 'magnolia mts' && normalized.includes('magnoia mts'))
  )
}

function resolveCategoryProducts(
  catalog: Awaited<ReturnType<typeof listCatalogTree>>['data'],
  selectedCategory: string,
  mode: BLiquidationMode,
) {
  if (mode === 'empties') {
    const empties = catalog.find(
      (category) => category.name.trim().toLowerCase() === 'empties',
    )
    const match = empties?.subcategories.find((sub) =>
      matchesEmptiesCatalogName(sub.name, selectedCategory),
    )
    if (!match) return []
    const seen = new Set<string>()
    return match.products.flatMap((product) => {
      if (seen.has(product.id)) return []
      seen.add(product.id)
      return [
        {
          id: product.id,
          name: product.name,
          subcategoryName: match.name,
        },
      ]
    })
  }

  const match = catalog.find(
    (category) =>
      category.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase() ||
      category.name.trim().toLowerCase().startsWith(selectedCategory.trim().toLowerCase()),
  )
  const seen = new Set<string>()
  return (
    match?.subcategories.flatMap((sub) =>
      sub.products.flatMap((product) => {
        if (seen.has(product.id)) return []
        seen.add(product.id)
        return [
          {
            id: product.id,
            name: product.name,
            subcategoryName: sub.name,
          },
        ]
      }),
    ) ?? []
  )
}

export function BLiquidationPrintablesPanel({
  mode = 'fulls',
  branch = 'Davao',
}: BLiquidationPrintablesPanelProps) {
  const catalogBranch = branch ?? 'Davao'
  const includeCustomerTx = catalogBranch === 'Nabunturan'
  const categories = mode === 'empties' ? [...EMPTIES_CATEGORIES] : [...FULLS_CATEGORIES]
  const [selectedCategory, setSelectedCategory] = useState(categories[0])
  const [dateFrom, setDateFrom] = useState(todayIsoDate())
  const [dateTo, setDateTo] = useState(todayIsoDate())
  const [printing, setPrinting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [movements, setMovements] = useState<FullGoodsMovement[]>([])
  const [categoryProducts, setCategoryProducts] = useState<
    Array<{ id: string; name: string; subcategoryName: string }>
  >([])
  const [actualBeginning, setActualBeginning] = useState<ActualBeginningLookup | null>(null)

  const modeTitle = mode === 'empties' ? 'Empties B-Liquidation' : 'Full B-Liquidation'
  const goodsLabel = mode === 'empties' ? 'Empties' : 'Fulls'
  const panelTitle = `${selectedCategory} ${modeTitle} Printables`
  const customerCompany = includeCustomerTx
    ? printableCategoryToCustomerCompany(selectedCategory)
    : null

  const summary = useMemo(() => {
    return computeFullBLiquidationSummary(movements, selectedCategory, dateTo, mode, {
      products: categoryProducts,
      actualBeginning: includeCustomerTx ? actualBeginning : null,
    })
  }, [
    movements,
    selectedCategory,
    dateTo,
    mode,
    categoryProducts,
    actualBeginning,
    includeCustomerTx,
  ])

  const productRemains = useMemo(() => {
    let rows = computeProductRemains(
      movements,
      categoryProducts,
      selectedCategory,
      dateTo,
      mode,
      includeCustomerTx ? actualBeginning : null,
    )
    // Checked-SKU catalogs omit unchecked products; drop orphan rows so
    // breakdown only lists products enabled for this branch.
    rows = rows.filter((row) => !row.productId.startsWith('orphan:'))
    return mode === 'empties' ? prepareEmptiesBreakdownRows(rows) : rows
  }, [
    movements,
    categoryProducts,
    selectedCategory,
    dateTo,
    mode,
    actualBeginning,
    includeCustomerTx,
  ])

  useEffect(() => {
    setSelectedCategory(mode === 'empties' ? EMPTIES_CATEGORIES[0] : FULLS_CATEGORIES[0])
  }, [mode])

  useEffect(() => {
    if (!includeCustomerTx) {
      setActualBeginning(null)
      return
    }

    let cancelled = false

    async function loadActuals() {
      const result = await listActualInventoriesForMonth(
        previousMonthStart(dateTo),
        catalogBranch,
      )
      if (cancelled) return
      if (result.missingTable || result.error) {
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
  }, [includeCustomerTx, catalogBranch, dateTo])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      const [movementsResult, catalogResult] = await Promise.all([
        listFullGoodsMovements(catalogBranch),
        // Nabunturan/Davao: only products checked in SKU for this branch.
        listCatalogTree(catalogBranch, { forTransactions: true }),
      ])
      if (cancelled) return

      const branchMovements = (movementsResult.data ?? []).filter(
        (row) => (row.branch || 'Davao') === catalogBranch,
      )

      let nextMovements = branchMovements
      let customerError: string | null = null

      if (includeCustomerTx && customerCompany) {
        // Nabunturan: fulls sales = Out; empties returns = In (customer TX + route summary).
        const [customerResult, routeResult] = await Promise.all([
          listCustomerTransactionsWithItemsInRange(
            catalogBranch,
            '2020-01-01',
            todayIsoDate(),
            customerCompany,
          ),
          listRouteSummariesWithItemsInRange(catalogBranch, '2020-01-01', todayIsoDate()),
        ])
        if (cancelled) return
        customerError = customerResult.error ?? routeResult.error
        const customerMovements = customerResult.data.map(({ transaction, items }) =>
          customerTxToPrintableMovement(transaction, items, mode, selectedCategory),
        )
        const routeMovements = routeResult.data
          .map(({ summary, items }) =>
            routeSummaryToPrintableMovement(
              summary,
              items,
              mode,
              selectedCategory,
              customerCompany,
            ),
          )
          .filter((row): row is NonNullable<typeof row> => row != null)
        const byId = new Map<string, FullGoodsMovement>()
        for (const row of branchMovements) byId.set(row.id, row)
        for (const row of customerMovements) byId.set(row.id, row)
        for (const row of routeMovements) byId.set(row.id, row)
        nextMovements = [...byId.values()]
      }

      setMovements(nextMovements)
      setLoadError(movementsResult.error ?? catalogResult.error ?? customerError)
      setCategoryProducts(
        resolveCategoryProducts(catalogResult.data, selectedCategory, mode),
      )
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [selectedCategory, mode, catalogBranch, includeCustomerTx, customerCompany])
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

  return (
    <section className="printables-panel fulls-printables" aria-label={panelTitle}>
      <header className="printables-panel__head fulls-printables-head no-print">
        <h1>{panelTitle}</h1>
      </header>

      <div className="fulls-printables-filters-row no-print">
        <div
          className={
            mode === 'empties'
              ? 'fulls-printables-filters b-liquidation-filters b-liquidation-filters--empties-inline'
              : 'fulls-printables-filters b-liquidation-filters'
          }
        >
          {mode === 'empties' ? (
            <div className="b-liquidation-empties-row">
              <span className="b-liquidation-empties-row__legend">Category</span>
              <div className="b-liquidation-empties-row__controls">
                <div
                  className="b-liquidation-empties-row__checks"
                  role="radiogroup"
                  aria-label="Category"
                >
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

                <label className="fulls-printables-date">
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

                <label className="fulls-printables-date">
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
            </div>
          ) : (
            <>
              <fieldset className="fulls-printables-categories">
                <legend>Category</legend>
                <div
                  className="fulls-printables-categories__row"
                  role="radiogroup"
                  aria-label="Category"
                >
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

              <div className="b-liquidation-dates">
                <label className="fulls-printables-date">
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

                <label className="fulls-printables-date">
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
            </>
          )}
        </div>

        <button
          type="button"
          className="fulls-printables-print-btn fulls-printables-print-all"
          disabled={!dateFrom || !dateTo || loading || Boolean(loadError)}
          onClick={() => setPrinting(true)}
        >
          <PrintIcon />
          {loading ? 'Loading…' : 'Print'}
        </button>
      </div>

      {loadError ? <p className="catalog-error no-print">{loadError}</p> : null}

      {printing ? (
        <div className="fulls-print-sheet print-only b-liquidation-print-sheet" aria-hidden="true">
          <header className="fulls-print-sheet__header">
            <p className="fulls-print-sheet__company">The CMJ Corporation</p>
            <p className="fulls-print-sheet__branch">CMJ {catalogBranch}</p>
            <p className="fulls-print-sheet__title is-out">
              {selectedCategory} {modeTitle}
            </p>
            <p className="b-liquidation-print-summary">
              Summary Report [
              <span className="b-liquidation-print-summary__dates">
                {formatDisplayDate(dateFrom)} – {formatDisplayDate(dateTo)}
              </span>
              ]
            </p>
          </header>

          {summary ? (
            <>
              <BLiquidationPrintTables summary={summary} goodsLabel={goodsLabel} />
              <BLiquidationBreakdown
                category={selectedCategory}
                dateTo={dateTo}
                rows={productRemains}
                goodsLabel={goodsLabel}
                summaryRemain={summary.totalStockRemain}
              />
            </>
          ) : null}

          <div className="fulls-print-sheet__end" aria-hidden="true">
            <span className="fulls-print-sheet__end-line" />
            <span className="fulls-print-sheet__end-label">Nothing follows</span>
            <span className="fulls-print-sheet__end-line" />
          </div>
        </div>
      ) : null}
    </section>
  )
}
