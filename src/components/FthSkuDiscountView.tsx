import { useEffect, useState, type FormEvent } from 'react'
import { formatPrice, listCatalogTree, type CatalogTreeCategory } from '../lib/catalog'
import { listDiscountsForRoute, saveDiscountsForRoute } from '../lib/fth'
import './CatalogPanel.css'
import './FthDiscountPanel.css'

type FthSkuDiscountViewProps = {
  routeTypeId: string
}

export function FthSkuDiscountView({ routeTypeId }: FthSkuDiscountViewProps) {
  const [tree, setTree] = useState<CatalogTreeCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [discounts, setDiscounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [skuMissing, setSkuMissing] = useState(false)
  const [discountMissing, setDiscountMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

  async function loadCatalog() {
    const result = await listCatalogTree()
    setSkuMissing(result.missingTable)
    if (result.missingTable || result.error) {
      setTree([])
      setActiveCategoryId(null)
      return { ok: false, error: result.error }
    }
    setTree(result.data)
    setActiveCategoryId((prev) =>
      prev && result.data.some((item) => item.id === prev) ? prev : result.data[0]?.id ?? null,
    )
    return { ok: true, error: null as string | null }
  }

  async function loadDiscounts() {
    const result = await listDiscountsForRoute(routeTypeId)
    setDiscountMissing(result.missingTable)
    if (result.missingTable || result.error) {
      setDiscounts({})
      return { ok: false, error: result.error }
    }
    setDiscounts(result.data)
    return { ok: true, error: null as string | null }
  }

  async function loadAll() {
    setLoading(true)
    setError(null)
    setSaved(false)

    const [catalogResult, discountResult] = await Promise.all([loadCatalog(), loadDiscounts()])

    if (!catalogResult.ok && catalogResult.error) setError(catalogResult.error)
    else if (!discountResult.ok && discountResult.error) setError(discountResult.error)

    setLoading(false)
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when route changes
  }, [routeTypeId])

  const activeCategory = tree.find((item) => item.id === activeCategoryId) ?? null

  function allProducts() {
    return tree.flatMap((category) =>
      category.subcategories.flatMap((sub) =>
        sub.products.map((product) => ({ id: product.id, name: product.name })),
      ),
    )
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSaved(false)

    const result = await saveDiscountsForRoute(
      routeTypeId,
      allProducts().map((product) => ({
        productId: product.id,
        discount: discounts[product.id] ?? '',
      })),
    )

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
    await loadDiscounts()
  }

  if (loading) {
    return <p className="catalog-empty">Loading SKU products…</p>
  }

  if (skuMissing) {
    return (
      <p className="catalog-empty">
        <span className="catalog-empty-title">Stock Keeping Unit not set up</span>
        Register products in Stock Keeping Unit first, then return here to set discounts.
      </p>
    )
  }

  if (discountMissing) {
    return (
      <p className="catalog-empty">
        <span className="catalog-empty-title">FTH discount table missing</span>
        Run the FTH SQL in the setup card above, then refresh.
      </p>
    )
  }

  if (tree.length === 0) {
    return (
      <p className="catalog-empty">
        <span className="catalog-empty-title">No SKU products yet</span>
        Add categories and products in Stock Keeping Unit first.
      </p>
    )
  }

  return (
    <form className="fth-sku-discount" onSubmit={(event) => void handleSave(event)}>
      {error ? <p className="catalog-error">{error}</p> : null}

      <div className="category-section">
        <div className="category-tabs-row">
          <div className="category-tabs" role="tablist" aria-label="SKU categories">
            {tree.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={category.id === activeCategoryId}
                className={
                  category.id === activeCategoryId ? 'category-tab is-active' : 'category-tab'
                }
                onClick={() => setActiveCategoryId(category.id)}
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
                        <span className="product-price">{formatPrice(Number(product.price))}</span>
                        <input
                          className={`fth-discount-input${
                            discounts[product.id] !== undefined &&
                            discounts[product.id] !== null &&
                            String(discounts[product.id]).trim() !== ''
                              ? ' fg-qty-filled'
                              : ''
                          }`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={discounts[product.id] ?? ''}
                          onChange={(event) =>
                            setDiscounts((prev) => ({
                              ...prev,
                              [product.id]: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                          aria-label={`Discount for ${product.name}`}
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

      <div className="fth-save-bar">
        <button type="submit" className="btn-mini" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save discounts'}
        </button>
        {saved ? <span className="fth-save-note">Saved for this route type.</span> : null}
      </div>
    </form>
  )
}
