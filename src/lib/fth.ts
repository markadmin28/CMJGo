import { supabase } from './supabase'
import { capitalizeFirst, isMissingCatalogTable } from './catalog'
import type { FthDiscount, FthRouteType } from '../types/fth'

function capitalizeName(value: string) {
  return capitalizeFirst(value).trim()
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'FTH tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }
  if ((error.message ?? '').toLowerCase().includes('duplicate')) {
    return 'That name already exists here.'
  }
  return error.message ?? 'Something went wrong.'
}

export async function listRouteTypes() {
  const { data, error } = await supabase
    .from('fth_route_types')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  return {
    data: (data ?? []) as FthRouteType[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function addRouteType(name: string, createdBy?: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as FthRouteType | null, error: 'Route type name is required.' }

  const { data, error } = await supabase
    .from('fth_route_types')
    .insert({ name: trimmed, created_by: createdBy ?? null })
    .select('id, name, created_at')
    .single()

  return { data: data as FthRouteType | null, error: mapError(error) }
}

export async function updateRouteType(id: string, name: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as FthRouteType | null, error: 'Route type name is required.' }

  const { data, error } = await supabase
    .from('fth_route_types')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  return { data: data as FthRouteType | null, error: mapError(error) }
}

export async function deleteRouteType(id: string) {
  const { error } = await supabase.from('fth_route_types').delete().eq('id', id)
  return { error: mapError(error) }
}

export async function listDiscountsForRoute(routeTypeId: string) {
  const { data, error } = await supabase
    .from('fth_discounts')
    .select('id, route_type_id, product_id, discount, created_at, updated_at')
    .eq('route_type_id', routeTypeId)

  if (error) {
    return {
      data: {} as Record<string, string>,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const map: Record<string, string> = {}
  for (const row of (data ?? []) as FthDiscount[]) {
    map[row.product_id] = String(row.discount)
  }

  return { data: map, error: null as string | null, missingTable: false }
}

export async function saveDiscountsForRoute(
  routeTypeId: string,
  entries: Array<{ productId: string; discount: string }>,
) {
  const toUpsert: Array<{ route_type_id: string; product_id: string; discount: number }> = []
  const toDelete: string[] = []

  for (const entry of entries) {
    const trimmed = entry.discount.trim()
    if (!trimmed) {
      toDelete.push(entry.productId)
      continue
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: 'Enter a valid discount for every filled field.' }
    }
    toUpsert.push({
      route_type_id: routeTypeId,
      product_id: entry.productId,
      discount: parsed,
    })
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('fth_discounts')
      .delete()
      .eq('route_type_id', routeTypeId)
      .in('product_id', toDelete)
    if (error) return { error: mapError(error) }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase.from('fth_discounts').upsert(
      toUpsert.map((row) => ({
        ...row,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'route_type_id,product_id' },
    )
    if (error) return { error: mapError(error) }
  }

  return { error: null as string | null }
}
