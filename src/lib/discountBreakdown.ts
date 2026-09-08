import { isMissingCatalogTable } from './catalog'
import type { UserBranch } from './branches'
import { supabase } from './supabase'

export type DiscountBreakdownLineInput = {
  qty: number
  unit: string
  discount: number
  totalAmount: number
}

export type DiscountBreakdownCustomerInput = {
  cusCode: string
  customerName: string
  items: DiscountBreakdownLineInput[]
}

export type DiscountBreakdownRecord = {
  id: string
  branch: string
  transaction_date: string
  plate_no: string
  status: 'open' | 'closed'
  total_amount: number
  created_at: string
  updated_at: string
}

export type DiscountBreakdownCustomerRecord = {
  id: string
  breakdown_id: string
  cus_code: string
  customer_name: string
  total_amount: number
  sort_order: number
}

export type DiscountBreakdownItemRecord = {
  id: string
  customer_id: string
  qty: number
  unit: string
  discount: number
  total_amount: number
  sort_order: number
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Discount Breakdown tables are not set up yet. Run supabase/discount_breakdown_schema.sql, then refresh.'
  }
  return error.message ?? 'Something went wrong.'
}

function resolveBranch(branch?: UserBranch | null) {
  return branch ?? 'Nabunturan'
}

export async function listDiscountBreakdownsInRange(
  branch: UserBranch,
  dateFrom: string,
  dateTo: string,
) {
  const { data, error } = await supabase
    .from('discount_breakdowns')
    .select('id, branch, transaction_date, plate_no, status, total_amount, created_at, updated_at')
    .eq('branch', resolveBranch(branch))
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return {
      data: [] as DiscountBreakdownRecord[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as DiscountBreakdownRecord[],
    error: null as string | null,
    missingTable: false,
  }
}

export async function getDiscountBreakdownDetail(id: string) {
  const { data: header, error } = await supabase
    .from('discount_breakdowns')
    .select('id, branch, transaction_date, plate_no, status, total_amount, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return {
      data: null as {
        breakdown: DiscountBreakdownRecord
        customers: Array<
          DiscountBreakdownCustomerRecord & { items: DiscountBreakdownItemRecord[] }
        >
      } | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  if (!header) {
    return {
      data: null,
      error: 'Discount breakdown not found.',
      missingTable: false,
    }
  }

  const { data: customers, error: customersError } = await supabase
    .from('discount_breakdown_customers')
    .select('id, breakdown_id, cus_code, customer_name, total_amount, sort_order')
    .eq('breakdown_id', id)
    .order('sort_order', { ascending: true })

  if (customersError) {
    return {
      data: null,
      error: mapError(customersError),
      missingTable: isMissingCatalogTable(customersError),
    }
  }

  const customerRows = (customers ?? []) as DiscountBreakdownCustomerRecord[]
  const withItems: Array<
    DiscountBreakdownCustomerRecord & { items: DiscountBreakdownItemRecord[] }
  > = []

  for (const customer of customerRows) {
    const { data: items, error: itemsError } = await supabase
      .from('discount_breakdown_items')
      .select('id, customer_id, qty, unit, discount, total_amount, sort_order')
      .eq('customer_id', customer.id)
      .order('sort_order', { ascending: true })

    if (itemsError) {
      return {
        data: null,
        error: mapError(itemsError),
        missingTable: isMissingCatalogTable(itemsError),
      }
    }

    withItems.push({
      ...customer,
      items: (items ?? []) as DiscountBreakdownItemRecord[],
    })
  }

  return {
    data: {
      breakdown: header as DiscountBreakdownRecord,
      customers: withItems,
    },
    error: null as string | null,
    missingTable: false,
  }
}

export async function saveDiscountBreakdown(input: {
  branch: UserBranch
  transactionDate: string
  plateNo: string
  status?: 'open' | 'closed'
  customers: DiscountBreakdownCustomerInput[]
  createdBy?: string | null
  existingId?: string | null
}) {
  const branch = resolveBranch(input.branch)
  const status = input.status ?? 'closed'
  const totalAmount = input.customers.reduce(
    (sum, customer) =>
      sum + customer.items.reduce((lineSum, item) => lineSum + (Number(item.totalAmount) || 0), 0),
    0,
  )
  let breakdownId = input.existingId ?? null

  if (breakdownId) {
    const { error } = await supabase
      .from('discount_breakdowns')
      .update({
        transaction_date: input.transactionDate,
        plate_no: input.plateNo.trim(),
        status,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', breakdownId)

    if (error) {
      return {
        data: null as { id: string } | null,
        error: mapError(error),
        missingTable: isMissingCatalogTable(error),
      }
    }

    const { error: deleteError } = await supabase
      .from('discount_breakdown_customers')
      .delete()
      .eq('breakdown_id', breakdownId)

    if (deleteError) {
      return {
        data: null,
        error: mapError(deleteError),
        missingTable: isMissingCatalogTable(deleteError),
      }
    }
  } else {
    const { data, error } = await supabase
      .from('discount_breakdowns')
      .insert({
        branch,
        transaction_date: input.transactionDate,
        plate_no: input.plateNo.trim(),
        status,
        total_amount: totalAmount,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      return {
        data: null,
        error: mapError(error),
        missingTable: isMissingCatalogTable(error),
      }
    }
    breakdownId = data.id as string
  }

  for (let index = 0; index < input.customers.length; index += 1) {
    const customer = input.customers[index]
    const customerTotal = customer.items.reduce(
      (sum, item) => sum + (Number(item.totalAmount) || 0),
      0,
    )
    const { data: customerRow, error: customerError } = await supabase
      .from('discount_breakdown_customers')
      .insert({
        breakdown_id: breakdownId,
        cus_code: customer.cusCode.trim(),
        customer_name: customer.customerName.trim(),
        total_amount: customerTotal,
        sort_order: index,
      })
      .select('id')
      .single()

    if (customerError || !customerRow) {
      return {
        data: null,
        error: mapError(customerError),
        missingTable: isMissingCatalogTable(customerError),
      }
    }

    if (customer.items.length > 0) {
      const rows = customer.items.map((item, itemIndex) => ({
        customer_id: customerRow.id,
        qty: Number(item.qty) || 0,
        unit: item.unit.trim(),
        discount: Number(item.discount) || 0,
        total_amount: Number(item.totalAmount) || 0,
        sort_order: itemIndex,
      }))
      const { error: itemsError } = await supabase.from('discount_breakdown_items').insert(rows)
      if (itemsError) {
        return {
          data: null,
          error: mapError(itemsError),
          missingTable: isMissingCatalogTable(itemsError),
        }
      }
    }
  }

  return {
    data: { id: breakdownId! },
    error: null as string | null,
    missingTable: false,
  }
}
