import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listCatalogTree, type CatalogTreeCategory } from '../lib/catalog'
import {
  addFullGoodsMovement,
  addLocation,
  deleteFullGoodsMovement,
  deleteLocation,
  getNextSeriesLoadNumber,
  isPresetLoadNumber,
  listFullGoodsMovements,
  listLoadNumberOptions,
  listLocations,
  searchFullGoodsMovements,
  updateFullGoodsMovement,
  updateLocation,
} from '../lib/fullGoods'
import type { FullGoodsLocation, FullGoodsMovement, FullGoodsMovementType } from '../types/fullGoods'
import schemaSql from '../../supabase/full_goods_schema.sql?raw'
import { NameModal } from './AddCategoryModal'
import './FullGoodsPanel.css'
import './CatalogPanel.css'
import './FthDiscountPanel.css'
import './AddUserModal.css'

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isEmptiesCategory(name: string) {
  return name.trim().toLowerCase() === 'empties'
}

function isPalletsCategory(name: string) {
  return name.trim().toLowerCase() === 'pallets'
}

const EMPTIES_TAB_ORDER = ['pepsi mts', 'smc mts', 'magnolia mts', 'magnoia mts']

function normalizeTabName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isPreferredEmptiesTab(name: string) {
  const normalized = normalizeTabName(name)
  return (
    normalized === 'pepsi mts' ||
    normalized === 'smc mts' ||
    normalized === 'magnolia mts' ||
    normalized === 'magnoia mts'
  )
}

function sortEmptiesTabs<T extends { name: string }>(tabs: T[]) {
  return [...tabs].sort((a, b) => {
    const aRank = EMPTIES_TAB_ORDER.indexOf(normalizeTabName(a.name))
    const bRank = EMPTIES_TAB_ORDER.indexOf(normalizeTabName(b.name))
    const left = aRank === -1 ? 999 : aRank
    const right = bRank === -1 ? 999 : bRank
    if (left !== right) return left - right
    return a.name.localeCompare(b.name)
  })
}

function buildEmptiesTabs(tree: CatalogTreeCategory[]): {
  tabs: CatalogTreeCategory[]
  parentId: string | null
} {
  const empties = tree.find((category) => isEmptiesCategory(category.name))
  if (!empties) {
    return { tabs: [], parentId: null }
  }

  const preferred = empties.subcategories.filter((sub) => isPreferredEmptiesTab(sub.name))
  const source = preferred.length > 0 ? preferred : empties.subcategories
  const tabs = sortEmptiesTabs(source).map((sub) => ({
    id: sub.id,
    name: sub.name,
    created_at: sub.created_at,
    created_by: null,
    subcategories: [
      {
        ...sub,
        products: sub.products,
      },
    ],
  })) as CatalogTreeCategory[]

  return { tabs, parentId: empties.id }
}

type FullGoodsPanelProps = {
  mode?: 'fullGoods' | 'empties'
}

export function FullGoodsPanel({ mode = 'fullGoods' }: FullGoodsPanelProps) {
  const { user } = useAuth()
  const isEmptiesMode = mode === 'empties'
  const goodsLabel = isEmptiesMode ? 'Empties' : 'Full Goods'
  const [tree, setTree] = useState<CatalogTreeCategory[]>([])
  const [emptiesParentId, setEmptiesParentId] = useState<string | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<FullGoodsLocation[]>([])
  const [locationId, setLocationId] = useState<string | null>(null)
  const [loadOptions, setLoadOptions] = useState<string[]>(['1', 'BO', 'OTHERS'])
  const [nextSeries, setNextSeries] = useState('1')
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [skuMissing, setSkuMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [locationSubmitting, setLocationSubmitting] = useState(false)
  const [savePopup, setSavePopup] = useState<{
    title: string
    detail: string
  } | null>(null)
  const [locationModal, setLocationModal] = useState<'add' | 'edit' | null>(null)

  const [movementType, setMovementType] = useState<FullGoodsMovementType>('in')
  const [movementDate, setMovementDate] = useState(todayIsoDate())
  const [truckNumber, setTruckNumber] = useState('')
  const [loadNumber, setLoadNumber] = useState('1')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FullGoodsMovement[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  const selectedLocation = locations.find((item) => item.id === locationId) ?? null

  const visibleTree = useMemo(() => {
    if (isEmptiesMode) {
      return buildEmptiesTabs(tree).tabs
    }
    return tree.filter(
      (category) => !isEmptiesCategory(category.name) && !isPalletsCategory(category.name),
    )
  }, [tree, isEmptiesMode])

  async function refreshLoadOptions(preferLoad?: string | null, keepPreset = false) {
    const seriesMode = isEmptiesMode ? 'empties' : 'fullGoods'
    const loadResult = await listLoadNumberOptions(movementDate, seriesMode, emptiesParentId)
    setLoadOptions(loadResult.data)
    setNextSeries(loadResult.nextSeries)

    if (preferLoad && loadResult.data.includes(preferLoad)) {
      setLoadNumber(preferLoad)
    } else if (keepPreset && isPresetLoadNumber(loadNumber)) {
      setLoadNumber(loadNumber.trim().toUpperCase())
    } else {
      setLoadNumber(loadResult.nextSeries)
    }

    return loadResult
  }

  async function load(preferLoad?: string | null, preferLocationId?: string | null) {
    setLoading(true)
    setError(null)

    const [catalogResult, locationsResult] = await Promise.all([listCatalogTree(), listLocations()])

    setSkuMissing(catalogResult.missingTable)
    setMissingTable(locationsResult.missingTable)
    setError(locationsResult.error ?? catalogResult.error)
    setTree(catalogResult.data)

    let filtered: CatalogTreeCategory[] = []

    if (isEmptiesMode) {
      const empties = buildEmptiesTabs(catalogResult.data)
      filtered = empties.tabs
      setEmptiesParentId(empties.parentId)
    } else {
      filtered = catalogResult.data.filter(
        (category) => !isEmptiesCategory(category.name) && !isPalletsCategory(category.name),
      )
      setEmptiesParentId(null)
    }

    let nextCategoryId: string | null = null
    setActiveCategoryId((prev) => {
      nextCategoryId =
        prev && filtered.some((item) => item.id === prev) ? prev : filtered[0]?.id ?? null
      return nextCategoryId
    })

    const loadResult = await refreshLoadOptions(preferLoad, false)
    if (loadResult.missingTable) setMissingTable(true)
    if (loadResult.error) setError(loadResult.error)

    setLocations(locationsResult.data)
    const nextLocationId =
      preferLocationId && locationsResult.data.some((item) => item.id === preferLocationId)
        ? preferLocationId
        : locationsResult.data[0]?.id ?? null
    setLocationId(nextLocationId)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [mode])

  useEffect(() => {
    if (loading || editingId) return
    void refreshLoadOptions(null, true)
  }, [movementDate])

  const activeCategory = visibleTree.find((item) => item.id === activeCategoryId) ?? null
  const categoryLabel = activeCategory?.name.trim() ?? ''
  const headerTitle = isEmptiesMode
    ? `${categoryLabel ? `${categoryLabel} ` : ''}Empties ${movementType === 'in' ? 'In' : 'Out'}`
    : `${categoryLabel ? `${categoryLabel} ` : ''}Full Goods ${
        movementType === 'in' ? 'In' : 'Out'
      }`

  function selectCategory(categoryId: string) {
    setActiveCategoryId(categoryId)
  }

  async function copySql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveLocation(name: string) {
    if (!locationModal) return 'Nothing to save.'

    setLocationSubmitting(true)
    setError(null)

    const result =
      locationModal === 'edit' && selectedLocation
        ? await updateLocation(selectedLocation.id, name)
        : await addLocation(name, user?.id)

    setLocationSubmitting(false)

    if (result.error) return result.error

    await load(loadNumber, result.data?.id ?? locationId)
    return null
  }

  async function handleDeleteLocation() {
    if (!selectedLocation) return
    if (!window.confirm(`Delete location "${selectedLocation.name}"?`)) return

    setError(null)
    const result = await deleteLocation(selectedLocation.id)
    if (result.error) {
      setError(result.error)
      return
    }
    await load(loadNumber, null)
  }

  function clearForm() {
    setEditingId(null)
    setTruckNumber('')
    setQuantities({})
    setMovementDate(todayIsoDate())
    setMovementType('in')
  }

  async function clearAndRefresh() {
    clearForm()
    await refreshLoadOptions(null, false)
  }

  function collectCategoryItems(category: CatalogTreeCategory) {
    type LineItem = {
      product_id: string
      product_name: string
      brand_id: string
      brand_name: string
      quantity: number
    }

    const lines: Array<LineItem | { invalid: true }> = []

    for (const sub of category.subcategories) {
      for (const product of sub.products) {
        const raw = (quantities[product.id] ?? '').trim()
        if (!raw) continue
        const quantity = Number(raw)
        if (!Number.isFinite(quantity) || quantity < 0) {
          lines.push({ invalid: true })
          continue
        }
        if (quantity === 0) continue
        lines.push({
          product_id: product.id,
          product_name: product.name,
          brand_id: sub.id,
          brand_name: sub.name,
          quantity,
        })
      }
    }

    if (lines.some((item) => 'invalid' in item)) {
      return { items: [] as LineItem[], invalid: true }
    }

    return {
      items: lines.filter((item): item is LineItem => !('invalid' in item)),
      invalid: false,
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (!selectedLocation) {
        setError('Add or select a location first.')
        return
      }

      const currentEditingId = editingId

      // Editing updates only that one category record.
      if (currentEditingId) {
        if (!activeCategory) {
          setError('Select a category tab first.')
          return
        }

        const { items, invalid } = collectCategoryItems(activeCategory)
        if (invalid) {
          setError('Enter a valid quantity for every filled product.')
          return
        }
        if (items.length === 0) {
          setError('Enter quantity for at least one product in this category.')
          return
        }

        if (isEmptiesMode && !emptiesParentId) {
          setError('Add a category named Empties in Stock Keeping Unit first.')
          return
        }

        const result = await updateFullGoodsMovement(currentEditingId, {
          movement_type: movementType,
          movement_date: movementDate,
          truck_number: truckNumber,
          load_number: loadNumber,
          location: selectedLocation.name,
          location_id: selectedLocation.id,
          category_id: isEmptiesMode ? emptiesParentId! : activeCategory.id,
          category_name: activeCategory.name,
          items: isEmptiesMode
            ? items.map((item) => ({
                ...item,
                brand_id: activeCategory.id,
                brand_name: activeCategory.name,
              }))
            : items,
        })

        if (result.error) {
          setError(result.error)
          return
        }

        clearForm()
        setSavePopup({
          title: 'Record updated',
          detail: `${activeCategory.name} ${goodsLabel} ${
            movementType === 'in' ? 'In' : 'Out'
          } for ${selectedLocation.name} was updated.`,
        })
        await load(null, locationId)
        if (searchOpen) void runSearch(searchQuery)
        return
      }

      if (isEmptiesMode && !emptiesParentId) {
        setError('Add a category named Empties in Stock Keeping Unit first.')
        return
      }

      // New save: one separate record per category/tab that has quantities.
      const categoryPayloads = visibleTree.map((category) => {
        const collected = collectCategoryItems(category)
        return { category, ...collected }
      })

      if (categoryPayloads.some((entry) => entry.invalid)) {
        setError('Enter a valid quantity for every filled product.')
        return
      }

      const toSave = categoryPayloads.filter((entry) => entry.items.length > 0)
      if (toSave.length === 0) {
        setError('Enter quantity for at least one product in any category.')
        return
      }

      const usePreset = isPresetLoadNumber(loadNumber)

      for (const entry of toSave) {
        let loadForCategory = String(loadNumber ?? '').trim()
        if (!usePreset) {
          const seriesResult = await getNextSeriesLoadNumber(
            movementDate,
            isEmptiesMode ? 'empties' : 'fullGoods',
            emptiesParentId,
          )
          if (seriesResult.error) {
            setError(
              toSave.length > 1
                ? `${entry.category.name}: ${seriesResult.error}`
                : seriesResult.error,
            )
            return
          }
          loadForCategory = String(seriesResult.data)
        }

        const result = await addFullGoodsMovement(
          {
            movement_type: movementType,
            movement_date: movementDate,
            truck_number: truckNumber,
            load_number: loadForCategory,
            location: selectedLocation.name,
            location_id: selectedLocation.id,
            category_id: isEmptiesMode ? emptiesParentId! : entry.category.id,
            category_name: entry.category.name,
            items: isEmptiesMode
              ? entry.items.map((item) => ({
                  ...item,
                  brand_id: entry.category.id,
                  brand_name: entry.category.name,
                }))
              : entry.items,
          },
          user?.id,
        )

        if (result.error) {
          setError(
            toSave.length > 1 ? `${entry.category.name}: ${result.error}` : result.error,
          )
          return
        }
      }

      clearForm()
      const typeLabel = movementType === 'in' ? 'In' : 'Out'
      const names = toSave.map((entry) => entry.category.name).join(', ')
      setSavePopup({
        title: toSave.length > 1 ? 'Records saved' : 'Record saved',
        detail:
          toSave.length > 1
            ? `${names} ${goodsLabel} ${typeLabel} for ${selectedLocation.name} were saved.`
            : `${names} ${goodsLabel} ${typeLabel} for ${selectedLocation.name} was saved.`,
      })
      await load(null, locationId)
      if (searchOpen) void runSearch(searchQuery)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while saving.')
    } finally {
      setSubmitting(false)
    }
  }

  async function openSearch() {
    setSearchOpen(true)
    await runSearch(searchQuery)
  }

  async function runSearch(query = searchQuery) {
    setSearching(true)
    setError(null)
    const result = await listFullGoodsMovements()
    setSearching(false)

    if (result.error) {
      setError(result.error)
      setSearchResults([])
      return
    }

    const byCategory = activeCategoryId
      ? result.data.filter((item) => {
          if (isEmptiesMode) {
            return (
              item.brand_id === activeCategoryId ||
              normalizeTabName(item.category_name ?? '') ===
                normalizeTabName(activeCategory?.name ?? '') ||
              (item.items ?? []).some((line) => line.brand_id === activeCategoryId)
            )
          }
          return item.category_id === activeCategoryId
        })
      : isEmptiesMode && emptiesParentId
        ? result.data.filter((item) => item.category_id === emptiesParentId)
        : result.data

    setSearchResults(searchFullGoodsMovements(byCategory, query))
  }

  function handleEdit(movement: FullGoodsMovement) {
    setSearchOpen(false)
    setEditingId(movement.id)
    setMovementType(movement.movement_type)
    setMovementDate(movement.movement_date)
    setTruckNumber(String(movement.truck_number ?? ''))
    const load = String(movement.load_number ?? '')
    setLoadNumber(load)
    setLoadOptions((prev) => (prev.includes(load) ? prev : [load, ...prev]))

    if (movement.location_id && locations.some((item) => item.id === movement.location_id)) {
      setLocationId(movement.location_id)
    } else {
      const match = locations.find(
        (item) => item.name.toLowerCase() === (movement.location ?? '').toLowerCase(),
      )
      if (match) setLocationId(match.id)
    }

    if (isEmptiesMode) {
      const brandFromItems = (movement.items ?? []).find((item) => item.brand_id)?.brand_id
      const tabId =
        movement.brand_id ||
        brandFromItems ||
        visibleTree.find(
          (tab) =>
            normalizeTabName(tab.name) === normalizeTabName(movement.category_name ?? ''),
        )?.id ||
        null
      if (tabId) setActiveCategoryId(tabId)
    } else if (movement.category_id) {
      setActiveCategoryId(movement.category_id)
    }

    const nextQuantities: Record<string, string> = {}
    for (const item of movement.items ?? []) {
      if (item.product_id) nextQuantities[item.product_id] = String(item.quantity)
    }
    setQuantities(nextQuantities)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this full goods record?')) return
    setError(null)
    const result = await deleteFullGoodsMovement(id)
    if (result.error) {
      setError(result.error)
      return
    }
    if (editingId === id) clearForm()
    await load(null, locationId)
    if (searchOpen) await runSearch(searchQuery)
  }

  return (
    <section className="fg">
      <div className="fg-head">
        <div>
          <h1>{headerTitle}</h1>
        </div>
      </div>

      {missingTable ? (
        <div className="catalog-setup">
          <div>
            <strong>Full Goods setup required</strong>
            <p>
              Full Goods tables are missing or outdated. Click <b>Copy SQL</b>, paste it in the{' '}
              <a
                href="https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new"
                target="_blank"
                rel="noreferrer"
              >
                SQL Editor
              </a>
              , press <b>Run</b>, then Refresh. This adds location/category columns and uses one
              load-number series per month for Full Goods and Empties.
            </p>
          </div>
          <div className="catalog-setup-actions">
            <button type="button" className="btn-secondary" onClick={() => void copySql()}>
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
            <button type="button" className="btn-primary-setup" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      {error && !missingTable ? <p className="catalog-error">{error}</p> : null}

      {!missingTable ? (
        <form className="fg-form-shell" onSubmit={(event) => void handleSubmit(event)}>
          {editingId ? (
            <div className="fg-edit-banner">
              <span>Editing saved record</span>
              <button type="button" className="btn-ghost-mini" onClick={() => void clearAndRefresh()}>
                Cancel edit
              </button>
            </div>
          ) : null}

          <div className="fg-form">
            <label className="fg-field">
              <span>Type</span>
              <select
                value={movementType}
                onChange={(event) => setMovementType(event.target.value as FullGoodsMovementType)}
              >
                <option value="in">{isEmptiesMode ? 'Empties in' : 'Full goods in'}</option>
                <option value="out">{isEmptiesMode ? 'Empties out' : 'Full goods out'}</option>
              </select>
            </label>

            <label className="fg-field">
              <span>Date</span>
              <input
                type="date"
                value={movementDate}
                onChange={(event) => setMovementDate(event.target.value)}
                required
              />
            </label>

            <label className="fg-field">
              <span>Truck number</span>
              <input
                value={truckNumber}
                onChange={(event) => setTruckNumber(event.target.value)}
                placeholder="ABC-1234"
                required
              />
            </label>

            <label className="fg-field">
              <span>Load number</span>
              <select
                value={loadNumber}
                onChange={(event) => setLoadNumber(event.target.value)}
                required
                aria-label="Load number"
              >
                {loadOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === nextSeries ? `${option} (series)` : option}
                  </option>
                ))}
              </select>
            </label>

            <div className="fg-field fg-location-field">
              <span>Location</span>
              <div className="fg-location-row">
                <select
                  value={locationId ?? ''}
                  disabled={loading || locations.length === 0}
                  onChange={(event) => setLocationId(event.target.value || null)}
                  required={locations.length > 0}
                  aria-label="Location"
                >
                  {locations.length === 0 ? (
                    <option value="">No locations yet</option>
                  ) : (
                    locations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="fg-location-add"
                  aria-label="Add location"
                  title="Add location"
                  disabled={loading}
                  onClick={() => setLocationModal('add')}
                >
                  +
                </button>
                {selectedLocation ? (
                  <>
                    <button
                      type="button"
                      className="catalog-edit"
                      aria-label="Edit location"
                      title="Edit location"
                      onClick={() => setLocationModal('edit')}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="catalog-delete"
                      onClick={() => void handleDeleteLocation()}
                    >
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {loading ? <p className="catalog-empty">Loading SKU products…</p> : null}

          {!loading && skuMissing ? (
            <p className="catalog-empty">
              <span className="catalog-empty-title">Stock Keeping Unit not set up</span>
              Register products in Stock Keeping Unit first.
            </p>
          ) : null}

          {!loading && !skuMissing && visibleTree.length === 0 ? (
            <p className="catalog-empty">
              <span className="catalog-empty-title">
                {isEmptiesMode
                  ? emptiesParentId
                    ? 'No Empties brands yet'
                    : 'No Empties category yet'
                  : 'No SKU products yet'}
              </span>
              {isEmptiesMode
                ? emptiesParentId
                  ? 'Under Empties, add brands named Pepsi MTS, SMC MTS, and Magnolia MTS.'
                  : 'Add a category named Empties in Stock Keeping Unit first.'
                : 'Add categories and products in Stock Keeping Unit first.'}
            </p>
          ) : null}

          {!loading && !skuMissing && visibleTree.length > 0 ? (
            <div className="category-section">
              <div className="category-tabs-row">
                <div
                  className="category-tabs"
                  role="tablist"
                  aria-label={isEmptiesMode ? 'Empties brands' : 'SKU categories'}
                >
                  {visibleTree.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      role="tab"
                      aria-selected={category.id === activeCategoryId}
                      className={
                        category.id === activeCategoryId
                          ? 'category-tab is-active'
                          : 'category-tab'
                      }
                      onClick={() => selectCategory(category.id)}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>

              {activeCategory ? (
                <div className="category-panel" role="tabpanel">
                  <div className="subcategory-stack">
                    {activeCategory.subcategories.length === 0 ? (
                      <p className="group-empty">No subcategories in this SKU category.</p>
                    ) : null}

                    {activeCategory.subcategories.map((subcategory) => (
                      <section key={subcategory.id} className="subcategory-group">
                        <header className="subcategory-group__header">
                          <h3>{subcategory.name}</h3>
                        </header>

                        <div className="product-list">
                          {subcategory.products.length === 0 ? (
                            <p className="product-empty">No products yet.</p>
                          ) : null}
                          {subcategory.products.map((product) => (
                            <div key={product.id} className="product-chip fth-discount-chip">
                              <span className="product-name">{product.name}</span>
                              <input
                                className={`fth-discount-input${
                                  quantities[product.id] !== undefined &&
                                  quantities[product.id] !== null &&
                                  String(quantities[product.id]).trim() !== ''
                                    ? ' fg-qty-filled'
                                    : ''
                                }`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={quantities[product.id] ?? ''}
                                onChange={(event) =>
                                  setQuantities((prev) => ({
                                    ...prev,
                                    [product.id]: event.target.value,
                                  }))
                                }
                                placeholder="Qty"
                                aria-label={`Quantity for ${product.name}`}
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="fg-form-actions">
            <button
              type="submit"
              className="btn-mini"
              disabled={submitting || loading || skuMissing || locations.length === 0}
            >
              {submitting ? 'Saving…' : editingId ? 'Update record' : 'Save record'}
            </button>
            {editingId ? (
              <button
                type="button"
                className="catalog-delete"
                disabled={submitting || loading}
                onClick={() => void handleDelete(editingId)}
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="btn-ghost-mini"
              disabled={searching || missingTable}
              onClick={() => void openSearch()}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
            <button
              type="button"
              className="btn-ghost-mini"
              disabled={submitting || loading}
              onClick={() => void clearAndRefresh()}
            >
              Clear
            </button>
          </div>
        </form>
      ) : null}

      {!loading && !missingTable && locations.length === 0 ? (
        <p className="catalog-empty">
          <span className="catalog-empty-title">No locations yet</span>
          Click + next to Location to add one.
        </p>
      ) : null}

      {searchOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setSearchOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel fg-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fg-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="fg-search-title">Saved records</h2>
                <p>
                  {activeCategory
                    ? `Showing ${activeCategory.name} only. Edit a row to update it.`
                    : 'Search and open a record to edit.'}
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSearchOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="fg-search-modal-body">
              <div className="fg-search-row">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void runSearch()
                    }
                  }}
                  placeholder="Date, truck, load no., location…"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-mini"
                  disabled={searching}
                  onClick={() => void runSearch()}
                >
                  {searching ? '…' : 'Go'}
                </button>
              </div>

              {searching ? <p className="catalog-empty">Loading…</p> : null}

              {!searching && searchResults.length === 0 ? (
                <p className="catalog-empty">
                  <span className="catalog-empty-title">No matching records</span>
                  {activeCategory
                    ? `No ${activeCategory.name} records match this search.`
                    : 'Try a different search term.'}
                </p>
              ) : null}

              {!searching && searchResults.length > 0 ? (
                <div className="fg-table-wrap">
                  <table className="fg-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Truck no.</th>
                        <th>Load no.</th>
                        <th>Location</th>
                        <th>Category</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((item) => (
                        <tr key={item.id}>
                          <td>{item.movement_date}</td>
                          <td>{item.truck_number}</td>
                          <td>{item.load_number}</td>
                          <td>{item.location}</td>
                          <td>{item.category_name ?? '—'}</td>
                          <td className="fg-row-actions">
                            <button
                              type="button"
                              className="catalog-edit"
                              aria-label="Edit record"
                              title="Edit"
                              onClick={() => handleEdit(item)}
                            >
                              <PencilIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {savePopup ? (
        <div
          className="modal-backdrop fg-toast-backdrop"
          onClick={() => setSavePopup(null)}
          role="presentation"
        >
          <div
            className="fg-toast"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fg-toast-title"
            aria-describedby="fg-toast-detail"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="fg-toast-check" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 id="fg-toast-title">{savePopup.title}</h2>
            <p id="fg-toast-detail">{savePopup.detail}</p>
            <button type="button" className="btn-mini fg-toast-ok" onClick={() => setSavePopup(null)}>
              OK
            </button>
          </div>
        </div>
      ) : null}

      <NameModal
        open={locationModal === 'add'}
        submitting={locationSubmitting}
        title="Add location"
        description="Create a location you can reuse on full goods records."
        fieldLabel="Location name"
        placeholder="Warehouse A"
        submitLabel="Save location"
        onClose={() => setLocationModal(null)}
        onSave={handleSaveLocation}
      />

      <NameModal
        open={locationModal === 'edit'}
        submitting={locationSubmitting}
        title="Edit location"
        description="Rename this location. Existing records keep the name they were saved with."
        fieldLabel="Location name"
        placeholder="Warehouse A"
        submitLabel="Save changes"
        initialName={selectedLocation?.name ?? ''}
        onClose={() => setLocationModal(null)}
        onSave={handleSaveLocation}
      />
    </section>
  )
}
