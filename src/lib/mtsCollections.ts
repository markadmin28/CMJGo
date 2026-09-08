import { isMissingCatalogTable } from './catalog'
import type { UserBranch } from './branches'
import { supabase } from './supabase'

export type MtsLedgerKind =
  | 'mts_collections'
  | 'mts_fund'
  | 'fulls_return'
  | 'fulls_return_lacking'
  | 'pallets_return'
  | 'pallets_payables'
  | 'cash_payment'
  | 'cash_payment_for_short'
  | 'cheque_payment'
  | 'account_route'
  | 'other_collection'

const LEDGER_LABELS: Record<MtsLedgerKind, string> = {
  mts_collections: 'MTS Collections',
  mts_fund: 'MTS Fund',
  fulls_return: 'Fulls Return',
  fulls_return_lacking: 'Fulls Return with Lacking/Missing',
  pallets_return: 'Pallets Return',
  pallets_payables: 'Pallets Payables',
  cash_payment: 'Cash Payment',
  cash_payment_for_short: 'Cash Payment for Short',
  cheque_payment: 'Cheque Payment',
  account_route: 'Account Route',
  other_collection: 'Other Collection',
}

export type MtsCollectionLineInput = {
  qty: number
  unit: string
  description: string
  price: number
  totalAmount: number
  lacking?: number
  remarks?: string
}

export type MtsCollectionRecord = {
  id: string
  branch: string
  kind?: MtsLedgerKind
  collection_date: string
  from_name: string
  payment_pc?: string
  payment_smc?: string
  payment_mag?: string
  plate_no?: string
  cash_amount?: number
  total_amount: number
  created_at: string
  updated_at: string
}

export type MtsCollectionItemRecord = {
  id: string
  collection_id: string
  qty: number
  unit: string
  description: string
  price: number
  total_amount: number
  lacking?: number
  remarks?: string
  sort_order: number
}

function mapError(error: { message?: string; code?: string } | null, kind?: MtsLedgerKind) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    const label = kind ? LEDGER_LABELS[kind] : 'Collection'
    return `${label} tables are not set up yet. Run supabase/mts_collections_schema.sql, then refresh.`
  }
  return error.message ?? 'Something went wrong.'
}

function resolveBranch(branch?: UserBranch | null) {
  return branch ?? 'Nabunturan'
}

export function mtsLedgerLabel(kind?: string | null) {
  if (!kind) return 'Collection'
  return LEDGER_LABELS[kind as MtsLedgerKind] ?? kind.replace(/_/g, ' ').toUpperCase()
}

/** Stable 5-digit display TID derived from record id (matches legacy TID column look). */
export function collectionDisplayTid(id: string) {
  const hex = id.replace(/-/g, '').slice(0, 8)
  const n = Number.parseInt(hex, 16)
  if (!Number.isFinite(n)) return '00000'
  return String(n % 100000).padStart(5, '0')
}

export async function listMtsCollectionsByDate(branch: UserBranch, date: string) {
  const { data, error } = await supabase
    .from('mts_collections')
    .select(
      'id, branch, kind, collection_date, from_name, payment_pc, payment_smc, payment_mag, plate_no, cash_amount, total_amount, created_at, updated_at',
    )
    .eq('branch', resolveBranch(branch))
    .eq('collection_date', date)
    .order('created_at', { ascending: true })

  if (error) {
    return {
      data: [] as MtsCollectionRecord[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as MtsCollectionRecord[],
    error: null as string | null,
    missingTable: false,
  }
}

export async function listMtsCollectionsInRange(
  branch: UserBranch,
  dateFrom: string,
  dateTo: string,
  kind: MtsLedgerKind = 'mts_collections',
) {
  const { data, error } = await supabase
    .from('mts_collections')
    .select(
      'id, branch, kind, collection_date, from_name, payment_pc, payment_smc, payment_mag, plate_no, cash_amount, total_amount, created_at, updated_at',
    )
    .eq('branch', resolveBranch(branch))
    .eq('kind', kind)
    .gte('collection_date', dateFrom)
    .lte('collection_date', dateTo)
    .order('collection_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return {
      data: [] as MtsCollectionRecord[],
      error: mapError(error, kind),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as MtsCollectionRecord[],
    error: null as string | null,
    missingTable: false,
  }
}

export async function getMtsCollectionDetail(id: string, kind: MtsLedgerKind = 'mts_collections') {
  const { data: header, error } = await supabase
    .from('mts_collections')
    .select(
      'id, branch, kind, collection_date, from_name, payment_pc, payment_smc, payment_mag, plate_no, cash_amount, total_amount, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return {
      data: null as {
        collection: MtsCollectionRecord
        items: MtsCollectionItemRecord[]
      } | null,
      error: mapError(error, kind),
      missingTable: isMissingCatalogTable(error),
    }
  }

  if (!header) {
    return {
      data: null,
      error: 'Record not found.',
      missingTable: false,
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('mts_collection_items')
    .select(
      'id, collection_id, qty, unit, description, price, total_amount, lacking, remarks, sort_order',
    )
    .eq('collection_id', id)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    return {
      data: null,
      error: mapError(itemsError, kind),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  return {
    data: {
      collection: header as MtsCollectionRecord,
      items: (items ?? []) as MtsCollectionItemRecord[],
    },
    error: null as string | null,
    missingTable: false,
  }
}

export async function saveMtsCollection(input: {
  branch: UserBranch
  kind?: MtsLedgerKind
  collectionDate: string
  fromName: string
  paymentPc?: string
  paymentSmc?: string
  paymentMag?: string
  plateNo?: string
  cashAmount?: number
  items: MtsCollectionLineInput[]
  createdBy?: string | null
  existingId?: string | null
}) {
  const kind = input.kind ?? 'mts_collections'
  const branch = resolveBranch(input.branch)
  const totalAmount = input.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const paymentFields = {
    payment_pc: (input.paymentPc ?? '').trim(),
    payment_smc: (input.paymentSmc ?? '').trim(),
    payment_mag: (input.paymentMag ?? '').trim(),
    plate_no: (input.plateNo ?? '').trim(),
    cash_amount: Number(input.cashAmount) || 0,
  }
  let collectionId = input.existingId ?? null

  if (collectionId) {
    const { error } = await supabase
      .from('mts_collections')
      .update({
        kind,
        collection_date: input.collectionDate,
        from_name: input.fromName.trim(),
        ...paymentFields,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collectionId)

    if (error) {
      return {
        data: null as { id: string } | null,
        error: mapError(error, kind),
        missingTable: isMissingCatalogTable(error),
      }
    }

    const { error: deleteError } = await supabase
      .from('mts_collection_items')
      .delete()
      .eq('collection_id', collectionId)

    if (deleteError) {
      return {
        data: null,
        error: mapError(deleteError, kind),
        missingTable: isMissingCatalogTable(deleteError),
      }
    }
  } else {
    const { data, error } = await supabase
      .from('mts_collections')
      .insert({
        branch,
        kind,
        collection_date: input.collectionDate,
        from_name: input.fromName.trim(),
        ...paymentFields,
        total_amount: totalAmount,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      return {
        data: null,
        error: mapError(error, kind),
        missingTable: isMissingCatalogTable(error),
      }
    }
    collectionId = data.id as string
  }

  if (input.items.length > 0) {
    const rows = input.items.map((item, index) => ({
      collection_id: collectionId,
      qty: Number(item.qty) || 0,
      unit: item.unit.trim(),
      description: item.description.trim(),
      price: Number(item.price) || 0,
      total_amount: Number(item.totalAmount) || 0,
      lacking: Number(item.lacking) || 0,
      remarks: (item.remarks ?? '').trim(),
      sort_order: index,
    }))
    const { error: itemsError } = await supabase.from('mts_collection_items').insert(rows)
    if (itemsError) {
      return {
        data: null,
        error: mapError(itemsError, kind),
        missingTable: isMissingCatalogTable(itemsError),
      }
    }
  }

  return {
    data: { id: collectionId! },
    error: null as string | null,
    missingTable: false,
  }
}
