import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserBranch } from '../lib/branches'
import { capitalizeFirst, listCatalogTree } from '../lib/catalog'
import {
  buildCustomerTxBrandGroups,
  buildCustomerTxEmptiesGroups,
  type CustomerTransactionCompany,
} from '../lib/customerTransaction'
import type { BoBrandGroup } from '../lib/boBadOrder'
import {
  buildRouteSummarySaveItemsForCompany,
  getRouteSummariesByRouteDate,
  saveRouteSummary,
  salesNoForCompany,
  type RouteSummaryCompanyFinance,
  type RouteSummaryRecord,
} from '../lib/routeSummarySave'
import {
  buildRouteSummaryBrandBlocks,
  formatRouteMoney,
  formatRouteQty,
  formatRouteSummaryProductName,
  formatRouteTxDateTime,
  listRouteAreasWithFirstLoad,
  loadRouteDayBundle,
  peekNextRouteSummarySalesNo,
  routeLoadTodayIsoDate,
  ROUTE_TX_COMPANIES,
  splitRouteSummaryBlocksEvenly,
  type RouteArea,
  type RouteSummaryBrandBlock,
  type RouteTempLoad,
  type RouteTempLoadItem,
} from '../lib/routeTransaction'
import routeSummarySql from '../../supabase/route_summary_schema.sql?raw'
import routeSummaryFinanceSql from '../../supabase/route_summary_company_finance_schema.sql?raw'
import routeSummaryPerCompanySql from '../../supabase/route_summary_per_company_schema.sql?raw'
import {
  RouteSummaryPrintSheet,
  type RouteSummaryPrintSheetData,
} from './RouteSummaryPrintSheet'
import './RouteSummaryPanel.css'

type RouteSummaryPanelProps = {
  branch?: UserBranch | null
  onClose?: () => void
}

type DayBundle = {
  firstItems: RouteTempLoadItem[]
  secondItems: RouteTempLoadItem[]
  rfgItems: RouteTempLoadItem[]
}

function formatPlateNo(value: string) {
  return value.toUpperCase()
}

function formatPersonName(value: string) {
  return capitalizeFirst(value)
}

function parseMoney(raw: string) {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

type EmptiesBucketKey = 'empties' | 'shell' | 'bottles'

type EmptiesBucketItem = {
  id: string
  label: string
  price: number
}

type EmptiesBucket = {
  key: EmptiesBucketKey
  title: string
  items: EmptiesBucketItem[]
}

function emptiesBucketForName(productName: string): EmptiesBucketKey {
  const name = productName.toLowerCase()
  if (name.includes('shell')) return 'shell'
  if (name.includes('bottle')) return 'bottles'
  return 'empties'
}

function groupEmptiesIntoBoxes(groups: BoBrandGroup[]): EmptiesBucket[] {
  const buckets: Record<EmptiesBucketKey, EmptiesBucketItem[]> = {
    empties: [],
    shell: [],
    bottles: [],
  }

  for (const group of groups) {
    for (const item of group.items) {
      const key = emptiesBucketForName(item.label)
      buckets[key].push({
        id: item.id,
        label: item.label,
        price: Number(item.price) || 0,
      })
    }
  }

  return (
    [
      { key: 'empties', title: 'Empties', items: buckets.empties },
      { key: 'shell', title: 'Shell', items: buckets.shell },
      { key: 'bottles', title: 'Bottles', items: buckets.bottles },
    ] as const
  ).filter((bucket) => bucket.items.length > 0)
}

type CompanyFinanceDraft = {
  discount: string
  expenses: string
  promo: string
  account: string
  cashRemittance: string
  emptyCases: Record<string, string>
}

function emptyFinanceDraft(): CompanyFinanceDraft {
  return {
    discount: '',
    expenses: '',
    promo: '',
    account: '',
    cashRemittance: '',
    emptyCases: {},
  }
}

function emptyFinanceByCompany(): Record<CustomerTransactionCompany, CompanyFinanceDraft> {
  return {
    Pepsi: emptyFinanceDraft(),
    SMC: emptyFinanceDraft(),
    Magnolia: emptyFinanceDraft(),
  }
}

function blocksForCompany(
  groups: BoBrandGroup[],
  company: CustomerTransactionCompany,
  bundle: DayBundle | null,
) {
  if (!bundle) return buildRouteSummaryBrandBlocks(groups, [], [], [], company)
  const match = (items: RouteTempLoadItem[]) => items.filter((item) => item.company === company)
  return buildRouteSummaryBrandBlocks(
    groups,
    match(bundle.firstItems),
    match(bundle.secondItems),
    match(bundle.rfgItems),
    company,
  )
}

function financeDraftFromSaved(row: RouteSummaryCompanyFinance | null | undefined): CompanyFinanceDraft {
  if (!row) return emptyFinanceDraft()
  return {
    discount: row.discount ? String(row.discount) : '',
    expenses: row.expenses ? String(row.expenses) : '',
    promo: row.promo ? String(row.promo) : '',
    account: row.account ? String(row.account) : '',
    cashRemittance: row.cash_remittance ? String(row.cash_remittance) : '',
    emptyCases: {},
  }
}

export function RouteSummaryPanel({ branch = 'Nabunturan', onClose }: RouteSummaryPanelProps) {
  const { user } = useAuth()
  const activeBranch = branch ?? 'Nabunturan'
  const [company, setCompany] = useState<CustomerTransactionCompany>('Pepsi')
  const [loading, setLoading] = useState(true)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missingSummaryTable, setMissingSummaryTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saveToast, setSaveToast] = useState<{
    updated: boolean
    routeName: string
    salesLabel: string
    itemCount: number
  } | null>(null)
  const [printing, setPrinting] = useState(false)
  const [printData, setPrintData] = useState<RouteSummaryPrintSheetData | null>(null)
  const [savedByCompany, setSavedByCompany] = useState<
    Record<CustomerTransactionCompany, RouteSummaryRecord | null>
  >({ Pepsi: null, SMC: null, Magnolia: null })
  const savedSummary = savedByCompany[company]
  const [routes, setRoutes] = useState<RouteArea[]>([])
  const [firstLoadByRouteId, setFirstLoadByRouteId] = useState<Record<string, RouteTempLoad>>({})
  const [groupsByCompany, setGroupsByCompany] = useState<
    Record<CustomerTransactionCompany, BoBrandGroup[]>
  >({ Pepsi: [], SMC: [], Magnolia: [] })
  const [emptiesGroups, setEmptiesGroups] = useState<BoBrandGroup[]>([])
  const [dayBundle, setDayBundle] = useState<DayBundle | null>(null)

  const [routeAreaId, setRouteAreaId] = useState('')
  const [salesNo, setSalesNo] = useState('')
  const [salesSeriesHint, setSalesSeriesHint] = useState('')
  const [plateNo, setPlateNo] = useState('')
  const [datePosted, setDatePosted] = useState(formatRouteTxDateTime())
  const [driver, setDriver] = useState('')
  const [helper, setHelper] = useState('')
  const [ahente, setAhente] = useState('')
  const [financeByCompany, setFinanceByCompany] =
    useState<Record<CustomerTransactionCompany, CompanyFinanceDraft>>(emptyFinanceByCompany)

  const [loadingSalesman, setLoadingSalesman] = useState('')
  const [loadingChecker, setLoadingChecker] = useState('')
  const [loadingTestify, setLoadingTestify] = useState('')
  const [unloadingSalesman, setUnloadingSalesman] = useState('')
  const [unloadingChecker, setUnloadingChecker] = useState('')
  const [unloadingTestify, setUnloadingTestify] = useState('')

  const finance = financeByCompany[company]
  const discount = finance.discount
  const expenses = finance.expenses
  const promo = finance.promo
  const account = finance.account
  const cashRemittance = finance.cashRemittance
  const emptyCases = finance.emptyCases

  function patchFinance(patch: Partial<CompanyFinanceDraft>) {
    setFinanceByCompany((prev) => ({
      ...prev,
      [company]: { ...prev[company], ...patch },
    }))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const [catalogResult, firstLoadsResult] = await Promise.all([
        listCatalogTree(activeBranch, { forTransactions: true }),
        listRouteAreasWithFirstLoad(activeBranch),
      ])
      if (cancelled) return

      if (catalogResult.error) {
        setError(catalogResult.error)
        setLoading(false)
        return
      }
      if (firstLoadsResult.error) setError(firstLoadsResult.error)

      const map: Record<string, RouteTempLoad> = {}
      const routeList: RouteArea[] = []
      for (const row of firstLoadsResult.data) {
        if (!row.route_area_id) continue
        map[row.route_area_id] = row
        routeList.push({
          id: row.route_area_id,
          branch: activeBranch,
          name: row.route_area_name,
          created_at: row.updated_at,
        })
      }
      routeList.sort((a, b) => a.name.localeCompare(b.name))
      setRoutes(routeList)
      setFirstLoadByRouteId(map)
      setGroupsByCompany({
        Pepsi: buildCustomerTxBrandGroups(catalogResult.data, 'Pepsi'),
        SMC: buildCustomerTxBrandGroups(catalogResult.data, 'SMC'),
        Magnolia: buildCustomerTxBrandGroups(catalogResult.data, 'Magnolia'),
      })
      setEmptiesGroups(buildCustomerTxEmptiesGroups(catalogResult.data))
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeBranch])

  useEffect(() => {
    let cancelled = false

    async function loadSalesNo() {
      const existing = savedSummary ? salesNoForCompany(savedSummary, company) : ''
      if (existing) {
        setSalesNo(existing)
        setSalesSeriesHint(`${company} · saved`)
        return
      }

      const result = await peekNextRouteSummarySalesNo(activeBranch, company)
      if (cancelled) return
      if (result.missingTable) {
        setSalesNo('')
        setSalesSeriesHint('Run route summary sales series SQL')
        if (result.error) setError(result.error)
        return
      }
      if (result.error) {
        setSalesNo('')
        setSalesSeriesHint('')
        setError(result.error)
        return
      }
      setSalesNo(result.salesNo)
      setSalesSeriesHint(`${company} · next`)
    }

    void loadSalesNo()
    return () => {
      cancelled = true
    }
  }, [activeBranch, company, savedSummary])

  function clearFinanceAndCrew() {
    setFinanceByCompany(emptyFinanceByCompany())
    setLoadingSalesman('')
    setLoadingChecker('')
    setLoadingTestify('')
    setUnloadingSalesman('')
    setUnloadingChecker('')
    setUnloadingTestify('')
  }

  function applySharedCrew(
    summaries: Array<RouteSummaryRecord | null | undefined>,
  ) {
    const filled = summaries
      .filter((row): row is RouteSummaryRecord => Boolean(row))
      .filter(
        (row) =>
          row.loading_salesman ||
          row.loading_checker ||
          row.loading_testify ||
          row.unloading_salesman ||
          row.unloading_checker ||
          row.unloading_testify,
      )
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))

    const source = filled[0] ?? summaries.find((row): row is RouteSummaryRecord => Boolean(row))
    if (!source) {
      setLoadingSalesman('')
      setLoadingChecker('')
      setLoadingTestify('')
      setUnloadingSalesman('')
      setUnloadingChecker('')
      setUnloadingTestify('')
      return
    }

    setLoadingSalesman(formatPersonName(source.loading_salesman ?? ''))
    setLoadingChecker(formatPersonName(source.loading_checker ?? ''))
    setLoadingTestify(formatPersonName(source.loading_testify ?? ''))
    setUnloadingSalesman(formatPersonName(source.unloading_salesman ?? ''))
    setUnloadingChecker(formatPersonName(source.unloading_checker ?? ''))
    setUnloadingTestify(formatPersonName(source.unloading_testify ?? ''))
  }

  function applyRouteCompanyBundle(
    byCompany: Awaited<ReturnType<typeof getRouteSummariesByRouteDate>>['data']['byCompany'],
  ) {
    const nextSaved: Record<CustomerTransactionCompany, RouteSummaryRecord | null> = {
      Pepsi: null,
      SMC: null,
      Magnolia: null,
    }
    const nextFinance = emptyFinanceByCompany()

    for (const companyKey of ROUTE_TX_COMPANIES) {
      const entry = byCompany[companyKey]
      if (!entry) continue
      nextSaved[companyKey] = entry.summary
      nextFinance[companyKey] = financeDraftFromSaved(entry.finance)
      const empties: Record<string, string> = {}
      for (const item of entry.items) {
        if (item.section !== 'empties') continue
        if (!item.product_id) continue
        const qty = Number(item.quantity) || 0
        if (qty > 0) empties[item.product_id] = String(qty)
      }
      nextFinance[companyKey].emptyCases = empties
    }

    setSavedByCompany(nextSaved)
    setFinanceByCompany(nextFinance)

    // Truck header can come from any saved company; crew is shared for the route/day.
    const preferred =
      nextSaved[company] ?? nextSaved.Pepsi ?? nextSaved.SMC ?? nextSaved.Magnolia ?? null
    if (preferred) {
      setPlateNo(formatPlateNo(preferred.plate_no ?? ''))
      setDriver(formatPersonName(preferred.driver ?? ''))
      setHelper(formatPersonName(preferred.helper ?? ''))
      setAhente(formatPersonName(preferred.ahente ?? ''))
      if (preferred.date_posted_text) setDatePosted(preferred.date_posted_text)
    }
    applySharedCrew([nextSaved.Pepsi, nextSaved.SMC, nextSaved.Magnolia])
  }

  const brandBlocks = useMemo(
    () => blocksForCompany(groupsByCompany[company] ?? [], company, dayBundle),
    [company, dayBundle, groupsByCompany],
  )

  const [leftBlocks, rightBlocks] = useMemo(
    () => splitRouteSummaryBlocksEvenly(brandBlocks),
    [brandBlocks],
  )

  const totalSales = useMemo(
    () => brandBlocks.reduce((sum, block) => sum + block.rows.reduce((s, row) => s + row.amount, 0), 0),
    [brandBlocks],
  )

  const emptiesBuckets = useMemo(() => groupEmptiesIntoBoxes(emptiesGroups), [emptiesGroups])

  const emptiesAmount = useMemo(() => {
    let total = 0
    for (const bucket of emptiesBuckets) {
      for (const item of bucket.items) {
        const cases = parseMoney(emptyCases[item.id] ?? '')
        total += cases * item.price
      }
    }
    return total
  }, [emptyCases, emptiesBuckets])

  const subTotal =
    totalSales -
    emptiesAmount -
    parseMoney(discount) -
    parseMoney(expenses) -
    parseMoney(promo) -
    parseMoney(account)

  const shortOver = parseMoney(cashRemittance) - subTotal

  useEffect(() => {
    function onAfterPrint() {
      setPrinting(false)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(timer)
  }, [printing])

  function handlePrint() {
    if (!routeAreaId) {
      setError('Select a route/area first.')
      return
    }

    const routeName = routes.find((route) => route.id === routeAreaId)?.name ?? ''
    const printBuckets = emptiesBuckets.map((bucket) => ({
      key: bucket.key,
      title:
        bucket.key === 'empties'
          ? 'Complete case'
          : bucket.key === 'shell'
            ? 'Complete shell'
            : 'Complete bot',
      qtyLabel: bucket.key === 'shell' ? 'Shell' : bucket.key === 'bottles' ? 'Bot' : 'Case',
      items: bucket.items.map((item) => {
        const cases = parseMoney(emptyCases[item.id] ?? '')
        return {
          id: item.id,
          label: item.label,
          cases,
          price: item.price,
          amount: cases * item.price,
        }
      }),
    }))

    setPrintData({
      branch: activeBranch,
      company,
      salesNo,
      routeAreaName: routeName,
      plateNo,
      driver,
      helper,
      ahente,
      datePosted,
      brandBlocks,
      emptiesBuckets: printBuckets,
      emptiesTotal: emptiesAmount,
      totalSales,
      discount: parseMoney(discount),
      expenses: parseMoney(expenses),
      promo: parseMoney(promo),
      account: parseMoney(account),
      subTotal,
      cashRemittance: parseMoney(cashRemittance),
      shortOver,
      loadingSalesman,
      loadingChecker,
      loadingTestify,
      unloadingSalesman,
      unloadingChecker,
      unloadingTestify,
    })
    setError(null)
    setPrinting(true)
  }

  async function handleSave() {
    if (activeBranch !== 'Nabunturan') {
      setError('Route Summary save is only available for Nabunturan.')
      return
    }
    if (!routeAreaId || !dayBundle) {
      setError('Select a route/area that already has a First Load today.')
      return
    }

    // Each company tab is its own record — save only this company's lines.
    const activeItems = buildRouteSummarySaveItemsForCompany({
      company,
      groupsByCompany,
      firstItems: dayBundle.firstItems,
      secondItems: dayBundle.secondItems,
      rfgItems: dayBundle.rfgItems,
      emptyCases,
      emptiesGroups,
    })

    const items = activeItems

    const companySalesTotal = activeItems
      .filter((item) => item.section === 'fulls')
      .reduce((sum, item) => sum + item.amount, 0)

    const financeSubTotal =
      companySalesTotal -
      emptiesAmount -
      parseMoney(discount) -
      parseMoney(expenses) -
      parseMoney(promo) -
      parseMoney(account)

    setSaving(true)
    setError(null)
    setMissingSummaryTable(false)
    const result = await saveRouteSummary({
      branch: activeBranch,
      routeAreaId,
      routeAreaName: routes.find((route) => route.id === routeAreaId)?.name ?? '',
      plateNo,
      driver,
      helper,
      ahente,
      datePostedText: datePosted,
      saveCompany: company,
      companyFinance: {
        totalSales: companySalesTotal,
        refEmpties: emptiesAmount,
        discount: parseMoney(discount),
        expenses: parseMoney(expenses),
        promo: parseMoney(promo),
        account: parseMoney(account),
        subTotal: financeSubTotal,
        cashRemittance: parseMoney(cashRemittance),
        shortOver: parseMoney(cashRemittance) - financeSubTotal,
      },
      loadingSalesman,
      loadingChecker,
      loadingTestify,
      unloadingSalesman,
      unloadingChecker,
      unloadingTestify,
      items,
      createdBy: user?.id ?? null,
    })
    setSaving(false)

    if (result.missingTable) {
      setMissingSummaryTable(true)
      setError(result.error)
      return
    }
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to save summary.')
      return
    }

    setSavedByCompany((prev) => {
      const next = { ...prev, [company]: result.data }
      for (const key of ROUTE_TX_COMPANIES) {
        if (!next[key] || key === company) continue
        next[key] = {
          ...next[key]!,
          loading_salesman: result.data!.loading_salesman,
          loading_checker: result.data!.loading_checker,
          loading_testify: result.data!.loading_testify,
          unloading_salesman: result.data!.unloading_salesman,
          unloading_checker: result.data!.unloading_checker,
          unloading_testify: result.data!.unloading_testify,
        }
      }
      return next
    })
    const companyNo = salesNoForCompany(result.data, company)
    setSalesNo(companyNo)
    setSaveToast({
      updated: Boolean(result.updated),
      routeName: result.data.route_area_name,
      salesLabel: `${company} #${companyNo || '—'}`,
      itemCount: activeItems.length,
    })
  }

  async function copySql() {
    await navigator.clipboard.writeText(
      `${routeSummarySql}\n\n${routeSummaryFinanceSql}\n\n${routeSummaryPerCompanySql}`,
    )
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleSelectRoute(nextId: string) {
    setRouteAreaId(nextId)
    setError(null)
    setSavedByCompany({ Pepsi: null, SMC: null, Magnolia: null })
    clearFinanceAndCrew()

    if (!nextId) {
      setPlateNo('')
      setDriver('')
      setHelper('')
      setAhente('')
      setDatePosted(formatRouteTxDateTime())
      setDayBundle(null)
      return
    }

    const first = firstLoadByRouteId[nextId]
    if (first) {
      setPlateNo(formatPlateNo(first.plate_no ?? ''))
      setDriver(formatPersonName(first.driver ?? ''))
      setHelper(formatPersonName(first.helper ?? ''))
      setAhente(formatPersonName(first.ahente ?? ''))
      if (first.load_at_text) setDatePosted(first.load_at_text)
    }

    setLoadingRoute(true)
    const [bundle, saved] = await Promise.all([
      loadRouteDayBundle(activeBranch, nextId),
      getRouteSummariesByRouteDate(activeBranch, nextId, routeLoadTodayIsoDate()),
    ])
    setLoadingRoute(false)

    if (bundle.error) {
      setError(bundle.error)
      setDayBundle(null)
      return
    }

    setDayBundle({
      firstItems: bundle.firstItems,
      secondItems: bundle.secondItems,
      rfgItems: bundle.rfgItems,
    })

    if (saved.error && !saved.missingTable) {
      setError(saved.error)
      return
    }
    if (saved.missingTable) {
      setMissingSummaryTable(true)
      if (saved.error) setError(saved.error)
      return
    }

    applyRouteCompanyBundle(saved.data.byCompany)
  }

  function renderGrid(blocks: RouteSummaryBrandBlock[]) {
    return (
      <div className="rsu-grid-panel">
        <table className="rsu-table">
          <thead>
            <tr>
              <th className="rsu-col-name">Full goods</th>
              <th>1st</th>
              <th>2nd</th>
              <th>Tot</th>
              <th>RFG</th>
              <th>Sales</th>
              <th>Price</th>
              <th>Amt</th>
            </tr>
          </thead>
          <tbody>
            {blocks.length === 0 ? (
              <tr>
                <td colSpan={8} className="rsu-table__empty">
                  No products for this company.
                </td>
              </tr>
            ) : (
              blocks.map((block) => (
                <BrandRows
                  key={`${block.brandId}-${block.rows[0]?.productId ?? 'x'}`}
                  block={block}
                  company={company}
                  showBrandHeader={company !== 'Pepsi'}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
    <section className="rsu-panel no-print" aria-label="Route Summary">
      <header className="rsu-header">
        <div className="rsu-header__meta">
          <label className="rsu-field">
            <span>Sales no.</span>
            <input
              value={salesNo}
              readOnly
              title={salesSeriesHint || `${activeBranch} monthly series`}
            />
          </label>
          <label className="rsu-field rsu-field--route">
            <span>Route / area</span>
            <select
              value={routeAreaId}
              onChange={(e) => void handleSelectRoute(e.target.value)}
              disabled={loading}
            >
              <option value="">Select route with First Load…</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rsu-field">
            <span>Plate no.</span>
            <input className="rsu-input--plate" value={plateNo} readOnly />
          </label>
          <label className="rsu-field">
            <span>Date posted</span>
            <input value={datePosted} onChange={(e) => setDatePosted(e.target.value)} />
          </label>
          <label className="rsu-field">
            <span>Driver</span>
            <input value={driver} readOnly />
          </label>
          <label className="rsu-field">
            <span>Helper</span>
            <input value={helper} readOnly />
          </label>
          <label className="rsu-field">
            <span>Ahente</span>
            <input value={ahente} readOnly />
          </label>
        </div>

        <div className="rsu-header__title">
          <p>{activeBranch}</p>
          <h1>SUMMARY</h1>
          {onClose ? (
            <button type="button" className="rsu-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
      </header>

      <div className="rsu-body">
        <div className="rsu-main">
          <div className="rsu-tabs" role="tablist" aria-label="Company">
            {ROUTE_TX_COMPANIES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={company === item}
                className={
                  company === item
                    ? `rsu-tab rsu-tab--${item.toLowerCase()} is-active`
                    : `rsu-tab rsu-tab--${item.toLowerCase()}`
                }
                onClick={() => setCompany(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {error ? <p className="rsu-banner is-error">{error}</p> : null}
          {missingSummaryTable ? (
            <div className="rsu-banner is-error">
              <p>
                Run Route Summary SQL in Supabase (include per-company update), then refresh.
              </p>
              <button type="button" className="rsu-btn rsu-btn--ghost" onClick={() => void copySql()}>
                {copied ? 'Copied' : 'Copy SQL'}
              </button>
            </div>
          ) : null}
          {loading || loadingRoute ? <p className="rsu-banner">Loading summary…</p> : null}
          {!loading && !loadingRoute && !routeAreaId ? (
            <p className="rsu-banner">Select a route/area that already has a First Load today.</p>
          ) : null}

          {!loading && !loadingRoute && routeAreaId ? (
            <div className="rsu-grids">
              {renderGrid(leftBlocks)}
              {renderGrid(rightBlocks)}
            </div>
          ) : null}

          <div className="rsu-bottom">
            <section className="rsu-finance" aria-label="Financial summary">
              <div className="rsu-finance__item is-total">
                <span>Total sales</span>
                <strong>₱ {formatRouteMoney(totalSales)}</strong>
              </div>
              <label className="rsu-finance__item is-deduction">
                <span>Ref. empties</span>
                <input
                  value={formatRouteMoney(emptiesAmount)}
                  readOnly
                  title="From Empties total"
                />
              </label>
              <label className="rsu-finance__item is-deduction">
                <span>Discount</span>
                <input
                  value={discount}
                  onChange={(e) => patchFinance({ discount: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <label className="rsu-finance__item is-deduction">
                <span>Expenses</span>
                <input
                  value={expenses}
                  onChange={(e) => patchFinance({ expenses: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <label className="rsu-finance__item is-deduction">
                <span>Promo</span>
                <input
                  value={promo}
                  onChange={(e) => patchFinance({ promo: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <label className="rsu-finance__item is-deduction">
                <span>Account</span>
                <input
                  value={account}
                  onChange={(e) => patchFinance({ account: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <div className="rsu-finance__item is-subtotal">
                <span>Sub total</span>
                <strong>₱ {formatRouteMoney(subTotal)}</strong>
              </div>
              <label className="rsu-finance__item">
                <span>Cash remittance</span>
                <input
                  value={cashRemittance}
                  onChange={(e) => patchFinance({ cashRemittance: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <div className="rsu-finance__item is-shortover">
                <span>Short / over</span>
                <strong className={shortOver < 0 ? 'is-short' : shortOver > 0 ? 'is-over' : undefined}>
                  ₱ {formatRouteMoney(shortOver)}
                </strong>
              </div>
            </section>

            <section className="rsu-crew" aria-label="Loading unloading">
              <div>
                <h3>Loading</h3>
                <label>
                  <span>Salesman</span>
                  <input
                    value={loadingSalesman}
                    onChange={(e) => setLoadingSalesman(formatPersonName(e.target.value))}
                  />
                </label>
                <label>
                  <span>Checker</span>
                  <input
                    value={loadingChecker}
                    onChange={(e) => setLoadingChecker(formatPersonName(e.target.value))}
                  />
                </label>
                <label>
                  <span>Testify</span>
                  <input
                    value={loadingTestify}
                    onChange={(e) => setLoadingTestify(formatPersonName(e.target.value))}
                  />
                </label>
              </div>
              <div>
                <h3>Unloading</h3>
                <label>
                  <span>Salesman</span>
                  <input
                    value={unloadingSalesman}
                    onChange={(e) => setUnloadingSalesman(formatPersonName(e.target.value))}
                  />
                </label>
                <label>
                  <span>Checker</span>
                  <input
                    value={unloadingChecker}
                    onChange={(e) => setUnloadingChecker(formatPersonName(e.target.value))}
                  />
                </label>
                <label>
                  <span>Testify</span>
                  <input
                    value={unloadingTestify}
                    onChange={(e) => setUnloadingTestify(formatPersonName(e.target.value))}
                  />
                </label>
              </div>
            </section>
          </div>
        </div>

        <aside className="rsu-side">
          <section className="rsu-empties" aria-label="Empties shell bottles">
            <div className="rsu-empties__scroll">
              {emptiesBuckets.length === 0 ? (
                <p className="rsu-table__empty">No empties in catalog.</p>
              ) : (
                emptiesBuckets.map((bucket) => (
                  <div key={bucket.key} className={`rsu-empties-box rsu-empties-box--${bucket.key}`}>
                    <h3>{bucket.title}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Case</th>
                          <th>Price</th>
                          <th>Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bucket.items.map((item) => {
                          const cases = parseMoney(emptyCases[item.id] ?? '')
                          const amount = cases * item.price
                          return (
                            <tr key={item.id}>
                              <td>
                                <span className="rsu-empties__name">{item.label}</span>
                              </td>
                              <td>
                                <input
                                  value={emptyCases[item.id] ?? ''}
                                  onChange={(e) =>
                                    patchFinance({
                                      emptyCases: {
                                        ...emptyCases,
                                        [item.id]: e.target.value,
                                      },
                                    })
                                  }
                                  inputMode="decimal"
                                />
                              </td>
                              <td>{formatRouteMoney(item.price)}</td>
                              <td className="is-amount">{formatRouteMoney(amount)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
            <footer className="rsu-empties__total">
              <span>Empties total</span>
              <strong>₱ {formatRouteMoney(emptiesAmount)}</strong>
            </footer>
          </section>
        </aside>
      </div>

      <footer className="rsu-footer">
        <button
          type="button"
          className="rsu-btn rsu-btn--primary"
          disabled={!routeAreaId || saving || loading || loadingRoute}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : savedSummary ? 'Update' : 'Save'}
        </button>
        <button
          type="button"
          className="rsu-btn rsu-btn--ghost"
          disabled={!routeAreaId || printing}
          onClick={handlePrint}
        >
          {printing ? 'Printing…' : 'Print'}
        </button>
      </footer>

      {saveToast ? (
        <div className="rsu-toast-backdrop" onClick={() => setSaveToast(null)} role="presentation">
          <div
            className="rsu-toast"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="rsu-toast__eyebrow">Success</p>
            <h2>{saveToast.updated ? 'Summary updated' : 'Summary saved'}</h2>
            <p>
              {saveToast.routeName} · Sales no. {saveToast.salesLabel} · {saveToast.itemCount} lines
            </p>
            <p className="rsu-toast__hint">
              Fulls sales = Out · Empties/shell/bottles = In (Nabunturan inventory).
            </p>
            <button type="button" className="rsu-btn rsu-btn--primary" onClick={() => setSaveToast(null)}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </section>

    <div className="print-only" aria-hidden={!printing}>
      <RouteSummaryPrintSheet data={printData} active={printing} />
    </div>
    </>
  )
}

function BrandRows({
  block,
  company,
  showBrandHeader,
}: {
  block: RouteSummaryBrandBlock
  company: CustomerTransactionCompany
  showBrandHeader: boolean
}) {
  return (
    <>
      {showBrandHeader ? (
        <tr className="rsu-brand-row">
          <td colSpan={8}>{block.brandName}</td>
        </tr>
      ) : null}
      {block.rows.map((row) => {
        const displayName = formatRouteSummaryProductName(
          company,
          row.brandName,
          row.productName,
        )
        return (
          <tr key={row.productId} className={row.sales !== 0 ? 'has-sales' : undefined}>
            <td className="rsu-col-name" title={displayName}>
              {displayName}
            </td>
            <td>{formatRouteQty(row.firstLoad)}</td>
            <td>{formatRouteQty(row.secondLoad)}</td>
            <td className="is-total">{formatRouteQty(row.total)}</td>
            <td>{formatRouteQty(row.rfg)}</td>
            <td className="is-sales">{formatRouteQty(row.sales)}</td>
            <td className="is-price">{formatRouteMoney(row.price)}</td>
            <td className="is-amount">{formatRouteMoney(row.amount)}</td>
          </tr>
        )
      })}
    </>
  )
}
