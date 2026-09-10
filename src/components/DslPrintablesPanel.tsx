import { useEffect, useMemo, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import {
  formatCustomerTxPlateDisplay,
  formatLedgerMoney,
  type CustomerTransactionCompany,
} from '../lib/customerTransaction'
import {
  buildCustomerTxPrintSheetData,
  type CustomerTxPrintSheetData,
} from '../lib/customerTxPrint'
import {
  getCustomerTransactionDetail,
  listCustomerTransactionsByDate,
  toIsoDateInput,
  type CustomerTxRecord,
} from '../lib/customerTxSave'
import { listFullGoodsMovements } from '../lib/fullGoods'
import { buildRouteSummaryPrintSheetData } from '../lib/routeSummaryPrint'
import {
  listRouteSummariesByDate,
  salesNoForCompany,
  type RouteSummaryItemRecord,
  type RouteSummaryRecord,
} from '../lib/routeSummarySave'
import { formatRouteMoney } from '../lib/routeTransaction'
import type { FullGoodsMovement } from '../types/fullGoods'
import { CustomerTransactionPrintSheet } from './CustomerTransactionPrintSheet'
import {
  RouteSummaryPrintSheet,
  type RouteSummaryPrintSheetData,
} from './RouteSummaryPrintSheet'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'
import './RoutePrintablesPanel.css'
import './DslPrintablesPanel.css'

const PRINTABLE_COMPANIES = [
  { label: 'PEPSI', company: 'Pepsi' as const },
  { label: 'SMC', company: 'SMC' as const },
  { label: 'MAGNOLIA', company: 'Magnolia' as const },
] as const

type RouteDayRecord = {
  summary: RouteSummaryRecord
  items: RouteSummaryItemRecord[]
}

type DslListRow =
  | {
      key: string
      source: 'customer'
      sourceLabel: string
      refNo: string
      detail: string
      meta: string
      amountLabel: string
      customer: CustomerTxRecord
    }
  | {
      key: string
      source: 'route'
      sourceLabel: string
      refNo: string
      detail: string
      meta: string
      amountLabel: string
      route: RouteDayRecord
    }
  | {
      key: string
      source: 'fullsDailyIn' | 'emptiesDailyIn' | 'emptiesDailyOut'
      sourceLabel: string
      refNo: string
      detail: string
      meta: string
      amountLabel: string
      movement: FullGoodsMovement
      movementMode: 'fulls' | 'empties'
    }

type DslPrintJob =
  | { kind: 'customer'; data: CustomerTxPrintSheetData }
  | { kind: 'route'; data: RouteSummaryPrintSheetData }
  | { kind: 'movement'; movement: FullGoodsMovement; mode: 'fulls' | 'empties' }

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

function normalizeName(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function matchesCompanyMovement(
  movement: FullGoodsMovement,
  company: CustomerTransactionCompany,
  mode: 'fulls' | 'empties',
) {
  const category = normalizeName(movement.category_name)
  const brand = normalizeName(movement.brand_name)
  const haystack = `${category} ${brand}`
  const isEmptiesCategory =
    category === 'empties' ||
    category.includes('mts') ||
    brand.includes('mts') ||
    haystack.includes('empties')

  if (mode === 'fulls') {
    if (isEmptiesCategory) return false
  } else if (!isEmptiesCategory) {
    return false
  }

  if (company === 'Pepsi') {
    if (mode === 'fulls') {
      return (
        category === 'pcppi' ||
        category === 'pc' ||
        category.includes('pepsi') ||
        category.startsWith('pcppi ')
      )
    }
    return haystack.includes('pepsi')
  }
  if (company === 'SMC') return haystack.includes('smc')
  return haystack.includes('magnolia') || haystack.includes('magnoia')
}

function movementCases(movement: FullGoodsMovement) {
  return (movement.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
}

function DslMovementPrintSheet({
  movement,
  mode,
  active,
}: {
  movement: FullGoodsMovement
  mode: 'fulls' | 'empties'
  active: boolean
}) {
  const goodsLabel = mode === 'empties' ? 'Empties' : 'Full Goods'
  const titleName = (
    mode === 'empties'
      ? movement.brand_name || movement.category_name || goodsLabel
      : movement.category_name || goodsLabel
  ).trim()
  const items = (movement.items ?? []).filter((item) => Number(item.quantity) !== 0)
  const total = movementCases(movement)

  return (
    <div
      className={`fulls-print-sheet${active ? '' : ''}`}
      aria-hidden={!active}
    >
      <header className="fulls-print-sheet__header">
        <p className="fulls-print-sheet__company">The CMJ Corporation</p>
        <p className="fulls-print-sheet__branch">CMJ {movement.branch || 'Nabunturan'}</p>
        <p
          className={
            movement.movement_type === 'in'
              ? 'fulls-print-sheet__title is-in'
              : 'fulls-print-sheet__title is-out'
          }
        >
          {titleName} {goodsLabel} {movement.movement_type === 'in' ? 'In' : 'Out'}
        </p>
      </header>

      <div className="fulls-print-sheet__body">
        <dl className="fulls-print-meta">
          <div className="fulls-print-meta__row">
            <dt>Date</dt>
            <dd>{movement.movement_date}</dd>
          </div>
          <div className="fulls-print-meta__row">
            <dt>Plate no.</dt>
            <dd>{movement.truck_number || '—'}</dd>
          </div>
          <div className="fulls-print-meta__row">
            <dt>Load no.</dt>
            <dd>{movement.load_number || '—'}</dd>
          </div>
          <div className="fulls-print-meta__row">
            <dt>Location</dt>
            <dd>{movement.location || '—'}</dd>
          </div>
        </dl>

        <div className="fulls-print-items-wrap">
          <table className="fulls-print-items">
            <thead>
              <tr>
                <th>{mode === 'empties' ? 'Empties' : 'Fulls'}</th>
                <th>No. of cases</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={2}>No items</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="fulls-print-items-total">
            <span>Total</span>
            <strong>{total}</strong>
          </div>
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

function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type DslPrintablesPanelProps = {
  branch?: UserBranch | null
}

export function DslPrintablesPanel({ branch = 'Nabunturan' }: DslPrintablesPanelProps) {
  const activeBranch = branch ?? 'Nabunturan'
  const [selectedCompany, setSelectedCompany] = useState<CustomerTransactionCompany>('Pepsi')
  const [filterDate, setFilterDate] = useState(toIsoDateInput())
  const [customerRecords, setCustomerRecords] = useState<CustomerTxRecord[]>([])
  const [routeRecords, setRouteRecords] = useState<RouteDayRecord[]>([])
  const [movements, setMovements] = useState<FullGoodsMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [printJobs, setPrintJobs] = useState<DslPrintJob[]>([])
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const [customerResult, routeResult, movementsResult] = await Promise.all([
        listCustomerTransactionsByDate(activeBranch, filterDate, selectedCompany),
        listRouteSummariesByDate(activeBranch, filterDate, selectedCompany),
        listFullGoodsMovements(activeBranch),
      ])
      if (cancelled) return

      setCustomerRecords(customerResult.data)
      setRouteRecords(routeResult.data)
      setMovements(
        (movementsResult.data ?? []).filter(
          (row) => (row.branch || 'Nabunturan') === activeBranch && row.movement_date === filterDate,
        ),
      )
      setError(customerResult.error ?? routeResult.error ?? movementsResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeBranch, filterDate, selectedCompany])

  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => window.print(), 150)
    function onAfterPrint() {
      setPrinting(false)
      setPrintJobs([])
      setPrintingId(null)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [printing])

  const fullsDailyIn = useMemo(
    () =>
      movements.filter(
        (row) =>
          row.movement_type === 'in' && matchesCompanyMovement(row, selectedCompany, 'fulls'),
      ),
    [movements, selectedCompany],
  )

  const emptiesDailyIn = useMemo(
    () =>
      movements.filter(
        (row) =>
          row.movement_type === 'in' && matchesCompanyMovement(row, selectedCompany, 'empties'),
      ),
    [movements, selectedCompany],
  )

  const emptiesDailyOut = useMemo(
    () =>
      movements.filter(
        (row) =>
          row.movement_type === 'out' && matchesCompanyMovement(row, selectedCompany, 'empties'),
      ),
    [movements, selectedCompany],
  )

  const rows = useMemo((): DslListRow[] => {
    const next: DslListRow[] = []

    for (const customer of customerRecords) {
      next.push({
        key: `customer-${customer.id}`,
        source: 'customer',
        sourceLabel: 'Customer TX',
        refNo: customer.sales_no || '—',
        detail: customer.customer_name || '—',
        meta: formatCustomerTxPlateDisplay(customer.truck_no, customer.plate_no),
        amountLabel: formatLedgerMoney(Number(customer.payables_total) || 0),
        customer,
      })
    }

    for (const route of routeRecords) {
      next.push({
        key: `route-${route.summary.id}`,
        source: 'route',
        sourceLabel: 'Route TX',
        refNo: salesNoForCompany(route.summary, selectedCompany) || '—',
        detail: route.summary.route_area_name || '—',
        meta: route.summary.plate_no || '—',
        amountLabel: formatRouteMoney(Number(route.summary.total_sales) || 0),
        route,
      })
    }

    for (const movement of fullsDailyIn) {
      next.push({
        key: `fulls-in-${movement.id}`,
        source: 'fullsDailyIn',
        sourceLabel: 'Fulls Daily In',
        refNo: movement.load_number || '—',
        detail: movement.location || movement.category_name || '—',
        meta: movement.truck_number || '—',
        amountLabel: `${movementCases(movement)} cs`,
        movement,
        movementMode: 'fulls',
      })
    }

    for (const movement of emptiesDailyIn) {
      next.push({
        key: `empties-in-${movement.id}`,
        source: 'emptiesDailyIn',
        sourceLabel: 'Empties Daily In',
        refNo: movement.load_number || '—',
        detail: movement.location || movement.brand_name || movement.category_name || '—',
        meta: movement.truck_number || '—',
        amountLabel: `${movementCases(movement)} cs`,
        movement,
        movementMode: 'empties',
      })
    }

    for (const movement of emptiesDailyOut) {
      next.push({
        key: `empties-out-${movement.id}`,
        source: 'emptiesDailyOut',
        sourceLabel: 'Empties Daily Out',
        refNo: movement.load_number || '—',
        detail: movement.location || movement.brand_name || movement.category_name || '—',
        meta: movement.truck_number || '—',
        amountLabel: `${movementCases(movement)} cs`,
        movement,
        movementMode: 'empties',
      })
    }

    return next
  }, [
    customerRecords,
    routeRecords,
    fullsDailyIn,
    emptiesDailyIn,
    emptiesDailyOut,
    selectedCompany,
  ])

  useEffect(() => {
    setSelectedKey((prev) =>
      prev && rows.some((row) => row.key === prev) ? prev : (rows[0]?.key ?? null),
    )
  }, [rows])

  const counts = useMemo(
    () => ({
      customer: customerRecords.length,
      route: routeRecords.length,
      fullsDailyIn: fullsDailyIn.length,
      emptiesDailyIn: emptiesDailyIn.length,
      emptiesDailyOut: emptiesDailyOut.length,
    }),
    [
      customerRecords.length,
      routeRecords.length,
      fullsDailyIn.length,
      emptiesDailyIn.length,
      emptiesDailyOut.length,
    ],
  )

  async function buildCustomerJob(record: CustomerTxRecord) {
    const detail = await getCustomerTransactionDetail(record.id)
    if (detail.error || !detail.data) {
      return { job: null as DslPrintJob | null, error: detail.error }
    }
    return {
      job: {
        kind: 'customer' as const,
        data: buildCustomerTxPrintSheetData(detail.data.transaction, detail.data.items),
      },
      error: null as string | null,
    }
  }

  function buildRouteJob(record: RouteDayRecord): DslPrintJob {
    return {
      kind: 'route',
      data: buildRouteSummaryPrintSheetData(record.summary, record.items),
    }
  }

  function buildMovementJob(
    movement: FullGoodsMovement,
    mode: 'fulls' | 'empties',
  ): DslPrintJob {
    return { kind: 'movement', movement, mode }
  }

  async function printRow(row: DslListRow) {
    if (printing || printingId) return
    setPrintingId(row.key)
    setError(null)

    if (row.source === 'customer') {
      const result = await buildCustomerJob(row.customer)
      setPrintingId(null)
      if (result.error || !result.job) {
        setError(result.error ?? 'Failed to load customer transaction for printing.')
        return
      }
      setPrintJobs([result.job])
      setPrinting(true)
      return
    }

    if (row.source === 'route') {
      setPrintingId(null)
      setPrintJobs([buildRouteJob(row.route)])
      setPrinting(true)
      return
    }

    setPrintingId(null)
    setPrintJobs([buildMovementJob(row.movement, row.movementMode)])
    setPrinting(true)
  }

  async function printAll() {
    if (printing || printingId || rows.length === 0) return
    setPrintingId('all')
    setError(null)
    const jobs: DslPrintJob[] = []

    for (const customer of customerRecords) {
      const result = await buildCustomerJob(customer)
      if (result.error || !result.job) {
        setPrintingId(null)
        setError(result.error ?? `Failed to load sales ${customer.sales_no} for printing.`)
        return
      }
      jobs.push(result.job)
    }
    for (const route of routeRecords) {
      jobs.push(buildRouteJob(route))
    }
    for (const movement of fullsDailyIn) {
      jobs.push(buildMovementJob(movement, 'fulls'))
    }
    for (const movement of emptiesDailyIn) {
      jobs.push(buildMovementJob(movement, 'empties'))
    }
    for (const movement of emptiesDailyOut) {
      jobs.push(buildMovementJob(movement, 'empties'))
    }

    setPrintingId(null)
    setPrintJobs(jobs)
    setPrinting(true)
  }

  const companyLabel =
    PRINTABLE_COMPANIES.find((entry) => entry.company === selectedCompany)?.label ??
    selectedCompany

  return (
    <>
      <section
        className="printables-panel fulls-printables route-printables dsl-printables"
        aria-label="DSL Printables"
      >
        <header className="route-printables__titlebar no-print">
          <h1>DSL Printables</h1>
        </header>

        <div className="route-printables__toolbar no-print">
          <fieldset className="route-printables__companies">
            <legend className="visually-hidden">Company</legend>
            <div
              className="route-printables__companies-row"
              role="radiogroup"
              aria-label="Company"
            >
              {PRINTABLE_COMPANIES.map((entry) => {
                const checked = selectedCompany === entry.company
                return (
                  <label
                    key={entry.company}
                    className={
                      checked
                        ? 'route-printables__radio is-checked'
                        : 'route-printables__radio'
                    }
                  >
                    <input
                      type="radio"
                      name="dsl-printables-company"
                      checked={checked}
                      onChange={() => setSelectedCompany(entry.company)}
                    />
                    <span>{entry.label}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="route-printables__date">
            <span className="visually-hidden">Date</span>
            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="fulls-printables-print-btn fulls-printables-print-all"
            disabled={loading || rows.length === 0 || Boolean(printingId) || printing}
            onClick={() => void printAll()}
          >
            <PrintIcon />
            Print all
          </button>
        </div>

        <div className="dsl-printables__summary no-print" aria-label="Day source counts">
          <span>Customer TX {counts.customer}</span>
          <span>Route TX {counts.route}</span>
          <span>Fulls Daily In {counts.fullsDailyIn}</span>
          <span>Empties Daily In {counts.emptiesDailyIn}</span>
          <span>Empties Daily Out {counts.emptiesDailyOut}</span>
        </div>

        {error ? <p className="catalog-error no-print">{error}</p> : null}

        <div className="route-printables__board no-print">
          {loading ? <p className="catalog-empty">Loading day transactions…</p> : null}

          {!loading && rows.length === 0 ? (
            <div className="route-printables__empty">
              <p className="route-printables__empty-title">No Data</p>
              <p>
                No {companyLabel} customer, route, or daily goods transactions for{' '}
                {formatDisplayDate(filterDate)} on {activeBranch}.
              </p>
            </div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <div className="route-printables__table-wrap">
              <table className="route-printables__table dsl-printables__table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Ref / Sales No.</th>
                    <th>Detail</th>
                    <th>Plate / Truck</th>
                    <th>Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const busy = printingId === row.key || printingId === 'all'
                    const selected = row.key === selectedKey
                    return (
                      <tr
                        key={row.key}
                        className={selected ? 'is-selected' : undefined}
                        tabIndex={0}
                        onClick={() => setSelectedKey(row.key)}
                        onDoubleClick={() => void printRow(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedKey(row.key)
                          }
                        }}
                      >
                        <td>
                          <span
                            className={`dsl-printables__source dsl-printables__source--${row.source}`}
                          >
                            {row.sourceLabel}
                          </span>
                        </td>
                        <td>{row.refNo}</td>
                        <td>{row.detail}</td>
                        <td>{row.meta}</td>
                        <td className="is-money">{row.amountLabel}</td>
                        <td className="is-actions">
                          <button
                            type="button"
                            className="fulls-printables-print-btn"
                            disabled={busy || printing}
                            onClick={(event) => {
                              event.stopPropagation()
                              void printRow(row)
                            }}
                          >
                            <PrintIcon />
                            {busy ? '…' : 'Print'}
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
      </section>

      {printJobs.length > 0 ? (
        <div className="dsl-printables-batch print-only" aria-hidden={!printing}>
          {printJobs.map((job, index) => {
            const followed = index < printJobs.length - 1
            if (job.kind === 'customer') {
              return (
                <div
                  key={`customer-${job.data.salesNo}-${index}`}
                  className={
                    followed
                      ? 'ctx-printables-batch__item ctx-printables-batch__item--followed'
                      : 'ctx-printables-batch__item'
                  }
                >
                  <CustomerTransactionPrintSheet
                    data={job.data}
                    active={printing}
                    showNothingFollows
                    layout="dsl"
                  />
                </div>
              )
            }
            if (job.kind === 'route') {
              return (
                <div
                  key={`route-${job.data.salesNo}-${job.data.routeAreaName}-${index}`}
                  className={
                    followed
                      ? 'rsu-printables-batch__item rsu-printables-batch__item--followed'
                      : 'rsu-printables-batch__item'
                  }
                >
                  <RouteSummaryPrintSheet
                    data={job.data}
                    active={printing}
                    variant="liquidation"
                    layout="dsl"
                  />
                </div>
              )
            }
            return (
              <div
                key={`movement-${job.movement.id}-${index}`}
                className={followed ? 'fulls-print-sheet--followed-wrap' : undefined}
              >
                <DslMovementPrintSheet
                  movement={job.movement}
                  mode={job.mode}
                  active={printing}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </>
  )
}
