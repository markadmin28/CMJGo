import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  addRouteType,
  deleteRouteType,
  listRouteTypes,
  updateRouteType,
} from '../lib/fth'
import type { FthRouteType } from '../types/fth'
import fthSchemaSql from '../../supabase/fth_schema.sql?raw'
import { NameModal } from './AddCategoryModal'
import { FthSkuDiscountView } from './FthSkuDiscountView'
import './FthDiscountPanel.css'
import './CatalogPanel.css'

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

export function FthDiscountPanel() {
  const { user } = useAuth()
  const [routeTypes, setRouteTypes] = useState<FthRouteType[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)

  const selected = routeTypes.find((item) => item.id === selectedId) ?? null

  async function load(preferId?: string | null) {
    setLoading(true)
    setError(null)
    const result = await listRouteTypes()
    setMissingTable(result.missingTable)
    setError(result.error)
    setRouteTypes(result.data)

    const nextId =
      preferId && result.data.some((item) => item.id === preferId)
        ? preferId
        : result.data[0]?.id ?? null
    setSelectedId(nextId)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function copySql() {
    await navigator.clipboard.writeText(fthSchemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveRouteType(name: string) {
    if (!modal) return 'Nothing to save.'

    setSubmitting(true)
    setError(null)

    const result =
      modal === 'edit' && selected
        ? await updateRouteType(selected.id, name)
        : await addRouteType(name, user?.id)

    setSubmitting(false)

    if (result.error) return result.error

    await load(result.data?.id ?? selectedId)
    return null
  }

  async function handleDeleteRouteType() {
    if (!selected) return
    if (!window.confirm(`Delete route type "${selected.name}" and all discounts under it?`)) return

    setError(null)
    const result = await deleteRouteType(selected.id)
    if (result.error) {
      setError(result.error)
      return
    }
    await load(null)
  }

  return (
    <section className="fth">
      <div className="fth-head">
        <div>
          <h1>FTH Discount</h1>
        </div>
      </div>

      {missingTable ? (
        <div className="catalog-setup">
          <div>
            <strong>FTH setup required</strong>
            <p>
              FTH Discount tables are missing. Click <b>Copy SQL</b>, paste it in the{' '}
              <a
                href="https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new"
                target="_blank"
                rel="noreferrer"
              >
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

      {!missingTable ? (
        <div className="fth-route-bar">
          <label className="fth-route-field">
            <span>Route type</span>
            <select
              className="fth-route-select"
              value={selectedId ?? ''}
              disabled={loading || routeTypes.length === 0}
              onChange={(event) => setSelectedId(event.target.value || null)}
            >
              {routeTypes.length === 0 ? (
                <option value="">No route types yet</option>
              ) : (
                routeTypes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="fth-route-actions">
            <button
              type="button"
              className="fth-route-add"
              aria-label="Add route type"
              title="Add route type"
              disabled={loading}
              onClick={() => setModal('add')}
            >
              +
            </button>
            {selected ? (
              <>
                <button
                  type="button"
                  className="catalog-edit"
                  aria-label="Edit route type"
                  title="Edit route type"
                  onClick={() => setModal('edit')}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="catalog-delete"
                  onClick={() => void handleDeleteRouteType()}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && !missingTable && routeTypes.length === 0 ? (
        <p className="catalog-empty">
          <span className="catalog-empty-title">No route types yet</span>
          Click + to add a route type, then enter discounts for SKU products.
        </p>
      ) : null}

      {selectedId ? <FthSkuDiscountView routeTypeId={selectedId} /> : null}

      <NameModal
        open={modal === 'add'}
        submitting={submitting}
        title="Add route type"
        description="Create a route type. Discounts you save will belong to this route."
        fieldLabel="Route type name"
        placeholder="North Route"
        submitLabel="Save route type"
        onClose={() => setModal(null)}
        onSave={handleSaveRouteType}
      />

      <NameModal
        open={modal === 'edit'}
        submitting={submitting}
        title="Edit route type"
        description="Rename this route type. Saved discounts stay linked to it."
        fieldLabel="Route type name"
        placeholder="North Route"
        submitLabel="Save changes"
        initialName={selected?.name ?? ''}
        onClose={() => setModal(null)}
        onSave={handleSaveRouteType}
      />
    </section>
  )
}
