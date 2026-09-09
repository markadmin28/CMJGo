import { useEffect, useState } from 'react'
import {
  getFactoryTransactionDetail,
  listFactoryTransactionsByDate,
  type FactoryTransactionDetail,
  type FactoryTransactionRecord,
} from '../lib/factoryTransaction'
import {
  buildFactoryTransactionPrintData,
  buildFactoryTransactionRunningTotalsById,
  emptyFactoryTransactionRunningTotals,
  type FactoryTransactionPrintData,
} from '../lib/factoryTransactionPrint'
import type { InventoryCategory } from '../lib/inventoryPreview'
import { FactoryTransactionPrintablesSheet } from './FactoryTransactionPrintablesSheet'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'
import './FtPrintablesPanel.css'

const CATEGORIES: { label: string; value: InventoryCategory }[] = [
  { label: 'PCPPI', value: 'PCPPI' },
  { label: 'SMC', value: 'SMC' },
  { label: 'MAGNOLIA', value: 'Magnolia' },
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function FtPrintablesPanel() {
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('PCPPI')
  const [filterDate, setFilterDate] = useState(todayIsoDate())
  const [records, setRecords] = useState<FactoryTransactionRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dayDetails, setDayDetails] = useState<FactoryTransactionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [printRecords, setPrintRecords] = useState<FactoryTransactionPrintData[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await listFactoryTransactionsByDate(selectedCategory, filterDate)
      if (cancelled) return

      if (result.error) {
        setRecords([])
        setDayDetails([])
        setSelectedId(null)
        setError(result.error)
        setLoading(false)
        return
      }

      setRecords(result.data)
      setSelectedId((prev) =>
        prev && result.data.some((row) => row.id === prev)
          ? prev
          : (result.data[0]?.id ?? null),
      )

      if (result.data.length === 0) {
        setDayDetails([])
        setLoading(false)
        return
      }

      const detailResults = await Promise.all(
        result.data.map((record) => getFactoryTransactionDetail(record.id)),
      )
      if (cancelled) return

      const details = detailResults
        .filter((entry) => entry.data)
        .map((entry) => entry.data as FactoryTransactionDetail)

      const detailError = detailResults.find((entry) => entry.error)?.error
      setDayDetails(details)
      setError(detailError ?? null)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [selectedCategory, filterDate])

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

  async function loadPrintData(recordIds: string[]) {
    const runningById = buildFactoryTransactionRunningTotalsById(dayDetails)
    const sheets: FactoryTransactionPrintData[] = []

    // Print in chronological order so running totals increase page by page.
    const orderedIds = [...recordIds].sort((a, b) => {
      const detailA = dayDetails.find((detail) => detail.transaction.id === a)
      const detailB = dayDetails.find((detail) => detail.transaction.id === b)
      const createdA = detailA?.transaction.created_at ?? ''
      const createdB = detailB?.transaction.created_at ?? ''
      const byCreated = createdA.localeCompare(createdB)
      if (byCreated !== 0) return byCreated
      return a.localeCompare(b)
    })

    for (const id of orderedIds) {
      const runningTotals =
        runningById.get(id) ?? emptyFactoryTransactionRunningTotals()
      const cached = dayDetails.find((detail) => detail.transaction.id === id)
      if (cached) {
        sheets.push(buildFactoryTransactionPrintData(selectedCategory, cached, runningTotals))
        continue
      }

      const result = await getFactoryTransactionDetail(id)
      if (result.error || !result.data) {
        setError(result.error ?? 'Failed to load record for printing.')
        return null
      }
      sheets.push(
        buildFactoryTransactionPrintData(selectedCategory, result.data, runningTotals),
      )
    }

    return sheets
  }

  async function handlePrintRecord(record: FactoryTransactionRecord) {
    if (printingId) return
    setPrintingId(record.id)
    setError(null)
    const sheets = await loadPrintData([record.id])
    setPrintingId(null)
    if (!sheets) return
    setPrintRecords(sheets)
  }

  async function handlePrintAll() {
    if (records.length === 0 || printingId) return
    setPrintingId('all')
    setError(null)
    const sheets = await loadPrintData(records.map((record) => record.id))
    setPrintingId(null)
    if (!sheets) return
    setPrintRecords(sheets)
  }

  const categoryLabel =
    CATEGORIES.find((entry) => entry.value === selectedCategory)?.label ?? selectedCategory

  return (
    <section
      className="printables-panel fulls-printables ft-printables"
      aria-label="FT Printables for the day"
    >
      <header className="ft-printables__titlebar no-print">
        <h1>FT Printables for the day</h1>
      </header>

      <div className="ft-printables__toolbar no-print">
        <fieldset className="ft-printables__companies">
          <legend className="visually-hidden">Category</legend>
          <div
            className="ft-printables__companies-row"
            role="radiogroup"
            aria-label="Category"
          >
            {CATEGORIES.map((entry) => {
              const checked = selectedCategory === entry.value
              return (
                <label
                  key={entry.value}
                  className={
                    checked ? 'ft-printables__radio is-checked' : 'ft-printables__radio'
                  }
                >
                  <input
                    type="radio"
                    name="ft-printables-category"
                    checked={checked}
                    onChange={() => setSelectedCategory(entry.value)}
                  />
                  <span>{entry.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <label className="ft-printables__date">
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
          disabled={loading || records.length === 0 || Boolean(printingId)}
          onClick={() => void handlePrintAll()}
        >
          <PrintIcon />
          {printingId === 'all' ? 'Preparing…' : 'Print all'}
        </button>
      </div>

      {error ? <p className="catalog-error no-print">{error}</p> : null}

      <div className="ft-printables__board no-print">
        {loading ? <p className="catalog-empty">Loading factory transactions…</p> : null}

        {!loading && records.length === 0 ? (
          <div className="ft-printables__empty">
            <p className="ft-printables__empty-title">No Data</p>
            <p>
              No {categoryLabel} Factory Transaction records for {formatDisplayDate(filterDate)}.
            </p>
          </div>
        ) : null}

        {!loading && records.length > 0 ? (
          <div className="ft-printables__table-wrap">
            <table className="ft-printables__table">
              <thead>
                <tr>
                  <th>Plate no.</th>
                  <th>Load no.</th>
                  <th>Driver</th>
                  <th>Helper</th>
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
                      onDoubleClick={() => void handlePrintRecord(record)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedId(record.id)
                        }
                      }}
                    >
                      <td>{record.plate_no || '—'}</td>
                      <td>{record.load_no || '—'}</td>
                      <td>{record.driver || '—'}</td>
                      <td>{record.helper || '—'}</td>
                      <td className="is-actions">
                        <button
                          type="button"
                          className="fulls-printables-print-btn"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handlePrintRecord(record)
                          }}
                        >
                          <PrintIcon />
                          {printingId === record.id ? '…' : 'Print'}
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

      {printRecords.length > 0 ? (
        <div className="ft-print-batch print-only" aria-hidden="true">
          {printRecords.map((record, index) => (
            <FactoryTransactionPrintablesSheet
              key={`${record.plateNo}-${record.loadNo}-${index}`}
              data={record}
              isLast={index === printRecords.length - 1}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
