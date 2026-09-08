import { supabase } from './supabase'
import { isMissingCatalogTable } from './catalog'
import type { UserBranch } from './branches'
import type { BoBrandGroup } from './boBadOrder'
import type { CustomerTransactionCompany } from './customerTransaction'
import {
  buildCustomerTxLedger,
  formatCustomerTxDateTime,
} from './customerTransaction'

import {
  allocateNextSharedSalesNo,
  formatSharedSalesNo,
  peekNextSharedSalesNo,
} from './sharedSalesSeries'

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Customer Transaction tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }
  return error.message ?? 'Something went wrong.'
}

export function currentYearMonth(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** Plain monthly series: 1, 2, 3… (resets each month per branch + company). */
export function formatSalesNo(seq: number) {
  return formatSharedSalesNo(seq)
}

/** Preview next sales no without consuming the series.
 * Continues with Route Summary for the same branch + company.
 */
export async function peekNextCustomerSalesNo(
  branch: UserBranch,
  company: CustomerTransactionCompany,
) {
  return peekNextSharedSalesNo(branch, company)
}

/** Atomically allocate next monthly sales no for this branch + company.
 * Shared with Route Summary so numbers continue across both modules.
 */
export async function allocateNextCustomerSalesNo(
  branch: UserBranch,
  company: CustomerTransactionCompany,
) {
  return allocateNextSharedSalesNo(branch, company)
}

export const CUSTOMER_TX_TRUCK_PRESETS = ['Pick-up', 'Deliver'] as const

export function isPickUpTruck(truckNo: string) {
  const value = truckNo.trim().toLowerCase()
  return value === 'pick-up' || value === 'pickup' || value === 'pick up'
}

export function isDeliverTruck(truckNo: string) {
  const value = truckNo.trim().toLowerCase()
  return value === 'deliver' || value === 'delivery'
}

export type CustomerTxSaveInput = {
  branch: UserBranch
  company: CustomerTransactionCompany
  customerId: string | null
  customerName: string
  invoiceNo: string
  truckNo: string
  plateNo: string
  transactionAtText: string
  fullsGroups: BoBrandGroup[]
  emptiesGroups: BoBrandGroup[]
  qtys: Record<string, string>
  discountsByProductId?: Record<string, string>
  paymentAmount?: string
  cashChequeNo?: string
  createdBy?: string
}

function parseTransactionAt(text: string) {
  // Expected UI format: MM-DD-YYYY HH:mm:ss
  const match = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(text.trim())
  if (!match) return new Date()
  const [, mm, dd, yyyy, hh, min, ss] = match
  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  )
  return Number.isNaN(date.getTime()) ? new Date() : date
}

export function validateCustomerTxBeforeNext(input: {
  truckNo: string
  plateNo: string
  fullsGroups: BoBrandGroup[]
  emptiesGroups: BoBrandGroup[]
  qtys: Record<string, string>
  discountsByProductId?: Record<string, string>
}) {
  const truck = input.truckNo.trim()
  if (!truck) {
    return { error: 'Truck no is required.' }
  }

  const plate = input.plateNo.trim() || 'N/A'
  if (!isPickUpTruck(truck)) {
    if (!plate || plate.toUpperCase() === 'N/A') {
      return { error: 'Enter a plate no before continuing a delivery / truck transaction.' }
    }
  }

  const ledger = buildCustomerTxLedger(
    input.fullsGroups,
    input.emptiesGroups,
    input.qtys,
    input.discountsByProductId ?? {},
  )
  if (ledger.error) return { error: ledger.error }
  return { error: null as string | null, ledger }
}

export async function saveCustomerTransaction(input: CustomerTxSaveInput) {
  const validated = validateCustomerTxBeforeNext(input)
  if (validated.error || !validated.ledger) {
    return { data: null, error: validated.error, missingTable: false }
  }

  const truck = input.truckNo.trim()
  const plate = input.plateNo.trim() || 'N/A'
  const ledger = validated.ledger

  const paymentRaw = (input.paymentAmount ?? '').trim()
  let paymentAmount: number | null = null
  if (paymentRaw) {
    paymentAmount = Number(paymentRaw)
    if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
      return { data: null, error: 'Enter a valid payment amount.', missingTable: false }
    }
  }

  const allocated = await allocateNextCustomerSalesNo(input.branch, input.company)
  if (allocated.missingTable || allocated.error) {
    return { data: null, error: allocated.error, missingTable: allocated.missingTable }
  }

  const { data: header, error } = await supabase
    .from('customer_transactions')
    .insert({
      branch: input.branch,
      company: input.company,
      sales_no: allocated.salesNo,
      sales_seq: allocated.seq,
      year_month: allocated.yearMonth,
      customer_id: input.customerId,
      customer_name: input.customerName,
      invoice_no: input.invoiceNo.trim(),
      truck_no: truck,
      plate_no: isPickUpTruck(truck) ? 'N/A' : plate,
      orders_total: ledger.ordersTotal,
      empties_total: ledger.emptiesTotal,
      payables_total: ledger.payablesTotal,
      payment_amount: paymentAmount,
      cash_cheque_no: (input.cashChequeNo ?? '').trim(),
      transaction_at: parseTransactionAt(
        input.transactionAtText || formatCustomerTxDateTime(),
      ).toISOString(),
      created_by: input.createdBy ?? null,
    })
    .select('id, sales_no')
    .single()

  if (error || !header) {
    return { data: null, error: mapError(error), missingTable: isMissingCatalogTable(error) }
  }

  const allLines = [...ledger.orderLines, ...ledger.emptiesLines]
  const { error: itemsError } = await supabase.from('customer_transaction_items').insert(
    allLines.map((line) => ({
      transaction_id: header.id,
      section: line.section,
      product_id: line.productId,
      product_name: line.description,
      brand_id: line.brandId,
      brand_name: line.brandName,
      quantity: line.qty,
      unit: line.unit,
      price: line.price,
      discount: line.discount,
      line_total: line.total,
      line_amount: line.totalAmount,
    })),
  )

  if (itemsError) {
    await supabase.from('customer_transactions').delete().eq('id', header.id)
    return {
      data: null,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  return {
    data: { id: header.id as string, salesNo: header.sales_no as string },
    error: null as string | null,
    missingTable: false,
  }
}

export type CustomerTxRecord = {
  id: string
  branch: UserBranch
  company: CustomerTransactionCompany
  sales_no: string
  customer_id: string | null
  customer_name: string
  invoice_no: string
  truck_no: string
  plate_no: string
  orders_total: number
  empties_total: number
  payables_total: number
  payment_amount: number | null
  cash_cheque_no: string
  transaction_at: string
  created_at: string
}

export type CustomerTxItemRecord = {
  id: string
  transaction_id: string
  section: 'fulls' | 'empties'
  product_id: string | null
  product_name: string
  brand_id: string | null
  brand_name: string
  quantity: number
  unit: string
  price: number
  discount: number
  line_total: number
  line_amount: number
}

export function toIsoDateInput(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function dayBounds(isoDate: string) {
  const [yyyy, mm, dd] = isoDate.split('-').map(Number)
  const start = new Date(yyyy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0)
  const end = new Date(yyyy, (mm || 1) - 1, dd || 1, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

const CUSTOMER_TX_COMPANY_ORDER: CustomerTransactionCompany[] = ['Pepsi', 'SMC', 'Magnolia']

export function groupCustomerTxRecordsByCompany(records: CustomerTxRecord[]) {
  const groups = CUSTOMER_TX_COMPANY_ORDER.map((company) => ({
    company,
    records: records.filter((row) => row.company === company),
  }))
  return groups.filter((group) => group.records.length > 0)
}

export async function listCustomerTransactionsByDate(
  branch: UserBranch,
  isoDate: string,
  company?: CustomerTransactionCompany,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return {
      data: [] as CustomerTxRecord[],
      error: 'Pick a valid date.',
      missingTable: false,
    }
  }

  return listCustomerTransactionsInRange(branch, isoDate, isoDate, company)
}

export async function listCustomerTransactionsInRange(
  branch: UserBranch,
  startIsoDate: string,
  endIsoDate: string,
  company?: CustomerTransactionCompany,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startIsoDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endIsoDate)
  ) {
    return {
      data: [] as CustomerTxRecord[],
      error: 'Pick a valid date.',
      missingTable: false,
    }
  }

  const start = dayBounds(startIsoDate).start
  const end = dayBounds(endIsoDate).end
  let query = supabase
    .from('customer_transactions')
    .select(
      'id, branch, company, sales_no, customer_id, customer_name, invoice_no, truck_no, plate_no, orders_total, empties_total, payables_total, payment_amount, cash_cheque_no, transaction_at, created_at',
    )
    .eq('branch', branch)
    .gte('transaction_at', start)
    .lte('transaction_at', end)

  if (company) {
    query = query.eq('company', company)
  }

  const { data, error } = await query
    .order('company', { ascending: true })
    .order('transaction_at', { ascending: true })

  if (error) {
    return {
      data: [] as CustomerTxRecord[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as CustomerTxRecord[],
    error: null as string | null,
    missingTable: false,
  }
}

const CUSTOMER_TX_ITEMS_CHUNK = 100

/** Headers + line items for customer TX in a date range (for printable running stock). */
export async function listCustomerTransactionsWithItemsInRange(
  branch: UserBranch,
  startIsoDate: string,
  endIsoDate: string,
  company?: CustomerTransactionCompany,
) {
  const headers = await listCustomerTransactionsInRange(
    branch,
    startIsoDate,
    endIsoDate,
    company,
  )
  if (headers.error || headers.missingTable) {
    return {
      data: [] as Array<{ transaction: CustomerTxRecord; items: CustomerTxItemRecord[] }>,
      error: headers.error,
      missingTable: headers.missingTable,
    }
  }

  const records = headers.data
  if (records.length === 0) {
    return {
      data: [] as Array<{ transaction: CustomerTxRecord; items: CustomerTxItemRecord[] }>,
      error: null as string | null,
      missingTable: false,
    }
  }

  const byTx = new Map<string, CustomerTxItemRecord[]>()
  for (let i = 0; i < records.length; i += CUSTOMER_TX_ITEMS_CHUNK) {
    const ids = records.slice(i, i + CUSTOMER_TX_ITEMS_CHUNK).map((row) => row.id)
    const { data, error } = await supabase
      .from('customer_transaction_items')
      .select(
        'id, transaction_id, section, product_id, product_name, brand_id, brand_name, quantity, unit, price, discount, line_total, line_amount',
      )
      .in('transaction_id', ids)

    if (error) {
      return {
        data: [] as Array<{ transaction: CustomerTxRecord; items: CustomerTxItemRecord[] }>,
        error: mapError(error),
        missingTable: isMissingCatalogTable(error),
      }
    }

    for (const item of (data ?? []) as CustomerTxItemRecord[]) {
      const list = byTx.get(item.transaction_id) ?? []
      list.push(item)
      byTx.set(item.transaction_id, list)
    }
  }

  return {
    data: records.map((transaction) => ({
      transaction,
      items: byTx.get(transaction.id) ?? [],
    })),
    error: null as string | null,
    missingTable: false,
  }
}

export async function getCustomerTransactionDetail(id: string) {
  const { data: header, error } = await supabase
    .from('customer_transactions')
    .select(
      'id, branch, company, sales_no, customer_id, customer_name, invoice_no, truck_no, plate_no, orders_total, empties_total, payables_total, payment_amount, cash_cheque_no, transaction_at, created_at',
    )
    .eq('id', id)
    .single()

  if (error || !header) {
    return {
      data: null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('customer_transaction_items')
    .select(
      'id, transaction_id, section, product_id, product_name, brand_id, brand_name, quantity, unit, price, discount, line_total, line_amount',
    )
    .eq('transaction_id', id)
    .order('created_at', { ascending: true })

  if (itemsError) {
    return {
      data: null,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  return {
    data: {
      transaction: header as CustomerTxRecord,
      items: ((items ?? []) as CustomerTxItemRecord[]).filter(
        (item) => item.transaction_id === id,
      ),
    },
    error: null as string | null,
    missingTable: false,
  }
}

export async function updateCustomerTransaction(id: string, input: CustomerTxSaveInput) {
  const validated = validateCustomerTxBeforeNext(input)
  if (validated.error || !validated.ledger) {
    return { data: null, error: validated.error, missingTable: false, updated: false }
  }

  const truck = input.truckNo.trim()
  const plate = input.plateNo.trim() || 'N/A'
  const ledger = validated.ledger

  const paymentRaw = (input.paymentAmount ?? '').trim()
  let paymentAmount: number | null = null
  if (paymentRaw) {
    paymentAmount = Number(paymentRaw)
    if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
      return {
        data: null,
        error: 'Enter a valid payment amount.',
        missingTable: false,
        updated: false,
      }
    }
  }

  const transactionAt = parseTransactionAt(
    input.transactionAtText || formatCustomerTxDateTime(),
  ).toISOString()

  const { data: header, error } = await supabase
    .from('customer_transactions')
    .update({
      customer_id: input.customerId,
      customer_name: input.customerName,
      invoice_no: input.invoiceNo.trim(),
      truck_no: truck,
      plate_no: isPickUpTruck(truck) ? 'N/A' : plate,
      orders_total: ledger.ordersTotal,
      empties_total: ledger.emptiesTotal,
      payables_total: ledger.payablesTotal,
      payment_amount: paymentAmount,
      cash_cheque_no: (input.cashChequeNo ?? '').trim(),
      transaction_at: transactionAt,
    })
    .eq('id', id)
    .select('id, sales_no')
    .single()

  if (error || !header) {
    return {
      data: null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
      updated: false,
    }
  }

  const { error: deleteError } = await supabase
    .from('customer_transaction_items')
    .delete()
    .eq('transaction_id', id)

  if (deleteError) {
    return {
      data: null,
      error: mapError(deleteError),
      missingTable: isMissingCatalogTable(deleteError),
      updated: false,
    }
  }

  const allLines = [...ledger.orderLines, ...ledger.emptiesLines]
  const { error: itemsError } = await supabase.from('customer_transaction_items').insert(
    allLines.map((line) => ({
      transaction_id: id,
      section: line.section,
      product_id: line.productId,
      product_name: line.description,
      brand_id: line.brandId,
      brand_name: line.brandName,
      quantity: line.qty,
      unit: line.unit,
      price: line.price,
      discount: line.discount,
      line_total: line.total,
      line_amount: line.totalAmount,
    })),
  )

  if (itemsError) {
    return {
      data: null,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
      updated: false,
    }
  }

  return {
    data: { id: header.id as string, salesNo: header.sales_no as string },
    error: null as string | null,
    missingTable: false,
    updated: true,
  }
}
