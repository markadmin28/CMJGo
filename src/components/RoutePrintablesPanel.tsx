import { useEffect, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import type { CustomerTransactionCompany } from '../lib/customerTransaction'
import { toIsoDateInput } from '../lib/customerTxSave'
import { buildRouteSummaryPrintSheetData } from '../lib/routeSummaryPrint'
import {
  listRouteSummariesByDate,
  salesNoForCompany,
  type RouteSummaryItemRecord,
  type RouteSummaryRecord,
} from '../lib/routeSummarySave'
import { formatRouteMoney } from '../lib/routeTransaction'
import {
  RouteSummaryPrintSheet,
  type RouteSummaryPrintSheetData,
} from './RouteSummaryPrintSheet'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'
import './RoutePrintablesPanel.css'

const PRINTABLE_COMPANIES = [
  { label: 'PEPSI', company: 'Pepsi' as const },
  { label: 'SMC', company: 'SMC' as const },
  { label: 'MAGNOLIA', company: 'Magnolia' as const },
] as const

type RouteDayRecord = {
  summary: RouteSummaryRecord
  items: RouteSummaryItemRecord[]
}

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

function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type RoutePrintablesPanelProps = {
  branch?: UserBranch | null
  /** Panel title shown in the blue title bar. */
  heading?: string
}

export function RoutePrintablesPanel({
  branch = 'Nabunturan',
  heading = 'Route Printables for the day',
}: RoutePrintablesPanelProps) {
  const activeBranch = branch ?? 'Nabunturan'
  const [selectedCompany, setSelectedCompany] = useState<CustomerTransactionCompany>('Pepsi')
  const [filterDate, setFilterDate] = useState(toIsoDateInput())
  const [records, setRecords] = useState<RouteDayRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [printBatch, setPrintBatch] = useState<RouteSummaryPrintSheetData[]>([])
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await listRouteSummariesByDate(
        activeBranch,
        filterDate,
        selectedCompany,
      )
      if (cancelled) return
      setRecords(result.data)
      setSelectedId((prev) =>
        prev && result.data.some((row) => row.summary.id === prev)
          ? prev
          : (result.data[0]?.summary.id ?? null),
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

  function printOne(record: RouteDayRecord) {
    if (printing || printingId) return
    setError(null)
    setPrintBatch([buildRouteSummaryPrintSheetData(record.summary, record.items)])
    setPrinting(true)
  }

  function printAll() {
    if (printing || printingId || records.length === 0) return
    setError(null)
    setPrintBatch(
      records.map((record) =>
        buildRouteSummaryPrintSheetData(record.summary, record.items),
      ),
    )
    setPrinting(true)
  }

  const companyLabel =
    PRINTABLE_COMPANIES.find((entry) => entry.company === selectedCompany)?.label ??
    selectedCompany

  return (
    <>
      <section
        className="printables-panel fulls-printables route-printables"
        aria-label={heading}
      >
        <header className="route-printables__titlebar no-print">
          <h1>{heading}</h1>
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
                      name="route-printables-company"
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
            disabled={loading || records.length === 0 || Boolean(printingId) || printing}
            onClick={() => printAll()}
          >
            <PrintIcon />
            Print all
          </button>
        </div>

        {error ? <p className="catalog-error no-print">{error}</p> : null}

        <div className="route-printables__board no-print">
          {loading ? <p className="catalog-empty">Loading route summaries…</p> : null}

          {!loading && records.length === 0 ? (
            <div className="route-printables__empty">
              <p className="route-printables__empty-title">No Data</p>
              <p>
                No {companyLabel} route printables for {formatDisplayDate(filterDate)} on{' '}
                {activeBranch}.
              </p>
            </div>
          ) : null}

          {!loading && records.length > 0 ? (
            <div className="route-printables__table-wrap">
              <table className="route-printables__table">
                <thead>
                  <tr>
                    <th>Sales No.</th>
                    <th>Route / Area</th>
                    <th>Plate</th>
                    <th>Driver</th>
                    <th>Ahente</th>
                    <th>Total Sales</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const { summary } = record
                    const busy = printingId === summary.id || printingId === 'all'
                    const selected = summary.id === selectedId
                    return (
                      <tr
                        key={summary.id}
                        className={selected ? 'is-selected' : undefined}
                        tabIndex={0}
                        onClick={() => setSelectedId(summary.id)}
                        onDoubleClick={() => printOne(record)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedId(summary.id)
                          }
                        }}
                      >
                        <td>{salesNoForCompany(summary, selectedCompany) || '—'}</td>
                        <td>{summary.route_area_name || '—'}</td>
                        <td>{summary.plate_no || '—'}</td>
                        <td>{summary.driver || '—'}</td>
                        <td>{summary.ahente || '—'}</td>
                        <td className="is-money">
                          {formatRouteMoney(Number(summary.total_sales) || 0)}
                        </td>
                        <td className="is-actions">
                          <button
                            type="button"
                            className="fulls-printables-print-btn"
                            disabled={busy || printing}
                            onClick={(event) => {
                              event.stopPropagation()
                              printOne(record)
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
        <div className="rsu-printables-batch print-only" aria-hidden={!printing}>
          {printBatch.map((sheet, index) => (
            <div
              key={`${sheet.salesNo}-${sheet.routeAreaName}-${index}`}
              className={
                index < printBatch.length - 1
                  ? 'rsu-printables-batch__item rsu-printables-batch__item--followed'
                  : 'rsu-printables-batch__item'
              }
            >
              <RouteSummaryPrintSheet
                data={sheet}
                active={printing}
                variant="liquidation"
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
