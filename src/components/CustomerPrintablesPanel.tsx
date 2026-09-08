import { useEffect, useState } from 'react'
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
import { CustomerTransactionPrintSheet } from './CustomerTransactionPrintSheet'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'
import './CustomerPrintablesPanel.css'

const PRINTABLE_COMPANIES = [
  { label: 'PEPSI', company: 'Pepsi' as const },
  { label: 'SMC', company: 'SMC' as const },
  { label: 'MAGNOLIA', company: 'Magnolia' as const },
] as const

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

function formatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
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

type CustomerPrintablesPanelProps = {
  branch?: UserBranch | null
}

export function CustomerPrintablesPanel({ branch = 'Nabunturan' }: CustomerPrintablesPanelProps) {
  const activeBranch = branch ?? 'Nabunturan'
  const [selectedCompany, setSelectedCompany] = useState<CustomerTransactionCompany>('Pepsi')
  const [filterDate, setFilterDate] = useState(toIsoDateInput())
  const [records, setRecords] = useState<CustomerTxRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [printBatch, setPrintBatch] = useState<CustomerTxPrintSheetData[]>([])
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await listCustomerTransactionsByDate(
        activeBranch,
        filterDate,
        selectedCompany,
      )
      if (cancelled) return
      setRecords(result.data)
      setSelectedId((prev) =>
        prev && result.data.some((row) => row.id === prev)
          ? prev
          : (result.data[0]?.id ?? null),
      )
      setError(result.error)
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
      setPrintBatch([])
      setPrintingId(null)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [printing])

  async function loadPrintData(record: CustomerTxRecord) {
    const detail = await getCustomerTransactionDetail(record.id)
    if (detail.error || !detail.data) {
      return { data: null as CustomerTxPrintSheetData | null, error: detail.error }
    }
    return {
      data: buildCustomerTxPrintSheetData(detail.data.transaction, detail.data.items),
      error: null as string | null,
    }
  }

  async function printOne(record: CustomerTxRecord) {
    if (printing || printingId) return
    setPrintingId(record.id)
    setError(null)
    const result = await loadPrintData(record)
    setPrintingId(null)
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to load record for printing.')
      return
    }
    setPrintBatch([result.data])
    setPrinting(true)
  }

  async function printAll() {
    if (printing || printingId || records.length === 0) return
    setPrintingId('all')
    setError(null)
    const sheets: CustomerTxPrintSheetData[] = []
    for (const record of records) {
      const result = await loadPrintData(record)
      if (result.error || !result.data) {
        setPrintingId(null)
        setError(result.error ?? `Failed to load sales ${record.sales_no} for printing.`)
        return
      }
      sheets.push(result.data)
    }
    setPrintingId(null)
    setPrintBatch(sheets)
    setPrinting(true)
  }

  const companyLabel =
    PRINTABLE_COMPANIES.find((entry) => entry.company === selectedCompany)?.label ??
    selectedCompany

  return (
    <>
      <section
        className="printables-panel fulls-printables customer-printables"
        aria-label="Customer Printables for the day"
      >
        <header className="customer-printables__titlebar no-print">
          <h1>Customer Printables for the day</h1>
        </header>

        <div className="customer-printables__toolbar no-print">
          <fieldset className="customer-printables__companies">
            <legend className="visually-hidden">Company</legend>
            <div
              className="customer-printables__companies-row"
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
                        ? 'customer-printables__radio is-checked'
                        : 'customer-printables__radio'
                    }
                  >
                    <input
                      type="radio"
                      name="customer-printables-company"
                      checked={checked}
                      onChange={() => setSelectedCompany(entry.company)}
                    />
                    <span>{entry.label}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="customer-printables__date">
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
            disabled={loading || records.length === 0 || Boolean(printingId) || printing}
            onClick={() => void printAll()}
          >
            <PrintIcon />
            Print all
          </button>
        </div>

        {error ? <p className="catalog-error no-print">{error}</p> : null}

        <div className="customer-printables__board no-print">
          {loading ? <p className="catalog-empty">Loading customer transactions…</p> : null}

          {!loading && records.length === 0 ? (
            <div className="customer-printables__empty">
              <p className="customer-printables__empty-title">No Data</p>
              <p>
                No {companyLabel} customer transactions for {formatDisplayDate(filterDate)} on{' '}
                {activeBranch}.
              </p>
            </div>
          ) : null}

          {!loading && records.length > 0 ? (
            <div className="customer-printables__table-wrap">
              <table className="customer-printables__table">
                <thead>
                  <tr>
                    <th>Sales No.</th>
                    <th>Customer</th>
                    <th>Invoice</th>
                    <th>Truck / Plate</th>
                    <th>Payables</th>
                    <th>Time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const busy = printingId === record.id || printingId === 'all'
                    const selected = record.id === selectedId
                    return (
                      <tr
                        key={record.id}
                        className={selected ? 'is-selected' : undefined}
                        tabIndex={0}
                        onClick={() => setSelectedId(record.id)}
                        onDoubleClick={() => void printOne(record)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedId(record.id)
                          }
                        }}
                      >
                        <td>{record.sales_no}</td>
                        <td>{record.customer_name || '—'}</td>
                        <td>{record.invoice_no || '—'}</td>
                        <td>
                          {formatCustomerTxPlateDisplay(record.truck_no, record.plate_no)}
                        </td>
                        <td className="is-money">
                          {formatLedgerMoney(Number(record.payables_total) || 0)}
                        </td>
                        <td>{formatTime(record.transaction_at)}</td>
                        <td className="is-actions">
                          <button
                            type="button"
                            className="fulls-printables-print-btn"
                            disabled={busy || printing}
                            onClick={(event) => {
                              event.stopPropagation()
                              void printOne(record)
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

      {printBatch.length > 0 ? (
        <div className="ctx-printables-batch print-only" aria-hidden={!printing}>
          {printBatch.map((sheet, index) => (
            <div
              key={`${sheet.salesNo}-${index}`}
              className={
                index < printBatch.length - 1
                  ? 'ctx-printables-batch__item ctx-printables-batch__item--followed'
                  : 'ctx-printables-batch__item'
              }
            >
              <CustomerTransactionPrintSheet
                data={sheet}
                active={printing}
                showNothingFollows
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
