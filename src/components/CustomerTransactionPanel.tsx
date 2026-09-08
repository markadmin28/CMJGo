import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listCatalogTree } from '../lib/catalog'
import { listCustomerDiscounts, listCustomerGroups } from '../lib/customerDiscount'
import type { UserBranch } from '../lib/branches'
import {
  buildCustomerTxBrandGroups,
  buildCustomerTxEmptiesGroups,
  customerTransactionTitle,
  customerTxHeaderTitle,
  emptyCustomerTxQtyMap,
  formatCustomerTxDateTime,
  formatCustomerTxDateTimeFromIso,
  formatCustomerTxPlateDisplay,
  formatLedgerMoney,
  hydrateCustomerTxFromSavedItems,
  type CustomerTransactionCompany,
  type CustomerTxLedgerLine,
} from '../lib/customerTransaction'
import {
  CUSTOMER_TX_TRUCK_PRESETS,
  getCustomerTransactionDetail,
  groupCustomerTxRecordsByCompany,
  isDeliverTruck,
  isPickUpTruck,
  listCustomerTransactionsByDate,
  peekNextCustomerSalesNo,
  saveCustomerTransaction,
  toIsoDateInput,
  updateCustomerTransaction,
  validateCustomerTxBeforeNext,
  type CustomerTxRecord,
} from '../lib/customerTxSave'
import type { CustomerDiscountGroup } from '../types/customerDiscount'
import type { BoBrandGroup } from '../lib/boBadOrder'
import { CustomerLedgerModal } from './CustomerLedgerModal'
import {
  CustomerTransactionPrintSheet,
  type CustomerTxPrintSheetData,
} from './CustomerTransactionPrintSheet'
import { buildCustomerTxPrintSheetData } from '../lib/customerTxPrint'
import schemaSql from '../../supabase/customer_transaction_schema.sql?raw'
import './CustomerTransactionPanel.css'
import './AddUserModal.css'

export type { CustomerTransactionCompany }
export { customerTransactionTitle }

type CustomerTransactionPanelProps = {
  company: CustomerTransactionCompany
  branch?: UserBranch | null
  onClose?: () => void
  onCompanyChange?: (company: CustomerTransactionCompany) => void
}

type TxTab = 'fulls' | 'empties'

type LedgerDraft = {
  orderLines: CustomerTxLedgerLine[]
  emptiesLines: CustomerTxLedgerLine[]
  ordersTotal: number
  emptiesTotal: number
  payablesTotal: number
}

type SavePopup = {
  salesNo: string
  customerName: string
  company: CustomerTransactionCompany
  plateDisplay: string
  payables: string
  updated: boolean
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 5h2l2.2 10.2a1.5 1.5 0 001.5 1.2h8.6a1.5 1.5 0 001.45-1.1L21 8H7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </svg>
  )
}

export function CustomerTransactionPanel({
  company,
  branch = 'Nabunturan',
  onClose,
  onCompanyChange,
}: CustomerTransactionPanelProps) {
  const { user } = useAuth()
  const activeBranch = branch ?? 'Nabunturan'
  const [tab, setTab] = useState<TxTab>('fulls')
  const [customers, setCustomers] = useState<CustomerDiscountGroup[]>([])
  const [customerId, setCustomerId] = useState('')
  const [salesNo, setSalesNo] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [truckNo, setTruckNo] = useState('')
  const [plateNo, setPlateNo] = useState('N/A')
  const [dateText, setDateText] = useState(formatCustomerTxDateTime())
  const [catalogFulls, setCatalogFulls] = useState<BoBrandGroup[]>([])
  const [catalogEmpties, setCatalogEmpties] = useState<BoBrandGroup[]>([])
  const [fullsGroups, setFullsGroups] = useState<BoBrandGroup[]>([])
  const [emptiesGroups, setEmptiesGroups] = useState<BoBrandGroup[]>([])
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [savePopup, setSavePopup] = useState<SavePopup | null>(null)
  const [saveToastPaused, setSaveToastPaused] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [ledgerDraft, setLedgerDraft] = useState<LedgerDraft | null>(null)
  const [discountsByProductId, setDiscountsByProductId] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [paymentAmountDraft, setPaymentAmountDraft] = useState('')
  const [cashChequeDraft, setCashChequeDraft] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchDate, setSearchDate] = useState(toIsoDateInput())
  const [searchResults, setSearchResults] = useState<CustomerTxRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null)
  const [printingRecordId, setPrintingRecordId] = useState<string | null>(null)
  const [printData, setPrintData] = useState<CustomerTxPrintSheetData | null>(null)
  const [printing, setPrinting] = useState(false)
  const pendingEditIdRef = useRef<string | null>(null)
  const loadTokenRef = useRef(0)

  const activeGroups = tab === 'fulls' ? fullsGroups : emptiesGroups
  const plateRequired = truckNo.trim() !== '' && !isPickUpTruck(truckNo)
  const selectedCustomer = customers.find((item) => item.id === customerId) ?? null
  const searchGroups = useMemo(
    () => groupCustomerTxRecordsByCompany(searchResults),
    [searchResults],
  )

  async function refreshSalesNo() {
    const result = await peekNextCustomerSalesNo(activeBranch, company)
    setMissingTable(result.missingTable)
    if (result.missingTable) {
      setSalesNo('')
      return
    }
    if (result.error) {
      setError(result.error)
      return
    }
    setSalesNo(result.salesNo)
  }

  function applyRecordToForm(
    transaction: CustomerTxRecord,
    items: Array<{
      section: 'fulls' | 'empties'
      product_id: string | null
      product_name: string
      brand_id: string | null
      brand_name: string
      quantity: number
      price?: number
    }>,
    nextFulls: BoBrandGroup[],
    nextEmpties: BoBrandGroup[],
    nextCustomers: CustomerDiscountGroup[],
  ) {
    // Only hydrate quantities from THIS transaction's line items.
    const ownedItems = items.filter((item) => Number(item.quantity) !== 0 || item.product_name)
    const hydrated = hydrateCustomerTxFromSavedItems(nextFulls, nextEmpties, ownedItems)

    setEditingId(transaction.id)
    setSalesNo(transaction.sales_no)
    setInvoiceNo(transaction.invoice_no ?? '')
    const savedTruck = (transaction.truck_no ?? '').trim()
    const truckOption =
      CUSTOMER_TX_TRUCK_PRESETS.find(
        (option) => option.toLowerCase() === savedTruck.toLowerCase(),
      ) ??
      (isPickUpTruck(savedTruck) ? 'Pick-up' : isDeliverTruck(savedTruck) ? 'Deliver' : '')
    setTruckNo(truckOption)
    setPlateNo(
      truckOption === 'Pick-up'
        ? 'N/A'
        : transaction.plate_no && transaction.plate_no.toUpperCase() !== 'N/A'
          ? transaction.plate_no
          : '',
    )
    setDateText(formatCustomerTxDateTimeFromIso(transaction.transaction_at))
    setPaymentAmountDraft(
      transaction.payment_amount == null ? '' : String(transaction.payment_amount),
    )
    setCashChequeDraft(transaction.cash_cheque_no ?? '')

    const matchedCustomer =
      nextCustomers.find((item) => item.id === transaction.customer_id) ??
      nextCustomers.find(
        (item) =>
          item.name.trim().toLowerCase() === (transaction.customer_name ?? '').trim().toLowerCase(),
      )
    setCustomerId(matchedCustomer?.id ?? '')

    setFullsGroups(hydrated.fullsGroups)
    setEmptiesGroups(hydrated.emptiesGroups)
    setQtys(hydrated.qtys)
    setDiscountsByProductId({})
    setTab('fulls')
  }

  async function loadCatalogAndCustomers(options?: { preserveEditId?: string | null }) {
    setLoading(true)
    setError(null)
    setSavePopup(null)
    setSaveToastPaused(false)
    setLedgerOpen(false)
    setLedgerDraft(null)
    setTab('fulls')

    const preserveEditId = options?.preserveEditId ?? pendingEditIdRef.current
    const token = ++loadTokenRef.current

    const [catalogResult, customersResult] = await Promise.all([
      listCatalogTree(activeBranch, { forTransactions: true }),
      listCustomerGroups(activeBranch),
    ])

    if (token !== loadTokenRef.current) return

    if (catalogResult.error) setError(catalogResult.error)
    else if (customersResult.error && !customersResult.missingTable) setError(customersResult.error)

    const nextFulls = buildCustomerTxBrandGroups(catalogResult.data, company)
    const nextEmpties = buildCustomerTxEmptiesGroups(catalogResult.data, company)
    setCatalogFulls(nextFulls)
    setCatalogEmpties(nextEmpties)
    setCustomers(customersResult.data)

    if (preserveEditId) {
      const detail = await getCustomerTransactionDetail(preserveEditId)
      if (token !== loadTokenRef.current) return
      pendingEditIdRef.current = null

      if (detail.error || !detail.data) {
        setEditingId(null)
        setFullsGroups(nextFulls)
        setEmptiesGroups(nextEmpties)
        setQtys(emptyCustomerTxQtyMap([...nextFulls, ...nextEmpties]))
        setCustomerId(customersResult.data[0]?.id ?? '')
        setInvoiceNo('')
        setTruckNo('')
        setPlateNo('N/A')
        setDateText(formatCustomerTxDateTime())
        setPaymentAmountDraft('')
        setCashChequeDraft('')
        setDiscountsByProductId({})
        setError(detail.error ?? 'Failed to load saved record.')
        await refreshSalesNo()
      } else if (detail.data.transaction.id !== preserveEditId) {
        setError('Loaded record did not match the selected transaction.')
        setFullsGroups(nextFulls)
        setEmptiesGroups(nextEmpties)
        setQtys(emptyCustomerTxQtyMap([...nextFulls, ...nextEmpties]))
        await refreshSalesNo()
      } else {
        // Rebuild product qtys strictly from this transaction's items.
        applyRecordToForm(
          detail.data.transaction,
          detail.data.items,
          nextFulls,
          nextEmpties,
          customersResult.data,
        )
      }
    } else {
      setEditingId(null)
      setFullsGroups(nextFulls)
      setEmptiesGroups(nextEmpties)
      setQtys(emptyCustomerTxQtyMap([...nextFulls, ...nextEmpties]))
      setCustomerId(customersResult.data[0]?.id ?? '')
      setInvoiceNo('')
      setTruckNo('')
      setPlateNo('N/A')
      setDateText(formatCustomerTxDateTime())
      setPaymentAmountDraft('')
      setCashChequeDraft('')
      setDiscountsByProductId({})
      await refreshSalesNo()
    }

    if (token === loadTokenRef.current) setLoading(false)
  }

  useEffect(() => {
    void loadCatalogAndCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when company/branch changes
  }, [company, activeBranch])

  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => window.print(), 150)
    const onAfterPrint = () => setPrinting(false)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [printing])

  const headerTitle = useMemo(() => customerTxHeaderTitle(company), [company])

  function setQty(productId: string, value: string) {
    // Allow digits and at most one decimal place (e.g. 12 or 12.5).
    let next = value.replace(/[^\d.]/g, '')
    const dot = next.indexOf('.')
    if (dot !== -1) {
      next = `${next.slice(0, dot + 1)}${next.slice(dot + 1).replace(/\./g, '').slice(0, 1)}`
    }
    setQtys((prev) => ({ ...prev, [productId]: next }))
  }

  function handleTruckChange(value: string) {
    setTruckNo(value)
    if (isPickUpTruck(value)) {
      setPlateNo('N/A')
      return
    }
    if (isDeliverTruck(value) || value.trim()) {
      setPlateNo((prev) => (prev.trim().toUpperCase() === 'N/A' ? '' : prev))
    }
  }

  function dismissSavePopup() {
    setSavePopup(null)
    setSaveToastPaused(false)
  }

  async function resetToNew() {
    setEditingId(null)
    setPaymentAmountDraft('')
    setCashChequeDraft('')
    setInvoiceNo('')
    setTruckNo('')
    setPlateNo('N/A')
    setDateText(formatCustomerTxDateTime())
    setFullsGroups(catalogFulls)
    setEmptiesGroups(catalogEmpties)
    setQtys(emptyCustomerTxQtyMap([...catalogFulls, ...catalogEmpties]))
    setCustomerId(customers[0]?.id ?? '')
    setDiscountsByProductId({})
    await refreshSalesNo()
  }

  function handleClear() {
    setError(null)
    setSavePopup(null)
    setSaveToastPaused(false)
    setLedgerError(null)
    setLedgerOpen(false)
    setLedgerDraft(null)
    void resetToNew()
  }

  async function runSearch(date = searchDate) {
    setSearching(true)
    setSearchError(null)
    const result = await listCustomerTransactionsByDate(activeBranch, date, company)
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
    setError(null)
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

  async function selectSearchResult(record: CustomerTxRecord) {
    if (loadingRecordId) return
    setSearchError(null)
    setLoadingRecordId(record.id)
    const token = ++loadTokenRef.current

    if (record.company !== company) {
      pendingEditIdRef.current = record.id
      setSearchOpen(false)
      setLoadingRecordId(null)
      onCompanyChange?.(record.company)
      if (!onCompanyChange) {
        await loadCatalogAndCustomers({ preserveEditId: record.id })
      }
      return
    }

    const detail = await getCustomerTransactionDetail(record.id)
    if (token !== loadTokenRef.current) return
    setLoadingRecordId(null)

    if (detail.missingTable) {
      setMissingTable(true)
      setSearchError(detail.error)
      return
    }
    if (detail.error || !detail.data) {
      setSearchError(detail.error ?? 'Failed to load saved record.')
      return
    }

    // Guard: never apply another transaction's products.
    if (detail.data.transaction.id !== record.id) {
      setSearchError('Selected record did not match loaded products.')
      return
    }

    applyRecordToForm(
      detail.data.transaction,
      detail.data.items.filter((item) => item.transaction_id === record.id),
      catalogFulls,
      catalogEmpties,
      customers,
    )
    setSearchOpen(false)
    setError(null)
  }

  async function printSearchRecord(record: CustomerTxRecord) {
    if (printingRecordId || printing) return
    setSearchError(null)
    setPrintingRecordId(record.id)

    const detail = await getCustomerTransactionDetail(record.id)
    setPrintingRecordId(null)

    if (detail.missingTable) {
      setMissingTable(true)
      setSearchError(detail.error)
      return
    }
    if (detail.error || !detail.data) {
      setSearchError(detail.error ?? 'Failed to load record for printing.')
      return
    }
    if (detail.data.transaction.id !== record.id) {
      setSearchError('Selected record did not match loaded products.')
      return
    }

    setPrintData(buildCustomerTxPrintSheetData(detail.data.transaction, detail.data.items))
    setPrinting(true)
  }

  async function handleNext() {
    setError(null)
    setSavePopup(null)
    setLedgerError(null)

    let discounts = discountsByProductId
    if (customerId) {
      const discountResult = await listCustomerDiscounts(customerId)
      if (discountResult.error && !discountResult.missingTable) {
        setError(discountResult.error)
        return
      }
      discounts = discountResult.data
      setDiscountsByProductId(discounts)
    }

    const validated = validateCustomerTxBeforeNext({
      truckNo,
      plateNo,
      fullsGroups,
      emptiesGroups,
      qtys,
      discountsByProductId: discounts,
    })

    if (validated.error || !validated.ledger) {
      setError(validated.error)
      return
    }

    setLedgerDraft({
      orderLines: validated.ledger.orderLines,
      emptiesLines: validated.ledger.emptiesLines,
      ordersTotal: validated.ledger.ordersTotal,
      emptiesTotal: validated.ledger.emptiesTotal,
      payablesTotal: validated.ledger.payablesTotal,
    })
    setLedgerOpen(true)
  }

  async function handleLedgerSave(payment: { amount: string; cashChequeNo: string }) {
    setSaving(true)
    setLedgerError(null)
    setError(null)
    setSavePopup(null)

    const customerName = selectedCustomer?.name ?? ''
    const plateDisplay = formatCustomerTxPlateDisplay(truckNo, plateNo)
    const payables = formatLedgerMoney(ledgerDraft?.payablesTotal ?? 0)

    const payload = {
      branch: activeBranch,
      company,
      customerId: selectedCustomer?.id ?? null,
      customerName,
      invoiceNo,
      truckNo,
      plateNo,
      transactionAtText: dateText,
      fullsGroups,
      emptiesGroups,
      qtys,
      discountsByProductId,
      paymentAmount: payment.amount,
      cashChequeNo: payment.cashChequeNo,
      createdBy: user?.id,
    }

    const result = editingId
      ? await updateCustomerTransaction(editingId, payload)
      : await saveCustomerTransaction(payload)

    setSaving(false)

    if (result.missingTable) {
      setMissingTable(true)
      setLedgerError(result.error)
      return
    }
    if (result.error) {
      setLedgerError(result.error)
      return
    }

    const updated = 'updated' in result ? Boolean(result.updated) : false
    const savedSalesNo = result.data?.salesNo ?? salesNo

    setPrintData({
      company,
      branch: activeBranch,
      customerName,
      salesNo: savedSalesNo,
      invoiceNo,
      truckNo,
      plateNo,
      dateText,
      orderLines: ledgerDraft?.orderLines ?? [],
      emptiesLines: ledgerDraft?.emptiesLines ?? [],
      ordersTotal: ledgerDraft?.ordersTotal ?? 0,
      emptiesTotal: ledgerDraft?.emptiesTotal ?? 0,
      payablesTotal: ledgerDraft?.payablesTotal ?? 0,
      paymentAmount: payment.amount,
      cashChequeNo: payment.cashChequeNo,
    })

    setLedgerOpen(false)
    setLedgerDraft(null)
    setSaveToastPaused(false)
    setSavePopup({
      salesNo: savedSalesNo,
      customerName,
      company,
      plateDisplay,
      payables,
      updated,
    })
    setPaymentAmountDraft(payment.amount)
    setCashChequeDraft(payment.cashChequeNo)
    await resetToNew()
  }

  async function copySql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
    <section
      className={`ctx-panel ctx-panel--${company.toLowerCase()} no-print`}
      aria-label={headerTitle}
    >
      <header className="ctx-panel__chrome">
        <div className="ctx-panel__title-row">
          <span className="ctx-panel__cart" aria-hidden="true">
            <CartIcon />
          </span>
          <h1>{headerTitle}</h1>
          {onClose ? (
            <button type="button" className="ctx-panel__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>

        {editingId ? (
          <p className="ctx-editing-banner">
            Editing Sales No. <strong>{salesNo}</strong> — change quantities or DATE, then Next to
            update. You can move the transaction to another day via DATE.
          </p>
        ) : null}

        <div className="ctx-panel__meta">
          <div className="ctx-panel__meta-col">
            <label className="ctx-field">
              <span>CUSTOMER:</span>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                {customers.length === 0 ? (
                  <option value="">No customers yet</option>
                ) : (
                  customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="ctx-field">
              <span>SALES NO.:</span>
              <input
                type="text"
                value={salesNo}
                readOnly
                title={
                  editingId
                    ? 'Existing sales number (kept on update)'
                    : `${activeBranch} monthly series`
                }
              />
            </label>
            <label className="ctx-field">
              <span>INVOICE NO.:</span>
              <input
                type="text"
                value={invoiceNo}
                onChange={(event) => setInvoiceNo(event.target.value)}
              />
            </label>
          </div>

          <div className="ctx-panel__meta-col">
            <label className="ctx-field">
              <span>TRUCK NO.:</span>
              <select
                value={truckNo}
                onChange={(event) => handleTruckChange(event.target.value)}
              >
                <option value="">Select…</option>
                {CUSTOMER_TX_TRUCK_PRESETS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="ctx-field">
              <span>PLATE NO.:</span>
              <input
                type="text"
                value={plateNo}
                onChange={(event) => setPlateNo(event.target.value)}
                disabled={isPickUpTruck(truckNo)}
                placeholder={plateRequired ? 'Required for delivery' : 'N/A'}
              />
            </label>
            <label className="ctx-field">
              <span>DATE :</span>
              <input
                type="text"
                value={dateText}
                onChange={(event) => setDateText(event.target.value)}
                title="Editable — change this to transfer the transaction to another day"
              />
            </label>
          </div>
        </div>
      </header>

      <div className="ctx-panel__body">
        {missingTable ? (
          <div className="ctx-setup">
            <div>
              <strong>Customer Transaction setup required</strong>
              <p>
                Run the Customer Transaction SQL in Supabase so Sales No. series and saves work
                (Nabunturan series is separate from Davao).
              </p>
            </div>
            <button type="button" className="ctx-btn ctx-btn--secondary" onClick={() => void copySql()}>
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
          </div>
        ) : null}

        <div className="ctx-tabs" role="tablist" aria-label="Product sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'fulls'}
            className={tab === 'fulls' ? 'ctx-tab is-active' : 'ctx-tab'}
            onClick={() => setTab('fulls')}
          >
            {company}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'empties'}
            className={tab === 'empties' ? 'ctx-tab is-active' : 'ctx-tab'}
            onClick={() => setTab('empties')}
          >
            Empties
          </button>
        </div>

        {error ? <p className="ctx-error">{error}</p> : null}
        {loading ? <p className="ctx-empty">Loading products…</p> : null}

        {!loading && activeGroups.length === 0 ? (
          <p className="ctx-empty">
            No {tab === 'fulls' ? company : 'Empties'} products found in the shared SKU catalog.
          </p>
        ) : null}

        {!loading && activeGroups.length > 0 ? (
          <div className="ctx-brands">
            {activeGroups.flatMap((group) => {
              const splitFulls =
                tab === 'fulls' && (company === 'SMC' || company === 'Magnolia')
              const chunks = splitFulls
                ? (() => {
                    const mid = Math.ceil(group.items.length / 2)
                    const left = group.items.slice(0, mid)
                    const right = group.items.slice(mid)
                    return right.length > 0 ? [left, right] : [left]
                  })()
                : [group.items]

              return chunks.map((items, chunkIndex) => (
                <section
                  key={`${group.id}-${chunkIndex}`}
                  className="ctx-brand-card"
                  aria-label={
                    chunks.length > 1 ? `${group.title} (${chunkIndex + 1})` : group.title
                  }
                >
                  <h2>{group.title}</h2>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>
                        <span title={item.label}>{item.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          className={(qtys[item.id] ?? '').trim() !== '' ? 'is-filled' : undefined}
                          value={qtys[item.id] ?? ''}
                          onChange={(event) => setQty(item.id, event.target.value)}
                          aria-label={`Quantity for ${item.label}`}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            })}
          </div>
        ) : null}

        <div className="ctx-actions">
          <button
            type="button"
            className="ctx-btn ctx-btn--save"
            disabled={loading || saving || missingTable}
            onClick={() => void handleNext()}
          >
            Next
          </button>
          <button
            type="button"
            className="ctx-btn ctx-btn--search"
            disabled={loading || saving || missingTable}
            onClick={() => void handleSearch()}
          >
            Search
          </button>
          <button
            type="button"
            className="ctx-btn ctx-btn--secondary"
            disabled={loading || saving}
            onClick={handleClear}
          >
            Clear
          </button>
          <button
            type="button"
            className="ctx-btn ctx-btn--cancel"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>

      {ledgerDraft ? (
        <CustomerLedgerModal
          open={ledgerOpen}
          company={company}
          branch={activeBranch}
          customerName={selectedCustomer?.name ?? ''}
          salesNo={salesNo}
          invoiceNo={invoiceNo}
          truckNo={truckNo}
          plateNo={plateNo}
          dateText={dateText}
          orderLines={ledgerDraft.orderLines}
          emptiesLines={ledgerDraft.emptiesLines}
          ordersTotal={ledgerDraft.ordersTotal}
          emptiesTotal={ledgerDraft.emptiesTotal}
          payablesTotal={ledgerDraft.payablesTotal}
          saving={saving}
          error={ledgerError}
          initialPaymentAmount={paymentAmountDraft}
          initialCashChequeNo={cashChequeDraft}
          saveLabel={editingId ? 'Update' : 'Save'}
          onClose={() => {
            if (saving) return
            setLedgerOpen(false)
            setLedgerError(null)
          }}
          onSave={(payment) => void handleLedgerSave(payment)}
        />
      ) : null}

      {searchOpen ? (
        <div
          className="modal-backdrop ctx-search-backdrop"
          onClick={() => setSearchOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel ctx-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ctx-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="ctx-search-title">Saved {company} records</h2>
                <p>
                  Pick a day, then select a {company} record to edit (DATE can be moved to another
                  day).
                </p>
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

            <div className="ctx-search-body">
              <label className="ctx-search-date">
                <span>Date</span>
                <input
                  type="date"
                  value={searchDate}
                  onChange={(event) => void handleSearchDateChange(event.target.value)}
                />
              </label>

              {searchError ? <p className="ctx-error">{searchError}</p> : null}
              {searching ? <p className="ctx-empty">Loading…</p> : null}

              {!searching && searchResults.length === 0 ? (
                <p className="ctx-empty">No saved {company} records for this date.</p>
              ) : null}

              {!searching && searchGroups.length > 0 ? (
                <div className="ctx-search-groups">
                  {searchGroups.map((group) => (
                    <section key={group.company} className="ctx-search-group">
                      <h3>{group.company}</h3>
                      <div className="ctx-search-table-wrap">
                        <table className="ctx-search-table">
                          <thead>
                            <tr>
                              <th>Sales No.</th>
                              <th>Customer</th>
                              <th>Invoice</th>
                              <th>Truck / Plate</th>
                              <th>Payables</th>
                              <th>Time</th>
                              <th>Print</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.records.map((record) => {
                              const isLoading = loadingRecordId === record.id
                              const isPrintingRow = printingRecordId === record.id
                              return (
                                <tr
                                  key={record.id}
                                  className={`ctx-search-row${isLoading ? ' is-loading' : ''}${
                                    editingId === record.id ? ' is-selected' : ''
                                  }`}
                                  tabIndex={loadingRecordId || printingRecordId ? -1 : 0}
                                  role="button"
                                  aria-busy={isLoading || isPrintingRow}
                                  aria-label={`Select sales ${record.sales_no} ${record.customer_name}`}
                                  onClick={() => void selectSearchResult(record)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      void selectSearchResult(record)
                                    }
                                  }}
                                >
                                  <td>{record.sales_no}</td>
                                  <td>{record.customer_name || '—'}</td>
                                  <td>{record.invoice_no || '—'}</td>
                                  <td>
                                    {formatCustomerTxPlateDisplay(
                                      record.truck_no,
                                      record.plate_no,
                                    )}
                                  </td>
                                  <td>{formatLedgerMoney(Number(record.payables_total) || 0)}</td>
                                  <td>
                                    {isLoading
                                      ? 'Loading…'
                                      : formatCustomerTxDateTimeFromIso(record.transaction_at)}
                                  </td>
                                  <td className="ctx-search-print-cell">
                                    <button
                                      type="button"
                                      className="ctx-search-print-btn"
                                      disabled={Boolean(printingRecordId) || printing}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void printSearchRecord(record)
                                      }}
                                    >
                                      {isPrintingRow ? '…' : 'Print'}
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {savePopup ? (
        <div className="ctx-toast-backdrop" onClick={dismissSavePopup} role="presentation">
          <div
            className={`ctx-toast${saveToastPaused ? ' is-paused' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ctx-toast-title"
            aria-describedby="ctx-toast-detail"
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
            <div className="ctx-toast__glow" aria-hidden="true" />
            <div className="ctx-toast__check" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  className="ctx-toast__check-path"
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className="ctx-toast__eyebrow">Success</p>
            <h2 id="ctx-toast-title">
              {savePopup.updated ? 'Transaction updated' : 'Transaction saved'}
            </h2>
            <p id="ctx-toast-detail">
              Sales No. {savePopup.salesNo} is{' '}
              {savePopup.updated ? 'updated' : 'recorded'} for {savePopup.company} · {activeBranch}.
            </p>

            <div className="ctx-toast__meta" aria-label="Saved record summary">
              <div className="ctx-toast__chip">
                <span>Customer</span>
                <strong>{savePopup.customerName || '—'}</strong>
              </div>
              <div className="ctx-toast__chip">
                <span>Sales No.</span>
                <strong>{savePopup.salesNo || '—'}</strong>
              </div>
              <div className="ctx-toast__chip">
                <span>Plate</span>
                <strong>{savePopup.plateDisplay || '—'}</strong>
              </div>
              <div className="ctx-toast__chip is-payable">
                <span>Payables</span>
                <strong>{savePopup.payables}</strong>
              </div>
            </div>

            <div className="ctx-toast__actions">
              <button
                type="button"
                className="ctx-toast__btn ctx-toast__btn--ghost"
                onClick={() => {
                  dismissSavePopup()
                  void handleSearch()
                }}
              >
                Find saved
              </button>
              <button
                type="button"
                className="ctx-toast__btn ctx-toast__btn--ghost"
                disabled={!printData}
                onClick={() => {
                  setSaveToastPaused(true)
                  setPrinting(true)
                }}
              >
                Print
              </button>
              <button
                type="button"
                className="ctx-toast__btn ctx-toast__btn--primary"
                onClick={dismissSavePopup}
              >
                Continue
              </button>
            </div>

            <div
              className="ctx-toast__progress"
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
    </section>
    <CustomerTransactionPrintSheet data={printData} active={printing} />
    </>
  )
}
