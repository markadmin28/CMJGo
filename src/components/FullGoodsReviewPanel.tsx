import { useEffect, useMemo, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import { listCatalogTree, type CatalogTreeCategory } from '../lib/catalog'
import { customerTxToPrintableMovement } from '../lib/customerTxAsMovement'
import { listCustomerTransactionsWithItemsInRange } from '../lib/customerTxSave'
import { listFullGoodsMovements, listLocations } from '../lib/fullGoods'
import { routeSummaryToPrintableMovement } from '../lib/routeSummaryAsMovement'
import { listRouteSummariesWithItemsInRange } from '../lib/routeSummarySave'
import type { FullGoodsMovement, FullGoodsMovementType } from '../types/fullGoods'
import './FullGoodsReviewPanel.css'

type ReviewCompany = 'Pepsi' | 'SMC' | 'Magnolia'
type ReviewMode = 'fullGoods' | 'empties'

type FullGoodsReviewPanelProps = {
  branch?: UserBranch | null
  mode?: ReviewMode
  onClose?: () => void
}

type ReviewRow = {
  id: string
  date: string
  loadNo: string
  truckNo: string
  location: string
  totalCases: number
  quantities: Record<string, number>
}

const COMPANIES: Array<{ label: string; value: ReviewCompany }> = [
  { label: 'PEPSI', value: 'Pepsi' },
  { label: 'SMC', value: 'SMC' },
  { label: 'MAGNOLIA', value: 'Magnolia' },
]

function todayIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function monthStartIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function normalizeCategoryName(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isEmptiesLikeMovement(movement: FullGoodsMovement) {
  const categoryName = normalizeCategoryName(movement.category_name)
  const brandName = normalizeCategoryName(movement.brand_name)
  return (
    categoryName === 'empties' ||
    categoryName.includes('mts') ||
    brandName.includes('mts')
  )
}

function matchesReviewMovement(
  movement: FullGoodsMovement,
  company: ReviewCompany,
  mode: ReviewMode,
) {
  const categoryName = normalizeCategoryName(movement.category_name)
  const brandName = normalizeCategoryName(movement.brand_name)
  const haystack = `${categoryName} ${brandName}`

  if (mode === 'fullGoods') {
    if (isEmptiesLikeMovement(movement) || categoryName === 'pallets') return false
    if (company === 'Pepsi') {
      return (
        categoryName === 'pcppi' ||
        categoryName === 'pc' ||
        categoryName.startsWith('pcppi') ||
        (categoryName.includes('pepsi') && !categoryName.includes('mts'))
      )
    }
    if (company === 'SMC') {
      return categoryName.includes('smc') && !categoryName.includes('mts')
    }
    return (
      (categoryName.includes('magnolia') || categoryName.includes('magnoia')) &&
      !categoryName.includes('mts')
    )
  }

  if (!isEmptiesLikeMovement(movement)) return false
  if (company === 'Pepsi') return haystack.includes('pepsi')
  if (company === 'SMC') return haystack.includes('smc')
  return haystack.includes('magnolia') || haystack.includes('magnoia')
}

function isEmptiesCategory(name: string) {
  return normalizeCategoryName(name) === 'empties'
}

function isPalletsCategory(name: string) {
  return normalizeCategoryName(name) === 'pallets'
}

function reviewCategoryLabel(company: ReviewCompany, movementMode: 'fulls' | 'empties') {
  if (movementMode === 'empties') {
    if (company === 'Pepsi') return 'Pepsi MTS'
    if (company === 'SMC') return 'SMC MTS'
    return 'Magnolia MTS'
  }
  if (company === 'Pepsi') return 'PCPPI'
  if (company === 'SMC') return 'SMC'
  return 'Magnolia'
}

function withMovementId(movement: FullGoodsMovement, id: string): FullGoodsMovement {
  return { ...movement, id }
}

function hasMovementItems(movement: FullGoodsMovement) {
  return (movement.items ?? []).some((item) => Number(item.quantity) !== 0)
}

function mergeMovementsById(base: FullGoodsMovement[], extra: FullGoodsMovement[]) {
  const byId = new Map<string, FullGoodsMovement>()
  for (const row of base) byId.set(row.id, row)
  for (const row of extra) {
    if (!hasMovementItems(row)) continue
    byId.set(row.id, row)
  }
  return [...byId.values()]
}

function collectCatalogProducts(
  tree: CatalogTreeCategory[],
  company: ReviewCompany,
  mode: ReviewMode,
) {
  const names: string[] = []
  const seen = new Set<string>()

  function pushName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(trimmed)
  }

  if (mode === 'empties') {
    const empties = tree.find((category) => isEmptiesCategory(category.name))
    const tabs = empties?.subcategories ?? []
    for (const tab of tabs) {
      const tabName = normalizeCategoryName(tab.name)
      const matchesCompany =
        company === 'Pepsi'
          ? tabName.includes('pepsi')
          : company === 'SMC'
            ? tabName.includes('smc')
            : tabName.includes('magnolia') || tabName.includes('magnoia')
      if (!matchesCompany) continue
      for (const product of tab.products) pushName(product.name)
    }
    return names
  }

  for (const category of tree) {
    const categoryName = normalizeCategoryName(category.name)
    if (isEmptiesCategory(category.name) || isPalletsCategory(category.name)) continue
    const matchesCompany =
      company === 'Pepsi'
        ? categoryName === 'pcppi' ||
          categoryName === 'pc' ||
          categoryName.startsWith('pcppi') ||
          (categoryName.includes('pepsi') && !categoryName.includes('mts'))
        : company === 'SMC'
          ? categoryName.includes('smc') && !categoryName.includes('mts')
          : (categoryName.includes('magnolia') || categoryName.includes('magnoia')) &&
            !categoryName.includes('mts')
    if (!matchesCompany) continue
    for (const sub of category.subcategories) {
      for (const product of sub.products) {
        // Nabunturan Pepsi full goods: show subcategory with product (e.g. "Mirinda · 1.5L").
        if (company === 'Pepsi') {
          const brand = sub.name.trim()
          pushName(brand ? `${brand} · ${product.name.trim()}` : product.name)
        } else {
          pushName(product.name)
        }
      }
    }
  }

  return names
}

function resolveReviewProductKey(
  item: { product_name: string; brand_name?: string | null },
  products: string[],
  company: ReviewCompany,
  mode: ReviewMode,
) {
  const name = item.product_name.trim()
  if (!name) return ''

  if (mode === 'fullGoods' && company === 'Pepsi') {
    const brand = (item.brand_name ?? '').trim()
    const labeled = brand ? `${brand} · ${name}` : name
    const exact = products.find((product) => product.toLowerCase() === labeled.toLowerCase())
    if (exact) return exact
    const byProductOnly = products.find((product) => {
      const lower = product.toLowerCase()
      const needle = name.toLowerCase()
      return lower === needle || lower.endsWith(` · ${needle}`)
    })
    if (byProductOnly) return byProductOnly
    return labeled
  }

  return products.find((product) => product.toLowerCase() === name.toLowerCase()) ?? name
}

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso || '—'
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatQty(value: number) {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })
}

function formatQtyAlways(value: number) {
  return formatQty(value)
}

function csvEscape(value: string | number) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function FullGoodsReviewPanel({
  branch = 'Nabunturan',
  mode = 'fullGoods',
  onClose,
}: FullGoodsReviewPanelProps) {
  const isEmptiesMode = mode === 'empties'
  const reviewTitle = isEmptiesMode ? 'Empties review' : 'Full goods review'
  const goodsLabel = isEmptiesMode ? 'empties' : 'full goods'
  const [company, setCompany] = useState<ReviewCompany>('Pepsi')
  const [movementType, setMovementType] = useState<FullGoodsMovementType>('in')
  const [includeInfo, setIncludeInfo] = useState(true)
  const [fromDate, setFromDate] = useState(monthStartIsoDate)
  const [toDate, setToDate] = useState(todayIsoDate)
  const [locationFilter, setLocationFilter] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [catalogTree, setCatalogTree] = useState<CatalogTreeCategory[]>([])
  const [allMovements, setAllMovements] = useState<FullGoodsMovement[]>([])
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [productColumns, setProductColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasViewed, setHasViewed] = useState(false)

  useEffect(() => {
    setHasViewed(false)
    setRows([])
    setProductColumns([])
  }, [mode, company, movementType, fromDate, toDate, locationFilter])

  useEffect(() => {
    let cancelled = false

    async function loadBase() {
      setLoading(true)
      setError(null)
      const catalogBranch = branch ?? 'Nabunturan'
      const historyEnd = todayIsoDate()
      const [movementsResult, locationsResult, catalogResult, customerResult, routeResult] =
        await Promise.all([
          listFullGoodsMovements(catalogBranch),
          listLocations(catalogBranch),
          listCatalogTree(catalogBranch, { forTransactions: true }),
          listCustomerTransactionsWithItemsInRange(catalogBranch, '2020-01-01', historyEnd),
          listRouteSummariesWithItemsInRange(catalogBranch, '2020-01-01', historyEnd),
        ])
      if (cancelled) return

      let nextMovements = (movementsResult.data ?? []).filter(
        (row) => (row.branch || catalogBranch) === catalogBranch,
      )

      const txMovements: FullGoodsMovement[] = []
      for (const { transaction, items } of customerResult.data) {
        const txCompany = transaction.company as ReviewCompany
        if (txCompany !== 'Pepsi' && txCompany !== 'SMC' && txCompany !== 'Magnolia') continue
        const fulls = customerTxToPrintableMovement(
          transaction,
          items,
          'fulls',
          reviewCategoryLabel(txCompany, 'fulls'),
        )
        const empties = customerTxToPrintableMovement(
          transaction,
          items,
          'empties',
          reviewCategoryLabel(txCompany, 'empties'),
        )
        txMovements.push(
          withMovementId(fulls, `${transaction.id}:customer:fulls`),
          withMovementId(empties, `${transaction.id}:customer:empties`),
        )
      }

      for (const { summary, items } of routeResult.data) {
        for (const routeCompany of COMPANIES.map((row) => row.value)) {
          const fulls = routeSummaryToPrintableMovement(
            summary,
            items,
            'fulls',
            reviewCategoryLabel(routeCompany, 'fulls'),
            routeCompany,
          )
          const empties = routeSummaryToPrintableMovement(
            summary,
            items,
            'empties',
            reviewCategoryLabel(routeCompany, 'empties'),
            routeCompany,
          )
          if (fulls) txMovements.push(fulls)
          if (empties) txMovements.push(empties)
        }
      }

      nextMovements = mergeMovementsById(nextMovements, txMovements)

      const firstError =
        movementsResult.error ??
        (catalogResult.error && !catalogResult.missingTable ? catalogResult.error : null) ??
        customerResult.error ??
        routeResult.error
      setError(firstError)
      setAllMovements(nextMovements)
      setCatalogTree(catalogResult.data)

      const scoped = nextMovements.filter((movement) =>
        isEmptiesMode ? isEmptiesLikeMovement(movement) : !isEmptiesLikeMovement(movement),
      )
      const names = [
        ...new Set(
          [
            ...(locationsResult.data ?? []).map((row) => row.name.trim()),
            ...scoped.map((row) => row.location.trim()),
          ].filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b))
      setLocations(names)
      setLoading(false)
    }

    void loadBase()
    return () => {
      cancelled = true
    }
  }, [branch, isEmptiesMode])

  function buildRows() {
    const from = fromDate || '0000-01-01'
    const to = toDate || '9999-12-31'
    const filtered = allMovements
      .filter((movement) => movement.movement_type === movementType)
      .filter((movement) => matchesReviewMovement(movement, company, mode))
      .filter((movement) => movement.movement_date >= from && movement.movement_date <= to)
      .filter((movement) =>
        locationFilter ? movement.location.trim().toLowerCase() === locationFilter.toLowerCase() : true,
      )
      .slice()
      .sort((a, b) => {
        const dateCmp = a.movement_date.localeCompare(b.movement_date)
        if (dateCmp !== 0) return dateCmp
        return a.created_at.localeCompare(b.created_at)
      })

    const catalogProducts = collectCatalogProducts(catalogTree, company, mode)
    const productSet = new Map<string, string>()
    for (const name of catalogProducts) {
      productSet.set(name.toLowerCase(), name)
    }
    // Keep any extra product names that appear on saved rows but are missing from catalog.
    for (const movement of filtered) {
      for (const item of movement.items ?? []) {
        const key = resolveReviewProductKey(item, catalogProducts, company, mode)
        if (!key) continue
        const lower = key.toLowerCase()
        if (!productSet.has(lower)) productSet.set(lower, key)
      }
    }
    const products = [
      ...catalogProducts,
      ...Array.from(productSet.values()).filter(
        (name) => !catalogProducts.some((catalogName) => catalogName.toLowerCase() === name.toLowerCase()),
      ),
    ]

    const nextRows: ReviewRow[] = filtered.map((movement) => {
      const quantities: Record<string, number> = {}
      for (const product of products) quantities[product] = 0
      let totalCases = 0
      for (const item of movement.items ?? []) {
        const matched = resolveReviewProductKey(item, products, company, mode)
        if (!matched) continue
        const qty = Number(item.quantity) || 0
        quantities[matched] = (quantities[matched] ?? 0) + qty
        totalCases += qty
      }
      return {
        id: movement.id,
        date: movement.movement_date,
        loadNo: movement.load_number || '—',
        truckNo: movement.truck_number?.trim() || 'N/A',
        location: movement.location || '—',
        totalCases,
        quantities,
      }
    })

    setProductColumns(products)
    setRows(nextRows)
    setHasViewed(true)
  }

  function handleView() {
    setViewing(true)
    setError(null)
    try {
      buildRows()
    } finally {
      setViewing(false)
    }
  }

  const totals = useMemo(() => {
    const productTotals: Record<string, number> = {}
    let totalCases = 0
    for (const row of rows) {
      totalCases += row.totalCases
      for (const product of productColumns) {
        productTotals[product] = (productTotals[product] ?? 0) + (row.quantities[product] ?? 0)
      }
    }
    return { totalCases, productTotals }
  }, [rows, productColumns])

  const rowsWithRunning = useMemo(() => {
    let running = 0
    return rows.map((row) => {
      running += row.totalCases
      return { ...row, runningTotal: running }
    })
  }, [rows])

  function handleExport() {
    if (!hasViewed) {
      buildRows()
    }
    const headers = [
      ...(includeInfo ? ['Date', 'Load no', 'Truck no', 'Location'] : ['Date', 'Load no']),
      'Running total',
      'Total # of cases',
      ...productColumns,
    ]

    const exportRows = (() => {
      let running = 0
      return rows.map((row) => {
        running += row.totalCases
        return [
          ...(includeInfo
            ? [formatDisplayDate(row.date), row.loadNo, row.truckNo, row.location]
            : [formatDisplayDate(row.date), row.loadNo]),
          formatQtyAlways(running),
          formatQtyAlways(row.totalCases),
          ...productColumns.map((product) => formatQtyAlways(row.quantities[product] ?? 0)),
        ]
      })
    })()

    const totalLine = [
      ...(includeInfo ? ['TOTAL', '', '', ''] : ['TOTAL', '']),
      formatQtyAlways(totals.totalCases),
      formatQtyAlways(totals.totalCases),
      ...productColumns.map((product) => formatQtyAlways(totals.productTotals[product] ?? 0)),
    ]

    const csv = [headers, totalLine, ...exportRows]
      .map((line) => line.map(csvEscape).join(','))
      .join('\n')

    const blob = new Blob([`\ufeff${csv}`], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${isEmptiesMode ? 'empties' : 'full-goods'}-review-${company.toLowerCase()}-${movementType}-${fromDate}-to-${toDate}.xls`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const locationLabel = movementType === 'in' ? 'From Location' : 'To Location'

  return (
    <section className="fg-review no-print" aria-label={reviewTitle}>
      <div className="fg-review__window">
        <header className="fg-review__titlebar">
          <div>
            <h2>{reviewTitle}</h2>
            <p>
              {branch} · {company}
              {isEmptiesMode ? ' MTS' : ''} · {movementType.toUpperCase()}
            </p>
          </div>
          {onClose ? (
            <button type="button" className="fg-review__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </header>

        <div className="fg-review__toolbar">
          <fieldset className="fg-review__radios">
            <legend className="visually-hidden">Company</legend>
            {COMPANIES.map((option) => (
              <label key={option.value} className="fg-review__radio">
                <input
                  type="radio"
                  name={`fg-review-company-${mode}`}
                  checked={company === option.value}
                  onChange={() => setCompany(option.value)}
                />
                <span>
                  {option.label}
                  {isEmptiesMode ? ' MTS' : ''}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="fg-review__radios">
            <legend className="visually-hidden">Movement</legend>
            {(['in', 'out'] as const).map((type) => (
              <label key={type} className="fg-review__radio">
                <input
                  type="radio"
                  name={`fg-review-type-${mode}`}
                  checked={movementType === type}
                  onChange={() => setMovementType(type)}
                />
                <span>{type.toUpperCase()}</span>
              </label>
            ))}
          </fieldset>

          <label className="fg-review__check">
            <input
              type="checkbox"
              checked={includeInfo}
              onChange={(event) => setIncludeInfo(event.target.checked)}
            />
            <span>Include informations</span>
          </label>

          <div className="fg-review__actions">
            <button
              type="button"
              className="fg-review__btn fg-review__btn--view"
              onClick={handleView}
              disabled={loading || viewing}
            >
              {viewing ? 'Loading…' : 'View'}
            </button>
            <button
              type="button"
              className="fg-review__btn fg-review__btn--export"
              onClick={handleExport}
              disabled={loading || (!hasViewed && rows.length === 0)}
            >
              Export to Excel
            </button>
          </div>
        </div>

        <div className="fg-review__filters">
          <label className="fg-review__field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="fg-review__field">
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="fg-review__field fg-review__field--wide">
            <span>Filter by location</span>
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
            >
              <option value="">All locations</option>
              {locations.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="fg-review__body">
          {loading ? <p className="fg-review__status">Loading {goodsLabel} records…</p> : null}
          {error ? <p className="fg-review__error">{error}</p> : null}
          {!loading && !error && !hasViewed ? (
            <p className="fg-review__status">
              Choose company, IN/OUT, and date range, then click <strong>View</strong>.
            </p>
          ) : null}
          {!loading && !error && hasViewed && rows.length === 0 ? (
            <p className="fg-review__status">No {goodsLabel} records match these filters.</p>
          ) : null}

          {!loading && !error && hasViewed && rows.length > 0 ? (
            <div className="fg-review__table-wrap">
              <table className="fg-review__table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Load no</th>
                    {includeInfo ? <th>Truck no</th> : null}
                    {includeInfo ? <th>{locationLabel}</th> : null}
                    <th>Running total</th>
                    <th>Total # of cases</th>
                    {productColumns.map((product) => (
                      <th key={product}>{product}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="fg-review__totals">
                    <td colSpan={includeInfo ? 4 : 2}>TOTAL</td>
                    <td className="fg-review__num">{formatQtyAlways(totals.totalCases)}</td>
                    <td className="fg-review__num">{formatQtyAlways(totals.totalCases)}</td>
                    {productColumns.map((product) => (
                      <td key={product} className="fg-review__num">
                        {formatQtyAlways(totals.productTotals[product] ?? 0)}
                      </td>
                    ))}
                  </tr>
                  {rowsWithRunning.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDisplayDate(row.date)}</td>
                      <td>{row.loadNo}</td>
                      {includeInfo ? <td>{row.truckNo}</td> : null}
                      {includeInfo ? <td>{row.location}</td> : null}
                      <td className="fg-review__num">{formatQtyAlways(row.runningTotal)}</td>
                      <td className="fg-review__num">{formatQtyAlways(row.totalCases)}</td>
                      {productColumns.map((product) => (
                        <td key={product} className="fg-review__num">
                          {formatQtyAlways(row.quantities[product] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
