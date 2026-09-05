import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listCatalogTree } from '../lib/catalog'
import {
  boActualInventoryCategory,
  findBoCatalogCategory,
  type BoInOutMeta,
} from '../lib/boBadOrder'
import {
  getActualInventory,
  saveActualInventory,
} from '../lib/actualInventory'
import schemaSql from '../../supabase/actual_inventory_schema.sql?raw'
import './CatalogPanel.css'
import './FthDiscountPanel.css'
import './ActualInventoryPanel.css'

type BoAccInventoryPanelProps = {
  company: BoInOutMeta['company']
  onClose: () => void
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function BoAccInventoryPanel({ company, onClose }: BoAccInventoryPanelProps) {
  const { user } = useAuth()
  const categoryKey = boActualInventoryCategory(company)
  const [monthValue, setMonthValue] = useState(currentMonthValue)
  const [subcategories, setSubcategories] = useState<
    Array<{ id: string; name: string; products: Array<{ id: string; name: string }> }>
  >([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setSaved(false)

      const catalogResult = await listCatalogTree()
      if (cancelled) return

      if (catalogResult.error) {
        setSubcategories([])
        setError(catalogResult.error)
        setLoading(false)
        return
      }

      const category = findBoCatalogCategory(catalogResult.data, company)
      const nextSubs =
        category?.subcategories
          .filter((sub) => sub.name.trim().toLowerCase() !== 'pallets')
          .map((sub) => ({
            id: sub.id,
            name: sub.name,
            products: sub.products.map((product) => ({ id: product.id, name: product.name })),
          })) ?? []
      setSubcategories(nextSubs)

      const savedResult = await getActualInventory(categoryKey, monthValue)
      if (cancelled) return

      setMissingTable(savedResult.missingTable)
      if (savedResult.error) {
        setError(savedResult.error)
        setQuantities({})
        setLoading(false)
        return
      }

      const nextQty: Record<string, string> = {}
      for (const item of savedResult.data?.items ?? []) {
        if (item.product_id) {
          nextQty[item.product_id] = String(Number(item.quantity) || '')
        }
      }
      setQuantities(nextQty)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [company, categoryKey, monthValue])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const items = subcategories.flatMap((sub) =>
      sub.products
        .map((product) => {
          const raw = (quantities[product.id] ?? '').trim()
          if (!raw) return null
          const quantity = Number(raw)
          if (!Number.isFinite(quantity) || quantity < 0) return null
          return {
            section: 'fg' as const,
            productId: product.id,
            subcategoryName: sub.name,
            productName: product.name,
            quantity,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null),
    )

    const result = await saveActualInventory({
      category: categoryKey,
      monthValue,
      items,
      createdBy: user?.id,
    })
    setSaving(false)

    if (result.missingTable) {
      setMissingTable(true)
      setError(result.error)
      return
    }
    if (result.error) {
      setError(result.error)
      return
    }

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  async function copySql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="actual-inventory" aria-label={`AI - BO ${company}`}>
      <header className="fth-head actual-inventory-head bo-acc-inventory-head">
        <div className="bo-acc-inventory-head__left">
          <h1>AI - BO {company}</h1>
          <div className="actual-inventory-head-actions">
            <label className="actual-inventory-month">
              <span>Month</span>
              <input
                type="month"
                value={monthValue}
                onChange={(event) => setMonthValue(event.target.value)}
              />
            </label>
            <button type="button" className="btn-secondary" onClick={onClose}>
              ← Back
            </button>
          </div>
        </div>
      </header>

      {missingTable ? (
        <div className="catalog-setup">
          <div>
            <strong>Actual Inventory setup required</strong>
            <p>
              Run the Actual Inventory SQL in Supabase (same tables as Actual Inventory), then save
              again.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void copySql()}>
            {copied ? 'Copied' : 'Copy SQL'}
          </button>
        </div>
      ) : null}

      {loading ? <p className="catalog-empty">Loading products…</p> : null}
      {error ? <p className="catalog-error">{error}</p> : null}

      {!loading && subcategories.length === 0 ? (
        <p className="catalog-empty">
          <span className="catalog-empty-title">No {company} products yet</span>
          Add SKU products under {company === 'PC' ? 'PCPPI' : company} first.
        </p>
      ) : null}

      {!loading && subcategories.length > 0 ? (
        <form className="fth-sku-discount" onSubmit={(event) => void handleSave(event)}>
          <div className="category-panel">
            <div className="subcategory-stack">
              {subcategories.map((subcategory) => (
                <section key={subcategory.id} className="subcategory-group">
                  <header className="subcategory-group__header">
                    <h3>{subcategory.name}</h3>
                  </header>
                  <div className="product-list">
                    {subcategory.products.map((product) => (
                      <div key={product.id} className="product-chip fth-discount-chip">
                        <span className="product-name">{product.name}</span>
                        <input
                          className={`fth-discount-input${
                            String(quantities[product.id] ?? '').trim() !== '' ? ' fg-qty-filled' : ''
                          }`}
                          type="number"
                          min="0"
                          step="0.001"
                          value={quantities[product.id] ?? ''}
                          onChange={(event) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [product.id]: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                          aria-label={`Actual BO inventory for ${product.name}`}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="fth-save-bar">
            <button type="submit" className="btn-mini" disabled={saving || missingTable}>
              {saving ? 'Saving…' : 'Save BO actual inventory'}
            </button>
            {saved ? <span className="fth-save-note">Saved.</span> : null}
          </div>
        </form>
      ) : null}
    </section>
  )
}
