import { useEffect, useMemo, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import {
  formatCustomerTxPlateDisplay,
  type CustomerTransactionCompany,
} from '../lib/customerTransaction'
import {
  listCustomerTransactionsWithItemsInRange,
  toIsoDateInput,
  type CustomerTxItemRecord,
  type CustomerTxRecord,
} from '../lib/customerTxSave'
import {
  listRouteSummariesByDate,
  salesNoForCompany,
  type RouteSummaryItemRecord,
  type RouteSummaryRecord,
} from '../lib/routeSummarySave'
import './DslPrintablesPanel.css'

type RouteDayRecord = {
  summary: RouteSummaryRecord
  items: RouteSummaryItemRecord[]
}

type CustomerDayRecord = {
  transaction: CustomerTxRecord
  items: CustomerTxItemRecord[]
}

type DslLiquidationRow = {
  key: string
  source: 'customer' | 'route'
  dateLabel: string
  salesNo: string
  truckCustomer: string
  cases: number
  salesAmt: number
  mtsReturn: number
  mtsAmt: number
  totalPayable: number
  cashAmt: number
  chequeAmt: number
  shortOver: number
  discount: number
  accounts: number
}

type ColumnTotals = {
  cases: number
  salesAmt: number
  mtsReturn: number
  mtsAmt: number
  totalPayable: number
  cashAmt: number
  shortOver: number
  discount: number
  accounts: number
  chequeAmt: number
  grandTotal: number
}

function PrintIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function formatGridDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate || '—'
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}

function formatLongDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate || '—'
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatIsoFromTimestamp(iso: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  if (match) return match[1]
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return toIsoDateInput()
  return toIsoDateInput(date)
}

function formatQty(value: number) {
  if (!Number.isFinite(value)) return '0.0'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0.00'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Short/Over print style: negatives in parentheses. */
function formatShortOver(value: number) {
  if (!Number.isFinite(value) || value === 0) return formatMoney(0)
  if (value < 0) return `(${formatMoney(Math.abs(value))})`
  return formatMoney(value)
}

function sumSectionQty(items: Array<{ section: string; quantity: number }>, section: string) {
  return items.reduce((sum, item) => {
    if (item.section !== section) return sum
    return sum + (Number(item.quantity) || 0)
  }, 0)
}

function sumCustomerDiscount(items: CustomerTxItemRecord[]) {
  return items.reduce((sum, item) => {
    if (item.section !== 'fulls') return sum
    const qty = Number(item.quantity) || 0
    const discount = Number(item.discount) || 0
    return sum + discount * qty
  }, 0)
}

function customerPaymentSplit(transaction: CustomerTxRecord) {
  const payment = Number(transaction.payment_amount) || 0
  const isCheque = Boolean(transaction.cash_cheque_no?.trim())
  return {
    cashAmt: isCheque ? 0 : payment,
    chequeAmt: isCheque ? payment : 0,
  }
}

function DslDayReportPrintSheet({
  company,
  branch,
  dateIso,
  rows,
  totals,
  active,
}: {
  company: CustomerTransactionCompany
  branch: UserBranch
  dateIso: string
  rows: DslLiquidationRow[]
  totals: ColumnTotals
  active: boolean
}) {
  return (
    <div className={`dsl-day-print${active ? ' is-active' : ''}`} aria-hidden={!active}>
      <header className="dsl-day-print__header">
        <p className="dsl-day-print__org">The CMJ Corporation</p>
        <h1>{company === 'Pepsi' ? 'PEPSI' : company.toUpperCase()}</h1>
        <h2>Daily Sales Liquidation ({branch})</h2>
        <p className="dsl-day-print__date">{formatLongDate(dateIso)}</p>
      </header>

      <table className="dsl-day-print__table">
        <thead>
          <tr>
            <th>Sales No</th>
            <th>Truck no / Customer</th>
            <th>No. of Case (Sales)</th>
            <th>Sales Amount</th>
            <th>No of Case (Mts ret)</th>
            <th>Mts Amount</th>
            <th>Total Payables</th>
            <th>Cash</th>
            <th>Short/ Over</th>
            <th>Discount</th>
            <th>Account</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="is-num">{row.salesNo}</td>
              <td className="is-name">{row.truckCustomer}</td>
              <td className="is-num">{formatQty(row.cases)}</td>
              <td className="is-num">{formatMoney(row.salesAmt)}</td>
              <td className="is-num">{formatQty(row.mtsReturn)}</td>
              <td className="is-num">{formatMoney(row.mtsAmt)}</td>
              <td className="is-num">{formatMoney(row.totalPayable)}</td>
              <td className="is-num">{formatMoney(row.cashAmt)}</td>
              <td className={`is-num${row.shortOver < 0 ? ' is-short' : ''}`}>
                {formatShortOver(row.shortOver)}
              </td>
              <td className="is-num">{row.discount ? formatMoney(row.discount) : ''}</td>
              <td className="is-num">{formatMoney(row.accounts)}</td>
            </tr>
          ))}
          <tr className="dsl-day-print__total-row">
            <td colSpan={2} className="is-total-label">
              Total :
            </td>
            <td className="is-num">{formatQty(totals.cases)}</td>
            <td className="is-num">{formatMoney(totals.salesAmt)}</td>
            <td className="is-num">{formatQty(totals.mtsReturn)}</td>
            <td className="is-num">{formatMoney(totals.mtsAmt)}</td>
            <td className="is-num">{formatMoney(totals.totalPayable)}</td>
            <td className="is-num">{formatMoney(totals.cashAmt)}</td>
            <td className={`is-num${totals.shortOver < 0 ? ' is-short-total' : ''}`}>
              {formatShortOver(totals.shortOver)}
            </td>
            <td className="is-num">{formatMoney(totals.discount)}</td>
            <td className="is-num">{formatMoney(totals.accounts)}</td>
          </tr>
        </tbody>
      </table>

      <div className="dsl-day-print__summary">
        <p className="dsl-day-print__summary-title">Liquidation for:</p>
        <p>
          Cash Amount = <strong>{formatMoney(totals.cashAmt)}</strong>
        </p>
        <p>
          Cheque Amount= <strong>{formatMoney(totals.chequeAmt)}</strong>
        </p>
        <hr />
        <p className="dsl-day-print__grand">
          <strong>{formatMoney(totals.grandTotal)}</strong>
        </p>
      </div>

      <div className="dsl-day-print__signs">
        <p>
          Prepared by: <strong>{branch}</strong>
        </p>
        <p>
          Checked by: <span className="dsl-day-print__line" />
        </p>
        <p>
          Received by: <span className="dsl-day-print__line" />
        </p>
      </div>
    </div>
  )
}

type DslPrintablesPanelProps = {
  branch?: UserBranch | null
  company?: CustomerTransactionCompany | null
  onClose?: () => void
}

export function DslPrintablesPanel({
  branch = 'Nabunturan',
  company = null,
  onClose,
}: DslPrintablesPanelProps) {
  const activeBranch = branch ?? 'Nabunturan'
  const selectedCompany = company ?? 'Pepsi'
  const [draftDate, setDraftDate] = useState(toIsoDateInput())
  const [appliedDate, setAppliedDate] = useState(toIsoDateInput())
  const [customerRecords, setCustomerRecords] = useState<CustomerDayRecord[]>([])
  const [routeRecords, setRouteRecords] = useState<RouteDayRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const [customerResult, routeResult] = await Promise.all([
        listCustomerTransactionsWithItemsInRange(
          activeBranch,
          appliedDate,
          appliedDate,
          selectedCompany,
        ),
        listRouteSummariesByDate(activeBranch, appliedDate, selectedCompany),
      ])
      if (cancelled) return

      setCustomerRecords(customerResult.data)
      setRouteRecords(routeResult.data)
      setError(customerResult.error ?? routeResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeBranch, appliedDate, selectedCompany])

  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => window.print(), 150)
    function onAfterPrint() {
      setPrinting(false)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [printing])

  const rows = useMemo((): DslLiquidationRow[] => {
    const next: DslLiquidationRow[] = []

    for (const { transaction, items } of customerRecords) {
      const payment = Number(transaction.payment_amount) || 0
      const payable = Number(transaction.payables_total) || 0
      const { cashAmt, chequeAmt } = customerPaymentSplit(transaction)
      const plate = formatCustomerTxPlateDisplay(transaction.truck_no, transaction.plate_no)
      const name = transaction.customer_name.trim() || '—'
      next.push({
        key: `customer-${transaction.id}`,
        source: 'customer',
        dateLabel: formatGridDate(
          formatIsoFromTimestamp(transaction.transaction_at || transaction.created_at),
        ),
        salesNo: transaction.sales_no || '—',
        truckCustomer: plate && plate !== '—' ? `${name} (${plate})` : name,
        cases: sumSectionQty(items, 'fulls'),
        salesAmt: Number(transaction.orders_total) || 0,
        mtsReturn: sumSectionQty(items, 'empties'),
        mtsAmt: Number(transaction.empties_total) || 0,
        totalPayable: payable,
        cashAmt,
        chequeAmt,
        shortOver: payment - payable,
        discount: sumCustomerDiscount(items),
        accounts: Math.max(0, payable - payment),
      })
    }

    for (const route of routeRecords) {
      const { summary, items } = route
      const companyItems = items.filter(
        (item) => !item.company || item.company === selectedCompany,
      )
      const cashAmt = Number(summary.cash_remittance) || 0
      const payable = Number(summary.sub_total) || 0
      next.push({
        key: `route-${summary.id}`,
        source: 'route',
        dateLabel: formatGridDate(summary.summary_date || appliedDate),
        salesNo: salesNoForCompany(summary, selectedCompany) || '—',
        truckCustomer: summary.route_area_name.trim() || summary.plate_no || '—',
        cases: sumSectionQty(companyItems, 'fulls'),
        salesAmt: Number(summary.total_sales) || 0,
        mtsReturn: sumSectionQty(companyItems, 'empties'),
        mtsAmt: Number(summary.ref_empties) || 0,
        totalPayable: payable,
        cashAmt,
        chequeAmt: 0,
        shortOver: Number(summary.short_over) || 0,
        discount: Number(summary.discount) || 0,
        accounts: Number(summary.account) || 0,
      })
    }

    return next.sort((a, b) => {
      const salesCmp = a.salesNo.localeCompare(b.salesNo, undefined, { numeric: true })
      if (salesCmp !== 0) return salesCmp
      return a.truckCustomer.localeCompare(b.truckCustomer)
    })
  }, [customerRecords, routeRecords, selectedCompany, appliedDate])

  useEffect(() => {
    setSelectedKey((prev) =>
      prev && rows.some((row) => row.key === prev) ? prev : (rows[0]?.key ?? null),
    )
  }, [rows])

  const totals = useMemo((): ColumnTotals => {
    const next: ColumnTotals = {
      cases: 0,
      salesAmt: 0,
      mtsReturn: 0,
      mtsAmt: 0,
      totalPayable: 0,
      cashAmt: 0,
      shortOver: 0,
      discount: 0,
      accounts: 0,
      chequeAmt: 0,
      grandTotal: 0,
    }
    for (const row of rows) {
      next.cases += row.cases
      next.salesAmt += row.salesAmt
      next.mtsReturn += row.mtsReturn
      next.mtsAmt += row.mtsAmt
      next.totalPayable += row.totalPayable
      next.cashAmt += row.cashAmt
      next.shortOver += row.shortOver
      next.discount += row.discount
      next.accounts += row.accounts
      next.chequeAmt += row.chequeAmt
    }
    next.grandTotal = next.cashAmt + next.chequeAmt
    return next
  }, [rows])

  function handleSearch() {
    setAppliedDate(draftDate || toIsoDateInput())
  }

  function handlePrint() {
    if (printing || loading || rows.length === 0) return
    setPrinting(true)
  }

  return (
    <>
      <section className="dsl-report no-print" aria-label="Daily Sales Liquidation">
        <div className="dsl-report__window">
          <header className="dsl-report__titlebar">
            <div>
              <h2>Daily Sales Liquidation</h2>
              <p>
                {activeBranch} · {selectedCompany}
              </p>
            </div>
            {onClose ? (
              <button type="button" className="dsl-report__close" onClick={onClose} aria-label="Close">
                ×
              </button>
            ) : null}
          </header>

          <div className="dsl-report__toolbar">
            <label className="dsl-report__date">
              <span>Date</span>
              <input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSearch()
                  }
                }}
              />
            </label>

            <button type="button" className="dsl-report__btn" onClick={handleSearch} disabled={loading}>
              <SearchIcon />
              Search
            </button>

            <div className="dsl-report__toolbar-spacer" />

            <button
              type="button"
              className="dsl-report__btn dsl-report__btn--print"
              disabled={loading || rows.length === 0 || printing}
              onClick={handlePrint}
            >
              <PrintIcon />
              Print
            </button>
          </div>

          {error ? <p className="dsl-report__error">{error}</p> : null}

          <div className="dsl-report__board">
            {loading ? <p className="dsl-report__empty">Loading liquidation…</p> : null}

            {!loading && rows.length === 0 ? (
              <div className="dsl-report__empty-card">
                <p className="dsl-report__empty-title">No Data</p>
                <p>
                  No {selectedCompany} customer or route sales for {formatGridDate(appliedDate)} on{' '}
                  {activeBranch}.
                </p>
              </div>
            ) : null}

            {!loading && rows.length > 0 ? (
              <div className="dsl-report__table-wrap">
                <table className="dsl-report__table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sales no</th>
                      <th>Truck no/Customer name</th>
                      <th>No. of case</th>
                      <th>Sales Amt</th>
                      <th>Mts return</th>
                      <th>Mts Amt</th>
                      <th>Total Payable(s)</th>
                      <th>Cash Amt</th>
                      <th>Short/Over</th>
                      <th>Discount</th>
                      <th>Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const selected = row.key === selectedKey
                      return (
                        <tr
                          key={row.key}
                          className={selected ? 'is-selected' : undefined}
                          tabIndex={0}
                          onClick={() => setSelectedKey(row.key)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedKey(row.key)
                            }
                          }}
                        >
                          <td>{row.dateLabel}</td>
                          <td>{row.salesNo}</td>
                          <td className="is-name">{row.truckCustomer}</td>
                          <td className="is-num">{formatQty(row.cases)}</td>
                          <td className="is-num">{formatMoney(row.salesAmt)}</td>
                          <td className="is-num">{formatQty(row.mtsReturn)}</td>
                          <td className="is-num">{formatMoney(row.mtsAmt)}</td>
                          <td className="is-num">{formatMoney(row.totalPayable)}</td>
                          <td className="is-num">{formatMoney(row.cashAmt)}</td>
                          <td
                            className={
                              row.shortOver < 0
                                ? 'is-num is-short'
                                : row.shortOver > 0
                                  ? 'is-num is-over'
                                  : 'is-num'
                            }
                          >
                            {formatShortOver(row.shortOver)}
                          </td>
                          <td className="is-num">
                            {row.discount ? formatMoney(row.discount) : ''}
                          </td>
                          <td className="is-num">{formatMoney(row.accounts)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <aside className="dsl-report__liquidation" aria-label="Liquidation for">
            <div className="dsl-report__liquidation-tab">Liquidation for</div>
            <div className="dsl-report__liquidation-body">
              <p>
                Cash amt = <strong>{formatMoney(totals.cashAmt)}</strong>
              </p>
              <p>
                Cheque Amt = <strong>{formatMoney(totals.chequeAmt)}</strong>
              </p>
              <hr />
              <p className="dsl-report__grand">{formatMoney(totals.grandTotal)}</p>
            </div>
          </aside>
        </div>
      </section>

      <div className="dsl-day-print-root print-only" aria-hidden={!printing}>
        <DslDayReportPrintSheet
          company={selectedCompany}
          branch={activeBranch}
          dateIso={appliedDate}
          rows={rows}
          totals={totals}
          active={printing}
        />
      </div>
    </>
  )
}
