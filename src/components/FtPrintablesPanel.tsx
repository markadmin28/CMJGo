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

const CATEGORIES: InventoryCategory[] = ['PCPPI', 'SMC', 'Magnolia']

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

export function FtPrintablesPanel() {
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('PCPPI')
  const [filterDate, setFilterDate] = useState(todayIsoDate())
  const [records, setRecords] = useState<FactoryTransactionRecord[]>([])
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
        setError(result.error)
        setLoading(false)
        return
      }

      setRecords(result.data)

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
    setPrintingId(record.id)
    setError(null)
    const sheets = await loadPrintData([record.id])
    setPrintingId(null)
    if (!sheets) return
    setPrintRecords(sheets)
  }

  async function handlePrintAll() {
    if (records.length === 0) return
    setPrintingId('all')
    setError(null)
    const sheets = await loadPrintData(records.map((record) => record.id))
    setPrintingId(null)
    if (!sheets) return
    setPrintRecords(sheets)
  }

  return (
    <section className="printables-panel ft-printables fulls-printables" aria-label="FT Printables">
      <header className="printables-panel__head fulls-printables-head no-print">
        <h1>FT Printables</h1>
      </header>

      <div className="fulls-printables-filters-row no-print">
        <div className="fulls-printables-filters">
          <fieldset className="fulls-printables-categories">
            <legend>Category</legend>
            <div className="fulls-printables-categories__row" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((category) => {
                const checked = selectedCategory === category
                return (
                  <label
                    key={category}
                    className={
                      checked ? 'fulls-printables-check is-checked' : 'fulls-printables-check'
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
          disabled={loading || records.length === 0 || printingId === 'all'}
          onClick={() => void handlePrintAll()}
        >
          <PrintIcon />
          {printingId === 'all' ? 'Preparing…' : 'Print all'}
        </button>
      </div>

      {error ? <p className="catalog-error no-print">{error}</p> : null}
      {loading ? <p className="catalog-empty no-print">Loading records…</p> : null}

      {!loading && records.length === 0 ? (
        <div className="printables-panel__empty no-print">
          <p className="printables-panel__empty-title">No records found</p>
          <p>
            No {selectedCategory} Factory Transaction records for {filterDate}.
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
                <th>Driver</th>
                <th>Helper</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.plate_no || '—'}</td>
                  <td>{record.load_no || '—'}</td>
                  <td>{record.driver || '—'}</td>
                  <td>{record.helper || '—'}</td>
                  <td className="fg-row-actions">
                    <button
                      type="button"
                      className="fulls-printables-print-btn"
                      disabled={printingId === record.id}
                      onClick={() => void handlePrintRecord(record)}
                    >
                      <PrintIcon />
                      {printingId === record.id ? 'Preparing…' : 'Print'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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
