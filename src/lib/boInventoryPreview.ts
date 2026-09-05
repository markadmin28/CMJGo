import type { CatalogTreeCategory } from './catalog'
import { normalizeCategoryName } from './bLiquidation'
import {
  lookupActualBeginning,
  type ActualBeginningLookup,
} from './actualInventory'
import {
  findBoCatalogCategory,
  type BoInOutMeta,
} from './boBadOrder'
import type { BoMovement } from './boTransactions'
import type { InventoryMetricRow } from './inventoryPreview'

type CatalogProduct = {
  id: string
  name: string
  subcategoryName: string
}

function matchesProductItem(
  productId: string,
  productName: string,
  itemProductId: string | null | undefined,
  itemProductName: string,
) {
  if (itemProductId && itemProductId === productId) return true
  return normalizeCategoryName(itemProductName) === normalizeCategoryName(productName)
}

function sumBoProductCases(
  movements: BoMovement[],
  productId: string,
  productName: string,
  direction: 'in' | 'out',
  datePredicate: (isoDate: string) => boolean,
) {
  let total = 0
  for (const movement of movements) {
    if (movement.direction !== direction) continue
    if (!datePredicate(movement.movement_date)) continue
    for (const item of movement.items ?? []) {
      if (!matchesProductItem(productId, productName, item.product_id, item.product_name)) continue
      total += Number(item.quantity) || 0
    }
  }
  return total
}

function buildBoMetrics(
  movements: BoMovement[],
  product: CatalogProduct,
  dateFrom: string,
  dateTo: string,
  actualBeginning?: ActualBeginningLookup | null,
): Omit<InventoryMetricRow, 'id' | 'kind' | 'label' | 'subcategoryName'> {
  const beforeFrom = (isoDate: string) => isoDate < dateFrom
  const inRange = (isoDate: string) => isoDate >= dateFrom && isoDate <= dateTo
  const monthStart = `${dateFrom.slice(0, 7)}-01`
  const inMonthBeforeFrom = (isoDate: string) => isoDate >= monthStart && isoDate < dateFrom

  const savedActual = lookupActualBeginning(actualBeginning, 'fg', product.id, product.name)
  const beginningIn = sumBoProductCases(movements, product.id, product.name, 'in', beforeFrom)
  const beginningOut = sumBoProductCases(movements, product.id, product.name, 'out', beforeFrom)
  const computedBeginning = beginningIn - beginningOut
  const extraIn =
    savedActual == null
      ? 0
      : sumBoProductCases(movements, product.id, product.name, 'in', inMonthBeforeFrom)
  const extraOut =
    savedActual == null
      ? 0
      : sumBoProductCases(movements, product.id, product.name, 'out', inMonthBeforeFrom)
  const beginning = savedActual == null ? computedBeginning : savedActual + extraIn - extraOut
  const stockIn = sumBoProductCases(movements, product.id, product.name, 'in', inRange)
  const totalSales = sumBoProductCases(movements, product.id, product.name, 'out', inRange)
  const totalStocks = beginning + stockIn
  const remain = totalStocks - totalSales

  return {
    beginning,
    stockIn,
    totalStocks,
    totalSales,
    remain,
    inventory: remain,
    remarks: '',
  }
}

function sumRows(rows: InventoryMetricRow[]) {
  return rows.reduce(
    (acc, row) => ({
      beginning: acc.beginning + row.beginning,
      stockIn: acc.stockIn + row.stockIn,
      totalStocks: acc.totalStocks + row.totalStocks,
      totalSales: acc.totalSales + row.totalSales,
      remain: acc.remain + row.remain,
      inventory: acc.inventory + row.inventory,
      remarks: '',
    }),
    {
      beginning: 0,
      stockIn: 0,
      totalStocks: 0,
      totalSales: 0,
      remain: 0,
      inventory: 0,
      remarks: '',
    },
  )
}

export function buildBoInventoryPreviewRows(
  movements: BoMovement[],
  catalog: CatalogTreeCategory[],
  company: BoInOutMeta['company'],
  dateFrom: string,
  dateTo: string,
  actualBeginning?: ActualBeginningLookup | null,
): InventoryMetricRow[] {
  const category = findBoCatalogCategory(catalog, company)
  if (!category) return []

  const products: CatalogProduct[] = category.subcategories
    .filter((sub) => normalizeCategoryName(sub.name) !== 'pallets')
    .flatMap((sub) =>
      sub.products.map((product) => ({
        id: product.id,
        name: product.name,
        subcategoryName: sub.name,
      })),
    )

  const rows: InventoryMetricRow[] = []
  const productRows: InventoryMetricRow[] = []

  const groups = new Map<string, CatalogProduct[]>()
  for (const product of products) {
    const list = groups.get(product.subcategoryName) ?? []
    list.push(product)
    groups.set(product.subcategoryName, list)
  }

  for (const [subcategoryName, groupProducts] of groups) {
    for (const product of groupProducts) {
      const metrics = buildBoMetrics(movements, product, dateFrom, dateTo, actualBeginning)
      const productRow: InventoryMetricRow = {
        id: `bo-${company}-${product.id}`,
        kind: 'product',
        label: product.name,
        subcategoryName,
        ...metrics,
      }
      rows.push(productRow)
      productRows.push(productRow)
    }
  }

  if (productRows.length > 0) {
    rows.push({
      id: `bo-${company}-total`,
      kind: 'total',
      label: 'TOTAL',
      ...sumRows(productRows),
    })
  }

  return rows
}

export function boInventoryPreviewTitle(company: BoInOutMeta['company']) {
  return `BO ${company} INVENTORY PREVIEW`
}
