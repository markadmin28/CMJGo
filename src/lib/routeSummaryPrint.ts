import type { CustomerTransactionCompany } from './customerTransaction'
import type { RouteSummaryBrandBlock, RouteSummaryProductRow } from './routeTransaction'
import type {
  RouteSummaryItemRecord,
  RouteSummaryRecord,
} from './routeSummarySave'
import { salesNoForCompany } from './routeSummarySave'
import type {
  RouteSummaryPrintEmptiesBucket,
  RouteSummaryPrintSheetData,
} from '../components/RouteSummaryPrintSheet'

function emptiesBucketKey(productName: string): 'empties' | 'shell' | 'bottles' {
  const name = productName.toLowerCase()
  if (name.includes('shell')) return 'shell'
  if (name.includes('bottle')) return 'bottles'
  return 'empties'
}

function emptiesBucketMeta(key: 'empties' | 'shell' | 'bottles') {
  if (key === 'shell') return { title: 'Complete shell', qtyLabel: 'Shell' }
  if (key === 'bottles') return { title: 'Complete bot', qtyLabel: 'Bot' }
  return { title: 'Complete case', qtyLabel: 'Case' }
}

function fullsBlocksFromItems(
  items: RouteSummaryItemRecord[],
  company: CustomerTransactionCompany,
): RouteSummaryBrandBlock[] {
  const blocks: RouteSummaryBrandBlock[] = []
  for (const item of items) {
    if (item.section !== 'fulls') continue
    if (item.company && item.company !== company) continue
    const brandName = item.brand_name?.trim() || 'Other'
    const brandId = item.brand_id || brandName
    const row: RouteSummaryProductRow = {
      productId: item.product_id || item.id,
      productName: item.product_name,
      brandId,
      brandName,
      price: Number(item.price) || 0,
      firstLoad: Number(item.first_load) || 0,
      secondLoad: Number(item.second_load) || 0,
      rfg: Number(item.rfg) || 0,
      total: (Number(item.first_load) || 0) + (Number(item.second_load) || 0),
      sales: Number(item.quantity) || 0,
      amount: Number(item.amount) || 0,
    }
    const last = blocks[blocks.length - 1]
    if (last && last.brandId === brandId) {
      last.rows.push(row)
    } else {
      blocks.push({ brandId, brandName, rows: [row] })
    }
  }
  return blocks
}

function emptiesBucketsFromItems(
  items: RouteSummaryItemRecord[],
  company: CustomerTransactionCompany,
): RouteSummaryPrintEmptiesBucket[] {
  const buckets: Record<'empties' | 'shell' | 'bottles', RouteSummaryPrintEmptiesBucket['items']> = {
    empties: [],
    shell: [],
    bottles: [],
  }

  for (const item of items) {
    if (item.section !== 'empties') continue
    if (item.company && item.company !== company) continue
    const key = emptiesBucketKey(item.product_name)
    const cases = Number(item.quantity) || 0
    const price = Number(item.price) || 0
    buckets[key].push({
      id: item.product_id || item.id,
      label: item.product_name,
      cases,
      price,
      amount: Number(item.amount) || cases * price,
    })
  }

  return (['empties', 'shell', 'bottles'] as const)
    .map((key) => {
      const meta = emptiesBucketMeta(key)
      return {
        key,
        title: meta.title,
        qtyLabel: meta.qtyLabel,
        items: buckets[key],
      }
    })
    .filter((bucket) => bucket.items.length > 0)
}

/** Build liquidation print payload from a saved route summary record. */
export function buildRouteSummaryPrintSheetData(
  summary: RouteSummaryRecord,
  items: RouteSummaryItemRecord[],
): RouteSummaryPrintSheetData {
  const company = (summary.company || 'Pepsi') as CustomerTransactionCompany
  const emptiesBuckets = emptiesBucketsFromItems(items, company)
  const emptiesTotal =
    Number(summary.ref_empties) ||
    emptiesBuckets.reduce(
      (sum, bucket) => sum + bucket.items.reduce((s, item) => s + item.amount, 0),
      0,
    )
  const totalSales = Number(summary.total_sales) || 0
  const discount = Number(summary.discount) || 0
  const expenses = Number(summary.expenses) || 0
  const promo = Number(summary.promo) || 0
  const account = Number(summary.account) || 0
  const subTotal =
    Number(summary.sub_total) || totalSales - emptiesTotal - discount - expenses - promo - account
  const cashRemittance = Number(summary.cash_remittance) || 0
  const shortOver = Number(summary.short_over) || cashRemittance - subTotal

  return {
    branch: summary.branch || 'Nabunturan',
    company,
    salesNo: salesNoForCompany(summary, company),
    routeAreaName: summary.route_area_name,
    plateNo: summary.plate_no,
    driver: summary.driver,
    helper: summary.helper,
    ahente: summary.ahente,
    datePosted: summary.date_posted_text,
    brandBlocks: fullsBlocksFromItems(items, company),
    emptiesBuckets,
    emptiesTotal,
    totalSales,
    discount,
    expenses,
    promo,
    account,
    subTotal,
    cashRemittance,
    shortOver,
    loadingSalesman: summary.loading_salesman,
    loadingChecker: summary.loading_checker,
    loadingTestify: summary.loading_testify,
    unloadingSalesman: summary.unloading_salesman,
    unloadingChecker: summary.unloading_checker,
    unloadingTestify: summary.unloading_testify,
  }
}
