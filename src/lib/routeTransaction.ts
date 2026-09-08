import { supabase } from './supabase'
import type { UserBranch } from './branches'
import { capitalizeFirst, isMissingCatalogTable } from './catalog'
import type { CustomerTransactionCompany } from './customerTransaction'
import type { RouteTransactionOption } from '../components/RouteTransactionOptionsPopover'
import type { BoBrandGroup } from './boBadOrder'
import {
  allocateNextSharedSalesNo,
  peekNextSharedSalesNo,
} from './sharedSalesSeries'

export type RouteArea = {
  id: string
  branch: string
  name: string
  created_at: string
}

export type RouteLoadKind = 'first_load' | 'second_load' | 'rfg'

export type RouteTempLoad = {
  id: string
  branch: string
  load_kind: RouteLoadKind
  route_area_id: string | null
  route_area_name: string
  plate_no: string
  driver: string
  helper: string
  ahente: string
  load_at_text: string
  load_at: string
  load_date: string
  is_temporary: boolean
  created_at: string
  updated_at: string
}

export type RouteTempLoadItem = {
  id: string
  load_id: string
  company: CustomerTransactionCompany
  product_id: string | null
  product_name: string
  brand_id: string | null
  brand_name: string
  quantity: number
}

export type RouteTempLoadItemInput = {
  company: CustomerTransactionCompany
  productId: string
  productName: string
  brandId: string
  brandName: string
  quantity: number
}

export type SaveRouteTempLoadInput = {
  branch?: UserBranch | null
  loadKind: RouteLoadKind
  routeAreaId: string | null
  routeAreaName: string
  plateNo: string
  driver: string
  helper: string
  ahente: string
  loadAtText: string
  items: RouteTempLoadItemInput[]
  createdBy?: string | null
}

export const ROUTE_TX_COMPANIES: CustomerTransactionCompany[] = ['Pepsi', 'SMC', 'Magnolia']

export function routeTransactionTitle(option: RouteTransactionOption) {
  if (option === 'firstLoad') return 'FIRST LOAD'
  if (option === 'secondLoad') return 'SECOND LOAD'
  if (option === 'rfg') return 'RFG'
  return 'SUMMARY'
}

export function routeOptionToLoadKind(option: RouteTransactionOption): RouteLoadKind | null {
  if (option === 'firstLoad') return 'first_load'
  if (option === 'secondLoad') return 'second_load'
  if (option === 'rfg') return 'rfg'
  return null
}

export function formatRouteTxDateTime(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${mm}-${dd}-${yyyy} ${hh}:${min}:${ss}`
}

/** Local calendar date (YYYY-MM-DD) used for the daily route-load reset. */
export function routeLoadTodayIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const ROUTE_TEMP_LOAD_SELECT =
  'id, branch, load_kind, route_area_id, route_area_name, plate_no, driver, helper, ahente, load_at_text, load_at, load_date, is_temporary, created_at, updated_at'

function mapRouteError(error: { message?: string; code?: string; details?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Route tables are not set up yet. Run the Route Areas + Route Temp Loads SQL, then refresh.'
  }
  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  if (message.includes('duplicate') || error.code === '23505') {
    if (message.includes('route_areas')) {
      return 'That route / area already exists for this branch.'
    }
    return 'A temporary load for this route already exists and will be updated.'
  }
  return error.message ?? 'Something went wrong.'
}

export async function listRouteAreas(branch: UserBranch = 'Nabunturan') {
  const { data, error } = await supabase
    .from('route_areas')
    .select('id, branch, name, created_at')
    .eq('branch', branch)
    .order('name', { ascending: true })

  if (error) {
    return {
      data: [] as RouteArea[],
      error: mapRouteError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as RouteArea[],
    error: null as string | null,
    missingTable: false,
  }
}

export async function addRouteArea(
  name: string,
  branch: UserBranch = 'Nabunturan',
  createdBy?: string | null,
) {
  const trimmed = capitalizeFirst(name).trim()
  if (!trimmed) {
    return { data: null as RouteArea | null, error: 'Route / Area name is required.', missingTable: false }
  }

  const { data, error } = await supabase
    .from('route_areas')
    .insert({
      name: trimmed,
      branch,
      created_by: createdBy ?? null,
    })
    .select('id, branch, name, created_at')
    .single()

  if (error) {
    return {
      data: null as RouteArea | null,
      error: mapRouteError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: data as RouteArea,
    error: null as string | null,
    missingTable: false,
  }
}

/** Routes that already have a saved temporary First Load today (for Second Load / RFG). */
export async function listRouteAreasWithFirstLoad(
  branch: UserBranch = 'Nabunturan',
  loadDate = routeLoadTodayIsoDate(),
) {
  const { data, error } = await supabase
    .from('route_temp_loads')
    .select(ROUTE_TEMP_LOAD_SELECT)
    .eq('branch', branch)
    .eq('load_kind', 'first_load')
    .eq('is_temporary', true)
    .eq('load_date', loadDate)
    .order('route_area_name', { ascending: true })

  if (error) {
    return {
      data: [] as RouteTempLoad[],
      error: mapRouteError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as RouteTempLoad[],
    error: null as string | null,
    missingTable: false,
  }
}

export async function getRouteTempLoad(
  branch: UserBranch,
  routeAreaId: string,
  loadKind: RouteLoadKind,
  loadDate = routeLoadTodayIsoDate(),
) {
  const { data, error } = await supabase
    .from('route_temp_loads')
    .select(ROUTE_TEMP_LOAD_SELECT)
    .eq('branch', branch)
    .eq('route_area_id', routeAreaId)
    .eq('load_kind', loadKind)
    .eq('load_date', loadDate)
    .maybeSingle()

  if (error) {
    return {
      data: null as RouteTempLoad | null,
      error: mapRouteError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data as RouteTempLoad | null) ?? null,
    error: null as string | null,
    missingTable: false,
  }
}

export async function getRouteTempLoadItems(loadId: string) {
  const { data, error } = await supabase
    .from('route_temp_load_items')
    .select('id, load_id, company, product_id, product_name, brand_id, brand_name, quantity')
    .eq('load_id', loadId)

  if (error) {
    return {
      data: [] as RouteTempLoadItem[],
      error: mapRouteError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as RouteTempLoadItem[],
    error: null as string | null,
    missingTable: false,
  }
}

export type RouteSummaryProductRow = {
  productId: string
  productName: string
  brandId: string
  brandName: string
  price: number
  firstLoad: number
  secondLoad: number
  rfg: number
  total: number
  sales: number
  amount: number
}

export type RouteSummaryBrandBlock = {
  brandId: string
  brandName: string
  rows: RouteSummaryProductRow[]
}

function qtyByProductId(items: RouteTempLoadItem[]) {
  const map = new Map<string, number>()
  for (const item of items) {
    if (!item.product_id) continue
    map.set(item.product_id, (map.get(item.product_id) ?? 0) + Number(item.quantity || 0))
  }
  return map
}

/** Pepsi: subcategory - product. SMC / Magnolia: product only. */
export function formatRouteSummaryProductName(
  company: CustomerTransactionCompany,
  brandName: string,
  productLabel: string,
) {
  const brand = brandName.trim()
  const product = productLabel.trim()
  if (company === 'Pepsi') {
    return brand && product ? `${brand} - ${product}` : brand || product
  }
  return product || brand
}

/** Merge catalog products with today's First / Second / RFG qty for one company. */
export function buildRouteSummaryBrandBlocks(
  groups: BoBrandGroup[],
  firstItems: RouteTempLoadItem[],
  secondItems: RouteTempLoadItem[],
  rfgItems: RouteTempLoadItem[],
  _company: CustomerTransactionCompany = 'Pepsi',
): RouteSummaryBrandBlock[] {
  const firstMap = qtyByProductId(firstItems)
  const secondMap = qtyByProductId(secondItems)
  const rfgMap = qtyByProductId(rfgItems)

  return groups.map((group) => ({
    brandId: group.id,
    brandName: group.title,
    rows: group.items.map((product) => {
      const firstLoad = firstMap.get(product.id) ?? 0
      const secondLoad = secondMap.get(product.id) ?? 0
      const rfg = rfgMap.get(product.id) ?? 0
      const total = firstLoad + secondLoad
      const sales = total - rfg
      const price = Number(product.price) || 0
      return {
        productId: product.id,
        productName: product.label,
        brandId: group.id,
        brandName: group.title,
        price,
        firstLoad,
        secondLoad,
        rfg,
        total,
        sales,
        amount: sales * price,
      }
    }),
  }))
}

/** Split products evenly across two tables (keeps brand headers when a brand spans). */
export function splitRouteSummaryBlocksEvenly(blocks: RouteSummaryBrandBlock[]) {
  const flat: Array<{ brandId: string; brandName: string; row: RouteSummaryProductRow }> = []
  for (const block of blocks) {
    for (const row of block.rows) {
      flat.push({ brandId: block.brandId, brandName: block.brandName, row })
    }
  }
  const mid = Math.ceil(flat.length / 2)
  return [regroupSummaryRows(flat.slice(0, mid)), regroupSummaryRows(flat.slice(mid))] as const
}

function regroupSummaryRows(
  items: Array<{ brandId: string; brandName: string; row: RouteSummaryProductRow }>,
): RouteSummaryBrandBlock[] {
  const blocks: RouteSummaryBrandBlock[] = []
  for (const item of items) {
    const last = blocks[blocks.length - 1]
    if (last && last.brandId === item.brandId) {
      last.rows.push(item.row)
    } else {
      blocks.push({
        brandId: item.brandId,
        brandName: item.brandName,
        rows: [item.row],
      })
    }
  }
  return blocks
}

/** Preview next Summary sales no — continues with Customer Transaction for same branch + company. */
export async function peekNextRouteSummarySalesNo(
  branch: UserBranch,
  company: CustomerTransactionCompany,
) {
  return peekNextSharedSalesNo(branch, company)
}

/** Allocate next Summary sales no — shared continuous series with Customer Transaction. */
export async function allocateNextRouteSummarySalesNo(
  branch: UserBranch,
  company: CustomerTransactionCompany,
) {
  return allocateNextSharedSalesNo(branch, company)
}

export async function loadRouteDayBundle(
  branch: UserBranch,
  routeAreaId: string,
  loadDate = routeLoadTodayIsoDate(),
) {
  const [first, second, rfg] = await Promise.all([
    getRouteTempLoad(branch, routeAreaId, 'first_load', loadDate),
    getRouteTempLoad(branch, routeAreaId, 'second_load', loadDate),
    getRouteTempLoad(branch, routeAreaId, 'rfg', loadDate),
  ])

  if (first.missingTable || second.missingTable || rfg.missingTable) {
    return {
      firstLoad: null as RouteTempLoad | null,
      secondLoad: null as RouteTempLoad | null,
      rfgLoad: null as RouteTempLoad | null,
      firstItems: [] as RouteTempLoadItem[],
      secondItems: [] as RouteTempLoadItem[],
      rfgItems: [] as RouteTempLoadItem[],
      error:
        first.error ??
        second.error ??
        rfg.error ??
        'Route tables are not set up yet. Run the Route Areas + Route Temp Loads SQL, then refresh.',
      missingTable: true,
    }
  }

  if (first.error || second.error || rfg.error) {
    return {
      firstLoad: null as RouteTempLoad | null,
      secondLoad: null as RouteTempLoad | null,
      rfgLoad: null as RouteTempLoad | null,
      firstItems: [] as RouteTempLoadItem[],
      secondItems: [] as RouteTempLoadItem[],
      rfgItems: [] as RouteTempLoadItem[],
      error: first.error ?? second.error ?? rfg.error,
      missingTable: false,
    }
  }

  const [firstItems, secondItems, rfgItems] = await Promise.all([
    first.data ? getRouteTempLoadItems(first.data.id) : Promise.resolve({ data: [] as RouteTempLoadItem[], error: null }),
    second.data
      ? getRouteTempLoadItems(second.data.id)
      : Promise.resolve({ data: [] as RouteTempLoadItem[], error: null }),
    rfg.data ? getRouteTempLoadItems(rfg.data.id) : Promise.resolve({ data: [] as RouteTempLoadItem[], error: null }),
  ])

  return {
    firstLoad: first.data,
    secondLoad: second.data,
    rfgLoad: rfg.data,
    firstItems: firstItems.data,
    secondItems: secondItems.data,
    rfgItems: rfgItems.data,
    error: firstItems.error ?? secondItems.error ?? rfgItems.error,
    missingTable: false,
  }
}

export function formatRouteMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatRouteQty(value: number) {
  if (!Number.isFinite(value) || value === 0) return '0'
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

export function collectRouteQtyItems(
  groupsByCompany: Record<CustomerTransactionCompany, BoBrandGroup[]>,
  qtys: Record<string, string>,
): RouteTempLoadItemInput[] {
  const items: RouteTempLoadItemInput[] = []
  for (const company of ROUTE_TX_COMPANIES) {
    for (const group of groupsByCompany[company] ?? []) {
      for (const product of group.items) {
        const qty = Number(qtys[product.id] || 0)
        if (!Number.isFinite(qty) || qty === 0) continue
        items.push({
          company,
          productId: product.id,
          productName: product.label,
          brandId: group.id,
          brandName: group.title,
          quantity: qty,
        })
      }
    }
  }
  return items
}

/**
 * Save First / Second / RFG as temporary storage only (scoped to today's load_date).
 * Does not write full_goods movements or touch inventory calculations.
 */
export async function saveRouteTempLoad(input: SaveRouteTempLoadInput) {
  const branch = input.branch ?? 'Nabunturan'
  const loadDate = routeLoadTodayIsoDate()
  const routeName = input.routeAreaName.trim()
  if (!routeName) {
    return {
      data: null as RouteTempLoad | null,
      updated: false,
      error: 'Route / Area is required.',
      missingTable: false,
    }
  }
  if (input.items.length === 0 && input.loadKind === 'first_load') {
    return {
      data: null as RouteTempLoad | null,
      updated: false,
      error: 'Enter at least one product quantity before saving.',
      missingTable: false,
    }
  }

  const payload = {
    branch,
    load_kind: input.loadKind,
    route_area_id: input.routeAreaId,
    route_area_name: routeName,
    plate_no: input.plateNo.trim().toUpperCase(),
    driver: capitalizeFirst(input.driver.trim()),
    helper: capitalizeFirst(input.helper.trim()),
    ahente: capitalizeFirst(input.ahente.trim()),
    load_at_text: input.loadAtText.trim(),
    load_at: new Date().toISOString(),
    load_date: loadDate,
    is_temporary: true,
    updated_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
  }

  let loadId: string | null = null
  let updated = false

  if (input.routeAreaId) {
    const existing = await getRouteTempLoad(branch, input.routeAreaId, input.loadKind, loadDate)
    if (existing.missingTable) {
      return {
        data: null as RouteTempLoad | null,
        updated: false,
        error: existing.error,
        missingTable: true,
      }
    }
    if (existing.error) {
      return {
        data: null as RouteTempLoad | null,
        updated: false,
        error: existing.error,
        missingTable: false,
      }
    }
    if (existing.data) {
      loadId = existing.data.id
      updated = true
      const { error: updateError } = await supabase
        .from('route_temp_loads')
        .update(payload)
        .eq('id', loadId)
      if (updateError) {
        return {
          data: null as RouteTempLoad | null,
          updated: false,
          error: mapRouteError(updateError),
          missingTable: isMissingCatalogTable(updateError),
        }
      }
      await supabase.from('route_temp_load_items').delete().eq('load_id', loadId)
    }
  }

  if (!loadId) {
    const { data: inserted, error: insertError } = await supabase
      .from('route_temp_loads')
      .insert(payload)
      .select(ROUTE_TEMP_LOAD_SELECT)
      .single()

    if (insertError) {
      // Race on unique index — fetch and update.
      if (insertError.code === '23505' && input.routeAreaId) {
        const again = await getRouteTempLoad(branch, input.routeAreaId, input.loadKind, loadDate)
        if (again.data) {
          loadId = again.data.id
          updated = true
          const { error: updateError } = await supabase
            .from('route_temp_loads')
            .update(payload)
            .eq('id', loadId)
          if (updateError) {
            return {
              data: null as RouteTempLoad | null,
              updated: false,
              error: mapRouteError(updateError),
              missingTable: isMissingCatalogTable(updateError),
            }
          }
          await supabase.from('route_temp_load_items').delete().eq('load_id', loadId)
        } else {
          return {
            data: null as RouteTempLoad | null,
            updated: false,
            error: mapRouteError(insertError),
            missingTable: isMissingCatalogTable(insertError),
          }
        }
      } else {
        return {
          data: null as RouteTempLoad | null,
          updated: false,
          error: mapRouteError(insertError),
          missingTable: isMissingCatalogTable(insertError),
        }
      }
    } else {
      loadId = (inserted as RouteTempLoad).id
      updated = false
    }
  }

  if (input.items.length > 0) {
    const itemRows = input.items.map((item) => ({
      load_id: loadId!,
      company: item.company,
      product_id: item.productId,
      product_name: item.productName,
      brand_id: item.brandId,
      brand_name: item.brandName,
      quantity: item.quantity,
    }))

    const { error: itemsError } = await supabase.from('route_temp_load_items').insert(itemRows)
    if (itemsError) {
      return {
        data: null as RouteTempLoad | null,
        updated: false,
        error: mapRouteError(itemsError),
        missingTable: isMissingCatalogTable(itemsError),
      }
    }
  }

  const { data: saved, error: readError } = await supabase
    .from('route_temp_loads')
    .select(ROUTE_TEMP_LOAD_SELECT)
    .eq('id', loadId!)
    .single()

  if (readError) {
    return {
      data: null as RouteTempLoad | null,
      updated: false,
      error: mapRouteError(readError),
      missingTable: isMissingCatalogTable(readError),
    }
  }

  return {
    data: saved as RouteTempLoad,
    updated,
    error: null as string | null,
    missingTable: false,
  }
}
