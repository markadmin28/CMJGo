import type { CustomerTransactionCompany } from './customerTransaction'
import type { RouteSummaryItemRecord, RouteSummaryRecord } from './routeSummarySave'
import { salesNoForCompany } from './routeSummarySave'
import type { FullGoodsItem, FullGoodsMovement } from '../types/fullGoods'

export type RouteSummaryMovementMode = 'fulls' | 'empties'

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Map a saved route summary into a Fulls/Empties movement (Nabunturan inventory).
 * Fulls = Out (sold). Empties = In (brought back by route truck).
 */
export function routeSummaryToPrintableMovement(
  summary: RouteSummaryRecord,
  items: RouteSummaryItemRecord[],
  mode: RouteSummaryMovementMode,
  fallbackCategory: string,
  company: CustomerTransactionCompany | null,
): FullGoodsMovement | null {
  const section = mode === 'empties' ? 'empties' : 'fulls'
  const summaryCompany = summary.company || null
  const filtered = items.filter((item) => {
    if (item.section !== section) return false
    if (Number(item.quantity) === 0) return false
    if (!company) return false
    // Per-company summary rows: prefer matching the summary's company.
    if (summaryCompany && summaryCompany !== company) return false
    return item.company === company || (!item.company && summaryCompany === company)
  })

  if (filtered.length === 0) return null

  const salesNo =
    section === 'fulls' && company
      ? salesNoForCompany(summary, company)
      : salesNoForCompany(summary, summaryCompany ?? company ?? 'Pepsi') ||
        summary.route_area_name

  const printItems: FullGoodsItem[] = filtered.map((item) => ({
    id: item.id,
    movement_id: summary.id,
    product_id: item.product_id,
    product_name: item.product_name,
    brand_id: item.brand_id,
    brand_name: item.brand_name,
    quantity: Number(item.quantity) || 0,
    created_at: summary.created_at,
  }))

  return {
    id: `${summary.id}:${section}:${company ?? 'empties'}`,
    branch: summary.branch,
    movement_type: mode === 'empties' ? 'in' : 'out',
    movement_date: summary.summary_date || todayIsoDate(),
    truck_number: summary.plate_no || 'N/A',
    load_number: salesNo || '—',
    location: summary.route_area_name.trim() || '—',
    location_id: null,
    category_id: null,
    category_name: fallbackCategory,
    brand_id: null,
    brand_name: mode === 'empties' ? fallbackCategory : null,
    created_at: summary.created_at,
    items: printItems,
  }
}
