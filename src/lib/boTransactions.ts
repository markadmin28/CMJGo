import { isMissingCatalogTable } from './catalog'
import { supabase } from './supabase'
import type { BoBrandGroup, BoInOutMeta } from './boBadOrder'

export type BoMovementItem = {
  id: string
  movement_id: string
  product_id: string | null
  product_name: string
  brand_id: string | null
  brand_name: string | null
  quantity: number
}

export type BoMovement = {
  id: string
  company: BoInOutMeta['company']
  direction: BoInOutMeta['direction']
  movement_date: string
  truck_number: string
  load_number: string
  from_location: string
  pallets: number
  created_at: string
  items?: BoMovementItem[]
}

export type BoMovementInput = {
  company: BoInOutMeta['company']
  direction: BoInOutMeta['direction']
  movementDate: string
  truckNumber: string
  loadNumber: string
  fromLocation: string
  pallets: number
  items: Array<{
    product_id: string | null
    product_name: string
    brand_id: string | null
    brand_name: string | null
    quantity: number
  }>
  createdBy?: string
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'BO tables are not set up yet. Run supabase/bo_bad_order_schema.sql in the SQL Editor, then try again.'
  }
  return error.message ?? 'Something went wrong.'
}

export function firstDayOfMonthIso(base = new Date()) {
  const year = base.getFullYear()
  const month = String(base.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

export function lastDayOfMonthIso(base = new Date()) {
  const year = base.getFullYear()
  const month = base.getMonth()
  const last = new Date(year, month + 1, 0)
  const mm = String(last.getMonth() + 1).padStart(2, '0')
  const dd = String(last.getDate()).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function buildBoItemsFromQtys(
  groups: BoBrandGroup[],
  qtys: Record<string, string>,
) {
  const items: BoMovementInput['items'] = []
  for (const group of groups) {
    for (const product of group.items) {
      const raw = (qtys[product.id] ?? '').trim()
      if (!raw) continue
      const quantity = Number(raw)
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      items.push({
        product_id: product.id,
        product_name: product.label,
        brand_id: group.id,
        brand_name: group.title,
        quantity,
      })
    }
  }
  return items
}

export async function saveBoMovement(input: BoMovementInput, editingId?: string | null) {
  const truck = input.truckNumber.trim()
  const load = input.loadNumber.trim()
  const from = input.fromLocation.trim()

  if (!input.movementDate) return { data: null as BoMovement | null, error: 'Date is required.', missingTable: false }
  if (!truck) return { data: null as BoMovement | null, error: 'Truck no is required.', missingTable: false }
  if (!load) return { data: null as BoMovement | null, error: 'Load no is required.', missingTable: false }
  if (!from) return { data: null as BoMovement | null, error: 'FROM is required.', missingTable: false }
  if (input.items.length === 0 && !(input.pallets > 0)) {
    return {
      data: null as BoMovement | null,
      error: 'Enter at least one product quantity or pallets.',
      missingTable: false,
    }
  }

  const payload = {
    company: input.company,
    direction: input.direction,
    movement_date: input.movementDate,
    truck_number: truck,
    load_number: load,
    from_location: from,
    pallets: input.pallets,
    created_by: input.createdBy ?? null,
  }

  let movementId = editingId ?? null

  if (editingId) {
    const { error } = await supabase.from('bo_movements').update(payload).eq('id', editingId)
    if (error) {
      return { data: null as BoMovement | null, error: mapError(error), missingTable: isMissingCatalogTable(error) }
    }
    const { error: deleteError } = await supabase.from('bo_movement_items').delete().eq('movement_id', editingId)
    if (deleteError) {
      return {
        data: null as BoMovement | null,
        error: mapError(deleteError),
        missingTable: isMissingCatalogTable(deleteError),
      }
    }
  } else {
    const { data, error } = await supabase.from('bo_movements').insert(payload).select('id').single()
    if (error) {
      return { data: null as BoMovement | null, error: mapError(error), missingTable: isMissingCatalogTable(error) }
    }
    movementId = data.id as string
  }

  if (!movementId) {
    return { data: null as BoMovement | null, error: 'Could not save movement.', missingTable: false }
  }

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from('bo_movement_items').insert(
      input.items.map((item) => ({
        movement_id: movementId,
        product_id: item.product_id,
        product_name: item.product_name,
        brand_id: item.brand_id,
        brand_name: item.brand_name,
        quantity: item.quantity,
      })),
    )
    if (itemsError) {
      return {
        data: null as BoMovement | null,
        error: mapError(itemsError),
        missingTable: isMissingCatalogTable(itemsError),
      }
    }
  }

  return getBoMovement(movementId)
}

export async function getBoMovement(id: string) {
  const { data, error } = await supabase
    .from('bo_movements')
    .select(
      'id, company, direction, movement_date, truck_number, load_number, from_location, pallets, created_at, items:bo_movement_items(id, movement_id, product_id, product_name, brand_id, brand_name, quantity)',
    )
    .eq('id', id)
    .single()

  return {
    data: (data as BoMovement | null) ?? null,
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function searchBoMovements(options: {
  company: BoInOutMeta['company']
  direction?: BoInOutMeta['direction']
  dateFrom: string
  dateTo: string
}) {
  let query = supabase
    .from('bo_movements')
    .select(
      'id, company, direction, movement_date, truck_number, load_number, from_location, pallets, created_at, items:bo_movement_items(id, movement_id, product_id, product_name, brand_id, brand_name, quantity)',
    )
    .eq('company', options.company)
    .gte('movement_date', options.dateFrom)
    .lte('movement_date', options.dateTo)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (options.direction) {
    query = query.eq('direction', options.direction)
  }

  const { data, error } = await query

  return {
    data: (data ?? []) as BoMovement[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function listBoMovementsForCompany(
  company: BoInOutMeta['company'],
  dateTo?: string,
) {
  let query = supabase
    .from('bo_movements')
    .select(
      'id, company, direction, movement_date, truck_number, load_number, from_location, pallets, created_at, items:bo_movement_items(id, movement_id, product_id, product_name, brand_id, brand_name, quantity)',
    )
    .eq('company', company)
    .order('movement_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (dateTo) {
    query = query.lte('movement_date', dateTo)
  }

  const { data, error } = await query

  return {
    data: (data ?? []) as BoMovement[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function deleteBoMovement(id: string) {
  const { error } = await supabase.from('bo_movements').delete().eq('id', id)
  return { error: mapError(error), missingTable: isMissingCatalogTable(error) }
}

export function qtysFromBoMovement(movement: BoMovement, groups: BoBrandGroup[]) {
  const values: Record<string, string> = { pallets: '' }
  for (const group of groups) {
    for (const item of group.items) values[item.id] = ''
  }

  if (movement.pallets > 0) values.pallets = Number(movement.pallets).toFixed(1)

  for (const line of movement.items ?? []) {
    if (line.product_id && values[line.product_id] !== undefined) {
      values[line.product_id] = Number(line.quantity).toFixed(1)
      continue
    }
    const match = groups
      .flatMap((group) => group.items.map((item) => ({ ...item, brandId: group.id })))
      .find(
        (item) =>
          item.label.trim().toLowerCase() === line.product_name.trim().toLowerCase() &&
          (!line.brand_name || item.brandId === line.brand_id),
      )
    if (match) values[match.id] = Number(line.quantity).toFixed(1)
  }

  return values
}
