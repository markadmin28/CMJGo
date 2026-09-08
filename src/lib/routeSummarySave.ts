import { supabase } from './supabase'
import type { UserBranch } from './branches'
import { isMissingCatalogTable } from './catalog'
import type { CustomerTransactionCompany } from './customerTransaction'
import type { BoBrandGroup } from './boBadOrder'
import {
  allocateNextRouteSummarySalesNo,
  buildRouteSummaryBrandBlocks,
  ROUTE_TX_COMPANIES,
  routeLoadTodayIsoDate,
  type RouteSummaryBrandBlock,
  type RouteTempLoadItem,
} from './routeTransaction'

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Route Summary tables are not set up yet. Run supabase/route_summary_schema.sql (and route_summary_per_company_schema.sql if upgrading), then refresh.'
  }
  return error.message ?? 'Something went wrong.'
}

function currentYearMonth(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function parsePostedDateToIso(datePostedText: string, fallback = routeLoadTodayIsoDate()) {
  const match = /^(\d{2})-(\d{2})-(\d{4})/.exec(datePostedText.trim())
  if (!match) return fallback
  const [, mm, dd, yyyy] = match
  return `${yyyy}-${mm}-${dd}`
}

export type RouteSummaryRecord = {
  id: string
  branch: string
  company: CustomerTransactionCompany
  route_area_id: string | null
  route_area_name: string
  plate_no: string
  driver: string
  helper: string
  ahente: string
  date_posted_text: string
  summary_date: string
  year_month: string
  sales_no_pepsi: string
  sales_seq_pepsi: number
  sales_no_smc: string
  sales_seq_smc: number
  sales_no_magnolia: string
  sales_seq_magnolia: number
  total_sales: number
  ref_empties: number
  discount: number
  expenses: number
  promo: number
  account: number
  sub_total: number
  cash_remittance: number
  short_over: number
  loading_salesman: string
  loading_checker: string
  loading_testify: string
  unloading_salesman: string
  unloading_checker: string
  unloading_testify: string
  created_at: string
  updated_at: string
}

export type RouteSummaryItemRecord = {
  id: string
  summary_id: string
  section: 'fulls' | 'empties'
  company: '' | CustomerTransactionCompany
  product_id: string | null
  product_name: string
  brand_id: string | null
  brand_name: string
  first_load: number
  second_load: number
  rfg: number
  quantity: number
  price: number
  amount: number
}

export type RouteSummarySaveItem = {
  section: 'fulls' | 'empties'
  company: '' | CustomerTransactionCompany
  productId: string
  productName: string
  brandId: string
  brandName: string
  firstLoad: number
  secondLoad: number
  rfg: number
  quantity: number
  price: number
  amount: number
}

export type RouteSummaryCompanyFinance = {
  summary_id: string
  company: CustomerTransactionCompany
  total_sales: number
  ref_empties: number
  discount: number
  expenses: number
  promo: number
  account: number
  sub_total: number
  cash_remittance: number
  short_over: number
}

export type RouteSummarySaveInput = {
  branch?: UserBranch | null
  routeAreaId: string
  routeAreaName: string
  plateNo: string
  driver: string
  helper: string
  ahente: string
  datePostedText: string
  /** Company whose finance + fulls/empties lines are being saved now. */
  saveCompany: CustomerTransactionCompany
  companyFinance: {
    totalSales: number
    refEmpties: number
    discount: number
    expenses: number
    promo: number
    account: number
    subTotal: number
    cashRemittance: number
    shortOver: number
  }
  loadingSalesman: string
  loadingChecker: string
  loadingTestify: string
  unloadingSalesman: string
  unloadingChecker: string
  unloadingTestify: string
  items: RouteSummarySaveItem[]
  createdBy?: string | null
}

export function salesNoForCompany(
  summary: RouteSummaryRecord,
  company: CustomerTransactionCompany = summary.company ?? 'Pepsi',
) {
  if (company === 'Pepsi') return summary.sales_no_pepsi
  if (company === 'SMC') return summary.sales_no_smc
  return summary.sales_no_magnolia
}

function salesNoPayloadForCompany(
  company: CustomerTransactionCompany,
  salesNo: string,
  seq: number,
) {
  return {
    sales_no_pepsi: company === 'Pepsi' ? salesNo : '',
    sales_seq_pepsi: company === 'Pepsi' ? seq : 0,
    sales_no_smc: company === 'SMC' ? salesNo : '',
    sales_seq_smc: company === 'SMC' ? seq : 0,
    sales_no_magnolia: company === 'Magnolia' ? salesNo : '',
    sales_seq_magnolia: company === 'Magnolia' ? seq : 0,
  }
}

function financeDraftFromHeader(summary: RouteSummaryRecord): RouteSummaryCompanyFinance {
  return {
    summary_id: summary.id,
    company: summary.company,
    total_sales: Number(summary.total_sales) || 0,
    ref_empties: Number(summary.ref_empties) || 0,
    discount: Number(summary.discount) || 0,
    expenses: Number(summary.expenses) || 0,
    promo: Number(summary.promo) || 0,
    account: Number(summary.account) || 0,
    sub_total: Number(summary.sub_total) || 0,
    cash_remittance: Number(summary.cash_remittance) || 0,
    short_over: Number(summary.short_over) || 0,
  }
}

export function buildRouteSummarySaveItems(args: {
  groupsByCompany: Record<CustomerTransactionCompany, BoBrandGroup[]>
  firstItems: RouteTempLoadItem[]
  secondItems: RouteTempLoadItem[]
  rfgItems: RouteTempLoadItem[]
  emptyCases: Record<string, string>
  emptiesGroups: BoBrandGroup[]
}): RouteSummarySaveItem[] {
  const items: RouteSummarySaveItem[] = []

  for (const company of ROUTE_TX_COMPANIES) {
    const match = (rows: RouteTempLoadItem[]) => rows.filter((row) => row.company === company)
    const blocks = buildRouteSummaryBrandBlocks(
      args.groupsByCompany[company] ?? [],
      match(args.firstItems),
      match(args.secondItems),
      match(args.rfgItems),
      company,
    )
    for (const block of blocks) {
      for (const row of block.rows) {
        if (row.sales === 0 && row.firstLoad === 0 && row.secondLoad === 0 && row.rfg === 0) {
          continue
        }
        if (row.sales <= 0) continue
        items.push({
          section: 'fulls',
          company,
          productId: row.productId,
          productName: row.productName,
          brandId: row.brandId,
          brandName: row.brandName,
          firstLoad: row.firstLoad,
          secondLoad: row.secondLoad,
          rfg: row.rfg,
          quantity: row.sales,
          price: row.price,
          amount: row.amount,
        })
      }
    }
  }

  for (const group of args.emptiesGroups) {
    for (const product of group.items) {
      const qty = Number(args.emptyCases[product.id] || 0)
      if (!Number.isFinite(qty) || qty <= 0) continue
      const price = Number(product.price) || 0
      items.push({
        section: 'empties',
        company: '',
        productId: product.id,
        productName: product.label,
        brandId: group.id,
        brandName: group.title,
        firstLoad: 0,
        secondLoad: 0,
        rfg: 0,
        quantity: qty,
        price,
        amount: qty * price,
      })
    }
  }

  return items
}

/** Collect sales rows from brand blocks (active company view helper). */
export function salesItemsFromBlocks(
  company: CustomerTransactionCompany,
  blocks: RouteSummaryBrandBlock[],
): RouteSummarySaveItem[] {
  const items: RouteSummarySaveItem[] = []
  for (const block of blocks) {
    for (const row of block.rows) {
      if (row.sales <= 0) continue
      items.push({
        section: 'fulls',
        company,
        productId: row.productId,
        productName: row.productName,
        brandId: row.brandId,
        brandName: row.brandName,
        firstLoad: row.firstLoad,
        secondLoad: row.secondLoad,
        rfg: row.rfg,
        quantity: row.sales,
        price: row.price,
        amount: row.amount,
      })
    }
  }
  return items
}

function hasCompanyFinanceValues(finance: RouteSummarySaveInput['companyFinance']) {
  return (
    finance.totalSales !== 0 ||
    finance.refEmpties !== 0 ||
    finance.discount !== 0 ||
    finance.expenses !== 0 ||
    finance.promo !== 0 ||
    finance.account !== 0 ||
    finance.subTotal !== 0 ||
    finance.cashRemittance !== 0 ||
    finance.shortOver !== 0
  )
}

export async function saveRouteSummary(input: RouteSummarySaveInput) {
  const branch = input.branch ?? 'Nabunturan'
  if (branch !== 'Nabunturan') {
    return {
      data: null as RouteSummaryRecord | null,
      error: 'Route Summary save is only available for Nabunturan.',
      missingTable: false,
    }
  }

  const routeName = input.routeAreaName.trim()
  if (!input.routeAreaId || !routeName) {
    return {
      data: null as RouteSummaryRecord | null,
      error: 'Select a route / area first.',
      missingTable: false,
    }
  }

  const companyItems = input.items.filter(
    (item) => item.company === input.saveCompany || (item.section === 'empties' && !item.company),
  )

  if (companyItems.length === 0 && !hasCompanyFinanceValues(input.companyFinance)) {
    return {
      data: null as RouteSummaryRecord | null,
      error: `Nothing to save for ${input.saveCompany}. Enter sales, empties, or finance totals first.`,
      missingTable: false,
    }
  }

  const yearMonth = currentYearMonth()
  const summaryDate = parsePostedDateToIso(input.datePostedText)

  // Separate row per company for the same route/area + day.
  const existing = await supabase
    .from('route_summaries')
    .select(
      'id, company, sales_no_pepsi, sales_seq_pepsi, sales_no_smc, sales_seq_smc, sales_no_magnolia, sales_seq_magnolia',
    )
    .eq('branch', branch)
    .eq('route_area_id', input.routeAreaId)
    .eq('summary_date', summaryDate)
    .eq('company', input.saveCompany)
    .maybeSingle()

  if (existing.error && isMissingCatalogTable(existing.error)) {
    return {
      data: null as RouteSummaryRecord | null,
      error: mapError(existing.error),
      missingTable: true,
    }
  }
  if (existing.error) {
    const needsCompanyColumn =
      /column .*company.* does not exist/i.test(existing.error.message ?? '') ||
      existing.error.code === '42703'
    return {
      data: null as RouteSummaryRecord | null,
      error: needsCompanyColumn
        ? 'Route Summary needs a per-company update. Run supabase/route_summary_per_company_schema.sql, then refresh.'
        : mapError(existing.error),
      missingTable: needsCompanyColumn,
    }
  }

  let salesNo = salesNoForCompany(
    {
      ...(existing.data as RouteSummaryRecord),
      company: input.saveCompany,
    } as RouteSummaryRecord,
    input.saveCompany,
  )
  let salesSeq = 0
  if (input.saveCompany === 'Pepsi') salesSeq = Number(existing.data?.sales_seq_pepsi ?? 0)
  else if (input.saveCompany === 'SMC') salesSeq = Number(existing.data?.sales_seq_smc ?? 0)
  else salesSeq = Number(existing.data?.sales_seq_magnolia ?? 0)

  if (!salesNo) {
    const next = await allocateNextRouteSummarySalesNo(branch, input.saveCompany)
    if (next.missingTable || next.error) {
      return {
        data: null as RouteSummaryRecord | null,
        error: next.error ?? 'Failed to allocate sales number.',
        missingTable: next.missingTable,
      }
    }
    salesNo = next.salesNo
    salesSeq = next.seq
  }

  let summaryId = existing.data?.id as string | undefined
  let updated = Boolean(summaryId)

  const headerPayload = {
    branch,
    company: input.saveCompany,
    route_area_id: input.routeAreaId,
    route_area_name: routeName,
    plate_no: input.plateNo.trim(),
    driver: input.driver.trim(),
    helper: input.helper.trim(),
    ahente: input.ahente.trim(),
    date_posted_text: input.datePostedText.trim(),
    summary_date: summaryDate,
    year_month: yearMonth,
    ...salesNoPayloadForCompany(input.saveCompany, salesNo, salesSeq),
    total_sales: input.companyFinance.totalSales,
    ref_empties: input.companyFinance.refEmpties,
    discount: input.companyFinance.discount,
    expenses: input.companyFinance.expenses,
    promo: input.companyFinance.promo,
    account: input.companyFinance.account,
    sub_total: input.companyFinance.subTotal,
    cash_remittance: input.companyFinance.cashRemittance,
    short_over: input.companyFinance.shortOver,
    loading_salesman: input.loadingSalesman.trim(),
    loading_checker: input.loadingChecker.trim(),
    loading_testify: input.loadingTestify.trim(),
    unloading_salesman: input.unloadingSalesman.trim(),
    unloading_checker: input.unloadingChecker.trim(),
    unloading_testify: input.unloadingTestify.trim(),
    updated_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
  }

  if (summaryId) {
    const { error } = await supabase.from('route_summaries').update(headerPayload).eq('id', summaryId)

    if (error) {
      return {
        data: null as RouteSummaryRecord | null,
        error: mapError(error),
        missingTable: isMissingCatalogTable(error),
      }
    }

    await supabase.from('route_summary_items').delete().eq('summary_id', summaryId)
  } else {
    updated = false
    const { data, error } = await supabase
      .from('route_summaries')
      .insert(headerPayload)
      .select('id')
      .single()

    if (error || !data) {
      const needsCompanyColumn =
        error &&
        (/column .*company.* does not exist/i.test(error.message ?? '') || error.code === '42703')
      return {
        data: null as RouteSummaryRecord | null,
        error: needsCompanyColumn
          ? 'Route Summary needs a per-company update. Run supabase/route_summary_per_company_schema.sql, then refresh.'
          : mapError(error),
        missingTable: Boolean(needsCompanyColumn || (error && isMissingCatalogTable(error))),
      }
    }
    summaryId = data.id as string
  }

  if (companyItems.length > 0) {
    const { error: itemsError } = await supabase.from('route_summary_items').insert(
      companyItems.map((item) => ({
        summary_id: summaryId,
        section: item.section,
        company: item.company || input.saveCompany,
        product_id: item.productId || null,
        product_name: item.productName,
        brand_id: item.brandId || null,
        brand_name: item.brandName,
        first_load: item.firstLoad,
        second_load: item.secondLoad,
        rfg: item.rfg,
        quantity: item.quantity,
        price: item.price,
        amount: item.amount,
      })),
    )

    if (itemsError) {
      if (!updated) await supabase.from('route_summaries').delete().eq('id', summaryId)
      return {
        data: null as RouteSummaryRecord | null,
        error: mapError(itemsError),
        missingTable: isMissingCatalogTable(itemsError),
      }
    }
  }

  const { error: financeError } = await supabase.from('route_summary_company_finance').upsert(
    {
      summary_id: summaryId,
      company: input.saveCompany,
      total_sales: input.companyFinance.totalSales,
      ref_empties: input.companyFinance.refEmpties,
      discount: input.companyFinance.discount,
      expenses: input.companyFinance.expenses,
      promo: input.companyFinance.promo,
      account: input.companyFinance.account,
      sub_total: input.companyFinance.subTotal,
      cash_remittance: input.companyFinance.cashRemittance,
      short_over: input.companyFinance.shortOver,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'summary_id,company' },
  )

  if (financeError) {
    return {
      data: null as RouteSummaryRecord | null,
      error: mapError(financeError),
      missingTable: isMissingCatalogTable(financeError),
    }
  }

  // Loading / Unloading crew is shared for the route + day across Pepsi / SMC / Magnolia.
  await supabase
    .from('route_summaries')
    .update({
      loading_salesman: input.loadingSalesman.trim(),
      loading_checker: input.loadingChecker.trim(),
      loading_testify: input.loadingTestify.trim(),
      unloading_salesman: input.unloadingSalesman.trim(),
      unloading_checker: input.unloadingChecker.trim(),
      unloading_testify: input.unloadingTestify.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('branch', branch)
    .eq('route_area_id', input.routeAreaId)
    .eq('summary_date', summaryDate)

  const loaded = await getRouteSummaryById(summaryId!)
  return {
    data: loaded.data,
    error: loaded.error,
    missingTable: loaded.missingTable,
    updated,
  }
}

export async function listRouteSummaryCompanyFinance(summaryId: string) {
  const { data, error } = await supabase
    .from('route_summary_company_finance')
    .select('*')
    .eq('summary_id', summaryId)

  if (error) {
    return {
      data: {} as Record<CustomerTransactionCompany, RouteSummaryCompanyFinance | null>,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const map: Record<CustomerTransactionCompany, RouteSummaryCompanyFinance | null> = {
    Pepsi: null,
    SMC: null,
    Magnolia: null,
  }
  for (const row of (data ?? []) as RouteSummaryCompanyFinance[]) {
    if (row.company === 'Pepsi' || row.company === 'SMC' || row.company === 'Magnolia') {
      map[row.company] = row
    }
  }
  return {
    data: map,
    error: null as string | null,
    missingTable: false,
  }
}

export async function getRouteSummaryById(id: string) {
  const { data, error } = await supabase.from('route_summaries').select('*').eq('id', id).maybeSingle()
  if (error) {
    return {
      data: null as RouteSummaryRecord | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }
  return {
    data: (data as RouteSummaryRecord | null) ?? null,
    error: null as string | null,
    missingTable: false,
  }
}

export async function getRouteSummaryItems(summaryId: string) {
  const { data, error } = await supabase
    .from('route_summary_items')
    .select('*')
    .eq('summary_id', summaryId)

  if (error) {
    return {
      data: [] as RouteSummaryItemRecord[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }
  return {
    data: (data ?? []) as RouteSummaryItemRecord[],
    error: null as string | null,
    missingTable: false,
  }
}

/** Load all company summaries for a route/area + day (Pepsi / SMC / Magnolia). */
export async function getRouteSummariesByRouteDate(
  branch: UserBranch,
  routeAreaId: string,
  summaryDate = routeLoadTodayIsoDate(),
) {
  type Bundle = {
    byCompany: Record<
      CustomerTransactionCompany,
      {
        summary: RouteSummaryRecord
        items: RouteSummaryItemRecord[]
        finance: RouteSummaryCompanyFinance | null
      } | null
    >
  }

  const emptyBundle = (): Bundle => ({
    byCompany: { Pepsi: null, SMC: null, Magnolia: null },
  })

  if (branch !== 'Nabunturan') {
    return {
      data: emptyBundle(),
      error: null as string | null,
      missingTable: false,
    }
  }

  const { data, error } = await supabase
    .from('route_summaries')
    .select('*')
    .eq('branch', branch)
    .eq('route_area_id', routeAreaId)
    .eq('summary_date', summaryDate)

  if (error) {
    const needsCompanyColumn =
      /column .*company.* does not exist/i.test(error.message ?? '') || error.code === '42703'
    return {
      data: emptyBundle(),
      error: needsCompanyColumn
        ? 'Route Summary needs a per-company update. Run supabase/route_summary_per_company_schema.sql, then refresh.'
        : mapError(error),
      missingTable: needsCompanyColumn || isMissingCatalogTable(error),
    }
  }

  const headers = (data ?? []) as RouteSummaryRecord[]
  const bundle = emptyBundle()
  if (headers.length === 0) {
    return { data: bundle, error: null as string | null, missingTable: false }
  }

  await Promise.all(
    headers.map(async (summary) => {
      const company = (summary.company || 'Pepsi') as CustomerTransactionCompany
      if (company !== 'Pepsi' && company !== 'SMC' && company !== 'Magnolia') return
      const [itemsResult, financeResult] = await Promise.all([
        getRouteSummaryItems(summary.id),
        listRouteSummaryCompanyFinance(summary.id),
      ])
      const finance = financeResult.data[company] ?? financeDraftFromHeader({ ...summary, company })
      bundle.byCompany[company] = {
        summary: { ...summary, company },
        items: itemsResult.data,
        finance,
      }
    }),
  )

  return { data: bundle, error: null as string | null, missingTable: false }
}

/** @deprecated Prefer getRouteSummariesByRouteDate — kept for one-company callers. */
export async function getRouteSummaryByRouteDate(
  branch: UserBranch,
  routeAreaId: string,
  summaryDate = routeLoadTodayIsoDate(),
  company: CustomerTransactionCompany = 'Pepsi',
) {
  const all = await getRouteSummariesByRouteDate(branch, routeAreaId, summaryDate)
  if (all.error || all.missingTable) {
    return {
      data: null as {
        summary: RouteSummaryRecord
        items: RouteSummaryItemRecord[]
        financeByCompany: Record<CustomerTransactionCompany, RouteSummaryCompanyFinance | null>
      } | null,
      error: all.error,
      missingTable: all.missingTable,
    }
  }

  const entry = all.data.byCompany[company]
  if (!entry) {
    return {
      data: null as {
        summary: RouteSummaryRecord
        items: RouteSummaryItemRecord[]
        financeByCompany: Record<CustomerTransactionCompany, RouteSummaryCompanyFinance | null>
      } | null,
      error: null as string | null,
      missingTable: false,
    }
  }

  const financeByCompany: Record<CustomerTransactionCompany, RouteSummaryCompanyFinance | null> = {
    Pepsi: null,
    SMC: null,
    Magnolia: null,
  }
  financeByCompany[company] = entry.finance

  return {
    data: {
      summary: entry.summary,
      items: entry.items,
      financeByCompany,
    },
    error: null as string | null,
    missingTable: false,
  }
}

export function itemRecordToSaveItem(item: RouteSummaryItemRecord): RouteSummarySaveItem {
  return {
    section: item.section,
    company: (item.company || '') as RouteSummarySaveItem['company'],
    productId: item.product_id ?? '',
    productName: item.product_name,
    brandId: item.brand_id ?? '',
    brandName: item.brand_name,
    firstLoad: Number(item.first_load) || 0,
    secondLoad: Number(item.second_load) || 0,
    rfg: Number(item.rfg) || 0,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    amount: Number(item.amount) || 0,
  }
}

/** Build save items for one company only (fulls + that company's empties). */
export function buildRouteSummarySaveItemsForCompany(args: {
  company: CustomerTransactionCompany
  groupsByCompany: Record<CustomerTransactionCompany, BoBrandGroup[]>
  firstItems: RouteTempLoadItem[]
  secondItems: RouteTempLoadItem[]
  rfgItems: RouteTempLoadItem[]
  emptyCases: Record<string, string>
  emptiesGroups: BoBrandGroup[]
}): RouteSummarySaveItem[] {
  const match = (rows: RouteTempLoadItem[]) => rows.filter((row) => row.company === args.company)
  const blocks = buildRouteSummaryBrandBlocks(
    args.groupsByCompany[args.company] ?? [],
    match(args.firstItems),
    match(args.secondItems),
    match(args.rfgItems),
    args.company,
  )
  const fulls = salesItemsFromBlocks(args.company, blocks)
  const emptiesOnly: RouteSummarySaveItem[] = []
  for (const group of args.emptiesGroups) {
    for (const product of group.items) {
      const qty = Number(args.emptyCases[product.id] || 0)
      if (!Number.isFinite(qty) || qty <= 0) continue
      const price = Number(product.price) || 0
      emptiesOnly.push({
        section: 'empties',
        company: args.company,
        productId: product.id,
        productName: product.label,
        brandId: group.id,
        brandName: group.title,
        firstLoad: 0,
        secondLoad: 0,
        rfg: 0,
        quantity: qty,
        price,
        amount: qty * price,
      })
    }
  }

  return [...fulls, ...emptiesOnly]
}

export async function listRouteSummariesWithItemsInRange(
  branch: UserBranch,
  dateFrom: string,
  dateTo: string,
) {
  if (branch !== 'Nabunturan') {
    return {
      data: [] as Array<{ summary: RouteSummaryRecord; items: RouteSummaryItemRecord[] }>,
      error: null as string | null,
      missingTable: false,
    }
  }

  const { data, error } = await supabase
    .from('route_summaries')
    .select('*')
    .eq('branch', branch)
    .gte('summary_date', dateFrom)
    .lte('summary_date', dateTo)
    .order('summary_date', { ascending: true })

  if (error) {
    return {
      data: [] as Array<{ summary: RouteSummaryRecord; items: RouteSummaryItemRecord[] }>,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const headers = (data ?? []) as RouteSummaryRecord[]
  if (headers.length === 0) {
    return {
      data: [] as Array<{ summary: RouteSummaryRecord; items: RouteSummaryItemRecord[] }>,
      error: null as string | null,
      missingTable: false,
    }
  }

  const ids = headers.map((row) => row.id)
  const { data: itemRows, error: itemsError } = await supabase
    .from('route_summary_items')
    .select('*')
    .in('summary_id', ids)

  if (itemsError) {
    return {
      data: [] as Array<{ summary: RouteSummaryRecord; items: RouteSummaryItemRecord[] }>,
      error: mapError(itemsError),
      missingTable: isMissingCatalogTable(itemsError),
    }
  }

  const bySummary = new Map<string, RouteSummaryItemRecord[]>()
  for (const row of (itemRows ?? []) as RouteSummaryItemRecord[]) {
    const list = bySummary.get(row.summary_id) ?? []
    list.push(row)
    bySummary.set(row.summary_id, list)
  }

  return {
    data: headers.map((summary) => ({
      summary,
      items: bySummary.get(summary.id) ?? [],
    })),
    error: null as string | null,
    missingTable: false,
  }
}

/** Nabunturan route summaries for one calendar day, optionally filtered by company. */
export async function listRouteSummariesByDate(
  branch: UserBranch,
  date: string,
  company?: CustomerTransactionCompany,
) {
  const result = await listRouteSummariesWithItemsInRange(branch, date, date)
  if (!company || result.error) return result
  return {
    ...result,
    data: result.data.filter((row) => row.summary.company === company),
  }
}
