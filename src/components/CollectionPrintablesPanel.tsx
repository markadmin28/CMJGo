import { useEffect, useMemo, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import { toIsoDateInput } from '../lib/customerTxSave'
import {
  getDiscountBreakdownDetail,
  listDiscountBreakdownsInRange,
} from '../lib/discountBreakdown'
import {
  collectionDisplayTid,
  getMtsCollectionDetail,
  listMtsCollectionsByDate,
  mtsLedgerLabel,
  type MtsCollectionItemRecord,
  type MtsCollectionRecord,
  type MtsLedgerKind,
} from '../lib/mtsCollections'
import {
  CollectionPrintSheet,
  type CollectionPrintSheetData,
} from './CollectionPrintSheet'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './RoutePrintablesPanel.css'
import './CollectionPrintablesPanel.css'

type CollectionPrintablesPanelProps = {
  branch?: UserBranch | null
  onClose?: () => void
}

type PrintableRow = {
  key: string
  source: 'mts' | 'discount'
  id: string
  createdAt: string
  fromName: string
  colType: string
  tid: string
  kind?: MtsLedgerKind
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${year}`
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
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

function formatQty(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

const MTS_STYLE_SLIP_KINDS: ReadonlySet<MtsLedgerKind> = new Set([
  'mts_collections',
  'mts_fund',
  'fulls_return',
  'pallets_return',
  'pallets_payables',
])

function normalizePrintLabel(value?: string) {
  return (value ?? '').toUpperCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
}

function printSheetTitle(kind?: MtsLedgerKind, fallback = 'COLLECTION') {
  switch (kind) {
    case 'mts_collections':
      return 'MTS COLLECTIONS'
    case 'mts_fund':
      return 'MTS FUND'
    case 'fulls_return':
      return 'FULLS RETURN'
    case 'fulls_return_lacking':
      return 'FULLS RETURN WITH LACKING/MISSING'
    case 'pallets_return':
      return 'PALLETS RETURN'
    case 'pallets_payables':
      return 'PALLETS PAYABLES'
    case 'cash_payment':
      return 'CASH PAYMENT'
    case 'cash_payment_for_short':
      return 'CASH PAYMENT FOR SHORT'
    case 'cheque_payment':
      return 'CHEQUE PAYMENT'
    case 'account_route':
      return 'ACCOUNT ROUTE'
    case 'other_collection':
      return 'OTHERS'
    default:
      return normalizePrintLabel(fallback || mtsLedgerLabel(kind)) || 'COLLECTION'
  }
}

function formatSlashDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}

function resolvePrintLayout(
  kind?: MtsLedgerKind,
  colType?: string,
):
  | 'default'
  | 'slip'
  | 'slip_lacking'
  | 'slip_cash'
  | 'slip_cash_short'
  | 'slip_cheque'
  | 'slip_account' {
  if (kind === 'fulls_return_lacking') return 'slip_lacking'
  if (kind === 'cash_payment' || kind === 'other_collection') return 'slip_cash'
  if (kind === 'cash_payment_for_short') return 'slip_cash_short'
  if (kind === 'cheque_payment') return 'slip_cheque'
  if (kind === 'account_route') return 'slip_account'
  if (kind && MTS_STYLE_SLIP_KINDS.has(kind)) return 'slip'

  const label = normalizePrintLabel(colType)
  if (
    label.includes('FULLS RETURN WITH LACKING') ||
    label.includes('FULLS RET W/LACKING') ||
    (label.includes('FULLS') && label.includes('LACKING'))
  ) {
    return 'slip_lacking'
  }
  if (label.includes('ACCOUNT ROUTE') || label.includes('ACC ROUTE') || label === 'ACC ROUTE') {
    return 'slip_account'
  }
  if (label.includes('CHEQUE PAYMENT')) {
    return 'slip_cheque'
  }
  if (label.includes('CASH PAYMENT') && label.includes('SHORT')) {
    return 'slip_cash_short'
  }
  if (label.includes('CASH PAYMENT') || label === 'OTHERS' || label.includes('OTHER COLLECTION')) {
    return 'slip_cash'
  }
  if (
    label.includes('MTS COLLECTIONS') ||
    label.includes('MTS FUND') ||
    label.includes('FULLS RETURN') ||
    label.includes('FULL RET') ||
    label.includes('PALLET')
  ) {
    return 'slip'
  }
  return 'default'
}

function paymentForLabel(row: MtsCollectionRecord) {
  const parts = [
    row.payment_pc ? `PC # ${row.payment_pc}` : '',
    row.payment_smc ? `SMC # ${row.payment_smc}` : '',
    row.payment_mag ? `MAG. # ${row.payment_mag}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function buildMtsPrintLines(kind: MtsLedgerKind | undefined, items: MtsCollectionItemRecord[]) {
  if (kind === 'fulls_return_lacking') {
    return items.map((item) => ({
      label: item.description || '—',
      qty: formatQty(Number(item.qty) || 0),
      unit: item.unit,
      amount: String(Number(item.lacking) || 0),
      total: String(Number(item.lacking) || 0),
      lacking: String(Number(item.lacking) || 0),
      remarks: item.remarks || '',
    }))
  }
  if (kind === 'cash_payment_for_short') {
    return items.map((item) => {
      const lineDate = (item.remarks || '').trim()
      return {
        label: lineDate ? formatSlashDate(lineDate) : item.description || '—',
        amount: money(Number(item.total_amount) || Number(item.price) || 0),
        total: money(Number(item.total_amount) || Number(item.price) || 0),
      }
    })
  }
  if (kind === 'cash_payment' || kind === 'other_collection') {
    return items.map((item) => {
      const note = (item.description || '').trim()
      return {
        label: note || (kind === 'cash_payment' ? 'Cash' : ''),
        amount: money(Number(item.total_amount) || Number(item.price) || 0),
        total: money(Number(item.total_amount) || Number(item.price) || 0),
        extra: item.remarks || undefined,
      }
    })
  }
  if (kind === 'cheque_payment') {
    return items.map((item) => {
      const dueDate = (item.remarks || '').trim()
      return {
        label: item.description || '—',
        amount: money(Number(item.total_amount) || Number(item.price) || 0),
        total: money(Number(item.total_amount) || Number(item.price) || 0),
        remarks: dueDate ? formatSlashDate(dueDate) : '',
      }
    })
  }
  return items.map((item) => ({
    label: item.description || '—',
    qty: formatQty(Number(item.qty) || 0),
    unit: item.unit,
    amount: money(Number(item.price) || 0),
    total: money(Number(item.total_amount) || 0),
  }))
}

async function buildPrintSheet(
  row: PrintableRow,
  branchLabel: string,
): Promise<{ data: CollectionPrintSheetData | null; error: string | null }> {
  if (row.source === 'discount') {
    const detail = await getDiscountBreakdownDetail(row.id)
    if (detail.error || !detail.data) {
      return { data: null, error: detail.error ?? 'Failed to load discount breakdown.' }
    }
    const lines: CollectionPrintSheetData['lines'] = []
    let grandQty = 0
    for (const customer of detail.data.customers) {
      let customerQty = 0
      let customerTotal = 0
      for (const item of customer.items) {
        const qty = Number(item.qty) || 0
        const total = Number(item.total_amount) || 0
        customerQty += qty
        customerTotal += total
        grandQty += qty
        lines.push({
          kind: 'line',
          label: customer.customer_name || '—',
          qty: formatQty(qty),
          unit: item.unit || '',
          description: 'DISCOUNT',
          amount: money(Number(item.discount) || 0),
          total: money(total),
        })
      }
      if (customer.items.length > 0) {
        lines.push({
          kind: 'subtotal',
          label: '',
          qty: formatQty(customerQty),
          amount: '',
          total: money(customerTotal),
        })
      }
    }
    return {
      data: {
        id: row.id,
        title: 'DISCOUNT BREAKDOWN',
        branchLabel,
        dateLabel: formatDisplayDate(detail.data.breakdown.transaction_date),
        dateTimeLabel: formatDateTime(detail.data.breakdown.created_at),
        fromName: detail.data.breakdown.plate_no?.trim() || '—',
        tid: row.tid,
        layout: 'slip_discount',
        plateNo: detail.data.breakdown.plate_no?.trim() || undefined,
        qtyTotalLabel: grandQty.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        lines,
        totalLabel: money(Number(detail.data.breakdown.total_amount) || 0),
      },
      error: null,
    }
  }

  const detail = await getMtsCollectionDetail(row.id, row.kind)
  if (detail.error || !detail.data) {
    return { data: null, error: detail.error ?? 'Failed to load collection.' }
  }
  const collection = detail.data.collection
  const kind = (row.kind ?? collection.kind) as MtsLedgerKind | undefined
  const cash = Number(collection.cash_amount) || 0
  const total = Number(collection.total_amount) || 0
  const qtyTotal = detail.data.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
  const title = printSheetTitle(kind, row.colType || mtsLedgerLabel(kind))
  const layout = resolvePrintLayout(kind, row.colType || title)
  const qtyTotalLabel =
    layout === 'default' ||
    layout === 'slip_cash' ||
    layout === 'slip_cash_short' ||
    layout === 'slip_cheque'
      ? undefined
      : qtyTotal.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  const routeBalance = cash - total
  return {
    data: {
      id: row.id,
      title,
      branchLabel,
      dateLabel: formatDisplayDate(collection.collection_date),
      dateTimeLabel: formatDateTime(collection.created_at || row.createdAt),
      fromName: collection.from_name || '—',
      tid: row.tid,
      layout,
      paymentFor:
        layout === 'default' ? paymentForLabel(collection) || undefined : undefined,
      paymentPc: collection.payment_pc?.trim() || undefined,
      paymentSmc: collection.payment_smc?.trim() || undefined,
      paymentMag: collection.payment_mag?.trim() || undefined,
      plateNo: collection.plate_no?.trim() || undefined,
      cashAmount: kind === 'account_route' ? money(cash) : undefined,
      balance:
        kind === 'account_route' ? money(Math.abs(routeBalance) < 0.005 ? 0 : Math.abs(routeBalance)) : undefined,
      qtyTotalLabel,
      lines: buildMtsPrintLines(kind, detail.data.items),
      totalLabel: money(total),
    },
    error: null,
  }
}

export function CollectionPrintablesPanel({
  branch = 'Nabunturan',
  onClose,
}: CollectionPrintablesPanelProps) {
  const activeBranch = branch ?? 'Nabunturan'
  const [filterDate, setFilterDate] = useState(toIsoDateInput())
  const [rows, setRows] = useState<PrintableRow[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printBatch, setPrintBatch] = useState<CollectionPrintSheetData[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const [mtsResult, discountResult] = await Promise.all([
        listMtsCollectionsByDate(activeBranch, filterDate),
        listDiscountBreakdownsInRange(activeBranch, filterDate, filterDate),
      ])
      if (cancelled) return

      if (mtsResult.missingTable) {
        setMissingTable(true)
        setError(mtsResult.error)
        setRows([])
        setLoading(false)
        return
      }

      const next: PrintableRow[] = []
      for (const row of mtsResult.data) {
        next.push({
          key: `mts:${row.id}`,
          source: 'mts',
          id: row.id,
          createdAt: row.created_at,
          fromName: row.from_name || '—',
          colType: mtsLedgerLabel(row.kind).toUpperCase(),
          tid: collectionDisplayTid(row.id),
          kind: row.kind,
        })
      }

      if (!discountResult.missingTable && !discountResult.error) {
        for (const row of discountResult.data) {
          next.push({
            key: `discount:${row.id}`,
            source: 'discount',
            id: row.id,
            createdAt: row.created_at,
            fromName: row.plate_no ? `Plate ${row.plate_no}` : '—',
            colType: 'DISCOUNT BREAKDOWN',
            tid: collectionDisplayTid(row.id),
          })
        }
      }

      next.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      setRows(next)
      setSelectedKey((prev) =>
        prev && next.some((row) => row.key === prev) ? prev : (next[0]?.key ?? null),
      )
      setError(mtsResult.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeBranch, filterDate])

  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => window.print(), 150)
    function onAfterPrint() {
      setPrinting(false)
      setPrintBatch([])
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [printing])

  const selectedRow = useMemo(
    () => rows.find((row) => row.key === selectedKey) ?? null,
    [rows, selectedKey],
  )

  async function printRows(targets: PrintableRow[]) {
    if (printing || targets.length === 0) return
    setError(null)
    const sheets: CollectionPrintSheetData[] = []
    for (const row of targets) {
      const result = await buildPrintSheet(row, `CMJ ${activeBranch}`)
      if (result.error || !result.data) {
        setError(result.error ?? 'Failed to prepare print.')
        return
      }
      sheets.push(result.data)
    }
    setPrintBatch(sheets)
    setPrinting(true)
  }

  return (
    <>
      <section
        className="printables-panel collection-printables"
        aria-label="Collection Printables"
      >
        <header className="collection-printables__titlebar no-print">
          <h1>COLLECTION PRINTABLES</h1>
          {onClose ? (
            <button
              type="button"
              className="collection-printables__close"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          ) : null}
        </header>

        <div className="collection-printables__toolbar no-print">
          <label className="collection-printables__date">
            <span>Date</span>
            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
            />
          </label>
          <div className="collection-printables__toolbar-actions">
            <button
              type="button"
              className="fulls-printables-print-btn"
              disabled={!selectedRow || printing || loading}
              onClick={() => selectedRow && void printRows([selectedRow])}
            >
              <PrintIcon />
              Print selected
            </button>
            <button
              type="button"
              className="fulls-printables-print-btn fulls-printables-print-all"
              disabled={rows.length === 0 || printing || loading}
              onClick={() => void printRows(rows)}
            >
              <PrintIcon />
              Print all
            </button>
          </div>
        </div>

        {error ? <p className="catalog-error no-print">{error}</p> : null}

        <div className="collection-printables__board no-print">
          {loading ? <p className="catalog-empty">Loading collections…</p> : null}

          {!loading && rows.length === 0 ? (
            <div className="printables-panel__empty">
              <p className="printables-panel__empty-title">No collections</p>
              <p>
                No collection printables for {formatDisplayDate(filterDate)} on {activeBranch}.
              </p>
              {missingTable ? (
                <p>Run supabase/mts_collections_schema.sql, then refresh.</p>
              ) : null}
            </div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <div className="collection-printables__table-wrap">
              <table className="collection-printables__table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>FROM</th>
                    <th>COL. TYPE</th>
                    <th>TID</th>
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
                        onDoubleClick={() => void printRows([row])}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedKey(row.key)
                          }
                        }}
                      >
                        <td>{formatDateTime(row.createdAt)}</td>
                        <td>{row.fromName}</td>
                        <td>{row.colType}</td>
                        <td>{row.tid}</td>
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
        <div className="col-printables-batch print-only" aria-hidden={!printing}>
          {printBatch.map((sheet, index) => (
            <div
              key={`${sheet.id}-${index}`}
              className={
                index < printBatch.length - 1
                  ? 'col-printables-batch__item col-printables-batch__item--followed'
                  : 'col-printables-batch__item'
              }
            >
              <CollectionPrintSheet data={sheet} active={printing} />
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
