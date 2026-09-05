import { supabase } from './supabase'
import { capitalizeFirst, isMissingCatalogTable } from './catalog'
import type {
  FullGoodsInput,
  FullGoodsItem,
  FullGoodsLocation,
  FullGoodsMovement,
} from '../types/fullGoods'

function capitalizeName(value: string) {
  return capitalizeFirst(value).trim()
}

function mapError(error: { message?: string; code?: string; details?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Full Goods tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }

  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  if (message.includes('duplicate') || error.code === '23505') {
    if (message.includes('load_number') || message.includes('full_goods_load_number')) {
      return 'That load number is already used. Pick the next series number for this month, or run the latest Full Goods SQL.'
    }
    if (message.includes('locations') || message.includes('full_goods_locations')) {
      return 'That location name already exists.'
    }
    return 'A matching record already exists.'
  }

  return error.message ?? 'Something went wrong.'
}

const PRESET_LOAD_OPTIONS = ['BO', 'OTHERS'] as const

export function getPresetLoadOptions() {
  return [...PRESET_LOAD_OPTIONS]
}

export async function listLocations() {
  const { data, error } = await supabase
    .from('full_goods_locations')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  return {
    data: (data ?? []) as FullGoodsLocation[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function addLocation(name: string, createdBy?: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as FullGoodsLocation | null, error: 'Location name is required.' }

  const { data, error } = await supabase
    .from('full_goods_locations')
    .insert({ name: trimmed, created_by: createdBy ?? null })
    .select('id, name, created_at')
    .single()

  return { data: data as FullGoodsLocation | null, error: mapError(error) }
}

export async function updateLocation(id: string, name: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as FullGoodsLocation | null, error: 'Location name is required.' }

  const { data, error } = await supabase
    .from('full_goods_locations')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  return { data: data as FullGoodsLocation | null, error: mapError(error) }
}

export async function deleteLocation(id: string) {
  const { error } = await supabase.from('full_goods_locations').delete().eq('id', id)
  return { error: mapError(error) }
}

export type LoadSeriesMode = 'fullGoods' | 'empties'

function monthRange(isoDate: string) {
  const [year, month] = isoDate.split('-').map(Number)
  if (!year || !month) {
    return { start: isoDate, end: isoDate }
  }
  const monthText = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  }
}

function normalizeLoadScopeName(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase()
}

function matchesLoadSeriesScope(
  row: { category_id: string | null; category_name: string | null },
  mode: LoadSeriesMode,
  emptiesParentId?: string | null,
) {
  if (emptiesParentId) {
    return mode === 'empties'
      ? row.category_id === emptiesParentId
      : row.category_id !== emptiesParentId
  }

  const categoryName = normalizeLoadScopeName(row.category_name)
  if (mode === 'empties') {
    return categoryName.includes('mts') || categoryName === 'empties'
  }
  return categoryName !== 'empties' && !categoryName.includes('mts')
}

/** Next numeric series load number for the movement month (ignores BO / OTHERS / non-numeric). */
export async function getNextSeriesLoadNumber(
  movementDate: string,
  mode: LoadSeriesMode,
  emptiesParentId?: string | null,
) {
  const { start, end } = monthRange(movementDate)
  const { data, error } = await supabase
    .from('full_goods_movements')
    .select('load_number, category_id, category_name')
    .gte('movement_date', start)
    .lte('movement_date', end)

  if (error) {
    return {
      data: 1,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  let max = 0
  for (const row of data ?? []) {
    if (!matchesLoadSeriesScope(row, mode, emptiesParentId)) continue
    const raw = String(row.load_number ?? '').trim()
    if (!/^\d+$/.test(raw)) continue
    const value = Number(raw)
    if (value > max) max = value
  }

  return {
    data: max + 1,
    error: null as string | null,
    missingTable: false,
  }
}

export function isPresetLoadNumber(value: string) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return PRESET_LOAD_OPTIONS.includes(normalized as (typeof PRESET_LOAD_OPTIONS)[number])
}

/** Load options: next monthly series + BO / OTHERS. */
export async function listLoadNumberOptions(
  movementDate: string,
  mode: LoadSeriesMode,
  emptiesParentId?: string | null,
) {
  const next = await getNextSeriesLoadNumber(movementDate, mode, emptiesParentId)
  if (next.error) {
    return {
      data: [...PRESET_LOAD_OPTIONS] as string[],
      nextSeries: '1',
      error: next.error,
      missingTable: next.missingTable,
    }
  }

  const series = String(next.data)
  return {
    data: [series, ...PRESET_LOAD_OPTIONS],
    nextSeries: series,
    error: null as string | null,
    missingTable: false,
  }
}

const MOVEMENTS_PAGE_SIZE = 1000
const ITEMS_ID_CHUNK_SIZE = 100

export async function listFullGoodsMovements() {
  const movements: FullGoodsMovement[] = []
  let from = 0

  // Supabase defaults to 1000 rows — page through so older history is not dropped.
  while (true) {
    const movementsResult = await supabase
      .from('full_goods_movements')
      .select(
        'id, movement_type, movement_date, truck_number, load_number, location, location_id, category_id, category_name, brand_id, brand_name, created_at',
      )
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + MOVEMENTS_PAGE_SIZE - 1)

    if (movementsResult.error) {
      return {
        data: [] as FullGoodsMovement[],
        error: mapError(movementsResult.error),
        missingTable: isMissingCatalogTable(movementsResult.error),
      }
    }

    const batch = (movementsResult.data ?? []) as FullGoodsMovement[]
    movements.push(...batch)
    if (batch.length < MOVEMENTS_PAGE_SIZE) break
    from += MOVEMENTS_PAGE_SIZE
  }

  if (movements.length === 0) {
    return { data: movements, error: null as string | null, missingTable: false }
  }

  // Chunk .in() filters — a single huge id list can fail the request and return no data.
  const byMovement = new Map<string, FullGoodsItem[]>()
  for (let i = 0; i < movements.length; i += ITEMS_ID_CHUNK_SIZE) {
    const ids = movements.slice(i, i + ITEMS_ID_CHUNK_SIZE).map((item) => item.id)
    const itemsResult = await supabase
      .from('full_goods_items')
      .select('id, movement_id, product_id, product_name, brand_id, brand_name, quantity, created_at')
      .in('movement_id', ids)

    if (itemsResult.error) {
      return {
        data: [] as FullGoodsMovement[],
        error: mapError(itemsResult.error),
        missingTable: isMissingCatalogTable(itemsResult.error),
      }
    }

    for (const item of (itemsResult.data ?? []) as FullGoodsItem[]) {
      const list = byMovement.get(item.movement_id) ?? []
      list.push(item)
      byMovement.set(item.movement_id, list)
    }
  }

  return {
    data: movements.map((movement) => ({
      ...movement,
      items: byMovement.get(movement.id) ?? [],
    })),
    error: null as string | null,
    missingTable: false,
  }
}

export async function addFullGoodsMovement(input: FullGoodsInput, createdBy?: string) {
  const truckNumber = String(input.truck_number ?? '').trim()
  const loadNumber = String(input.load_number ?? '').trim()
  const location = capitalizeName(input.location)
  const categoryName = capitalizeName(input.category_name)

  if (!input.movement_date) {
    return { data: null as FullGoodsMovement | null, error: 'Date is required.' }
  }
  if (!truckNumber) {
    return { data: null as FullGoodsMovement | null, error: 'Truck number is required.' }
  }
  if (!loadNumber) {
    return { data: null as FullGoodsMovement | null, error: 'Load number is required.' }
  }
  if (!location) return { data: null as FullGoodsMovement | null, error: 'Location is required.' }
  if (!categoryName || !input.category_id) {
    return { data: null as FullGoodsMovement | null, error: 'Select a category first.' }
  }
  if (input.items.length === 0) {
    return {
      data: null as FullGoodsMovement | null,
      error: 'Enter quantity for at least one product in this category.',
    }
  }

  const primaryBrand = input.items[0]
  const listOption =
    loadNumber.toUpperCase() === 'BO' || loadNumber.toUpperCase() === 'OTHERS'
      ? loadNumber.toUpperCase()
      : 'OTHERS'

  const { data: movement, error } = await supabase
    .from('full_goods_movements')
    .insert({
      movement_type: input.movement_type,
      movement_date: input.movement_date,
      truck_number: truckNumber,
      load_number: loadNumber,
      list_option: listOption,
      location,
      location_id: input.location_id,
      category_id: input.category_id,
      category_name: categoryName,
      brand_id: primaryBrand?.brand_id ?? null,
      brand_name: primaryBrand?.brand_name ?? categoryName,
      created_by: createdBy ?? null,
    })
    .select(
      'id, movement_type, movement_date, truck_number, load_number, location, location_id, category_id, category_name, brand_id, brand_name, created_at',
    )
    .single()

  if (error || !movement) {
    return { data: null as FullGoodsMovement | null, error: mapError(error) }
  }

  const { error: itemsError } = await supabase.from('full_goods_items').insert(
    input.items.map((item) => ({
      movement_id: movement.id,
      product_id: item.product_id,
      product_name: item.product_name,
      brand_id: item.brand_id,
      brand_name: item.brand_name,
      quantity: item.quantity,
    })),
  )

  if (itemsError) {
    await supabase.from('full_goods_movements').delete().eq('id', movement.id)
    return { data: null as FullGoodsMovement | null, error: mapError(itemsError) }
  }

  return { data: movement as FullGoodsMovement, error: null as string | null }
}

export async function updateFullGoodsMovement(id: string, input: FullGoodsInput) {
  const truckNumber = String(input.truck_number ?? '').trim()
  const loadNumber = String(input.load_number ?? '').trim()
  const location = capitalizeName(input.location)
  const categoryName = capitalizeName(input.category_name)

  if (!input.movement_date) {
    return { data: null as FullGoodsMovement | null, error: 'Date is required.' }
  }
  if (!truckNumber) {
    return { data: null as FullGoodsMovement | null, error: 'Truck number is required.' }
  }
  if (!loadNumber) {
    return { data: null as FullGoodsMovement | null, error: 'Load number is required.' }
  }
  if (!location) return { data: null as FullGoodsMovement | null, error: 'Location is required.' }
  if (!categoryName || !input.category_id) {
    return { data: null as FullGoodsMovement | null, error: 'Select a category first.' }
  }
  if (input.items.length === 0) {
    return {
      data: null as FullGoodsMovement | null,
      error: 'Enter quantity for at least one product in this category.',
    }
  }

  const primaryBrand = input.items[0]
  const listOption =
    loadNumber.toUpperCase() === 'BO' || loadNumber.toUpperCase() === 'OTHERS'
      ? loadNumber.toUpperCase()
      : 'OTHERS'

  const { error } = await supabase
    .from('full_goods_movements')
    .update({
      movement_type: input.movement_type,
      movement_date: input.movement_date,
      truck_number: truckNumber,
      load_number: loadNumber,
      list_option: listOption,
      location,
      location_id: input.location_id,
      category_id: input.category_id,
      category_name: categoryName,
      brand_id: primaryBrand?.brand_id ?? null,
      brand_name: primaryBrand?.brand_name ?? categoryName,
    })
    .eq('id', id)

  if (error) {
    return { data: null as FullGoodsMovement | null, error: mapError(error) }
  }

  const { error: deleteError } = await supabase.from('full_goods_items').delete().eq('movement_id', id)
  if (deleteError) {
    return { data: null as FullGoodsMovement | null, error: mapError(deleteError) }
  }

  const { error: itemsError } = await supabase.from('full_goods_items').insert(
    input.items.map((item) => ({
      movement_id: id,
      product_id: item.product_id,
      product_name: item.product_name,
      brand_id: item.brand_id,
      brand_name: item.brand_name,
      quantity: item.quantity,
    })),
  )

  if (itemsError) {
    return { data: null as FullGoodsMovement | null, error: mapError(itemsError) }
  }

  return {
    data: {
      id,
      movement_type: input.movement_type,
      movement_date: input.movement_date,
      truck_number: truckNumber,
      load_number: loadNumber,
      location,
      location_id: input.location_id,
      category_id: input.category_id,
      category_name: categoryName,
      created_at: new Date().toISOString(),
    } as FullGoodsMovement,
    error: null as string | null,
  }
}

export async function deleteFullGoodsMovement(id: string) {
  const { error } = await supabase.from('full_goods_movements').delete().eq('id', id)
  return { error: mapError(error) }
}

export function searchFullGoodsMovements(movements: FullGoodsMovement[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return movements

  return movements.filter((item) => {
    const haystack = [
      item.load_number,
      item.movement_type,
      item.category_name,
      item.movement_date,
      item.truck_number,
      item.location,
      ...(item.items ?? []).flatMap((line) => [
        line.brand_name,
        line.product_name,
        String(line.quantity),
      ]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(q)
  })
}
