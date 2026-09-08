import type { FullGoodsMovement } from '../types/fullGoods'

export function normalizeCategoryName(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function matchesFullsCategory(movement: FullGoodsMovement, category: string) {
  const target = normalizeCategoryName(category)
  const categoryName = normalizeCategoryName(movement.category_name)
  if (!categoryName) return false
  if (categoryName === 'empties' || categoryName === 'pallets' || categoryName.includes('mts')) {
    return false
  }
  return categoryName === target || categoryName.startsWith(`${target} `)
}

export function matchesEmptiesCategory(movement: FullGoodsMovement, category: string) {
  const target = normalizeCategoryName(category)
  const categoryName = normalizeCategoryName(movement.category_name)
  const brandName = normalizeCategoryName(movement.brand_name)

  return [categoryName, brandName].some(
    (name) =>
      name === target ||
      name.startsWith(`${target} `) ||
      name.includes(target) ||
      (target === 'magnolia mts' && name.includes('magnoia mts')),
  )
}

export function matchesBLiquidationCategory(
  movement: FullGoodsMovement,
  category: string,
  mode: 'fulls' | 'empties',
) {
  return mode === 'empties'
    ? matchesEmptiesCategory(movement, category)
    : matchesFullsCategory(movement, category)
}

function movementCases(movement: FullGoodsMovement) {
  return (movement.items ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function sumCases(
  movements: FullGoodsMovement[],
  predicate: (movement: FullGoodsMovement) => boolean,
) {
  return movements.filter(predicate).reduce((sum, movement) => sum + movementCases(movement), 0)
}

function monthStartIso(isoDate: string) {
  const [year, month] = isoDate.split('-')
  return `${year}-${month}-01`
}

function previousMonthEndIso(isoDate: string) {
  const [year, month] = isoDate.split('-').map(Number)
  const lastDay = new Date(year, month - 1, 0)
  const y = lastDay.getFullYear()
  const m = String(lastDay.getMonth() + 1).padStart(2, '0')
  const d = String(lastDay.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type FullBLiquidationSummary = {
  todayIn: number
  runningInMtd: number
  previousMonthRemain: number
  totalStockIn: number
  todayOut: number
  runningOutMtd: number
  totalStockRemain: number
  /** True when previous-month Actual Inventory was used for previousMonthRemain. */
  usedActualPreviousMonth: boolean
}

export type BLiquidationProductRef = {
  id: string
  name: string
  subcategoryName: string
}

/** Same key shape as actualInventory.buildActualBeginningLookup. */
export type BLiquidationActualLookup = Map<string, number>

function actualSectionForMode(mode: 'fulls' | 'empties'): 'fg' | 'mts' {
  return mode === 'empties' ? 'mts' : 'fg'
}

function actualQtyKey(section: 'fg' | 'mts', productId: string, productName: string) {
  if (productId) return `${section}:id:${productId}`
  return `${section}:name:${normalizeCategoryName(productName)}`
}

function lookupActualQty(
  lookup: BLiquidationActualLookup | null | undefined,
  section: 'fg' | 'mts',
  productId: string,
  productName: string,
) {
  if (!lookup) return null
  const byId = lookup.get(actualQtyKey(section, productId, productName))
  if (byId != null) return byId
  const byName = lookup.get(actualQtyKey(section, '', productName))
  return byName == null ? null : byName
}

function sumProductMovementCases(
  movements: FullGoodsMovement[],
  productId: string,
  productName: string,
  movementType: 'in' | 'out',
  datePredicate: (isoDate: string) => boolean,
) {
  let total = 0
  const nameKey = normalizeCategoryName(productName)
  for (const movement of movements) {
    if (movement.movement_type !== movementType) continue
    if (!datePredicate(movement.movement_date)) continue
    for (const item of movement.items ?? []) {
      const matchesId = Boolean(item.product_id && item.product_id === productId)
      const matchesName = normalizeCategoryName(item.product_name) === nameKey
      if (!matchesId && !matchesName) continue
      total += Number(item.quantity || 0)
    }
  }
  return total
}

/** Per-product previous-month remain: Actual Inventory when present, else movement net. */
export function productPreviousMonthRemain(
  movements: FullGoodsMovement[],
  product: BLiquidationProductRef,
  category: string,
  dateTo: string,
  mode: 'fulls' | 'empties',
  actualBeginning?: BLiquidationActualLookup | null,
) {
  const categoryMovements = movements.filter((movement) =>
    matchesBLiquidationCategory(movement, category, mode),
  )
  const prevMonthEnd = previousMonthEndIso(dateTo)
  const throughPrev = (isoDate: string) => isoDate <= prevMonthEnd
  const computedIn = sumProductMovementCases(
    categoryMovements,
    product.id,
    product.name,
    'in',
    throughPrev,
  )
  const computedOut = sumProductMovementCases(
    categoryMovements,
    product.id,
    product.name,
    'out',
    throughPrev,
  )
  const computed = computedIn - computedOut
  const saved = lookupActualQty(
    actualBeginning,
    actualSectionForMode(mode),
    product.id,
    product.name,
  )
  return saved == null ? computed : saved
}

export function sumPreviousMonthRemainFromActual(
  movements: FullGoodsMovement[],
  products: BLiquidationProductRef[],
  category: string,
  dateTo: string,
  mode: 'fulls' | 'empties',
  actualBeginning?: BLiquidationActualLookup | null,
) {
  if (!actualBeginning || products.length === 0) {
    return { remain: null as number | null, usedActual: false }
  }

  let usedActual = false
  let remain = 0
  for (const product of products) {
    const saved = lookupActualQty(
      actualBeginning,
      actualSectionForMode(mode),
      product.id,
      product.name,
    )
    if (saved != null) usedActual = true
    remain += productPreviousMonthRemain(
      movements,
      product,
      category,
      dateTo,
      mode,
      actualBeginning,
    )
  }

  return { remain: usedActual ? remain : null, usedActual }
}

export function computeFullBLiquidationSummary(
  movements: FullGoodsMovement[],
  category: string,
  dateTo: string,
  mode: 'fulls' | 'empties' = 'fulls',
  options?: {
    products?: BLiquidationProductRef[]
    actualBeginning?: BLiquidationActualLookup | null
  },
): FullBLiquidationSummary {
  const categoryMovements = movements.filter((movement) =>
    matchesBLiquidationCategory(movement, category, mode),
  )
  const monthStart = monthStartIso(dateTo)
  const prevMonthEnd = previousMonthEndIso(dateTo)

  const todayIn = sumCases(
    categoryMovements,
    (movement) => movement.movement_type === 'in' && movement.movement_date === dateTo,
  )
  const runningInMtd = sumCases(
    categoryMovements,
    (movement) =>
      movement.movement_type === 'in' &&
      movement.movement_date >= monthStart &&
      movement.movement_date <= dateTo,
  )
  const previousMonthIn = sumCases(
    categoryMovements,
    (movement) => movement.movement_type === 'in' && movement.movement_date <= prevMonthEnd,
  )
  const previousMonthOut = sumCases(
    categoryMovements,
    (movement) => movement.movement_type === 'out' && movement.movement_date <= prevMonthEnd,
  )
  const movementPreviousRemain = previousMonthIn - previousMonthOut

  const actualSummary = sumPreviousMonthRemainFromActual(
    movements,
    options?.products ?? [],
    category,
    dateTo,
    mode,
    options?.actualBeginning,
  )
  const previousMonthRemain =
    actualSummary.usedActual && actualSummary.remain != null
      ? actualSummary.remain
      : movementPreviousRemain
  const totalStockIn = previousMonthRemain + runningInMtd

  const todayOut = sumCases(
    categoryMovements,
    (movement) => movement.movement_type === 'out' && movement.movement_date === dateTo,
  )
  const runningOutMtd = sumCases(
    categoryMovements,
    (movement) =>
      movement.movement_type === 'out' &&
      movement.movement_date >= monthStart &&
      movement.movement_date <= dateTo,
  )
  const totalStockRemain = totalStockIn - runningOutMtd

  return {
    todayIn,
    runningInMtd,
    previousMonthRemain,
    totalStockIn,
    todayOut,
    runningOutMtd,
    totalStockRemain,
    usedActualPreviousMonth: actualSummary.usedActual,
  }
}

export function formatLiquidationValue(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function formatRemainValue(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  const hasDecimal = !Number.isInteger(rounded)
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: hasDecimal ? 3 : 0,
  })
}

export type ProductRemainRow = {
  productId: string
  productName: string
  subcategoryName: string
  remain: number
}

const EMPTIES_PRODUCT_MERGE_GROUPS: Array<{
  displayName: string
  aliases: string[]
}> = [
  {
    displayName: 'LITRO',
    aliases: ['pepsi lit', 'lit', 'litro', 'pepsi litro'],
  },
  {
    displayName: 'FAMILY',
    aliases: ['pepsi fam', 'fam', 'family', 'pepsi family'],
  },
  {
    displayName: '8OZ',
    aliases: ['pepsi 8oz', 'pepsi 8 oz', '8oz', '8 oz'],
  },
]

function emptiesProductMergeKey(productName: string) {
  const normalized = normalizeCategoryName(productName)
  const group = EMPTIES_PRODUCT_MERGE_GROUPS.find((item) =>
    item.aliases.includes(normalized),
  )
  return group?.displayName ?? null
}

/** Combine Pepsi Lit/Litro, Fam/Family, and 8oz variants into single empties breakdown rows. */
export function mergeEmptiesBreakdownRows(rows: ProductRemainRow[]): ProductRemainRow[] {
  const merged: ProductRemainRow[] = []
  const groupIndex = new Map<string, number>()

  for (const row of rows) {
    const mergeName = emptiesProductMergeKey(row.productName)
    if (!mergeName) {
      merged.push({
        ...row,
        productName: row.productName.trim().toUpperCase(),
      })
      continue
    }

    const existingIndex = groupIndex.get(mergeName)
    if (existingIndex === undefined) {
      groupIndex.set(mergeName, merged.length)
      merged.push({
        ...row,
        productId: `merged:${mergeName}`,
        productName: mergeName,
      })
      continue
    }

    merged[existingIndex] = {
      ...merged[existingIndex],
      remain: merged[existingIndex].remain + row.remain,
    }
  }

  return merged
}

/** Empties breakdown: merge Pepsi aliases and hide zero remain rows. */
export function prepareEmptiesBreakdownRows(rows: ProductRemainRow[]): ProductRemainRow[] {
  return mergeEmptiesBreakdownRows(rows).filter((row) => {
    const value = Number(row.remain)
    return Number.isFinite(value) && value !== 0
  })
}

function dedupeCategoryProducts<
  T extends { id: string; name: string; subcategoryName: string },
>(products: T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const product of products) {
    if (seen.has(product.id)) continue
    seen.add(product.id)
    unique.push(product)
  }
  return unique
}

export function computeProductRemains(
  movements: FullGoodsMovement[],
  products: Array<{ id: string; name: string; subcategoryName: string }>,
  category: string,
  dateTo: string,
  mode: 'fulls' | 'empties' = 'fulls',
  actualBeginning?: BLiquidationActualLookup | null,
): ProductRemainRow[] {
  const uniqueProducts = dedupeCategoryProducts(products)
  const categoryMovements = movements.filter((movement) =>
    matchesBLiquidationCategory(movement, category, mode),
  )
  const catalogByName = new Map(
    uniqueProducts.map((product) => [normalizeCategoryName(product.name), product.id]),
  )
  const remainById = new Map<string, number>()
  const orphanByName = new Map<string, { name: string; remain: number }>()

  for (const product of uniqueProducts) {
    remainById.set(product.id, 0)
  }

  const actualSummary = sumPreviousMonthRemainFromActual(
    movements,
    uniqueProducts,
    category,
    dateTo,
    mode,
    actualBeginning,
  )
  const useActualBasis = actualSummary.usedActual
  const prevMonthEnd = previousMonthEndIso(dateTo)
  const includeMovementDate = (isoDate: string) =>
    useActualBasis ? isoDate > prevMonthEnd && isoDate <= dateTo : isoDate <= dateTo

  if (useActualBasis) {
    for (const product of uniqueProducts) {
      remainById.set(
        product.id,
        productPreviousMonthRemain(
          movements,
          product,
          category,
          dateTo,
          mode,
          actualBeginning,
        ),
      )
    }
  }

  for (const movement of categoryMovements) {
    if (!includeMovementDate(movement.movement_date)) continue
    const sign = movement.movement_type === 'in' ? 1 : -1
    for (const item of movement.items ?? []) {
      const qty = Number(item.quantity || 0)
      if (!qty) continue

      const nameKey = normalizeCategoryName(item.product_name)
      // Prefer a catalog id that exists in this category; fall back to name
      // when product_id is missing or points at a removed/other-category SKU.
      const byId =
        item.product_id && remainById.has(item.product_id) ? item.product_id : undefined
      const catalogId = byId ?? catalogByName.get(nameKey)
      if (!catalogId || !remainById.has(catalogId)) {
        // Keep unmatched lines so breakdown TOTAL REMAIN matches summary.
        const existing = orphanByName.get(nameKey)
        if (existing) {
          existing.remain += sign * qty
        } else {
          orphanByName.set(nameKey, {
            name: (item.product_name || 'Unknown').trim() || 'Unknown',
            remain: sign * qty,
          })
        }
        continue
      }
      remainById.set(catalogId, (remainById.get(catalogId) ?? 0) + sign * qty)
    }
  }

  const catalogRows = uniqueProducts.map((product) => ({
    productId: product.id,
    productName: product.name,
    subcategoryName: product.subcategoryName,
    remain: remainById.get(product.id) ?? 0,
  }))

  const orphanRows: ProductRemainRow[] = [...orphanByName.values()]
    .filter((row) => row.remain !== 0)
    .map((row) => ({
      productId: `orphan:${normalizeCategoryName(row.name)}`,
      productName: row.name,
      subcategoryName: '',
      remain: row.remain,
    }))

  return [...catalogRows, ...orphanRows]
}

export function splitProductColumns<T>(items: T[], columnCount = 3): T[][] {
  if (items.length === 0) return Array.from({ length: columnCount }, () => [])
  const size = Math.ceil(items.length / columnCount)
  return Array.from({ length: columnCount }, (_, index) =>
    items.slice(index * size, index * size + size),
  )
}

export function splitGroupedColumns<T>(
  groups: Array<{ items: T[] }>,
  columnCount = 3,
): T[][] {
  if (groups.length === 0) return Array.from({ length: columnCount }, () => [])

  const columns: T[][] = Array.from({ length: columnCount }, () => [])
  const sizes = Array.from({ length: columnCount }, () => 0)

  for (const group of groups) {
    let target = 0
    for (let i = 1; i < columnCount; i += 1) {
      if (sizes[i] < sizes[target]) target = i
    }
    columns[target].push(...group.items)
    sizes[target] += group.items.length
  }

  return columns
}

export function formatShortDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${month}/${day}/${year}`
}
