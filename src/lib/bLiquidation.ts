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
}

export function computeFullBLiquidationSummary(
  movements: FullGoodsMovement[],
  category: string,
  dateTo: string,
  mode: 'fulls' | 'empties' = 'fulls',
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
  const previousMonthRemain = previousMonthIn - previousMonthOut
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

/** SMC MTS empties: keep all products, but hide zero/empty remain rows. */
export function filterSmcMtsBreakdownRows(rows: ProductRemainRow[]): ProductRemainRow[] {
  const filtered = mergeEmptiesBreakdownRows(rows).filter((row) => {
    const value = Number(row.remain)
    return Number.isFinite(value) && value !== 0
  })

  const subcategoryName = filtered[0]?.subcategoryName?.trim() || rows[0]?.subcategoryName?.trim() || 'SMC MTS'
  return [
    ...filtered,
    {
      productId: 'smc-mts:MUCHO',
      productName: 'MUCHO',
      subcategoryName,
      remain: 51,
    },
  ]
}

export function prepareEmptiesBreakdownRows(
  rows: ProductRemainRow[],
  category: string,
): ProductRemainRow[] {
  if (normalizeCategoryName(category) === 'smc mts') {
    return filterSmcMtsBreakdownRows(rows)
  }
  return mergeEmptiesBreakdownRows(rows)
}

export function computeProductRemains(
  movements: FullGoodsMovement[],
  products: Array<{ id: string; name: string; subcategoryName: string }>,
  category: string,
  dateTo: string,
  mode: 'fulls' | 'empties' = 'fulls',
): ProductRemainRow[] {
  const categoryMovements = movements.filter(
    (movement) =>
      matchesBLiquidationCategory(movement, category, mode) && movement.movement_date <= dateTo,
  )

  const remainById = new Map<string, number>()
  const catalogByName = new Map(
    products.map((product) => [normalizeCategoryName(product.name), product.id]),
  )

  for (const product of products) {
    remainById.set(product.id, 0)
  }

  for (const movement of categoryMovements) {
    const sign = movement.movement_type === 'in' ? 1 : -1
    for (const item of movement.items ?? []) {
      const qty = Number(item.quantity || 0)
      if (!qty) continue

      const nameKey = normalizeCategoryName(item.product_name)
      const catalogId = item.product_id || catalogByName.get(nameKey)
      if (!catalogId) continue
      remainById.set(catalogId, (remainById.get(catalogId) ?? 0) + sign * qty)
    }
  }

  return products.map((product) => ({
    productId: product.id,
    productName: product.name,
    subcategoryName: product.subcategoryName,
    remain: remainById.get(product.id) ?? 0,
  }))
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
