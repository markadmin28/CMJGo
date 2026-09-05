import type { FullGoodsMovement } from '../types/fullGoods'
import {
  matchesBLiquidationCategory,
  matchesEmptiesCategory,
  normalizeCategoryName,
} from './bLiquidation'
import type { CatalogTreeCategory } from './catalog'
import {
  lookupActualBeginning,
  type ActualBeginningLookup,
} from './actualInventory'

export type InventoryCategory = 'PCPPI' | 'SMC' | 'Magnolia'

export const INVENTORY_CATEGORIES: InventoryCategory[] = ['PCPPI', 'SMC', 'Magnolia']

const EMPTIES_SUBCATEGORY_BY_CATEGORY: Record<InventoryCategory, string> = {
  PCPPI: 'Pepsi MTS',
  SMC: 'SMC MTS',
  Magnolia: 'Magnolia MTS',
}

export function inventoryPreviewTitle(category: InventoryCategory) {
  if (category === 'PCPPI') return 'PEPSI INVENTORY PREVIEW'
  return `${category.toUpperCase()} INVENTORY PREVIEW`
}

export type InventoryMetricRow = {
  id: string
  kind: 'subcategory' | 'product' | 'total' | 'section'
  label: string
  subcategoryName?: string
  beginning: number
  stockIn: number
  totalStocks: number
  totalSales: number
  remain: number
  inventory: number
  remarks: string
}

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

function sumProductCases(
  movements: FullGoodsMovement[],
  productId: string,
  productName: string,
  category: string,
  mode: 'fulls' | 'empties',
  movementType: 'in' | 'out',
  datePredicate: (isoDate: string) => boolean,
) {
  let total = 0

  for (const movement of movements) {
    const matchesCategory =
      mode === 'fulls'
        ? matchesBLiquidationCategory(movement, category, 'fulls')
        : matchesEmptiesCategory(movement, category)

    if (!matchesCategory || movement.movement_type !== movementType) continue
    if (!datePredicate(movement.movement_date)) continue

    for (const item of movement.items ?? []) {
      if (!matchesProductItem(productId, productName, item.product_id, item.product_name)) continue
      total += Number(item.quantity || 0)
    }
  }

  return total
}

function buildMetrics(
  movements: FullGoodsMovement[],
  product: CatalogProduct,
  category: string,
  mode: 'fulls' | 'empties',
  dateFrom: string,
  dateTo: string,
  actualBeginning?: ActualBeginningLookup | null,
): Omit<InventoryMetricRow, 'id' | 'kind' | 'label'> {
  const beforeFrom = (isoDate: string) => isoDate < dateFrom
  const inRange = (isoDate: string) => isoDate >= dateFrom && isoDate <= dateTo
  const monthStart = `${dateFrom.slice(0, 7)}-01`
  const inMonthBeforeFrom = (isoDate: string) => isoDate >= monthStart && isoDate < dateFrom
  const section = mode === 'fulls' ? 'fg' : 'mts'
  const savedActual = lookupActualBeginning(actualBeginning, section, product.id, product.name)

  const beginningIn = sumProductCases(
    movements,
    product.id,
    product.name,
    category,
    mode,
    'in',
    beforeFrom,
  )
  const beginningOut = sumProductCases(
    movements,
    product.id,
    product.name,
    category,
    mode,
    'out',
    beforeFrom,
  )
  const computedBeginning = beginningIn - beginningOut
  const extraIn =
    savedActual == null
      ? 0
      : sumProductCases(movements, product.id, product.name, category, mode, 'in', inMonthBeforeFrom)
  const extraOut =
    savedActual == null
      ? 0
      : sumProductCases(movements, product.id, product.name, category, mode, 'out', inMonthBeforeFrom)
  const beginning = savedActual == null ? computedBeginning : savedActual + extraIn - extraOut
  const stockIn = sumProductCases(
    movements,
    product.id,
    product.name,
    category,
    mode,
    'in',
    inRange,
  )
  const totalSales = sumProductCases(
    movements,
    product.id,
    product.name,
    category,
    mode,
    'out',
    inRange,
  )
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

function sumRows(rows: InventoryMetricRow[]): Omit<InventoryMetricRow, 'id' | 'kind' | 'label'> {
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

function resolveFullProducts(
  catalog: CatalogTreeCategory[],
  category: InventoryCategory,
): CatalogProduct[] {
  const match = catalog.find(
    (entry) =>
      normalizeCategoryName(entry.name) === normalizeCategoryName(category) ||
      normalizeCategoryName(entry.name).startsWith(normalizeCategoryName(category)),
  )
  if (!match) return []

  return match.subcategories.flatMap((sub) =>
    sub.products.map((product) => ({
      id: product.id,
      name: product.name,
      subcategoryName: sub.name,
    })),
  )
}

function resolveEmptiesProducts(
  catalog: CatalogTreeCategory[],
  category: InventoryCategory,
): CatalogProduct[] {
  const target = EMPTIES_SUBCATEGORY_BY_CATEGORY[category]
  const empties = catalog.find((entry) => normalizeCategoryName(entry.name) === 'empties')
  const match = empties?.subcategories.find((sub) => {
    const name = normalizeCategoryName(sub.name)
    const normalizedTarget = normalizeCategoryName(target)
    return (
      name === normalizedTarget ||
      name.includes(normalizedTarget) ||
      (normalizedTarget === 'magnolia mts' && name.includes('magnoia mts'))
    )
  })
  if (!match) return []

  return match.products.map((product) => ({
    id: product.id,
    name: product.name,
    subcategoryName: match.name,
  }))
}

function appendGroupedProducts(
  rows: InventoryMetricRow[],
  products: CatalogProduct[],
  movements: FullGoodsMovement[],
  category: string,
  mode: 'fulls' | 'empties',
  dateFrom: string,
  dateTo: string,
  idPrefix: string,
  actualBeginning?: ActualBeginningLookup | null,
) {
  const groups = new Map<string, CatalogProduct[]>()
  for (const product of products) {
    const list = groups.get(product.subcategoryName) ?? []
    list.push(product)
    groups.set(product.subcategoryName, list)
  }

  const productRows: InventoryMetricRow[] = []

  for (const [subcategoryName, groupProducts] of groups) {
    for (const product of groupProducts) {
      const metrics = buildMetrics(
        movements,
        product,
        category,
        mode,
        dateFrom,
        dateTo,
        actualBeginning,
      )
      const productRow: InventoryMetricRow = {
        id: `${idPrefix}-prod-${product.id}`,
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
      id: `${idPrefix}-total`,
      kind: 'total',
      label: 'TOTAL',
      ...sumRows(productRows),
    })
  }
}

export function buildInventoryPreviewRows(
  movements: FullGoodsMovement[],
  catalog: CatalogTreeCategory[],
  category: InventoryCategory,
  dateFrom: string,
  dateTo: string,
  actualBeginning?: ActualBeginningLookup | null,
): InventoryMetricRow[] {
  const rows: InventoryMetricRow[] = []
  const fullProducts = resolveFullProducts(catalog, category)
  appendGroupedProducts(
    rows,
    fullProducts,
    movements,
    category,
    'fulls',
    dateFrom,
    dateTo,
    'full',
    actualBeginning,
  )

  const emptiesProducts = resolveEmptiesProducts(catalog, category)
  if (emptiesProducts.length > 0) {
    rows.push({
      id: 'empties-section',
      kind: 'section',
      label: 'EMPTIES',
      beginning: 0,
      stockIn: 0,
      totalStocks: 0,
      totalSales: 0,
      remain: 0,
      inventory: 0,
      remarks: '',
    })

    const emptiesCategory = EMPTIES_SUBCATEGORY_BY_CATEGORY[category]
    const emptiesProductRows: InventoryMetricRow[] = []

    for (const product of emptiesProducts) {
      const metrics = buildMetrics(
        movements,
        product,
        emptiesCategory,
        'empties',
        dateFrom,
        dateTo,
        actualBeginning,
      )
      const productRow: InventoryMetricRow = {
        id: `empties-prod-${product.id}`,
        kind: 'product',
        label: product.name,
        subcategoryName: product.subcategoryName,
        ...metrics,
      }
      rows.push(productRow)
      emptiesProductRows.push(productRow)
    }

    if (emptiesProductRows.length > 0) {
      rows.push({
        id: 'empties-total',
        kind: 'total',
        label: 'TOTAL',
        ...sumRows(emptiesProductRows),
      })
    }
  }

  return rows
}

export function splitInventoryPreviewRows(rows: InventoryMetricRow[]): {
  fullRows: InventoryMetricRow[]
  emptiesRows: InventoryMetricRow[]
} {
  const sectionIndex = rows.findIndex((row) => row.kind === 'section' && row.label === 'EMPTIES')
  if (sectionIndex === -1) {
    return { fullRows: rows, emptiesRows: [] }
  }

  return {
    fullRows: rows.slice(0, sectionIndex),
    emptiesRows: rows.slice(sectionIndex + 1),
  }
}

export function inventoryPrintReportPeriod(dateTo: string) {
  const [year, month, day] = dateTo.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return {
    monthName: date.toLocaleString('en-US', { month: 'long' }),
    year: date.getFullYear(),
  }
}

export function formatInventoryValue(value: number) {
  if (!value) return ''
  const rounded = Math.round(value * 1000) / 1000
  const hasDecimal = !Number.isInteger(rounded)
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: hasDecimal ? 3 : 0,
  })
}

export function inventoryDateBounds(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { dateFrom: dateTo, dateTo: dateFrom }
  }
  return { dateFrom, dateTo }
}
