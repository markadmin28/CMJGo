import type { CatalogTreeCategory } from './catalog'
import { isMissingCatalogTable } from './catalog'
import { normalizeCategoryName } from './bLiquidation'
import { supabase } from './supabase'

export type ActualInventoryItemInput = {
  section: 'fg' | 'mts'
  productId: string
  subcategoryName: string
  productName: string
  quantity: number
}

export type ActualInventoryItemRecord = {
  id: string
  section: 'fg' | 'mts'
  product_id: string | null
  subcategory_name: string
  product_name: string
  quantity: number
}

export type ActualInventoryDetail = {
  id: string
  category: string
  as_of_month: string
  items: ActualInventoryItemRecord[]
}

export type ActualBeginningLookup = Map<string, number>

export type ActualInventoryMonthSummary = {
  monthValue: string
  asOfMonth: string
  categories: string[]
  lineCount: number
  productCount: number
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Actual Inventory tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }
  return error.message ?? 'Something went wrong.'
}

export function monthStartFromValue(monthValue: string) {
  if (/^\d{4}-\d{2}$/.test(monthValue)) return `${monthValue}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(monthValue)) return `${monthValue.slice(0, 7)}-01`
  return monthValue
}

export function monthValueFromDate(dateValue: string) {
  return dateValue.slice(0, 7)
}

export function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  if (!year || !month) return monthValue
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function previousMonthStart(dateFrom: string) {
  const [year, month] = dateFrom.split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  const nextYear = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  return `${nextYear}-${nextMonth}-01`
}

export function actualInventorySection(categoryName: string): 'fg' | 'mts' {
  return normalizeCategoryName(categoryName) === 'empties' ? 'mts' : 'fg'
}

export function actualQtyKey(section: 'fg' | 'mts', productId: string, productName: string) {
  if (productId) return `${section}:id:${productId}`
  return `${section}:name:${normalizeCategoryName(productName)}`
}

export function buildActualBeginningLookup(items: ActualInventoryItemRecord[]): ActualBeginningLookup {
  const lookup: ActualBeginningLookup = new Map()
  for (const item of items) {
    const quantity = Number(item.quantity) || 0
    lookup.set(actualQtyKey(item.section, item.product_id ?? '', item.product_name), quantity)
    if (item.product_id) {
      lookup.set(actualQtyKey(item.section, '', item.product_name), quantity)
    }
  }
  return lookup
}

export function lookupActualBeginning(
  lookup: ActualBeginningLookup | null | undefined,
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

export async function getActualInventory(category: string, monthValue: string) {
  const asOfMonth = monthStartFromValue(monthValue)
  const { data: header, error } = await supabase
    .from('actual_inventories')
    .select('id, category, as_of_month')
    .eq('category', category)
    .eq('as_of_month', asOfMonth)
    .maybeSingle()

  if (error) {
    return {
      data: null as ActualInventoryDetail | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  if (!header) {
    return { data: null as ActualInventoryDetail | null, error: null, missingTable: false }
  }

  const { data: items, error: itemsError } = await supabase
    .from('actual_inventory_items')
    .select('id, section, product_id, subcategory_name, product_name, quantity')
    .eq('actual_inventory_id', header.id)
    .order('created_at', { ascending: true })

  if (itemsError) {
    return {
      data: null as ActualInventoryDetail | null,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  return {
    data: {
      id: header.id as string,
      category: header.category as string,
      as_of_month: header.as_of_month as string,
      items: (items ?? []) as ActualInventoryItemRecord[],
    },
    error: null,
    missingTable: false,
  }
}

export async function listActualInventoriesForMonth(monthValue: string) {
  const asOfMonth = monthStartFromValue(monthValue)
  const { data: headers, error } = await supabase
    .from('actual_inventories')
    .select('id, category, as_of_month')
    .eq('as_of_month', asOfMonth)

  if (error) {
    return {
      data: [] as ActualInventoryDetail[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const rows = headers ?? []
  if (rows.length === 0) {
    return { data: [] as ActualInventoryDetail[], error: null, missingTable: false }
  }

  const { data: items, error: itemsError } = await supabase
    .from('actual_inventory_items')
    .select('id, actual_inventory_id, section, product_id, subcategory_name, product_name, quantity')
    .in(
      'actual_inventory_id',
      rows.map((header) => header.id),
    )
    .order('created_at', { ascending: true })

  if (itemsError) {
    return {
      data: [] as ActualInventoryDetail[],
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  const itemsByHeader = new Map<string, ActualInventoryItemRecord[]>()
  for (const item of items ?? []) {
    const list = itemsByHeader.get(item.actual_inventory_id) ?? []
    list.push({
      id: item.id,
      section: item.section,
      product_id: item.product_id,
      subcategory_name: item.subcategory_name,
      product_name: item.product_name,
      quantity: item.quantity,
    })
    itemsByHeader.set(item.actual_inventory_id, list)
  }

  return {
    data: rows.map((header) => ({
      id: header.id as string,
      category: header.category as string,
      as_of_month: header.as_of_month as string,
      items: itemsByHeader.get(header.id) ?? [],
    })),
    error: null,
    missingTable: false,
  }
}

export async function listActualInventoryMonthSummaries() {
  const { data: headers, error } = await supabase
    .from('actual_inventories')
    .select('id, category, as_of_month')
    .order('as_of_month', { ascending: false })

  if (error) {
    return {
      data: [] as ActualInventoryMonthSummary[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const rows = headers ?? []
  if (rows.length === 0) {
    return { data: [] as ActualInventoryMonthSummary[], error: null, missingTable: false }
  }

  const { data: items, error: itemsError } = await supabase
    .from('actual_inventory_items')
    .select('actual_inventory_id, quantity')
    .in(
      'actual_inventory_id',
      rows.map((header) => header.id),
    )

  if (itemsError) {
    return {
      data: [] as ActualInventoryMonthSummary[],
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  const countsByHeader = new Map<string, { lineCount: number; productCount: number }>()
  for (const item of items ?? []) {
    const current = countsByHeader.get(item.actual_inventory_id) ?? { lineCount: 0, productCount: 0 }
    current.lineCount += 1
    if (Number(item.quantity) > 0) current.productCount += 1
    countsByHeader.set(item.actual_inventory_id, current)
  }

  const byMonth = new Map<string, ActualInventoryMonthSummary>()
  for (const header of rows) {
    const asOfMonth = header.as_of_month as string
    const monthValue = monthValueFromDate(asOfMonth)
    const counts = countsByHeader.get(header.id) ?? { lineCount: 0, productCount: 0 }
    const existing = byMonth.get(monthValue) ?? {
      monthValue,
      asOfMonth,
      categories: [] as string[],
      lineCount: 0,
      productCount: 0,
    }
    existing.categories.push(header.category as string)
    existing.lineCount += counts.lineCount
    existing.productCount += counts.productCount
    byMonth.set(monthValue, existing)
  }

  const data = Array.from(byMonth.values())
    .map((summary) => ({
      ...summary,
      categories: [...summary.categories].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.asOfMonth.localeCompare(a.asOfMonth))

  return { data, error: null, missingTable: false }
}

export async function deleteActualInventoriesForMonth(monthValue: string) {
  const asOfMonth = monthStartFromValue(monthValue)
  const { error } = await supabase.from('actual_inventories').delete().eq('as_of_month', asOfMonth)

  if (error) {
    return { data: false as const, error: mapError(error), missingTable: isMissingCatalogTable(error) }
  }

  return { data: true as const, error: null as string | null, missingTable: false }
}

export async function saveActualInventory(input: {
  category: string
  monthValue: string
  items: ActualInventoryItemInput[]
  createdBy?: string
}) {
  const asOfMonth = monthStartFromValue(input.monthValue)
  const existing = await getActualInventory(input.category, asOfMonth)
  if (existing.error && existing.missingTable) {
    return { data: null as ActualInventoryDetail | null, error: existing.error, missingTable: true }
  }
  if (existing.error) {
    return { data: null as ActualInventoryDetail | null, error: existing.error, missingTable: false }
  }

  let inventoryId = existing.data?.id ?? null

  if (inventoryId) {
    const { error: updateError } = await supabase
      .from('actual_inventories')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', inventoryId)
    if (updateError) {
      return {
        data: null as ActualInventoryDetail | null,
        error: mapError(updateError),
        missingTable: isMissingCatalogTable(updateError),
      }
    }

    const { error: deleteError } = await supabase
      .from('actual_inventory_items')
      .delete()
      .eq('actual_inventory_id', inventoryId)
    if (deleteError) {
      return {
        data: null as ActualInventoryDetail | null,
        error: mapError(deleteError),
        missingTable: isMissingCatalogTable(deleteError),
      }
    }
  } else {
    const { data: created, error: createError } = await supabase
      .from('actual_inventories')
      .insert({
        category: input.category,
        as_of_month: asOfMonth,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single()

    if (createError || !created) {
      return {
        data: null as ActualInventoryDetail | null,
        error: mapError(createError),
        missingTable: isMissingCatalogTable(createError),
      }
    }
    inventoryId = created.id as string
  }

  const rows = input.items.map((item) => ({
    actual_inventory_id: inventoryId,
    section: item.section,
    product_id: item.productId || null,
    subcategory_name: item.subcategoryName,
    product_name: item.productName,
    quantity: item.quantity,
  }))

  if (rows.length > 0) {
    const { error: itemsError } = await supabase.from('actual_inventory_items').insert(rows)
    if (itemsError) {
      return {
        data: null as ActualInventoryDetail | null,
        error: mapError(itemsError),
        missingTable: isMissingCatalogTable(itemsError),
      }
    }
  }

  return getActualInventory(input.category, asOfMonth)
}

export async function saveActualInventoriesForMonth(input: {
  monthValue: string
  categories: CatalogTreeCategory[]
  quantities: Record<string, string>
  createdBy?: string
}) {
  for (const category of input.categories) {
    const section = actualInventorySection(category.name)
    const items = category.subcategories.flatMap((sub) =>
      sub.products.map((product) => ({
        section,
        productId: product.id,
        subcategoryName: sub.name,
        productName: product.name,
        quantity: Number(input.quantities[product.id]) || 0,
      })),
    )

    const result = await saveActualInventory({
      category: category.name,
      monthValue: input.monthValue,
      items,
      createdBy: input.createdBy,
    })
    if (result.error) return result
  }

  return { data: true as const, error: null as string | null, missingTable: false }
}
