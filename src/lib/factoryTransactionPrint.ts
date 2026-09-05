import {
  factoryTransactionTitle,
  type FactoryTransactionDetail,
  type FactoryTransactionItemRecord,
} from './factoryTransaction'
import type { InventoryCategory } from './inventoryPreview'

export type FactoryTransactionPrintRow = {
  id: string
  pallets: number
  cases: number
  sku: string
  price: number
  amount: number
}

export type FactoryTransactionDiscountPrintRow = {
  id: string
  cases: number
  sku: string
  price: number
  amount: number
}

export type FactoryTransactionRunningTotals = {
  palletsIn: number
  casesIn: number
  runningDiscount: number
  palletsOut: number
  mtsOut: number
}

export type FactoryTransactionAdjustmentPrintRow = {
  id: string
  description: string
  amount: number
}

export type FactoryTransactionPrintData = {
  title: string
  printDateLabel: string
  updatedLabel: string
  plateNo: string
  loadNo: string
  driver: string
  helper: string
  chequeNo: string
  chequeDueDate: string
  chequeAmountValue: number
  payableAmount: number
  overBal: number
  overBalTone: 'is-over' | 'is-short'
  runningTotals: FactoryTransactionRunningTotals
  totals: {
    fgPallets: number
    fgCases: number
    mtsPallets: number
    mtsCases: number
    fullsAmount: number
    mtsAmount: number
    discountFthAmount: number
  }
  printRows: {
    fulls: FactoryTransactionPrintRow[]
    discounts: FactoryTransactionDiscountPrintRow[]
    empties: FactoryTransactionPrintRow[]
  }
  otherDeductions: FactoryTransactionAdjustmentPrintRow[]
  otherAdditionals: FactoryTransactionAdjustmentPrintRow[]
}

export function formatPrintMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
}

export function formatPrintRunningQty(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function formatPrintQty(value: number) {
  if (!value) return ''
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}

export function formatPrintPalletsBreakdown(pallets: number, cases: number) {
  const palletQty = Number(pallets) || 0
  const caseQty = Number(cases) || 0
  if (!palletQty) return ''
  const casesPerPallet = caseQty / palletQty
  return `${formatPrintQty(palletQty)} x ${formatPrintQty(casesPerPallet)}`
}

function formatPrintSku(subcategoryName: string, productName: string) {
  const product = productName.trim()
  const subcategory = subcategoryName.trim()
  if (!subcategory) return product
  return `${subcategory} ${product}`
}

function formatPrintDateLabel(transactionDate: string, createdAt?: string) {
  const source = createdAt ?? `${transactionDate}T12:00:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return transactionDate
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function buildPrintRowsFromItems(items: FactoryTransactionItemRecord[]) {
  const fulls: FactoryTransactionPrintRow[] = []
  const discounts: FactoryTransactionDiscountPrintRow[] = []
  const empties: FactoryTransactionPrintRow[] = []

  for (const item of items) {
    const pallets = Number(item.pallets) || 0
    const cases = Number(item.cases) || 0
    const discount = Number(item.discount) || 0
    const price = Number(item.price) || 0
    if (!pallets && !cases) continue

    if (item.section === 'fg') {
      fulls.push({
        id: item.id,
        pallets,
        cases,
        sku: formatPrintSku(item.subcategory_name, item.product_name),
        price,
        amount: Number(item.line_amount) || cases * price,
      })
      if (cases && discount) {
        discounts.push({
          id: `disc-${item.id}`,
          cases,
          sku: formatPrintSku(item.subcategory_name, item.product_name),
          price: discount,
          amount: Number(item.discount_amount) || cases * discount,
        })
      }
    } else {
      empties.push({
        id: item.id,
        pallets,
        cases,
        sku: item.product_name.trim(),
        price,
        amount: Number(item.line_amount) || cases * price,
      })
    }
  }

  return { fulls, discounts, empties }
}

function buildAdjustmentPrintRows(
  adjustments: FactoryTransactionDetail['adjustments'],
  kind: 'deductions' | 'additionals',
): FactoryTransactionAdjustmentPrintRow[] {
  return adjustments
    .filter((entry) => entry.kind === kind)
    .filter((entry) => entry.description.trim() || Number(entry.amount))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((entry) => ({
      id: entry.id,
      description: entry.description.trim() || '—',
      amount: Number(entry.amount) || 0,
    }))
}

function sumItemQty(items: FactoryTransactionItemRecord[], section: 'fg' | 'mts', field: 'pallets' | 'cases') {
  return items
    .filter((item) => item.section === section)
    .reduce((sum, item) => sum + (Number(item[field]) || 0), 0)
}

export function buildFactoryTransactionRunningTotals(
  details: FactoryTransactionDetail[],
): FactoryTransactionRunningTotals {
  let palletsIn = 0
  let casesIn = 0
  let runningDiscount = 0
  let palletsOut = 0
  let mtsOut = 0

  for (const detail of details) {
    palletsIn += sumItemQty(detail.items, 'fg', 'pallets')
    casesIn += sumItemQty(detail.items, 'fg', 'cases')
    runningDiscount += Number(detail.transaction.discount_fth_amount) || 0
    palletsOut += sumItemQty(detail.items, 'mts', 'pallets')
    mtsOut += sumItemQty(detail.items, 'mts', 'cases')
  }

  return { palletsIn, casesIn, runningDiscount, palletsOut, mtsOut }
}

/** Chronological (created_at ascending) cumulative totals through each transaction. */
export function buildFactoryTransactionRunningTotalsById(
  details: FactoryTransactionDetail[],
): Map<string, FactoryTransactionRunningTotals> {
  const ordered = [...details].sort((a, b) => {
    const byCreated = a.transaction.created_at.localeCompare(b.transaction.created_at)
    if (byCreated !== 0) return byCreated
    return a.transaction.id.localeCompare(b.transaction.id)
  })

  const byId = new Map<string, FactoryTransactionRunningTotals>()
  let palletsIn = 0
  let casesIn = 0
  let runningDiscount = 0
  let palletsOut = 0
  let mtsOut = 0

  for (const detail of ordered) {
    palletsIn += sumItemQty(detail.items, 'fg', 'pallets')
    casesIn += sumItemQty(detail.items, 'fg', 'cases')
    runningDiscount += Number(detail.transaction.discount_fth_amount) || 0
    palletsOut += sumItemQty(detail.items, 'mts', 'pallets')
    mtsOut += sumItemQty(detail.items, 'mts', 'cases')
    byId.set(detail.transaction.id, {
      palletsIn,
      casesIn,
      runningDiscount,
      palletsOut,
      mtsOut,
    })
  }

  return byId
}

export function emptyFactoryTransactionRunningTotals(): FactoryTransactionRunningTotals {
  return {
    palletsIn: 0,
    casesIn: 0,
    runningDiscount: 0,
    palletsOut: 0,
    mtsOut: 0,
  }
}

export function buildFactoryTransactionPrintData(
  category: InventoryCategory,
  detail: FactoryTransactionDetail,
  runningTotals: FactoryTransactionRunningTotals,
): FactoryTransactionPrintData {
  const { transaction, items, adjustments } = detail
  const chequeAmountValue =
    transaction.cheque_amount == null ? 0 : Number(transaction.cheque_amount) || 0
  const payableAmount = Number(transaction.payable_amount) || 0
  const overBal = chequeAmountValue - payableAmount
  const createdLabel = formatPrintDateLabel(transaction.transaction_date, transaction.created_at)

  return {
    title: factoryTransactionTitle(category),
    printDateLabel: createdLabel,
    updatedLabel: createdLabel,
    plateNo: transaction.plate_no ?? '',
    loadNo: transaction.load_no ?? '',
    driver: transaction.driver ?? '',
    helper: transaction.helper ?? '',
    chequeNo: transaction.cheque_no ?? '',
    chequeDueDate: transaction.cheque_due_date ?? '',
    chequeAmountValue,
    payableAmount,
    overBal,
    overBalTone: overBal > 0 ? 'is-over' : 'is-short',
    runningTotals,
    totals: {
      fgPallets: sumItemQty(items, 'fg', 'pallets'),
      fgCases: sumItemQty(items, 'fg', 'cases'),
      mtsPallets: sumItemQty(items, 'mts', 'pallets'),
      mtsCases: sumItemQty(items, 'mts', 'cases'),
      fullsAmount: Number(transaction.fulls_amount) || 0,
      mtsAmount: Number(transaction.mts_amount) || 0,
      discountFthAmount: Number(transaction.discount_fth_amount) || 0,
    },
    printRows: buildPrintRowsFromItems(items),
    otherDeductions: buildAdjustmentPrintRows(adjustments, 'deductions'),
    otherAdditionals: buildAdjustmentPrintRows(adjustments, 'additionals'),
  }
}
