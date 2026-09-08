import { supabase } from './supabase'
import { isMissingCatalogTable } from './catalog'
import type { UserBranch } from './branches'
import type { CustomerTransactionCompany } from './customerTransaction'

/** Shared monthly sales series for Customer Transaction + Route Summary
 * (same branch + company counter: 1, 2, 3… then continues across both modules).
 */

function currentYearMonth(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function formatSharedSalesNo(seq: number) {
  return String(seq)
}

function mapSeriesError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Sales series tables are not set up yet. Run customer transaction + route summary sales series SQL, then refresh.'
  }
  return error.message ?? 'Something went wrong.'
}

async function readSeriesLastNumber(
  table: 'customer_tx_sales_series' | 'route_summary_sales_series',
  branch: UserBranch,
  company: CustomerTransactionCompany,
  yearMonth: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select('last_number')
    .eq('branch', branch)
    .eq('company', company)
    .eq('year_month', yearMonth)
    .maybeSingle()

  if (error) {
    return {
      last: 0,
      error: mapSeriesError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    last: data == null ? 0 : Number(data.last_number) || 0,
    error: null as string | null,
    missingTable: false,
  }
}

async function writeSeriesLastNumber(
  table: 'customer_tx_sales_series' | 'route_summary_sales_series',
  branch: UserBranch,
  company: CustomerTransactionCompany,
  yearMonth: string,
  lastNumber: number,
) {
  const { error } = await supabase.from(table).upsert(
    {
      branch,
      company,
      year_month: yearMonth,
      last_number: lastNumber,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'branch,company,year_month' },
  )

  if (error) {
    return {
      error: mapSeriesError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }
  return { error: null as string | null, missingTable: false }
}

/** Preview next shared sales no (customer TX + route summary continuous). */
export async function peekNextSharedSalesNo(
  branch: UserBranch,
  company: CustomerTransactionCompany,
) {
  const yearMonth = currentYearMonth()
  const [customer, route] = await Promise.all([
    readSeriesLastNumber('customer_tx_sales_series', branch, company, yearMonth),
    readSeriesLastNumber('route_summary_sales_series', branch, company, yearMonth),
  ])

  // Prefer a real counter when only one series table exists (e.g. Davao has customer only).
  if (customer.missingTable && route.missingTable) {
    return {
      salesNo: formatSharedSalesNo(1),
      seq: 1,
      yearMonth,
      error: customer.error ?? route.error,
      missingTable: true,
    }
  }
  if (customer.error && !customer.missingTable) {
    return {
      salesNo: formatSharedSalesNo(1),
      seq: 1,
      yearMonth,
      error: customer.error,
      missingTable: false,
    }
  }
  if (route.error && !route.missingTable) {
    return {
      salesNo: formatSharedSalesNo(1),
      seq: 1,
      yearMonth,
      error: route.error,
      missingTable: false,
    }
  }

  const customerLast = customer.missingTable ? 0 : customer.last
  const routeLast = route.missingTable ? 0 : route.last
  const next = Math.max(customerLast, routeLast) + 1

  return {
    salesNo: formatSharedSalesNo(next),
    seq: next,
    yearMonth,
    error: null as string | null,
    missingTable: false,
  }
}

/** Allocate next shared sales no and keep both series tables in sync. */
export async function allocateNextSharedSalesNo(
  branch: UserBranch,
  company: CustomerTransactionCompany,
) {
  const yearMonth = currentYearMonth()
  const peeked = await peekNextSharedSalesNo(branch, company)
  if (peeked.missingTable || peeked.error) return peeked

  const next = peeked.seq
  const [customerWrite, routeWrite] = await Promise.all([
    writeSeriesLastNumber('customer_tx_sales_series', branch, company, yearMonth, next),
    writeSeriesLastNumber('route_summary_sales_series', branch, company, yearMonth, next),
  ])

  // Succeed if at least one table accepted the write (other may be absent on some branches).
  if (customerWrite.missingTable && routeWrite.missingTable) {
    return {
      salesNo: peeked.salesNo,
      seq: next,
      yearMonth,
      error: customerWrite.error ?? routeWrite.error,
      missingTable: true,
    }
  }
  if (customerWrite.error && !customerWrite.missingTable) {
    return {
      salesNo: peeked.salesNo,
      seq: next,
      yearMonth,
      error: customerWrite.error,
      missingTable: false,
    }
  }
  if (routeWrite.error && !routeWrite.missingTable) {
    return {
      salesNo: peeked.salesNo,
      seq: next,
      yearMonth,
      error: routeWrite.error,
      missingTable: false,
    }
  }

  return {
    salesNo: formatSharedSalesNo(next),
    seq: next,
    yearMonth,
    error: null as string | null,
    missingTable: false,
  }
}
