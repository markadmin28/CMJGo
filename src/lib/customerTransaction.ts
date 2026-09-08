import { normalizeCategoryName } from './bLiquidation'
import type { CatalogTreeCategory } from './catalog'
import {
  buildBoBrandGroupsFromCatalog,
  findBoCatalogCategory,
  type BoBrandGroup,
  type BoInOutMeta,
} from './boBadOrder'

export type CustomerTransactionCompany = 'Pepsi' | 'SMC' | 'Magnolia'

/** Empties unit from product name; fulls stay Case. */
export function customerTxUnitForProduct(section: 'fulls' | 'empties', productName: string) {
  if (section !== 'empties') return 'Case'
  const name = productName.toLowerCase()
  if (name.includes('shell')) return 'Shell'
  if (name.includes('bottle')) return 'Bot'
  return 'Case'
}

/** Qty display/entry: one decimal place max (e.g. 1.5). */
export function formatCustomerTxQty(qty: number) {
  if (!Number.isFinite(qty) || qty === 0) return ''
  const rounded = Math.round(qty * 10) / 10
  return String(rounded)
}

export function customerTransactionTitle(company: CustomerTransactionCompany) {
  return `${company} Transaction`
}

export function customerTxCompanyToBo(company: CustomerTransactionCompany): BoInOutMeta['company'] {
  if (company === 'Pepsi') return 'PC'
  if (company === 'SMC') return 'SMC'
  return 'MAGNOLIA'
}

export function customerTxHeaderTitle(company: CustomerTransactionCompany) {
  if (company === 'Pepsi') return 'PCPPI - CUSTOMER TRANSACTION'
  if (company === 'SMC') return 'SMC - CUSTOMER TRANSACTION'
  return 'MAGNOLIA - CUSTOMER TRANSACTION'
}

export function buildCustomerTxBrandGroups(
  catalog: CatalogTreeCategory[],
  company: CustomerTransactionCompany,
): BoBrandGroup[] {
  return buildBoBrandGroupsFromCatalog(catalog, customerTxCompanyToBo(company))
}

function isScuffiesName(name: string) {
  return normalizeCategoryName(name).includes('scuff')
}

/** All Empties brands/products except Scuffies (shared across Pepsi / SMC / Magnolia TX). */
export function buildCustomerTxEmptiesGroups(
  catalog: CatalogTreeCategory[],
  _company?: CustomerTransactionCompany,
): BoBrandGroup[] {
  const empties = catalog.find((category) => normalizeCategoryName(category.name) === 'empties')
  if (!empties) return []

  return empties.subcategories
    .filter((sub) => !isScuffiesName(sub.name))
    .map((sub) => ({
      id: sub.id,
      title: sub.name.toUpperCase(),
      items: sub.products
        .filter((product) => !isScuffiesName(product.name))
        .map((product) => ({
          id: product.id,
          label: product.name,
          price: Number(product.price) || 0,
        })),
    }))
    .filter((group) => group.items.length > 0)
}

export function emptyCustomerTxQtyMap(groups: BoBrandGroup[]) {
  const values: Record<string, string> = {}
  for (const group of groups) {
    for (const item of group.items) values[item.id] = ''
  }
  return values
}

export type CustomerTxSavedItemLike = {
  section: 'fulls' | 'empties'
  product_id: string | null
  product_name: string
  brand_id: string | null
  brand_name: string
  quantity: number
  price?: number
}

function normalizeMatchName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Map a saved line to a catalog product in the given brand groups. */
export function matchSavedCustomerTxItem(
  groups: BoBrandGroup[],
  item: CustomerTxSavedItemLike,
): { group: BoBrandGroup; productId: string } | null {
  if (item.product_id) {
    for (const group of groups) {
      const found = group.items.find((product) => product.id === item.product_id)
      if (found) return { group, productId: found.id }
    }
  }

  const productName = normalizeMatchName(item.product_name)
  const brandName = normalizeMatchName(item.brand_name)
  if (!productName) return null

  const brandCandidates = brandName
    ? groups.filter((group) => normalizeMatchName(group.title) === brandName)
    : groups
  const searchGroups = brandCandidates.length > 0 ? brandCandidates : groups

  for (const group of searchGroups) {
    const found = group.items.find(
      (product) => normalizeMatchName(product.label) === productName,
    )
    if (found) return { group, productId: found.id }
  }

  return null
}

/**
 * Hydrate qty fields from one saved transaction only.
 * Unmatched saved products are injected into the groups so they still appear for that record.
 */
export function hydrateCustomerTxFromSavedItems(
  fullsGroups: BoBrandGroup[],
  emptiesGroups: BoBrandGroup[],
  items: CustomerTxSavedItemLike[],
) {
  const nextFulls: BoBrandGroup[] = fullsGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }))
  const nextEmpties: BoBrandGroup[] = emptiesGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }))

  const qtys = emptyCustomerTxQtyMap([...nextFulls, ...nextEmpties])

  for (const item of items) {
    const targetGroups = item.section === 'empties' ? nextEmpties : nextFulls
    const matched = matchSavedCustomerTxItem(targetGroups, item)
    if (matched) {
      const qty = Number(item.quantity)
      qtys[matched.productId] = formatCustomerTxQty(qty)
      continue
    }

    // Keep orphan lines from this saved record visible under their brand.
    const brandId =
      item.brand_id ||
      `saved-brand-${item.section}-${normalizeMatchName(item.brand_name) || 'other'}`
    const brandTitle = (item.brand_name || 'Saved items').toUpperCase()
    let group = targetGroups.find((entry) => entry.id === brandId)
    if (!group) {
      group = { id: brandId, title: brandTitle, items: [] }
      targetGroups.push(group)
    }

    const productId =
      item.product_id ||
      `saved-product-${item.section}-${normalizeMatchName(item.product_name)}-${brandId}`
    if (!group.items.some((product) => product.id === productId)) {
      group.items.push({
        id: productId,
        label: item.product_name || 'Saved product',
        price: Number(item.price) || 0,
      })
    }
    const qty = Number(item.quantity)
    qtys[productId] = formatCustomerTxQty(qty)
  }

  return {
    fullsGroups: nextFulls.filter((group) => group.items.length > 0),
    emptiesGroups: nextEmpties.filter((group) => group.items.length > 0),
    qtys,
  }
}

export function formatCustomerTxDateTime(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${mm}-${dd}-${yyyy} ${hh}:${min}:${ss}`
}

export function formatCustomerTxDateTimeFromIso(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return formatCustomerTxDateTime()
  return formatCustomerTxDateTime(date)
}

export type CustomerTxLedgerLine = {
  productId: string
  brandId: string
  brandName: string
  section: 'fulls' | 'empties'
  qty: number
  unit: string
  description: string
  price: number
  discount: number
  /** Net unit price (price − discount). */
  total: number
  /** Line amount (qty × net). */
  totalAmount: number
}

export function formatLedgerMoney(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function customerLedgerTitle(customerName: string) {
  const name = customerName.trim() || 'Customer'
  if (/s$/i.test(name)) return `${name}' ledger`
  return `${name}'s ledger`
}

export function formatCustomerTxPlateDisplay(truckNo: string, plateNo: string) {
  const truck = truckNo.trim()
  const plate = plateNo.trim() || 'N/A'
  if (!truck) return plate
  return `${truck} / ${plate}`
}

function collectLedgerLines(
  section: 'fulls' | 'empties',
  groups: BoBrandGroup[],
  qtys: Record<string, string>,
  discountsByProductId: Record<string, string>,
): { lines: CustomerTxLedgerLine[]; error: string | null } {
  const lines: CustomerTxLedgerLine[] = []

  for (const group of groups) {
    for (const item of group.items) {
      const raw = (qtys[item.id] ?? '').trim()
      if (!raw) continue
      const qty = Number(raw)
      if (!Number.isFinite(qty) || qty < 0) {
        return { lines: [], error: `Invalid quantity for ${item.label}.` }
      }
      if (qty === 0) continue

      const price = Number(item.price) || 0
      const discount =
        section === 'fulls' ? Math.max(0, Number(discountsByProductId[item.id]) || 0) : 0
      const total = Math.max(0, price - discount)
      lines.push({
        productId: item.id,
        brandId: group.id,
        brandName: group.title,
        section,
        qty,
        unit: customerTxUnitForProduct(section, item.label),
        description: item.label,
        price,
        discount,
        total,
        totalAmount: qty * total,
      })
    }
  }

  return { lines, error: null }
}

export function buildCustomerTxLedger(
  fullsGroups: BoBrandGroup[],
  emptiesGroups: BoBrandGroup[],
  qtys: Record<string, string>,
  discountsByProductId: Record<string, string>,
) {
  const fulls = collectLedgerLines('fulls', fullsGroups, qtys, discountsByProductId)
  if (fulls.error) {
    return {
      orderLines: [] as CustomerTxLedgerLine[],
      emptiesLines: [] as CustomerTxLedgerLine[],
      ordersTotal: 0,
      emptiesTotal: 0,
      payablesTotal: 0,
      error: fulls.error,
    }
  }
  const empties = collectLedgerLines('empties', emptiesGroups, qtys, discountsByProductId)
  if (empties.error) {
    return {
      orderLines: [] as CustomerTxLedgerLine[],
      emptiesLines: [] as CustomerTxLedgerLine[],
      ordersTotal: 0,
      emptiesTotal: 0,
      payablesTotal: 0,
      error: empties.error,
    }
  }

  if (fulls.lines.length === 0 && empties.lines.length === 0) {
    return {
      orderLines: [] as CustomerTxLedgerLine[],
      emptiesLines: [] as CustomerTxLedgerLine[],
      ordersTotal: 0,
      emptiesTotal: 0,
      payablesTotal: 0,
      error: 'Enter at least one product quantity.',
    }
  }

  const ordersTotal = fulls.lines.reduce((sum, line) => sum + line.totalAmount, 0)
  const emptiesTotal = empties.lines.reduce((sum, line) => sum + line.totalAmount, 0)
  return {
    orderLines: fulls.lines,
    emptiesLines: empties.lines,
    ordersTotal,
    emptiesTotal,
    payablesTotal: ordersTotal - emptiesTotal,
    error: null as string | null,
  }
}

export function findCustomerTxCatalogCategory(
  catalog: CatalogTreeCategory[],
  company: CustomerTransactionCompany,
) {
  return findBoCatalogCategory(catalog, customerTxCompanyToBo(company))
}
