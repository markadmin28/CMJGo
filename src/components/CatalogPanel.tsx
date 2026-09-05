import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  addCategory,
  addProduct,
  addSubcategory,
  capitalizeFirst,
  deleteCategory,
  deleteProduct,
  deleteSubcategory,
  formatPrice,
  listCatalogTree,
  updateCategory,
  updateProduct,
  updateSubcategory,
  type CatalogTreeCategory,
} from '../lib/catalog'
import schemaSql from '../../supabase/schema.sql?raw'
import { AddCategoryModal } from './AddCategoryModal'
import './CatalogPanel.css'

type EditState =
  | { kind: 'category'; id: string; name: string }
  | { kind: 'subcategory'; id: string; name: string }
  | { kind: 'product'; id: string; name: string; price: string }

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

export function CatalogPanel() {
  const { user } = useAuth()
  const [tree, setTree] = useState<CatalogTreeCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)

  const [subName, setSubName] = useState('')
  const [addingBrand, setAddingBrand] = useState(false)
  const [productForms, setProductForms] = useState<Record<string, { name: string; price: string }>>({})

  async function load(preferCategoryId?: string | null) {
    setLoading(true)
    setError(null)
    const result = await listCatalogTree()
    setMissingTable(result.missingTable)
    setError(result.error)
    setTree(result.data)

    const nextId =
      preferCategoryId && result.data.some((item) => item.id === preferCategoryId)
        ? preferCategoryId
        : result.data[0]?.id ?? null
    setActiveCategoryId(nextId)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const activeCategory = tree.find((item) => item.id === activeCategoryId) ?? null

  async function copySql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveCategory(name: string) {
    setSubmitting(true)
    setError(null)
    const result = await addCategory(name, user?.id)
    setSubmitting(false)

    if (result.error) return result.error

    await load(result.data?.id ?? null)
    return null
  }

  async function handleAddSubcategory(event: FormEvent) {
    event.preventDefault()
    if (!activeCategory) return

    const trimmed = subName.trim()
    if (!trimmed) {
      setError('Subcategory name is required.')
      return
    }

    setSubmitting(true)
    setError(null)
    const result = await addSubcategory(activeCategory.id, trimmed)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSubName('')
    setAddingBrand(false)
    await load(activeCategory.id)
  }

  async function handleAddProduct(event: FormEvent, subcategoryId: string) {
    event.preventDefault()
    const form = productForms[subcategoryId] ?? { name: '', price: '' }
    const trimmed = form.name.trim()
    const parsed = Number(form.price)

    if (!trimmed) {
      setError('Product name is required.')
      return
    }
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a valid price.')
      return
    }

    setSubmitting(true)
    setError(null)
    const result = await addProduct(subcategoryId, trimmed, parsed)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setProductForms((prev) => ({ ...prev, [subcategoryId]: { name: '', price: '' } }))
    await load(activeCategoryId)
  }

  async function handleDeleteCategory(id: string) {
    if (!window.confirm('Delete this category and everything inside it?')) return
    setError(null)
    setEdit(null)
    const result = await deleteCategory(id)
    if (result.error) setError(result.error)
    await load(id === activeCategoryId ? null : activeCategoryId)
  }

  async function handleDeleteSubcategory(id: string) {
    if (!window.confirm('Delete this subcategory and its products?')) return
    setError(null)
    setEdit(null)
    const result = await deleteSubcategory(id)
    if (result.error) setError(result.error)
    await load(activeCategoryId)
  }

  async function handleDeleteProduct(id: string) {
    if (!window.confirm('Delete this product?')) return
    setError(null)
    setEdit(null)
    const result = await deleteProduct(id)
    if (result.error) setError(result.error)
    await load(activeCategoryId)
  }

  async function commitEdit() {
    if (!edit || submitting) return

    setSubmitting(true)
    setError(null)

    let resultError: string | null = null

    if (edit.kind === 'category') {
      const result = await updateCategory(edit.id, edit.name)
      resultError = result.error
    } else if (edit.kind === 'subcategory') {
      const result = await updateSubcategory(edit.id, edit.name)
      resultError = result.error
    } else {
      const result = await updateProduct(edit.id, edit.name, Number(edit.price))
      resultError = result.error
    }

    setSubmitting(false)

    if (resultError) {
      setError(resultError)
      return
    }

    setEdit(null)
    await load(activeCategoryId)
  }

  function cancelEdit() {
    setEdit(null)
  }

  function onEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commitEdit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    }
  }

  const sqlEditorHref =
    'https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new'

  return (
    <section className="catalog">
      <div className="catalog-head">
        <div className="catalog-head-actions">
          {!loading && !missingTable ? (
            <span className="catalog-count">{tree.length} categories</span>
          ) : null}
        </div>
      </div>

      {missingTable ? (
        <div className="catalog-setup">
          <div>
            <strong>Setup required</strong>
            <p>
              Catalog tables are missing. Click <b>Copy SQL</b>, paste it in the{' '}
              <a href={sqlEditorHref} target="_blank" rel="noreferrer">
                SQL Editor
              </a>
              , press <b>Run</b>, then click Refresh.
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

      {loading ? <p className="catalog-empty">Loading…</p> : null}

      {!loading && !missingTable && tree.length === 0 ? (
        <p className="catalog-empty">
          <span className="catalog-empty-title">No categories yet</span>
          Click + to add PCPPI, SMC, or MAGNOLIA.
          <button
            type="button"
            className="category-add-tab-btn catalog-empty-add"
            aria-label="Add category"
            title="Add category"
            onClick={() => setAddCategoryOpen(true)}
          >
            +
          </button>
        </p>
      ) : null}

      {!loading && tree.length > 0 ? (
        <div className="category-section">
          <div className="category-tabs-row">
            <div className="category-tabs" role="tablist" aria-label="Categories">
              {tree.map((category) => {
                const isEditing = edit?.kind === 'category' && edit.id === category.id

                if (isEditing) {
                  return (
                    <div key={category.id} className="category-tab-edit">
                      <input
                        className="catalog-edit-input"
                        value={edit.name}
                        autoFocus
                        onChange={(event) =>
                          setEdit({
                            kind: 'category',
                            id: category.id,
                            name: capitalizeFirst(event.target.value),
                          })
                        }
                        onKeyDown={onEditKeyDown}
                        aria-label="Edit category name"
                      />
                      <button
                        type="button"
                        className="btn-mini"
                        disabled={submitting}
                        onClick={() => void commitEdit()}
                      >
                        Save
                      </button>
                      <button type="button" className="btn-ghost-mini" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  )
                }

                return (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={category.id === activeCategoryId}
                    className={
                      category.id === activeCategoryId ? 'category-tab is-active' : 'category-tab'
                    }
                    onClick={() => {
                      setEdit(null)
                      setAddingBrand(false)
                      setSubName('')
                      setActiveCategoryId(category.id)
                    }}
                    onDoubleClick={() => {
                      setActiveCategoryId(category.id)
                      setEdit({ kind: 'category', id: category.id, name: category.name })
                    }}
                    title="Double-click to rename"
                  >
                    {category.name}
                  </button>
                )
              })}
              <button
                type="button"
                className="category-add-tab-btn"
                aria-label="Add category"
                title="Add category"
                disabled={missingTable}
                onClick={() => setAddCategoryOpen(true)}
              >
                +
              </button>
            </div>
            {activeCategory ? (
              <div className="category-tabs-actions">
                {edit?.kind === 'category' && edit.id === activeCategory.id ? null : (
                  <button
                    type="button"
                    className="catalog-edit"
                    aria-label="Edit category"
                    title="Edit category"
                    onClick={() =>
                      setEdit({
                        kind: 'category',
                        id: activeCategory.id,
                        name: activeCategory.name,
                      })
                    }
                  >
                    <PencilIcon />
                  </button>
                )}
                <button
                  type="button"
                  className="catalog-delete category-delete-tab"
                  onClick={() => void handleDeleteCategory(activeCategory.id)}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>

          {activeCategory ? (
            <div className="category-panel" role="tabpanel">
              <div className="subcategory-stack">
                {activeCategory.subcategories.length === 0 ? (
                  <p className="group-empty">
                    No subcategories yet. Use Add subcategory below.
                  </p>
                ) : null}

                {activeCategory.subcategories.map((subcategory) => {
                  const productForm = productForms[subcategory.id] ?? { name: '', price: '' }
                  const editingSub =
                    edit?.kind === 'subcategory' && edit.id === subcategory.id ? edit : null

                  return (
                    <section key={subcategory.id} className="subcategory-group">
                      <header className="subcategory-group__header">
                        {editingSub ? (
                          <div className="subcategory-edit">
                            <input
                              className="catalog-edit-input"
                              value={editingSub.name}
                              autoFocus
                              onChange={(event) =>
                                setEdit({
                                  kind: 'subcategory',
                                  id: subcategory.id,
                                  name: capitalizeFirst(event.target.value),
                                })
                              }
                              onKeyDown={onEditKeyDown}
                              aria-label="Edit brand name"
                            />
                            <button
                              type="button"
                              className="btn-mini"
                              disabled={submitting}
                              onClick={() => void commitEdit()}
                            >
                              Save
                            </button>
                            <button type="button" className="btn-ghost-mini" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <h3
                              title="Double-click to rename"
                              onDoubleClick={() =>
                                setEdit({
                                  kind: 'subcategory',
                                  id: subcategory.id,
                                  name: subcategory.name,
                                })
                              }
                            >
                              {subcategory.name}
                            </h3>
                            <div className="subcategory-group__actions">
                              <button
                                type="button"
                                className="catalog-edit"
                                aria-label={`Edit ${subcategory.name}`}
                                title="Edit brand"
                                onClick={() =>
                                  setEdit({
                                    kind: 'subcategory',
                                    id: subcategory.id,
                                    name: subcategory.name,
                                  })
                                }
                              >
                                <PencilIcon />
                              </button>
                              <button
                                type="button"
                                className="catalog-delete"
                                onClick={() => void handleDeleteSubcategory(subcategory.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </header>

                      <div className="product-list">
                        {subcategory.products.length === 0 ? (
                          <p className="product-empty">No products yet.</p>
                        ) : null}
                        {subcategory.products.map((product) => {
                          const editingProduct =
                            edit?.kind === 'product' && edit.id === product.id ? edit : null

                          if (editingProduct) {
                            return (
                              <div key={product.id} className="product-chip product-chip--edit">
                                <input
                                  className="catalog-edit-input"
                                  value={editingProduct.name}
                                  autoFocus
                                  onChange={(event) =>
                                    setEdit({
                                      ...editingProduct,
                                      name: capitalizeFirst(event.target.value),
                                    })
                                  }
                                  onKeyDown={onEditKeyDown}
                                  aria-label="Edit product name"
                                />
                                <input
                                  className="catalog-edit-input catalog-edit-input--price"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editingProduct.price}
                                  onChange={(event) =>
                                    setEdit({
                                      ...editingProduct,
                                      price: event.target.value,
                                    })
                                  }
                                  onKeyDown={onEditKeyDown}
                                  aria-label="Edit product price"
                                />
                                <button
                                  type="button"
                                  className="btn-mini"
                                  disabled={submitting}
                                  onClick={() => void commitEdit()}
                                >
                                  Save
                                </button>
                                <button type="button" className="btn-ghost-mini" onClick={cancelEdit}>
                                  Cancel
                                </button>
                              </div>
                            )
                          }

                          return (
                            <div key={product.id} className="product-chip">
                              <span
                                className="product-name"
                                title="Double-click to edit"
                                onDoubleClick={() =>
                                  setEdit({
                                    kind: 'product',
                                    id: product.id,
                                    name: product.name,
                                    price: String(product.price),
                                  })
                                }
                              >
                                {product.name}
                              </span>
                              <span className="product-price">
                                {formatPrice(Number(product.price))}
                              </span>
                              <button
                                type="button"
                                className="catalog-edit product-edit"
                                aria-label={`Edit ${product.name}`}
                                title="Edit product"
                                onClick={() =>
                                  setEdit({
                                    kind: 'product',
                                    id: product.id,
                                    name: product.name,
                                    price: String(product.price),
                                  })
                                }
                              >
                                <PencilIcon />
                              </button>
                              <button
                                type="button"
                                className="product-delete"
                                onClick={() => void handleDeleteProduct(product.id)}
                                aria-label={`Delete ${product.name}`}
                              >
                                ×
                              </button>
                            </div>
                          )
                        })}
                      </div>

                      <form
                        className="inline-form"
                        onSubmit={(event) => void handleAddProduct(event, subcategory.id)}
                      >
                        <input
                          value={productForm.name}
                          onChange={(event) =>
                            setProductForms((prev) => ({
                              ...prev,
                              [subcategory.id]: {
                                ...productForm,
                                name: capitalizeFirst(event.target.value),
                              },
                            }))
                          }
                          placeholder="1.5L"
                          required
                        />
                        <input
                          className="inline-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={productForm.price}
                          onChange={(event) =>
                            setProductForms((prev) => ({
                              ...prev,
                              [subcategory.id]: { ...productForm, price: event.target.value },
                            }))
                          }
                          placeholder="0.00"
                          required
                        />
                        <button type="submit" className="btn-mini" disabled={submitting}>
                          Add
                        </button>
                      </form>
                    </section>
                  )
                })}
              </div>

              {addingBrand ? (
                <form
                  className="inline-form category-add-sub"
                  onSubmit={(event) => void handleAddSubcategory(event)}
                >
                  <input
                    value={subName}
                    autoFocus
                    onChange={(event) => setSubName(capitalizeFirst(event.target.value))}
                    placeholder="Pepsi"
                    required
                    aria-label="Subcategory name"
                  />
                  <button type="submit" className="btn-mini" disabled={submitting}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-mini"
                    onClick={() => {
                      setAddingBrand(false)
                      setSubName('')
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="category-add-sub-bar">
                  <button
                    type="button"
                    className="btn-mini category-add-sub-btn"
                    onClick={() => setAddingBrand(true)}
                  >
                    Add subcategory
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <AddCategoryModal
        open={addCategoryOpen}
        submitting={submitting}
        onClose={() => setAddCategoryOpen(false)}
        onSave={handleSaveCategory}
      />
    </section>
  )
}
