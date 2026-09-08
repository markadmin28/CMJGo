import { supabase } from './supabase'
import type { UserBranch } from './branches'
import { capitalizeFirst, isMissingCatalogTable } from './catalog'
import type { CustomerDiscount, CustomerDiscountGroup } from '../types/customerDiscount'

function capitalizeName(value: string) {
  return capitalizeFirst(value).trim()
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Customers Discount tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }
  if ((error.message ?? '').toLowerCase().includes('duplicate')) {
    return 'That customer name already exists for this branch.'
  }
  return error.message ?? 'Something went wrong.'
}

export async function listCustomerGroups(branch: UserBranch) {
  const { data, error } = await supabase
    .from('customer_discount_groups')
    .select('id, branch, name, created_at')
    .eq('branch', branch)
    .order('created_at', { ascending: true })

  return {
    data: (data ?? []) as CustomerDiscountGroup[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function addCustomerGroup(branch: UserBranch, name: string, createdBy?: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) {
    return { data: null as CustomerDiscountGroup | null, error: 'Customer name is required.' }
  }

  const { data, error } = await supabase
    .from('customer_discount_groups')
    .insert({ branch, name: trimmed, created_by: createdBy ?? null })
    .select('id, branch, name, created_at')
    .single()

  return { data: data as CustomerDiscountGroup | null, error: mapError(error) }
}

export async function updateCustomerGroup(id: string, name: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) {
    return { data: null as CustomerDiscountGroup | null, error: 'Customer name is required.' }
  }

  const { data, error } = await supabase
    .from('customer_discount_groups')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, branch, name, created_at')
    .single()

  return { data: data as CustomerDiscountGroup | null, error: mapError(error) }
}

export async function deleteCustomerGroup(id: string) {
  const { error } = await supabase.from('customer_discount_groups').delete().eq('id', id)
  return { error: mapError(error) }
}

export async function listCustomerDiscounts(groupId: string) {
  const { data, error } = await supabase
    .from('customer_discounts')
    .select('id, group_id, product_id, discount, created_at, updated_at')
    .eq('group_id', groupId)

  if (error) {
    return {
      data: {} as Record<string, string>,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const map: Record<string, string> = {}
  for (const row of (data ?? []) as CustomerDiscount[]) {
    map[row.product_id] = String(row.discount)
  }

  return { data: map, error: null as string | null, missingTable: false }
}

export async function saveCustomerDiscounts(
  groupId: string,
  entries: Array<{ productId: string; discount: string }>,
) {
  const toUpsert: Array<{ group_id: string; product_id: string; discount: number }> = []
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
      group_id: groupId,
      product_id: entry.productId,
      discount: parsed,
    })
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('customer_discounts')
      .delete()
      .eq('group_id', groupId)
      .in('product_id', toDelete)
    if (error) return { error: mapError(error) }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase.from('customer_discounts').upsert(
      toUpsert.map((row) => ({
        ...row,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'group_id,product_id' },
    )
    if (error) return { error: mapError(error) }
  }

  return { error: null as string | null }
}
