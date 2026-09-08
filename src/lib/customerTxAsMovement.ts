import { formatCustomerTxPlateDisplay, type CustomerTransactionCompany } from './customerTransaction'
import type { CustomerTxItemRecord, CustomerTxRecord } from './customerTxSave'
import type { FullGoodsItem, FullGoodsMovement } from '../types/fullGoods'

export type CustomerTxMovementMode = 'fulls' | 'empties'

function normalizeCategoryName(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function printableCategoryToCustomerCompany(
  category: string,
): CustomerTransactionCompany | null {
  const name = normalizeCategoryName(category)
  if (name === 'pcppi' || name.includes('pepsi')) return 'Pepsi'
  if (name.includes('smc')) return 'SMC'
  if (name.includes('magnolia') || name.includes('magnoia')) return 'Magnolia'
  return null
}

export function isoDateFromTimestamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
    return match?.[1] ?? todayIsoDate()
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Map a customer transaction into a Fulls/Empties movement row.
 * Fulls = Out (sold). Empties = In (returned / brought in by customer).
 */
export function customerTxToPrintableMovement(
  transaction: CustomerTxRecord,
  items: CustomerTxItemRecord[],
  mode: CustomerTxMovementMode,
  fallbackCategory: string,
): FullGoodsMovement {
  const section = mode === 'empties' ? 'empties' : 'fulls'
  const printItems: FullGoodsItem[] = items
    .filter((item) => item.section === section && Number(item.quantity) !== 0)
    .map((item) => ({
      id: item.id,
      movement_id: transaction.id,
      product_id: item.product_id,
      product_name: item.product_name,
      brand_id: item.brand_id,
      brand_name: item.brand_name,
      quantity: Number(item.quantity) || 0,
      created_at: transaction.transaction_at || transaction.created_at,
    }))

  return {
    id: transaction.id,
    branch: transaction.branch,
    movement_type: mode === 'empties' ? 'in' : 'out',
    movement_date: isoDateFromTimestamp(transaction.transaction_at || transaction.created_at),
    truck_number: formatCustomerTxPlateDisplay(transaction.truck_no, transaction.plate_no),
    load_number: transaction.sales_no,
    location: transaction.customer_name.trim() || '—',
    location_id: null,
    category_id: null,
    category_name: fallbackCategory,
    brand_id: null,
    brand_name: mode === 'empties' ? fallbackCategory : null,
    created_at: transaction.transaction_at || transaction.created_at,
    items: printItems,
  }
}
