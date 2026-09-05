import type { InventoryCategory } from './inventoryPreview'
import type { CatalogTreeCategory } from './catalog'
import { isMissingCatalogTable } from './catalog'
import { normalizeCategoryName } from './bLiquidation'
import { supabase } from './supabase'

export type FactoryProductLine = {
  id: string
  productId: string
  subcategoryName: string
  productName: string
  price: number
  section: 'fg' | 'mts'
}

export type FactoryAdjustmentInput = {
  description: string
  amount: number
}

export type FactoryLineInput = {
  section: 'fg' | 'mts'
  productId: string
  subcategoryName: string
  productName: string
  price: number
  pallets: number
  cases: number
  discount: number
}

export type FactoryTransactionInput = {
  category: InventoryCategory
  plateNo: string
  loadNo: string
  driver: string
  helper: string
  transactionDate?: string
  fullsAmount: number
  mtsAmount: number
  discountFthAmount: number
  payableAmount: number
  chequeNo: string
  chequeAmount: number | null
  chequeDueDate: string | null
  items: FactoryLineInput[]
  deductions: FactoryAdjustmentInput[]
  additionals: FactoryAdjustmentInput[]
}

export type FactoryTransactionRecord = {
  id: string
  category: string
  plate_no: string
  load_no: string
  driver: string
  helper: string
  transaction_date: string
  fulls_amount: number
  mts_amount: number
  discount_fth_amount: number
  payable_amount: number
  cheque_no: string
  cheque_amount: number | null
  cheque_due_date: string | null
  created_at: string
}

function mapError(error: { message?: string; code?: string; details?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Factory Transaction tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }
  return error.message ?? 'Something went wrong.'
}

export function factoryTransactionTitle(category: InventoryCategory) {
  if (category === 'PCPPI') return 'PEPSI'
  return category.toUpperCase()
}

const EMPTIES_SUBCATEGORY_BY_CATEGORY: Record<InventoryCategory, string> = {
  PCPPI: 'Pepsi MTS',
  SMC: 'SMC MTS',
  Magnolia: 'Magnolia MTS',
}

export function resolveFactoryLines(
  catalog: CatalogTreeCategory[],
  category: InventoryCategory,
): FactoryProductLine[] {
  const match = catalog.find(
    (entry) =>
      normalizeCategoryName(entry.name) === normalizeCategoryName(category) ||
      normalizeCategoryName(entry.name).startsWith(normalizeCategoryName(category)),
  )

  const fullLines: FactoryProductLine[] =
    match?.subcategories.flatMap((sub) =>
      sub.products.map((product) => ({
        id: `fg-${product.id}`,
        productId: product.id,
        subcategoryName: sub.name,
        productName: product.name,
        price: Number(product.price) || 0,
        section: 'fg' as const,
      })),
    ) ?? []

  const emptiesTarget = EMPTIES_SUBCATEGORY_BY_CATEGORY[category]
  const empties = catalog.find((entry) => normalizeCategoryName(entry.name) === 'empties')
  const emptiesMatch = empties?.subcategories.find((sub) => {
    const name = normalizeCategoryName(sub.name)
    const target = normalizeCategoryName(emptiesTarget)
    return name === target || name.includes(target) || target.includes(name)
  })

  const mtsLines: FactoryProductLine[] =
    emptiesMatch?.products.map((product) => ({
      id: `mts-${product.id}`,
      productId: product.id,
      subcategoryName: emptiesMatch.name,
      productName: product.name,
      price: Number(product.price) || 0,
      section: 'mts' as const,
    })) ?? []

  return [...fullLines, ...mtsLines]
}

export function formatFactoryMoney(value: number) {
  if (!Number.isFinite(value) || value === 0) return ''
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatFactoryQty(value: number) {
  if (!Number.isFinite(value) || value === 0) return '0.0'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildItemRows(transactionId: string, items: FactoryLineInput[]) {
  return items.map((item) => ({
    transaction_id: transactionId,
    section: item.section,
    product_id: item.productId || null,
    subcategory_name: item.subcategoryName,
    product_name: item.productName,
    price: item.price,
    pallets: item.pallets,
    cases: item.cases,
    discount: item.discount,
    line_amount: item.cases * item.price,
    discount_amount: item.cases * item.discount,
  }))
}

function buildAdjustmentRows(
  transactionId: string,
  deductions: FactoryAdjustmentInput[],
  additionals: FactoryAdjustmentInput[],
) {
  return [
    ...deductions.map((entry, index) => ({
      transaction_id: transactionId,
      kind: 'deductions' as const,
      sort_order: index,
      description: entry.description.trim(),
      amount: entry.amount,
    })),
    ...additionals.map((entry, index) => ({
      transaction_id: transactionId,
      kind: 'additionals' as const,
      sort_order: index,
      description: entry.description.trim(),
      amount: entry.amount,
    })),
  ].filter((row) => row.description || row.amount)
}

function validateFactoryTransactionInput(input: FactoryTransactionInput) {
  const plateNo = input.plateNo.trim()
  const loadNo = input.loadNo.trim()

  if (!plateNo) {
    return { error: 'Plate no is required.', missingTable: false as const }
  }
  if (!loadNo) {
    return { error: 'Load no is required.', missingTable: false as const }
  }
  if (input.items.length === 0) {
    return {
      error: 'Enter pallets or cases for at least one product.',
      missingTable: false as const,
    }
  }

  return {
    plateNo,
    loadNo,
    driver: input.driver.trim(),
    helper: input.helper.trim(),
    chequeNo: input.chequeNo.trim(),
    error: null as string | null,
    missingTable: false as const,
  }
}

const FACTORY_TX_SELECT =
  'id, category, plate_no, load_no, driver, helper, transaction_date, fulls_amount, mts_amount, discount_fth_amount, payable_amount, cheque_no, cheque_amount, cheque_due_date, created_at'

export async function saveFactoryTransaction(
  input: FactoryTransactionInput,
  createdBy?: string,
  existingId?: string | null,
) {
  const validated = validateFactoryTransactionInput(input)
  if (validated.error) {
    return {
      data: null as FactoryTransactionRecord | null,
      error: validated.error,
      missingTable: validated.missingTable,
      updated: false,
    }
  }

  const { plateNo, loadNo, driver, helper, chequeNo } = validated

  if (existingId) {
    const { data: transaction, error } = await supabase
      .from('factory_transactions')
      .update({
        category: input.category,
        plate_no: plateNo,
        load_no: loadNo,
        driver,
        helper,
        fulls_amount: input.fullsAmount,
        mts_amount: input.mtsAmount,
        discount_fth_amount: input.discountFthAmount,
        payable_amount: input.payableAmount,
        cheque_no: chequeNo,
        cheque_amount: input.chequeAmount,
        cheque_due_date: input.chequeDueDate,
      })
      .eq('id', existingId)
      .select(FACTORY_TX_SELECT)
      .single()

    if (error || !transaction) {
      return {
        data: null as FactoryTransactionRecord | null,
        error: mapError(error),
        missingTable: isMissingCatalogTable(error),
        updated: false,
      }
    }

    const { error: deleteItemsError } = await supabase
      .from('factory_transaction_items')
      .delete()
      .eq('transaction_id', existingId)
    if (deleteItemsError) {
      return {
        data: null as FactoryTransactionRecord | null,
        error: mapError(deleteItemsError),
        missingTable: isMissingCatalogTable(deleteItemsError),
        updated: false,
      }
    }

    const { error: deleteAdjustmentsError } = await supabase
      .from('factory_transaction_adjustments')
      .delete()
      .eq('transaction_id', existingId)
    if (deleteAdjustmentsError) {
      return {
        data: null as FactoryTransactionRecord | null,
        error: mapError(deleteAdjustmentsError),
        missingTable: isMissingCatalogTable(deleteAdjustmentsError),
        updated: false,
      }
    }

    const itemRows = buildItemRows(existingId, input.items)
    const { error: itemsError } = await supabase.from('factory_transaction_items').insert(itemRows)
    if (itemsError) {
      return {
        data: null as FactoryTransactionRecord | null,
        error: mapError(itemsError),
        missingTable: isMissingCatalogTable(itemsError),
        updated: false,
      }
    }

    const adjustmentRows = buildAdjustmentRows(existingId, input.deductions, input.additionals)
    if (adjustmentRows.length > 0) {
      const { error: adjustmentsError } = await supabase
        .from('factory_transaction_adjustments')
        .insert(adjustmentRows)
      if (adjustmentsError) {
        return {
          data: null as FactoryTransactionRecord | null,
          error: mapError(adjustmentsError),
          missingTable: isMissingCatalogTable(adjustmentsError),
          updated: false,
        }
      }
    }

    return {
      data: transaction as FactoryTransactionRecord,
      error: null as string | null,
      missingTable: false,
      updated: true,
    }
  }

  const { data: transaction, error } = await supabase
    .from('factory_transactions')
    .insert({
      category: input.category,
      plate_no: plateNo,
      load_no: loadNo,
      driver,
      helper,
      transaction_date: input.transactionDate || todayIsoDate(),
      fulls_amount: input.fullsAmount,
      mts_amount: input.mtsAmount,
      discount_fth_amount: input.discountFthAmount,
      payable_amount: input.payableAmount,
      cheque_no: chequeNo,
      cheque_amount: input.chequeAmount,
      cheque_due_date: input.chequeDueDate,
      created_by: createdBy ?? null,
    })
    .select(FACTORY_TX_SELECT)
    .single()

  if (error || !transaction) {
    return {
      data: null as FactoryTransactionRecord | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
      updated: false,
    }
  }

  const itemRows = buildItemRows(transaction.id, input.items)
  const { error: itemsError } = await supabase.from('factory_transaction_items').insert(itemRows)
  if (itemsError) {
    await supabase.from('factory_transactions').delete().eq('id', transaction.id)
    return {
      data: null as FactoryTransactionRecord | null,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
      updated: false,
    }
  }

  const adjustmentRows = buildAdjustmentRows(transaction.id, input.deductions, input.additionals)
  if (adjustmentRows.length > 0) {
    const { error: adjustmentsError } = await supabase
      .from('factory_transaction_adjustments')
      .insert(adjustmentRows)
    if (adjustmentsError) {
      await supabase.from('factory_transactions').delete().eq('id', transaction.id)
      return {
        data: null as FactoryTransactionRecord | null,
        error: mapError(adjustmentsError),
        missingTable: isMissingCatalogTable(adjustmentsError),
        updated: false,
      }
    }
  }

  return {
    data: transaction as FactoryTransactionRecord,
    error: null as string | null,
    missingTable: false,
    updated: false,
  }
}

export async function listFactoryTransactionsByDate(
  category: InventoryCategory,
  transactionDate: string,
) {
  if (!transactionDate) {
    return {
      data: [] as FactoryTransactionRecord[],
      error: 'Select a date first.',
      missingTable: false,
    }
  }

  const { data, error } = await supabase
    .from('factory_transactions')
    .select(
      'id, category, plate_no, load_no, driver, helper, transaction_date, fulls_amount, mts_amount, discount_fth_amount, payable_amount, cheque_no, cheque_amount, cheque_due_date, created_at',
    )
    .eq('category', category)
    .eq('transaction_date', transactionDate)
    .order('created_at', { ascending: false })

  return {
    data: (data ?? []) as FactoryTransactionRecord[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export type FactoryTransactionItemRecord = {
  id: string
  section: 'fg' | 'mts'
  product_id: string | null
  subcategory_name: string
  product_name: string
  price: number
  pallets: number
  cases: number
  discount: number
  line_amount: number
  discount_amount: number
}

export type FactoryTransactionAdjustmentRecord = {
  id: string
  kind: 'deductions' | 'additionals'
  sort_order: number
  description: string
  amount: number
}

export type FactoryTransactionDetail = {
  transaction: FactoryTransactionRecord
  items: FactoryTransactionItemRecord[]
  adjustments: FactoryTransactionAdjustmentRecord[]
}

export async function getFactoryTransactionDetail(id: string) {
  const { data: transaction, error } = await supabase
    .from('factory_transactions')
    .select(
      'id, category, plate_no, load_no, driver, helper, transaction_date, fulls_amount, mts_amount, discount_fth_amount, payable_amount, cheque_no, cheque_amount, cheque_due_date, created_at',
    )
    .eq('id', id)
    .single()

  if (error || !transaction) {
    return {
      data: null as FactoryTransactionDetail | null,
      error: mapError(error) ?? 'Record not found.',
      missingTable: isMissingCatalogTable(error),
    }
  }

  const [{ data: items, error: itemsError }, { data: adjustments, error: adjustmentsError }] =
    await Promise.all([
      supabase
        .from('factory_transaction_items')
        .select(
          'id, section, product_id, subcategory_name, product_name, price, pallets, cases, discount, line_amount, discount_amount',
        )
        .eq('transaction_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('factory_transaction_adjustments')
        .select('id, kind, sort_order, description, amount')
        .eq('transaction_id', id)
        .order('sort_order', { ascending: true }),
    ])

  if (itemsError) {
    return {
      data: null as FactoryTransactionDetail | null,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  if (adjustmentsError) {
    return {
      data: null as FactoryTransactionDetail | null,
      error: mapError(adjustmentsError),
      missingTable: isMissingCatalogTable(adjustmentsError),
    }
  }

  return {
    data: {
      transaction: transaction as FactoryTransactionRecord,
      items: (items ?? []) as FactoryTransactionItemRecord[],
      adjustments: (adjustments ?? []) as FactoryTransactionAdjustmentRecord[],
    },
    error: null as string | null,
    missingTable: false,
  }
}

export async function updateFactoryTransactionHeader(
  id: string,
  patch: {
    plateNo: string
    loadNo: string
    driver: string
    helper: string
  },
) {
  const plateNo = patch.plateNo.trim()
  const loadNo = patch.loadNo.trim()
  if (!plateNo) {
    return { data: null as FactoryTransactionRecord | null, error: 'Plate no is required.', missingTable: false }
  }
  if (!loadNo) {
    return { data: null as FactoryTransactionRecord | null, error: 'Load no is required.', missingTable: false }
  }

  const { data, error } = await supabase
    .from('factory_transactions')
    .update({
      plate_no: plateNo,
      load_no: loadNo,
      driver: patch.driver.trim(),
      helper: patch.helper.trim(),
    })
    .eq('id', id)
    .select(
      'id, category, plate_no, load_no, driver, helper, transaction_date, fulls_amount, mts_amount, discount_fth_amount, payable_amount, cheque_no, cheque_amount, cheque_due_date, created_at',
    )
    .single()

  return {
    data: (data as FactoryTransactionRecord | null) ?? null,
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}
