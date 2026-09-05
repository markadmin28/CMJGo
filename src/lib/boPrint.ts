import type { BoBrandGroup, BoInOutMeta } from './boBadOrder'

export type BoPrintRow = {
  id: string
  pallets: number | null
  cases: number
  sku: string
  price: number
  amount: number
  discount: number
}

export type BoPrintData = {
  title: string
  company: BoInOutMeta['company']
  direction: BoInOutMeta['direction']
  printDateLabel: string
  dateUpdatedLabel: string
  plateNo: string
  loadNo: string
  from: string
  rows: BoPrintRow[]
  totalCases: number
  totalAmount: number
  totalDiscount: number
  totalPayables: number
}

export function formatBoPrintMoney(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatBoPrintQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function formatBoPrintDateTime(value = new Date()) {
  return value.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function formatBoPrintDateOnly(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US')
}

export function buildBoPrintData(input: {
  meta: BoInOutMeta
  groups: BoBrandGroup[]
  qtys: Record<string, string>
  truckNo: string
  loadNo: string
  from: string
  dateUpdated?: string | null
}): BoPrintData | null {
  const palletsRaw = Number((input.qtys.pallets ?? '').trim())
  const pallets = Number.isFinite(palletsRaw) && palletsRaw > 0 ? palletsRaw : 0

  const rows: BoPrintRow[] = []
  for (const group of input.groups) {
    for (const item of group.items) {
      const raw = (input.qtys[item.id] ?? '').trim()
      if (!raw) continue
      const cases = Number(raw)
      if (!Number.isFinite(cases) || cases <= 0) continue
      const price = Number(item.price) || 0
      const amount = cases * price
      rows.push({
        id: item.id,
        pallets: null,
        cases,
        sku: `${group.title} ${item.label}`.trim(),
        price,
        amount,
        discount: 0,
      })
    }
  }

  if (rows.length === 0 && pallets <= 0) return null

  if (rows.length > 0) {
    rows[0] = { ...rows[0], pallets }
  } else {
    rows.push({
      id: 'pallets-only',
      pallets,
      cases: 0,
      sku: 'PALLETS',
      price: 0,
      amount: 0,
      discount: 0,
    })
  }

  const totalCases = rows.reduce((sum, row) => sum + row.cases, 0)
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  const totalDiscount = rows.reduce((sum, row) => sum + row.discount, 0)

  return {
    title: `BO - ${input.meta.company} ${input.meta.direction}`.toUpperCase(),
    company: input.meta.company,
    direction: input.meta.direction,
    printDateLabel: formatBoPrintDateTime(),
    dateUpdatedLabel: input.dateUpdated
      ? formatBoPrintDateTime(new Date(input.dateUpdated))
      : '—',
    plateNo: input.truckNo.trim() || '—',
    loadNo: input.loadNo.trim() || '—',
    from: input.from.trim() || '—',
    rows,
    totalCases,
    totalAmount,
    totalDiscount,
    totalPayables: totalAmount - totalDiscount,
  }
}
