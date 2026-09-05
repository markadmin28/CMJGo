import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listCatalogTree } from '../lib/catalog'
import { listDiscountsForRoute, listRouteTypes } from '../lib/fth'
import {
  factoryTransactionTitle,
  formatFactoryMoney,
  formatFactoryQty,
  getFactoryTransactionDetail,
  listFactoryTransactionsByDate,
  resolveFactoryLines,
  saveFactoryTransaction,
  type FactoryProductLine,
  type FactoryTransactionItemRecord,
  type FactoryTransactionRecord,
} from '../lib/factoryTransaction'
import type { InventoryCategory } from '../lib/inventoryPreview'
import schemaSql from '../../supabase/factory_transaction_schema.sql?raw'
import './FactoryTransactionPanel.css'

type FactoryTransactionPanelProps = {
  category: InventoryCategory
}

type LineValues = {
  pallets: string
  cases: string
  discount: string
}

type RenderRow =
  | { type: 'product'; line: FactoryProductLine; showSubcategory: boolean; rowSpan: number }
  | { type: 'section'; id: string; label: string }

function PrintIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M6 14h12v7H6v-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 3h11l3 3v15H5V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 3v6h8V3M8 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function buildRenderRows(lines: FactoryProductLine[], options?: { includeSection?: boolean }): RenderRow[] {
  const result: RenderRow[] = []
  let index = 0
  let sawMts = false
  const includeSection = options?.includeSection ?? true

  while (index < lines.length) {
    const line = lines[index]
    if (includeSection && line.section === 'mts' && !sawMts) {
      result.push({ type: 'section', id: 'mts-section', label: 'MTS / EMPTIES' })
      sawMts = true
    }

    const subcategoryName = line.subcategoryName.trim()
    let span = 1
    while (
      index + span < lines.length &&
      lines[index + span].section === line.section &&
      lines[index + span].subcategoryName.trim() === subcategoryName
    ) {
      span += 1
    }

    for (let offset = 0; offset < span; offset += 1) {
      result.push({
        type: 'product',
        line: lines[index + offset],
        showSubcategory: offset === 0,
        rowSpan: span,
      })
    }
    index += span
  }

  return result
}

function parseQty(value: string) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function sanitizeNumberInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  if (rest.length === 0) return whole
  return `${whole}.${rest.join('').replace(/\./g, '')}`
}

type LineValuesMap = Record<string, LineValues>

function FactoryProductRows({
  rows,
  values,
  onUpdate,
  emptyMessage,
}: {
  rows: RenderRow[]
  values: LineValuesMap
  onUpdate: (id: string, patch: Partial<LineValues>) => void
  emptyMessage?: string
}) {
  if (rows.length === 0) {
    if (!emptyMessage) return null
    return (
      <tr>
        <td colSpan={8} className="factory-tx-table__empty">
          {emptyMessage}
        </td>
      </tr>
    )
  }

  return (
    <>
      {rows.map((entry) => {
        if (entry.type === 'section') {
          return (
            <tr key={entry.id} className="is-section">
              <td colSpan={8}>{entry.label}</td>
            </tr>
          )
        }

        const { line, showSubcategory, rowSpan } = entry
        const row = values[line.id] ?? { pallets: '', cases: '', discount: '' }
        const cases = parseQty(row.cases)
        const discount = parseQty(row.discount)
        const fullsAmount = cases * line.price
        const discountAmount = cases * discount

        return (
          <tr key={line.id} className={line.section === 'mts' ? 'is-mts' : 'is-fg'}>
            {showSubcategory ? (
              <td className="factory-tx-table__subcategory" rowSpan={rowSpan}>
                {line.subcategoryName}
              </td>
            ) : null}
            <td className="factory-tx-table__product">{line.productName}</td>
            <td>
              <input
                className="factory-tx-cell-input"
                value={row.pallets}
                onChange={(e) => onUpdate(line.id, { pallets: sanitizeNumberInput(e.target.value) })}
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
              />
            </td>
            <td>
              <input
                className="factory-tx-cell-input"
                value={row.cases}
                onChange={(e) => onUpdate(line.id, { cases: sanitizeNumberInput(e.target.value) })}
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
              />
            </td>
            <td className="factory-tx-table__price">{formatFactoryMoney(line.price)}</td>
            <td>
              <input
                className="factory-tx-cell-input"
                value={formatFactoryMoney(fullsAmount)}
                readOnly
                tabIndex={-1}
              />
            </td>
            <td>
              <input
                className="factory-tx-cell-input factory-tx-cell-input--red"
                value={row.discount}
                readOnly
                tabIndex={-1}
              />
            </td>
            <td>
              <input
                className="factory-tx-cell-input factory-tx-cell-input--red"
                value={formatFactoryMoney(discountAmount)}
                readOnly
                tabIndex={-1}
              />
            </td>
          </tr>
        )
      })}
    </>
  )
}

function FactoryTableHead() {
  return (
    <thead>
      <tr>
        <th className="factory-tx-table__item" colSpan={2} />
        <th>No. of Pallets</th>
        <th>No. of Cases</th>
        <th className="is-red-head">Price Fulls</th>
        <th>Fulls Amount</th>
        <th className="is-red-head">Discount / FTH</th>
        <th>Discount / FTH Amount</th>
      </tr>
    </thead>
  )
}

type AdjustmentEntry = {
  description: string
  amount: string
}

function createEmptyAdjustments(): AdjustmentEntry[] {
  return Array.from({ length: 5 }, () => ({ description: '', amount: '' }))
}

function qtyToInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value)) || Number(value) === 0) return ''
  return String(value)
}

function matchSavedItemToLine(
  catalogLines: FactoryProductLine[],
  item: FactoryTransactionItemRecord,
) {
  const section = item.section === 'mts' ? 'mts' : 'fg'
  const candidates = catalogLines.filter((line) => line.section === section)

  if (item.product_id) {
    const byProductId = candidates.find((line) => line.productId === item.product_id)
    if (byProductId) return byProductId
  }

  const productName = item.product_name.trim().toLowerCase()
  const subcategoryName = item.subcategory_name.trim().toLowerCase()

  const byNameAndSub = candidates.find(
    (line) =>
      line.productName.trim().toLowerCase() === productName &&
      (!subcategoryName || line.subcategoryName.trim().toLowerCase() === subcategoryName),
  )
  if (byNameAndSub) return byNameAndSub

  return candidates.find((line) => line.productName.trim().toLowerCase() === productName) ?? null
}

function mapAdjustmentsFromSaved(
  adjustments: Array<{ description: string; amount: number }>,
): AdjustmentEntry[] {
  const next = createEmptyAdjustments()
  adjustments.slice(0, next.length).forEach((entry, index) => {
    next[index] = {
      description: entry.description ?? '',
      amount: qtyToInput(entry.amount),
    }
  })
  return next
}

export function FactoryTransactionPanel({ category }: FactoryTransactionPanelProps) {
  const { user } = useAuth()
  const [lines, setLines] = useState<FactoryProductLine[]>([])
  const [values, setValues] = useState<Record<string, LineValues>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [plateNo, setPlateNo] = useState('')
  const [loadNo, setLoadNo] = useState('')
  const [driver, setDriver] = useState('')
  const [helper, setHelper] = useState('')
  const [sideTab, setSideTab] = useState<'deductions' | 'additionals'>('deductions')
  const [deductions, setDeductions] = useState<AdjustmentEntry[]>(createEmptyAdjustments)
  const [additionals, setAdditionals] = useState<AdjustmentEntry[]>(createEmptyAdjustments)
  const [chequeNo, setChequeNo] = useState('')
  const [chequeAmount, setChequeAmount] = useState('')
  const [chequeDueDate, setChequeDueDate] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [savePopup, setSavePopup] = useState<{
    category: string
    plateNo: string
    loadNo: string
    payable: string
    updated: boolean
  } | null>(null)
  const [saveToastPaused, setSaveToastPaused] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchDate, setSearchDate] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [searchResults, setSearchResults] = useState<FactoryTransactionRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  function dismissSavePopup() {
    setSaveToastPaused(false)
    setSavePopup(null)
  }

  useEffect(() => {
    if (!savePopup) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSaveToastPaused(false)
        setSavePopup(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [savePopup])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setStatus(null)

      const [catalogResult, routesResult] = await Promise.all([listCatalogTree(), listRouteTypes()])
      if (cancelled) return

      if (catalogResult.error) {
        setError(catalogResult.error)
        setLines([])
        setValues({})
        setLoading(false)
        return
      }

      const nextLines = resolveFactoryLines(catalogResult.data, category)
      let discountMap: Record<string, string> = {}

      const firstRoute = routesResult.data[0]
      if (firstRoute) {
        const discounts = await listDiscountsForRoute(firstRoute.id)
        if (!cancelled) discountMap = discounts.data
      }

      if (cancelled) return

      const nextValues: Record<string, LineValues> = {}
      for (const line of nextLines) {
        nextValues[line.id] = {
          pallets: '',
          cases: '',
          discount: discountMap[line.productId] ?? '',
        }
      }

      setLines(nextLines)
      setValues(nextValues)
      setEditingTransactionId(null)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [category])

  const fgLines = useMemo(() => lines.filter((line) => line.section === 'fg'), [lines])
  const mtsLines = useMemo(() => lines.filter((line) => line.section === 'mts'), [lines])
  const fgRows = useMemo(() => buildRenderRows(fgLines, { includeSection: false }), [fgLines])
  const mtsRows = useMemo(
    () => buildRenderRows(mtsLines, { includeSection: false }),
    [mtsLines],
  )

  const totals = useMemo(() => {
    let fgPallets = 0
    let fgCases = 0
    let mtsPallets = 0
    let mtsCases = 0
    let fullsAmount = 0
    let mtsAmount = 0
    let discountFthAmount = 0

    for (const line of lines) {
      const row = values[line.id]
      if (!row) continue
      const pallets = parseQty(row.pallets)
      const cases = parseQty(row.cases)
      const discount = parseQty(row.discount)
      const lineAmount = cases * line.price
      discountFthAmount += cases * discount

      if (line.section === 'fg') {
        fgPallets += pallets
        fgCases += cases
        fullsAmount += lineAmount
      } else {
        mtsPallets += pallets
        mtsCases += cases
        mtsAmount += lineAmount
      }
    }

    return {
      fgPallets,
      fgCases,
      mtsPallets,
      mtsCases,
      fullsAmount,
      mtsAmount,
      discountFthAmount,
    }
  }, [lines, values])

  const deductionsTotal = useMemo(
    () => deductions.reduce((acc, entry) => acc + parseQty(entry.amount), 0),
    [deductions],
  )

  const additionalsTotal = useMemo(
    () => additionals.reduce((acc, entry) => acc + parseQty(entry.amount), 0),
    [additionals],
  )

  const payableAmount = useMemo(
    () =>
      totals.fullsAmount -
      totals.discountFthAmount -
      totals.mtsAmount -
      deductionsTotal +
      additionalsTotal,
    [totals.fullsAmount, totals.mtsAmount, totals.discountFthAmount, deductionsTotal, additionalsTotal],
  )

  const printRows = useMemo(() => {
    const fulls: Array<{
      id: string
      pallets: number
      cases: number
      sku: string
      price: number
      amount: number
    }> = []
    const discounts: Array<{
      id: string
      cases: number
      sku: string
      price: number
      amount: number
    }> = []
    const empties: Array<{
      id: string
      pallets: number
      cases: number
      sku: string
      price: number
      amount: number
    }> = []

    for (const line of lines) {
      const row = values[line.id]
      if (!row) continue
      const pallets = parseQty(row.pallets)
      const cases = parseQty(row.cases)
      const discount = parseQty(row.discount)
      if (!pallets && !cases) continue

      if (line.section === 'fg') {
        fulls.push({
          id: line.id,
          pallets,
          cases,
          sku: line.productName,
          price: line.price,
          amount: cases * line.price,
        })
        if (cases && discount) {
          discounts.push({
            id: `disc-${line.id}`,
            cases,
            sku: line.productName,
            price: discount,
            amount: cases * discount,
          })
        }
      } else {
        empties.push({
          id: line.id,
          pallets,
          cases,
          sku: line.productName,
          price: line.price,
          amount: cases * line.price,
        })
      }
    }

    return { fulls, discounts, empties }
  }, [lines, values])

  const chequeAmountValue = chequeAmount.trim() ? parseQty(chequeAmount) : 0
  const overBal = chequeAmountValue - payableAmount
  const overBalTone = overBal > 0 ? 'is-over' : 'is-short'

  const printDateLabel = useMemo(() => {
    const now = new Date()
    return now.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }, [printing])

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

  function formatPrintMoney(value: number) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })
  }

  function formatPrintQty(value: number) {
    if (!value) return ''
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    })
  }

  function updateLine(id: string, patch: Partial<LineValues>) {
    setValues((prev) => ({
      ...prev,
      [id]: {
        pallets: prev[id]?.pallets ?? '',
        cases: prev[id]?.cases ?? '',
        discount: prev[id]?.discount ?? '',
        ...patch,
      },
    }))
  }

  function resetFormFields() {
    setEditingTransactionId(null)
    setPlateNo('')
    setLoadNo('')
    setDriver('')
    setHelper('')
    setChequeNo('')
    setChequeAmount('')
    setChequeDueDate('')
    setDeductions(createEmptyAdjustments())
    setAdditionals(createEmptyAdjustments())
    setValues((prev) => {
      const next: Record<string, LineValues> = {}
      for (const [id, row] of Object.entries(prev)) {
        next[id] = { pallets: '', cases: '', discount: row.discount }
      }
      return next
    })
  }

  function handleClear() {
    resetFormFields()
    setError(null)
    setStatus('Cleared.')
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    setStatus(null)

    const items = lines
      .map((line) => {
        const row = values[line.id]
        if (!row) return null
        const pallets = parseQty(row.pallets)
        const cases = parseQty(row.cases)
        if (!pallets && !cases) return null
        return {
          section: line.section,
          productId: line.productId,
          subcategoryName: line.subcategoryName,
          productName: line.productName,
          price: line.price,
          pallets,
          cases,
          discount: parseQty(row.discount),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const result = await saveFactoryTransaction(
      {
        category,
        plateNo,
        loadNo,
        driver,
        helper,
        fullsAmount: totals.fullsAmount,
        mtsAmount: totals.mtsAmount,
        discountFthAmount: totals.discountFthAmount,
        payableAmount,
        chequeNo,
        chequeAmount: chequeAmount.trim() ? parseQty(chequeAmount) : null,
        chequeDueDate: chequeDueDate || null,
        items,
        deductions: deductions.map((entry) => ({
          description: entry.description,
          amount: parseQty(entry.amount),
        })),
        additionals: additionals.map((entry) => ({
          description: entry.description,
          amount: parseQty(entry.amount),
        })),
      },
      user?.id,
      editingTransactionId,
    )

    setSaving(false)

    if (result.missingTable) {
      setMissingTable(true)
      setError(result.error)
      return
    }

    if (result.error || !result.data) {
      setError(
        result.error ??
          (editingTransactionId
            ? 'Failed to update factory transaction.'
            : 'Failed to save factory transaction.'),
      )
      return
    }

    setSavePopup({
      category: result.data.category,
      plateNo: result.data.plate_no,
      loadNo: result.data.load_no,
      payable: formatFactoryMoney(result.data.payable_amount) || '0.00',
      updated: result.updated,
    })
    resetFormFields()
    setStatus(null)
  }

  async function copySql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function runSearch(date = searchDate) {
    setSearching(true)
    setSearchError(null)
    const result = await listFactoryTransactionsByDate(category, date)
    setSearching(false)

    if (result.missingTable) {
      setMissingTable(true)
      setSearchError(result.error)
      setSearchResults([])
      return
    }

    if (result.error) {
      setSearchError(result.error)
      setSearchResults([])
      return
    }

    setSearchResults(result.data)
  }

  async function handleSearch() {
    setSearchOpen(true)
    setStatus(null)
    await runSearch(searchDate)
  }

  async function handleSearchDateChange(nextDate: string) {
    setSearchDate(nextDate)
    if (!nextDate) {
      setSearchResults([])
      setSearchError(null)
      return
    }
    await runSearch(nextDate)
  }

  async function selectSearchResult(record: FactoryTransactionRecord) {
    if (loadingRecordId) return

    setSearchError(null)
    setLoadingRecordId(record.id)

    const result = await getFactoryTransactionDetail(record.id)
    setLoadingRecordId(null)

    if (result.missingTable) {
      setMissingTable(true)
      setSearchError(result.error)
      return
    }

    if (result.error || !result.data) {
      setSearchError(result.error ?? 'Failed to load saved record.')
      return
    }

    const { transaction, items, adjustments } = result.data

    setPlateNo(transaction.plate_no ?? '')
    setLoadNo(transaction.load_no ?? '')
    setDriver(transaction.driver ?? '')
    setHelper(transaction.helper ?? '')
    setChequeNo(transaction.cheque_no ?? '')
    setChequeAmount(qtyToInput(transaction.cheque_amount))
    setChequeDueDate(transaction.cheque_due_date ?? '')

    setDeductions(
      mapAdjustmentsFromSaved(
        adjustments
          .filter((entry) => entry.kind === 'deductions')
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((entry) => ({ description: entry.description, amount: entry.amount })),
      ),
    )
    setAdditionals(
      mapAdjustmentsFromSaved(
        adjustments
          .filter((entry) => entry.kind === 'additionals')
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((entry) => ({ description: entry.description, amount: entry.amount })),
      ),
    )

    setValues((prev) => {
      const next: Record<string, LineValues> = {}
      for (const [id, row] of Object.entries(prev)) {
        next[id] = { pallets: '', cases: '', discount: row.discount }
      }

      for (const item of items) {
        const line = matchSavedItemToLine(lines, item)
        if (!line) continue
        next[line.id] = {
          pallets: qtyToInput(item.pallets),
          cases: qtyToInput(item.cases),
          discount: qtyToInput(item.discount) || next[line.id]?.discount || '',
        }
      }

      return next
    })

    setEditingTransactionId(transaction.id)
    setSearchOpen(false)
    setError(null)
    setStatus(null)
  }

  function handlePrint() {
    setPrinting(true)
  }

  function updateAdjustment(index: number, patch: Partial<AdjustmentEntry>) {
    const setter = sideTab === 'deductions' ? setDeductions : setAdditionals
    setter((prev) =>
      prev.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    )
  }

  const adjustmentEntries = sideTab === 'deductions' ? deductions : additionals
  const title = factoryTransactionTitle(category)

  return (
    <section className="factory-tx" aria-label={`${title} Factory Transaction`}>
      <div className={`factory-tx-card no-print${printing ? ' is-printing' : ''}`}>
        <header className="factory-tx-header no-print">
          <div className="factory-tx-fields">
            <label className="factory-tx-field">
              <span>Plate no</span>
              <input value={plateNo} onChange={(e) => setPlateNo(e.target.value)} />
            </label>
            <label className="factory-tx-field">
              <span>Load no</span>
              <input value={loadNo} onChange={(e) => setLoadNo(e.target.value)} />
            </label>
            <label className="factory-tx-field">
              <span>Driver</span>
              <input value={driver} onChange={(e) => setDriver(e.target.value)} />
            </label>
            <label className="factory-tx-field">
              <span>Helper</span>
              <input value={helper} onChange={(e) => setHelper(e.target.value)} />
            </label>
          </div>
        </header>

        {missingTable ? (
          <div className="catalog-setup no-print">
            <div>
              <strong>Factory Transaction setup required</strong>
              <p>
                Factory Transaction tables are missing. Click <b>Copy SQL</b>, paste it in the{' '}
                <a
                  href="https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new"
                  target="_blank"
                  rel="noreferrer"
                >
                  SQL Editor
                </a>
                , press <b>Run</b>, then try Save again.
              </p>
            </div>
            <div className="catalog-setup-actions">
              <button type="button" className="btn-secondary" onClick={() => void copySql()}>
                {copied ? 'Copied' : 'Copy SQL'}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="factory-tx-status factory-tx-status--error no-print">{error}</p> : null}
        {status ? <p className="factory-tx-status no-print">{status}</p> : null}
        {loading ? <p className="factory-tx-status no-print">Loading products…</p> : null}

        <div className="factory-tx-body">
          <div className="factory-tx-table-wrap">
            <table className="factory-tx-table">
              <FactoryTableHead />
              <tbody>
                <FactoryProductRows
                  rows={fgRows}
                  values={values}
                  onUpdate={updateLine}
                  emptyMessage={loading ? undefined : `No products found for ${category}.`}
                />
              </tbody>
            </table>
          </div>

          <aside className="factory-tx-side no-print">
            {mtsLines.length > 0 ? (
              <div className="factory-tx-mts-block">
                <div className="factory-tx-table-wrap factory-tx-table-wrap--mts">
                  <table className="factory-tx-table factory-tx-table--mts">
                    <FactoryTableHead />
                    <tbody>
                      <FactoryProductRows rows={mtsRows} values={values} onUpdate={updateLine} />
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="factory-tx-side-card">
              <div className="factory-tx-amount-totals" aria-label="Amount totals">
                <div className="factory-tx-amount-totals__row is-fulls">
                  <span>Total Fulls Amount</span>
                  <strong>{formatFactoryMoney(totals.fullsAmount) || '0.00'}</strong>
                </div>
                <div className="factory-tx-amount-totals__row is-mts">
                  <span>MTS Amount</span>
                  <strong>{formatFactoryMoney(totals.mtsAmount) || '0.00'}</strong>
                </div>
                <div className="factory-tx-amount-totals__row is-discount">
                  <span>Discount / FTH Amount</span>
                  <strong>{formatFactoryMoney(totals.discountFthAmount) || '0.00'}</strong>
                </div>
              </div>

              <div className="factory-tx-side-tabs" role="tablist" aria-label="Adjustments">
                <button
                  type="button"
                  role="tab"
                  aria-selected={sideTab === 'deductions'}
                  className={sideTab === 'deductions' ? 'is-active' : undefined}
                  onClick={() => setSideTab('deductions')}
                >
                  Other deductions
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sideTab === 'additionals'}
                  className={sideTab === 'additionals' ? 'is-active' : undefined}
                  onClick={() => setSideTab('additionals')}
                >
                  Other additionals
                </button>
              </div>

              <div className="factory-tx-adjustment-list" aria-label={sideTab}>
                <div className="factory-tx-adjustment-list__head">
                  <span>Description</span>
                  <span>Amount</span>
                </div>
                {adjustmentEntries.map((entry, index) => (
                  <div key={`${sideTab}-${index}`} className="factory-tx-adjustment-row">
                    <input
                      className="factory-tx-adjustment-row__desc"
                      value={entry.description}
                      onChange={(e) => updateAdjustment(index, { description: e.target.value })}
                      placeholder={`Description ${index + 1}`}
                      aria-label={`${sideTab} description ${index + 1}`}
                    />
                    <input
                      className="factory-tx-adjustment-row__amount"
                      value={entry.amount}
                      onChange={(e) =>
                        updateAdjustment(index, { amount: sanitizeNumberInput(e.target.value) })
                      }
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      placeholder="0.00"
                      aria-label={`${sideTab} amount ${index + 1}`}
                    />
                  </div>
                ))}
              </div>

              <div className="factory-tx-payment">
                <label className="factory-tx-payment__row factory-tx-payment__row--payable">
                  <span>Payable</span>
                  <input
                    value={formatFactoryMoney(payableAmount) || '0.00'}
                    readOnly
                    tabIndex={-1}
                  />
                </label>
                <label className="factory-tx-payment__row">
                  <span>Cheque No.</span>
                  <input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                </label>
                <label className="factory-tx-payment__row">
                  <span>Cheque amount</span>
                  <input
                    value={chequeAmount}
                    onChange={(e) => setChequeAmount(sanitizeNumberInput(e.target.value))}
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                  />
                </label>
                <label className="factory-tx-payment__row">
                  <span>Cheque due date</span>
                  <input
                    type="date"
                    value={chequeDueDate}
                    onChange={(e) => setChequeDueDate(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="factory-tx-summary" aria-label="Totals">
              <div className="factory-tx-summary__group is-fg">
                <span className="factory-tx-summary__tag">FG</span>
                <div className="factory-tx-summary__metrics">
                  <div className="factory-tx-summary__metric">
                    <span>Pallets</span>
                    <strong>{formatFactoryQty(totals.fgPallets)}</strong>
                  </div>
                  <div className="factory-tx-summary__metric">
                    <span>Cases</span>
                    <strong>{formatFactoryQty(totals.fgCases)}</strong>
                  </div>
                </div>
              </div>
              <div className="factory-tx-summary__group is-mts">
                <span className="factory-tx-summary__tag">MTS</span>
                <div className="factory-tx-summary__metrics">
                  <div className="factory-tx-summary__metric">
                    <span>Pallets</span>
                    <strong>{formatFactoryQty(totals.mtsPallets)}</strong>
                  </div>
                  <div className="factory-tx-summary__metric">
                    <span>Cases</span>
                    <strong>{formatFactoryQty(totals.mtsCases)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="factory-tx-actions">
              <button type="button" className="factory-tx-action" onClick={handlePrint}>
                <PrintIcon />
                <span>Print</span>
              </button>
              <button type="button" className="factory-tx-action" onClick={() => void handleSearch()}>
                <SearchIcon />
                <span>Search</span>
              </button>
              <button type="button" className="factory-tx-action" onClick={handleClear}>
                <ClearIcon />
                <span>Clear</span>
              </button>
              <button
                type="button"
                className="factory-tx-action factory-tx-action--save"
                disabled={saving || loading}
                onClick={() => void handleSave()}
              >
                <SaveIcon />
                <span>
                  {saving
                    ? editingTransactionId
                      ? 'Updating…'
                      : 'Saving…'
                    : editingTransactionId
                      ? 'Update'
                      : 'Save'}
                </span>
              </button>
            </div>
          </aside>
        </div>
      </div>

      <div className={`factory-tx-print-sheet${printing ? ' is-active' : ''}`} aria-hidden={!printing}>
        <header className="factory-tx-print-sheet__brand">
          <p className="factory-tx-print-sheet__company">The CMJ Corporation</p>
          <p className="factory-tx-print-sheet__branch">CMJ Davao</p>
          <p className="factory-tx-print-sheet__title">{title} FACTORY TRANSACTION</p>
        </header>

        <div className="factory-tx-print-meta">
          <p>
            <span>DATE:</span> <strong>{printDateLabel}</strong>
          </p>
          <p>
            <span>PLATE NO.:</span> <strong>{plateNo.trim() || '—'}</strong>
          </p>
          <p>
            <span>LOAD NO.:</span> <strong>{loadNo.trim() || '—'}</strong>
          </p>
          <p>
            <span>DRIVER:</span> <strong>{driver.trim() || '—'}</strong>
          </p>
          <p>
            <span>HELPER:</span> <strong>{helper.trim() || '—'}</strong>
          </p>
        </div>

        <table className="factory-tx-print-table">
          <thead>
            <tr>
              <th>No of pallets</th>
              <th>No of cases</th>
              <th>SKU</th>
              <th>Price/case</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {printRows.fulls.map((row) => (
              <tr key={row.id}>
                <td className="is-num">{formatPrintQty(row.pallets)}</td>
                <td className="is-num">{formatPrintQty(row.cases)}</td>
                <td className="is-sku">{row.sku}</td>
                <td className="is-num">{formatPrintMoney(row.price)}</td>
                <td className="is-num">{formatPrintMoney(row.amount)}</td>
              </tr>
            ))}
            <tr className="is-total">
              <td className="is-num">{formatPrintQty(totals.fgPallets)}</td>
              <td className="is-num">{formatPrintQty(totals.fgCases)}</td>
              <td />
              <td className="is-label">Total:</td>
              <td className="is-num is-blue">{formatPrintMoney(totals.fullsAmount)}</td>
            </tr>

            <tr className="is-section">
              <td colSpan={5}>DISCOUNTS</td>
            </tr>
            {printRows.discounts.map((row) => (
              <tr key={row.id}>
                <td />
                <td className="is-num">{formatPrintQty(row.cases)}</td>
                <td className="is-sku">{row.sku}</td>
                <td className="is-num">{formatPrintMoney(row.price)}</td>
                <td className="is-num">{formatPrintMoney(row.amount)}</td>
              </tr>
            ))}
            <tr className="is-total">
              <td />
              <td />
              <td />
              <td className="is-label">Total:</td>
              <td className="is-num is-red">{formatPrintMoney(totals.discountFthAmount)}</td>
            </tr>

            <tr className="is-section is-empties-section">
              <td colSpan={5}>EMPTIES</td>
            </tr>
            {printRows.empties.map((row) => (
              <tr key={row.id} className="is-empties">
                <td className="is-num">{formatPrintQty(row.pallets)}</td>
                <td className="is-num">{formatPrintQty(row.cases)}</td>
                <td className="is-sku">{row.sku}</td>
                <td className="is-num">{formatPrintMoney(row.price)}</td>
                <td className="is-num">{formatPrintMoney(row.amount)}</td>
              </tr>
            ))}
            <tr className="is-total is-empties-total">
              <td className="is-num">{formatPrintQty(totals.mtsPallets)}</td>
              <td className="is-num">{formatPrintQty(totals.mtsCases)}</td>
              <td />
              <td className="is-label">Total:</td>
              <td className="is-num">{formatPrintMoney(totals.mtsAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="factory-tx-print-footer">
          <div className="factory-tx-print-payable">
            <div className="factory-tx-print-payable__row">
              <span>TOTAL PAYABLE:</span>
              <strong className="is-blue">{formatPrintMoney(payableAmount)}</strong>
            </div>
            <div className="factory-tx-print-payable__row">
              <span>NET PAYABLE:</span>
              <strong className="is-blue">{formatPrintMoney(payableAmount)}</strong>
            </div>
          </div>

          <p className="factory-tx-print-cheque">
            Cheque#:<strong>{chequeNo.trim() || '—'}</strong>
            {', '}Due date:
            <strong>
              {chequeDueDate
                ? new Date(`${chequeDueDate}T00:00:00`).toLocaleDateString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                    year: '2-digit',
                  })
                : '—'}
            </strong>
            {', '}Amount:
            <strong>{formatPrintMoney(chequeAmountValue)}</strong>
          </p>

          <p className={`factory-tx-print-overbal ${overBalTone}`}>
            {overBal > 0 ? 'over' : 'bal'} {formatPrintMoney(overBal)}
          </p>
        </div>
      </div>

      {savePopup ? (
        <div
          className="modal-backdrop factory-tx-toast-backdrop no-print"
          onClick={dismissSavePopup}
          role="presentation"
        >
          <div
            className={`factory-tx-toast${saveToastPaused ? ' is-paused' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="factory-tx-toast-title"
            aria-describedby="factory-tx-toast-detail"
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => setSaveToastPaused(true)}
            onMouseLeave={() => setSaveToastPaused(false)}
            onFocusCapture={() => setSaveToastPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSaveToastPaused(false)
              }
            }}
          >
            <div className="factory-tx-toast__glow" aria-hidden="true" />
            <div className="factory-tx-toast__check" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  className="factory-tx-toast__check-path"
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className="factory-tx-toast__eyebrow">Success</p>
            <h2 id="factory-tx-toast-title">
              {savePopup.updated ? 'Transaction updated' : 'Transaction saved'}
            </h2>
            <p id="factory-tx-toast-detail">
              {savePopup.updated
                ? 'Changes were written back to the selected saved record.'
                : 'Your factory transaction is stored and ready to search or print later.'}
            </p>

            <div className="factory-tx-toast__meta" aria-label="Saved record summary">
              <div className="factory-tx-toast__chip">
                <span>Category</span>
                <strong>{savePopup.category}</strong>
              </div>
              <div className="factory-tx-toast__chip">
                <span>Plate</span>
                <strong>{savePopup.plateNo || '—'}</strong>
              </div>
              <div className="factory-tx-toast__chip">
                <span>Load</span>
                <strong>{savePopup.loadNo || '—'}</strong>
              </div>
              <div className="factory-tx-toast__chip is-payable">
                <span>Payable</span>
                <strong>{savePopup.payable}</strong>
              </div>
            </div>

            <div className="factory-tx-toast__actions">
              <button
                type="button"
                className="factory-tx-toast__btn factory-tx-toast__btn--ghost"
                onClick={() => {
                  dismissSavePopup()
                  void handleSearch()
                }}
              >
                Find saved
              </button>
              <button
                type="button"
                className="factory-tx-toast__btn factory-tx-toast__btn--primary"
                onClick={dismissSavePopup}
              >
                Continue
              </button>
            </div>

            <div
              className="factory-tx-toast__progress"
              aria-hidden="true"
              title={saveToastPaused ? 'Paused — hover away to resume' : 'Auto-closing'}
            >
              <span
                onAnimationEnd={() => {
                  if (!saveToastPaused) dismissSavePopup()
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div
          className="modal-backdrop no-print"
          onClick={() => setSearchOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel factory-tx-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-tx-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="factory-tx-search-title">Saved factory records</h2>
                <p>Select a record to autofill the full saved transaction into the form.</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSearchOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="factory-tx-search-body">
              <div className="factory-tx-search-filters">
                <label className="factory-tx-search-date">
                  <span>Date</span>
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(event) => void handleSearchDateChange(event.target.value)}
                  />
                </label>
              </div>

              {searchError ? <p className="catalog-error">{searchError}</p> : null}
              {searching ? <p className="catalog-empty">Loading…</p> : null}

              {!searching && searchResults.length === 0 ? (
                <p className="catalog-empty">No saved records for this date.</p>
              ) : null}

              {!searching && searchResults.length > 0 ? (
                <div className="factory-tx-search-table-wrap">
                  <table className="factory-tx-search-table">
                    <thead>
                      <tr>
                        <th>Plate no</th>
                        <th>Load no</th>
                        <th>Driver</th>
                        <th>Helper</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((record) => {
                        const isLoading = loadingRecordId === record.id
                        return (
                        <tr
                          key={record.id}
                          className={`factory-tx-search-row${isLoading ? ' is-loading' : ''}`}
                          tabIndex={loadingRecordId ? -1 : 0}
                          role="button"
                          aria-busy={isLoading}
                          aria-label={`Select ${record.plate_no || 'record'} ${record.load_no || ''}`}
                          onClick={() => void selectSearchResult(record)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              void selectSearchResult(record)
                            }
                          }}
                        >
                          <td>{record.plate_no || '—'}</td>
                          <td>{record.load_no || '—'}</td>
                          <td>{record.driver || '—'}</td>
                          <td>{isLoading ? 'Loading…' : record.helper || '—'}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
