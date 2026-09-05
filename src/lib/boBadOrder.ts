import type { CatalogTreeCategory } from './catalog'
import { normalizeCategoryName } from './bLiquidation'
import type { InventoryCategory } from './inventoryPreview'

export type BoBrandGroup = {
  id: string
  title: string
  items: { id: string; label: string; price: number }[]
}

export type BoInOutMeta = {
  company: 'PC' | 'SMC' | 'MAGNOLIA'
  direction: 'in' | 'out'
}

export function parseBoInOutLeafId(id: string): BoInOutMeta | null {
  const match = /^bo-(pc|smc|magnolia)-(in|out)$/.exec(id)
  if (!match) return null
  const companyMap = { pc: 'PC', smc: 'SMC', magnolia: 'MAGNOLIA' } as const
  return {
    company: companyMap[match[1] as keyof typeof companyMap],
    direction: match[2] as 'in' | 'out',
  }
}

export function parseBoAccLeafId(id: string): BoInOutMeta['company'] | null {
  const match = /^ai-bo-(pc|smc|magnolia)$/.exec(id)
  if (!match) return null
  const companyMap = { pc: 'PC', smc: 'SMC', magnolia: 'MAGNOLIA' } as const
  return companyMap[match[1] as keyof typeof companyMap]
}

export function parseBoInvLeafId(id: string): BoInOutMeta['company'] | null {
  const match = /^inv-bo-(pc|smc|magnolia)$/.exec(id)
  if (!match) return null
  const companyMap = { pc: 'PC', smc: 'SMC', magnolia: 'MAGNOLIA' } as const
  return companyMap[match[1] as keyof typeof companyMap]
}

/** Actual-inventory category key used for BO ACC counts. */
export function boActualInventoryCategory(company: BoInOutMeta['company']) {
  return `BO-${company}`
}

/** Maps BO tree company to the SKU catalog / inventory category. */
export function boCompanyToInventoryCategory(company: BoInOutMeta['company']): InventoryCategory {
  if (company === 'PC') return 'PCPPI'
  if (company === 'SMC') return 'SMC'
  return 'Magnolia'
}

function catalogNameCandidates(company: BoInOutMeta['company']): string[] {
  if (company === 'PC') return ['pcppi', 'pepsi', 'pc']
  if (company === 'SMC') return ['smc']
  return ['magnolia', 'magnoia']
}

function isPalletsName(name: string) {
  return normalizeCategoryName(name) === 'pallets'
}

export function findBoCatalogCategory(
  catalog: CatalogTreeCategory[],
  company: BoInOutMeta['company'],
) {
  const candidates = catalogNameCandidates(company)
  return (
    catalog.find((category) => {
      const name = normalizeCategoryName(category.name)
      return candidates.some((candidate) => name === candidate || name.includes(candidate))
    }) ?? null
  )
}

/** Build brand cards from that company's SKU subcategories (excludes Pallets). */
export function buildBoBrandGroupsFromCatalog(
  catalog: CatalogTreeCategory[],
  company: BoInOutMeta['company'],
): BoBrandGroup[] {
  const category = findBoCatalogCategory(catalog, company)
  if (!category) return []

  return category.subcategories
    .filter((sub) => !isPalletsName(sub.name) && sub.products.length > 0)
    .map((sub) => ({
      id: sub.id,
      title: sub.name.toUpperCase(),
      items: sub.products.map((product) => ({
        id: product.id,
        label: product.name,
        price: Number(product.price) || 0,
      })),
    }))
}

export function emptyBoQtyMap(groups: BoBrandGroup[] = []) {
  const values: Record<string, string> = { pallets: '' }
  for (const group of groups) {
    for (const item of group.items) values[item.id] = ''
  }
  return values
}

export function todayBoDateInput() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
