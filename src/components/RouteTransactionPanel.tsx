import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserBranch } from '../lib/branches'
import { listCatalogTree, capitalizeFirst } from '../lib/catalog'
import {
  buildCustomerTxBrandGroups,
  emptyCustomerTxQtyMap,
  type CustomerTransactionCompany,
} from '../lib/customerTransaction'
import type { BoBrandGroup } from '../lib/boBadOrder'
import type { RouteTransactionOption } from './RouteTransactionOptionsPopover'
import {
  addRouteArea,
  collectRouteQtyItems,
  formatRouteTxDateTime,
  getRouteTempLoad,
  getRouteTempLoadItems,
  listRouteAreas,
  listRouteAreasWithFirstLoad,
  ROUTE_TX_COMPANIES,
  routeOptionToLoadKind,
  routeTransactionTitle,
  saveRouteTempLoad,
  type RouteArea,
  type RouteTempLoad,
} from '../lib/routeTransaction'
import { NameModal } from './AddCategoryModal'
import { RouteSummaryPanel } from './RouteSummaryPanel'
import routeAreasSql from '../../supabase/route_areas_schema.sql?raw'
import routeTempLoadsSql from '../../supabase/route_temp_loads_schema.sql?raw'
import './RouteTransactionPanel.css'

type RouteTransactionPanelProps = {
  option: RouteTransactionOption
  branch?: UserBranch | null
  onClose?: () => void
}

type SavePopup = {
  updated: boolean
  kindLabel: string
  routeName: string
  plateNo: string
  driver: string
  itemCount: number
}

function emptyQtyMap(groupsByCompany: Record<CustomerTransactionCompany, BoBrandGroup[]>) {
  return emptyCustomerTxQtyMap([
    ...groupsByCompany.Pepsi,
    ...groupsByCompany.SMC,
    ...groupsByCompany.Magnolia,
  ])
}

function formatPlateNo(value: string) {
  return value.toUpperCase()
}

function formatPersonName(value: string) {
  return capitalizeFirst(value)
}

export function RouteTransactionPanel({
  option,
  branch = 'Nabunturan',
  onClose,
}: RouteTransactionPanelProps) {
  const { user } = useAuth()
  const activeBranch = branch ?? 'Nabunturan'
  const canManageRoutes = activeBranch === 'Nabunturan'
  const title = routeTransactionTitle(option)
  const loadKind = routeOptionToLoadKind(option)
  const isLoadScreen = loadKind != null
  const isFirstLoad = option === 'firstLoad'
  const needsFirstLoadRoutes = option === 'secondLoad' || option === 'rfg'

  const [company, setCompany] = useState<CustomerTransactionCompany>('Pepsi')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savePopup, setSavePopup] = useState<SavePopup | null>(null)
  const [saveToastPaused, setSaveToastPaused] = useState(false)
  const [missingRoutesTable, setMissingRoutesTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [routeAddOpen, setRouteAddOpen] = useState(false)
  const [routeSaving, setRouteSaving] = useState(false)
  const [routes, setRoutes] = useState<RouteArea[]>([])
  const [firstLoadByRouteId, setFirstLoadByRouteId] = useState<Record<string, RouteTempLoad>>({})
  const [groupsByCompany, setGroupsByCompany] = useState<
    Record<CustomerTransactionCompany, BoBrandGroup[]>
  >({
    Pepsi: [],
    SMC: [],
    Magnolia: [],
  })
  const [qtys, setQtys] = useState<Record<string, string>>({})

  const [routeAreaId, setRouteAreaId] = useState('')
  const [routeArea, setRouteArea] = useState('')
  const [plateNo, setPlateNo] = useState('')
  const [driver, setDriver] = useState('')
  const [helper, setHelper] = useState('')
  const [ahente, setAhente] = useState('')
  const [dateText, setDateText] = useState(formatRouteTxDateTime())
  const [crewLocked, setCrewLocked] = useState(false)
  const [editingLoadId, setEditingLoadId] = useState<string | null>(null)
  const isUpdating = Boolean(editingLoadId)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isLoadScreen) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setSavePopup(null)
      setRouteAreaId('')
      setRouteArea('')
      setPlateNo('')
      setDriver('')
      setHelper('')
      setAhente('')
      setDateText(formatRouteTxDateTime())
      setCrewLocked(false)
      setEditingLoadId(null)
      setCompany('Pepsi')

      const catalogPromise = listCatalogTree(activeBranch, { forTransactions: true })
      const routesPromise = !canManageRoutes
        ? Promise.resolve({ data: [] as RouteArea[], error: null, missingTable: false })
        : isFirstLoad
          ? listRouteAreas('Nabunturan')
          : Promise.resolve({ data: [] as RouteArea[], error: null, missingTable: false })
      const firstLoadsPromise =
        canManageRoutes && needsFirstLoadRoutes
          ? listRouteAreasWithFirstLoad('Nabunturan')
          : Promise.resolve({ data: [] as RouteTempLoad[], error: null, missingTable: false })

      const [catalogResult, routesResult, firstLoadsResult] = await Promise.all([
        catalogPromise,
        routesPromise,
        firstLoadsPromise,
      ])
      if (cancelled) return

      if (catalogResult.error) {
        setError(catalogResult.error)
        setLoading(false)
        return
      }

      const missing =
        Boolean(routesResult.missingTable) || Boolean(firstLoadsResult.missingTable)
      setMissingRoutesTable(missing)

      if (routesResult.error && !routesResult.missingTable) setError(routesResult.error)
      if (firstLoadsResult.error && !firstLoadsResult.missingTable) {
        setError(firstLoadsResult.error)
      }

      if (isFirstLoad) {
        setRoutes(routesResult.data)
        setFirstLoadByRouteId({})
      } else {
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
      }

      const next: Record<CustomerTransactionCompany, BoBrandGroup[]> = {
        Pepsi: buildCustomerTxBrandGroups(catalogResult.data, 'Pepsi'),
        SMC: buildCustomerTxBrandGroups(catalogResult.data, 'SMC'),
        Magnolia: buildCustomerTxBrandGroups(catalogResult.data, 'Magnolia'),
      }
      setGroupsByCompany(next)
      setQtys(emptyQtyMap(next))
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeBranch, canManageRoutes, isFirstLoad, isLoadScreen, needsFirstLoadRoutes, option])

  const groups = groupsByCompany[company]
  const filledCount = useMemo(
    () => Object.values(qtys).filter((value) => value.trim() !== '' && Number(value) !== 0).length,
    [qtys],
  )

  function setQty(productId: string, value: string) {
    setQtys((prev) => ({ ...prev, [productId]: value }))
  }

  function applyQtysFromItems(
    base: Record<string, string>,
    items: Array<{ product_id: string | null; quantity: number }>,
  ) {
    const next = { ...base }
    for (const key of Object.keys(next)) next[key] = ''
    for (const item of items) {
      if (!item.product_id) continue
      next[item.product_id] = String(item.quantity)
    }
    return next
  }

  function dismissSavePopup() {
    setSavePopup(null)
    setSaveToastPaused(false)
  }

  async function handleSelectRoute(nextRouteId: string) {
    setSavePopup(null)
    setRouteAreaId(nextRouteId)
    const selected = routes.find((route) => route.id === nextRouteId)
    setRouteArea(selected?.name ?? '')
    setEditingLoadId(null)

    if (!nextRouteId) {
      setPlateNo('')
      setDriver('')
      setHelper('')
      setAhente('')
      setCrewLocked(false)
      setQtys(emptyQtyMap(groupsByCompany))
      return
    }

    if (needsFirstLoadRoutes) {
      const first = firstLoadByRouteId[nextRouteId]
      if (first) {
        setPlateNo(formatPlateNo(first.plate_no ?? ''))
        setDriver(formatPersonName(first.driver ?? ''))
        setHelper(formatPersonName(first.helper ?? ''))
        setAhente(formatPersonName(first.ahente ?? ''))
        setCrewLocked(true)
      }
    } else {
      setCrewLocked(false)
    }

    if (!loadKind) return
    const existing = await getRouteTempLoad(activeBranch, nextRouteId, loadKind)
    if (existing.data) {
      setEditingLoadId(existing.data.id)
      if (!needsFirstLoadRoutes) {
        setPlateNo(formatPlateNo(existing.data.plate_no ?? ''))
        setDriver(formatPersonName(existing.data.driver ?? ''))
        setHelper(formatPersonName(existing.data.helper ?? ''))
        setAhente(formatPersonName(existing.data.ahente ?? ''))
      }
      if (existing.data.load_at_text) setDateText(existing.data.load_at_text)
      const itemsResult = await getRouteTempLoadItems(existing.data.id)
      if (!itemsResult.error) {
        setQtys(applyQtysFromItems(emptyQtyMap(groupsByCompany), itemsResult.data))
      }
    } else {
      setEditingLoadId(null)
      setQtys(emptyQtyMap(groupsByCompany))
      if (!needsFirstLoadRoutes) {
        setPlateNo('')
        setDriver('')
        setHelper('')
        setAhente('')
      }
    }
  }

  function handleClear() {
    setRouteAreaId('')
    setRouteArea('')
    setPlateNo('')
    setDriver('')
    setHelper('')
    setAhente('')
    setDateText(formatRouteTxDateTime())
    setQtys(emptyQtyMap(groupsByCompany))
    setCompany('Pepsi')
    setCrewLocked(false)
    setEditingLoadId(null)
    setError(null)
    setSavePopup(null)
  }

  async function handleAddRoute(name: string) {
    if (!canManageRoutes || !isFirstLoad) {
      return 'Route / Area can only be added on Nabunturan First Load.'
    }
    setRouteSaving(true)
    const result = await addRouteArea(name, 'Nabunturan', user?.id)
    setRouteSaving(false)
    if (result.error) {
      setMissingRoutesTable(Boolean(result.missingTable))
      return result.error
    }
    if (result.data) {
      setRoutes((prev) =>
        [...prev, result.data!].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setRouteAreaId(result.data.id)
      setRouteArea(result.data.name)
      setMissingRoutesTable(false)
    }
    return null
  }

  async function handleSave() {
    if (!loadKind) return
    setSaving(true)
    setError(null)
    setSavePopup(null)

    const items = collectRouteQtyItems(groupsByCompany, qtys)
    const result = await saveRouteTempLoad({
      branch: activeBranch,
      loadKind,
      routeAreaId: routeAreaId || null,
      routeAreaName: routeArea,
      plateNo,
      driver,
      helper,
      ahente,
      loadAtText: dateText,
      items,
      createdBy: user?.id,
    })

    setSaving(false)
    if (result.error) {
      setMissingRoutesTable(Boolean(result.missingTable))
      setError(result.error)
      return
    }

    const kindLabel =
      loadKind === 'first_load'
        ? 'First Load'
        : loadKind === 'second_load'
          ? 'Second Load'
          : 'RFG'
    setEditingLoadId(result.data?.id ?? null)
    setSaveToastPaused(false)
    setSavePopup({
      updated: Boolean(result.updated),
      kindLabel,
      routeName: result.data?.route_area_name ?? routeArea,
      plateNo: result.data?.plate_no ?? plateNo,
      driver: result.data?.driver ?? driver,
      itemCount: items.length,
    })

    if (loadKind === 'first_load' && result.data?.route_area_id) {
      setFirstLoadByRouteId((prev) => ({
        ...prev,
        [result.data!.route_area_id!]: result.data!,
      }))
    }
  }

  async function copySql() {
    await navigator.clipboard.writeText(`${routeAreasSql}\n\n${routeTempLoadsSql}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  if (option === 'summary') {
    return <RouteSummaryPanel branch={activeBranch} onClose={onClose} />
  }

  if (!isLoadScreen) {
    return (
      <section className="rtx-panel no-print" aria-label={title}>
        <header className="rtx-panel__top">
          <div className="rtx-panel__top-main">
            <p className="rtx-panel__eyebrow">Route Transactions · {activeBranch}</p>
            <h1 className="rtx-panel__hero-title">{title}</h1>
          </div>
          {onClose ? (
            <button type="button" className="rtx-panel__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </header>
        <p className="rtx-panel__coming">This route screen is not set up yet.</p>
      </section>
    )
  }

  return (
    <>
      <section className="rtx-panel no-print" aria-label={title}>
        <header className="rtx-panel__top">
          <div className="rtx-panel__meta">
            <div className="rtx-field rtx-field--wide rtx-field--route">
              <span>ROUTE / AREA</span>
              <div className="rtx-route-row">
                <select
                  value={routeAreaId}
                  onChange={(event) => void handleSelectRoute(event.target.value)}
                  aria-label="Route / Area"
                >
                  <option value="">
                    {needsFirstLoadRoutes
                      ? 'Select route with a saved First Load…'
                      : 'Select route / area…'}
                  </option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name}
                    </option>
                  ))}
                </select>
                {canManageRoutes && isFirstLoad ? (
                  <button
                    type="button"
                    className="rtx-route-add"
                    onClick={() => setRouteAddOpen(true)}
                    aria-label="Add route / area"
                    title="Add route / area"
                  >
                    +
                  </button>
                ) : null}
              </div>
            </div>
            <label className="rtx-field rtx-field--plate">
              <span>PLATE #</span>
              <input
                type="text"
                value={plateNo}
                onChange={(event) => setPlateNo(formatPlateNo(event.target.value))}
                readOnly={crewLocked}
              />
            </label>
            <label className="rtx-field">
              <span>DRIVER</span>
              <input
                type="text"
                value={driver}
                onChange={(event) => setDriver(formatPersonName(event.target.value))}
                readOnly={crewLocked}
              />
            </label>
            <label className="rtx-field">
              <span>HELPER</span>
              <input
                type="text"
                value={helper}
                onChange={(event) => setHelper(formatPersonName(event.target.value))}
                readOnly={crewLocked}
              />
            </label>
            <label className="rtx-field">
              <span>AHENTE</span>
              <input
                type="text"
                value={ahente}
                onChange={(event) => setAhente(formatPersonName(event.target.value))}
                readOnly={crewLocked}
              />
            </label>
            <label className="rtx-field">
              <span>DATE</span>
              <input
                type="text"
                value={dateText}
                onChange={(event) => setDateText(event.target.value)}
              />
            </label>
          </div>

          <div className="rtx-panel__title-block">
            <p className="rtx-panel__eyebrow">{activeBranch} · temporary · resets daily</p>
            <h1 className="rtx-panel__hero-title">{title}</h1>
            {filledCount > 0 ? (
              <p className="rtx-panel__filled">
                {filledCount} product{filledCount === 1 ? '' : 's'} filled
              </p>
            ) : null}
          </div>

          {onClose ? (
            <button type="button" className="rtx-panel__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </header>

        <div className="rtx-panel__body">
          {missingRoutesTable && canManageRoutes ? (
            <div className="rtx-setup">
              <div>
                <strong>Route temporary storage setup required</strong>
                <p>
                  Run Route Areas + Route Temp Loads SQL in Supabase. Saves stay temporary for the
                  current day only (routine resets every day) and are not posted to inventory until
                  Summary finalizes them.
                </p>
              </div>
              <button type="button" className="rtx-btn rtx-btn--secondary" onClick={() => void copySql()}>
                {copied ? 'Copied' : 'Copy SQL'}
              </button>
            </div>
          ) : null}

          {needsFirstLoadRoutes && !loading && routes.length === 0 && !missingRoutesTable ? (
            <p className="rtx-empty">
              No routes with a saved First Load yet. Save a First Load first, then return here.
            </p>
          ) : null}

          <div className="rtx-tabs" role="tablist" aria-label="Company">
            {ROUTE_TX_COMPANIES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={company === item}
                className={
                  company === item
                    ? `rtx-tab rtx-tab--${item.toLowerCase()} is-active`
                    : `rtx-tab rtx-tab--${item.toLowerCase()}`
                }
                onClick={() => setCompany(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {error ? <p className="rtx-error">{error}</p> : null}
          {loading ? <p className="rtx-empty">Loading products…</p> : null}

          {!loading && groups.length === 0 ? (
            <p className="rtx-empty">
              No {company} products found. Check products marked for Nabunturan in Stock Keeping
              Unit.
            </p>
          ) : null}

          {!loading && groups.length > 0 ? (
            <div
              className={
                company === 'SMC' || company === 'Magnolia'
                  ? 'rtx-brands rtx-brands--split'
                  : 'rtx-brands'
              }
              aria-label={`${company} products`}
            >
              {groups.map((group) => {
                const splitWide = company === 'SMC' || company === 'Magnolia'
                const mid = Math.ceil(group.items.length / 2)
                const leftItems = splitWide ? group.items.slice(0, mid) : group.items
                const rightItems = splitWide ? group.items.slice(mid) : []

                return (
                  <section
                    key={group.id}
                    className={
                      splitWide ? 'rtx-brand-card rtx-brand-card--split' : 'rtx-brand-card'
                    }
                    aria-label={group.title}
                  >
                    <h2>{group.title}</h2>
                    {splitWide ? (
                      <div className="rtx-brand-card__columns">
                        <ul>
                          {leftItems.map((item) => (
                            <li key={item.id}>
                              <span>{item.label}</span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                inputMode="decimal"
                                className={
                                  (qtys[item.id] ?? '').trim() !== '' ? 'is-filled' : undefined
                                }
                                value={qtys[item.id] ?? ''}
                                onChange={(event) => setQty(item.id, event.target.value)}
                                aria-label={`Quantity for ${item.label}`}
                              />
                            </li>
                          ))}
                        </ul>
                        {rightItems.length > 0 ? (
                          <ul>
                            {rightItems.map((item) => (
                              <li key={item.id}>
                                <span>{item.label}</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  inputMode="decimal"
                                  className={
                                    (qtys[item.id] ?? '').trim() !== '' ? 'is-filled' : undefined
                                  }
                                  value={qtys[item.id] ?? ''}
                                  onChange={(event) => setQty(item.id, event.target.value)}
                                  aria-label={`Quantity for ${item.label}`}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : (
                      <ul>
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <span title={item.label}>{item.label}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              inputMode="decimal"
                              className={
                                (qtys[item.id] ?? '').trim() !== '' ? 'is-filled' : undefined
                              }
                              value={qtys[item.id] ?? ''}
                              onChange={(event) => setQty(item.id, event.target.value)}
                              aria-label={`Quantity for ${item.label}`}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          ) : null}

          <div className="rtx-actions">
            <button
              type="button"
              className="rtx-btn rtx-btn--primary"
              disabled={loading || saving || missingRoutesTable}
              onClick={() => void handleSave()}
            >
              {saving ? (isUpdating ? 'Updating…' : 'Saving…') : isUpdating ? 'Update' : 'Save'}
            </button>
            <button
              type="button"
              className="rtx-btn rtx-btn--secondary"
              disabled={loading || saving}
              onClick={handleClear}
            >
              Clear
            </button>
            {onClose ? (
              <button type="button" className="rtx-btn rtx-btn--ghost" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {canManageRoutes && isFirstLoad ? (
        <NameModal
          open={routeAddOpen}
          submitting={routeSaving}
          title="Add route / area"
          description="Saved for Nabunturan Route Transactions only."
          fieldLabel="Route / Area"
          placeholder="e.g. Nab. 1(smc)(N-Sebonga/ Magsaysay)"
          submitLabel="Add"
          onClose={() => setRouteAddOpen(false)}
          onSave={handleAddRoute}
        />
      ) : null}

      {savePopup ? (
        <div className="rtx-toast-backdrop" onClick={dismissSavePopup} role="presentation">
          <div
            className={`rtx-toast${saveToastPaused ? ' is-paused' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rtx-toast-title"
            aria-describedby="rtx-toast-detail"
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => setSaveToastPaused(true)}
            onMouseLeave={() => setSaveToastPaused(false)}
            onFocusCapture={() => setSaveToastPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSaveToastPaused(false)
              }
            }}
          >
            <div className="rtx-toast__glow" aria-hidden="true" />
            <div className="rtx-toast__check" aria-hidden="true">
              <svg viewBox="0 0 52 52" width="52" height="52">
                <path
                  className="rtx-toast__check-path"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 27l8 8 16-18"
                />
              </svg>
            </div>
            <p className="rtx-toast__eyebrow">Success</p>
            <h2 id="rtx-toast-title">
              {savePopup.updated ? `${savePopup.kindLabel} updated` : `${savePopup.kindLabel} saved`}
            </h2>
            <p id="rtx-toast-detail">
              Temporary {savePopup.kindLabel.toLowerCase()} for today — not posted to inventory yet.
            </p>
            <div className="rtx-toast__meta" aria-label="Saved record summary">
              <div className="rtx-toast__chip">
                <span>Route</span>
                <strong>{savePopup.routeName || '—'}</strong>
              </div>
              <div className="rtx-toast__chip">
                <span>Plate</span>
                <strong>{savePopup.plateNo.trim() || '—'}</strong>
              </div>
              <div className="rtx-toast__chip">
                <span>Driver</span>
                <strong>{savePopup.driver.trim() || '—'}</strong>
              </div>
              <div className="rtx-toast__chip is-count">
                <span>Products</span>
                <strong>{savePopup.itemCount}</strong>
              </div>
            </div>
            <div className="rtx-toast__actions">
              <button
                type="button"
                className="rtx-toast__btn rtx-toast__btn--ghost"
                onClick={() => {
                  dismissSavePopup()
                  handleClear()
                }}
              >
                Clear & new
              </button>
              <button
                type="button"
                className="rtx-toast__btn rtx-toast__btn--primary"
                onClick={dismissSavePopup}
              >
                OK
              </button>
            </div>
            <div
              className="rtx-toast__progress"
              aria-hidden="true"
              onAnimationEnd={() => {
                if (!saveToastPaused) dismissSavePopup()
              }}
            >
              <span />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
