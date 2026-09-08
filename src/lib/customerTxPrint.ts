import type { UserBranch } from './branches'
import {
  customerTxUnitForProduct,
  formatCustomerTxDateTimeFromIso,
  type CustomerTransactionCompany,
  type CustomerTxLedgerLine,
} from './customerTransaction'
import type { CustomerTxItemRecord, CustomerTxRecord } from './customerTxSave'

export type CustomerTxPrintSheetData = {
  company: CustomerTransactionCompany
  branch: UserBranch
  customerName: string
  salesNo: string
  invoiceNo: string
  truckNo: string
  plateNo: string
  dateText: string
  orderLines: CustomerTxLedgerLine[]
  emptiesLines: CustomerTxLedgerLine[]
  ordersTotal: number
  emptiesTotal: number
  payablesTotal: number
  paymentAmount: string
  cashChequeNo: string
}

function savedItemsToPrintLines(
  items: CustomerTxItemRecord[],
  section: 'fulls' | 'empties',
): CustomerTxLedgerLine[] {
  return items
    .filter((item) => item.section === section)
    .map((item) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.price) || 0
      const discount = Number(item.discount) || 0
      const total = Number(item.line_total) || Math.max(0, price - discount)
      const totalAmount = Number(item.line_amount) || qty * total
      return {
        productId: item.product_id || item.id,
        brandId: item.brand_id || '',
        brandName: item.brand_name || '',
        section,
        qty,
        unit: customerTxUnitForProduct(section, item.product_name || ''),
        description: item.product_name || '—',
        price,
        discount,
        total,
        totalAmount,
      }
    })
}

export function buildCustomerTxPrintSheetData(
  transaction: CustomerTxRecord,
  items: CustomerTxItemRecord[],
): CustomerTxPrintSheetData {
  const owned = items.filter((item) => item.transaction_id === transaction.id)
  return {
    company: transaction.company,
    branch: transaction.branch,
    customerName: transaction.customer_name ?? '',
    salesNo: transaction.sales_no,
    invoiceNo: transaction.invoice_no ?? '',
    truckNo: transaction.truck_no ?? '',
    plateNo: transaction.plate_no ?? 'N/A',
    dateText: formatCustomerTxDateTimeFromIso(transaction.transaction_at),
    orderLines: savedItemsToPrintLines(owned, 'fulls'),
    emptiesLines: savedItemsToPrintLines(owned, 'empties'),
    ordersTotal: Number(transaction.orders_total) || 0,
    emptiesTotal: Number(transaction.empties_total) || 0,
    payablesTotal: Number(transaction.payables_total) || 0,
    paymentAmount:
      transaction.payment_amount == null ? '' : String(transaction.payment_amount),
    cashChequeNo: transaction.cash_cheque_no ?? '',
  }
}
