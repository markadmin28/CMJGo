import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserBranch } from '../lib/branches'
import {
  addCustomerGroup,
  deleteCustomerGroup,
  listCustomerGroups,
  updateCustomerGroup,
} from '../lib/customerDiscount'
import type { CustomerDiscountGroup } from '../types/customerDiscount'
import customerDiscountSchemaSql from '../../supabase/customer_discount_schema.sql?raw'
import { NameModal } from './AddCategoryModal'
import { CustomersDiscountSkuView } from './CustomersDiscountSkuView'
import './FthDiscountPanel.css'
import './CatalogPanel.css'

type CustomersDiscountPanelProps = {
  branch: UserBranch
}

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

export function CustomersDiscountPanel({ branch }: CustomersDiscountPanelProps) {
  const { user } = useAuth()
  const [groups, setGroups] = useState<CustomerDiscountGroup[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)

  const selected = groups.find((item) => item.id === selectedId) ?? null

  async function load(preferId?: string | null) {
    setLoading(true)
    setError(null)
    const result = await listCustomerGroups(branch)
    setMissingTable(result.missingTable)
    setError(result.error)
    setGroups(result.data)

    const nextId =
      preferId && result.data.some((item) => item.id === preferId)
        ? preferId
        : result.data[0]?.id ?? null
    setSelectedId(nextId)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [branch])

  async function copySql() {
    await navigator.clipboard.writeText(customerDiscountSchemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveCustomer(name: string) {
    if (!modal) return 'Nothing to save.'

    setSubmitting(true)
    setError(null)

    const result =
      modal === 'edit' && selected
        ? await updateCustomerGroup(selected.id, name)
        : await addCustomerGroup(branch, name, user?.id)

    setSubmitting(false)

    if (result.error) return result.error

    await load(result.data?.id ?? selectedId)
    return null
  }

  async function handleDeleteCustomer() {
    if (!selected) return
    if (
      !window.confirm(
        `Delete customer "${selected.name}" from the ${branch} list and all discounts under it?`,
      )
    ) {
      return
    }

    setError(null)
    const result = await deleteCustomerGroup(selected.id)
    if (result.error) {
      setError(result.error)
      return
    }
    await load(null)
  }

  return (
    <section className="fth" aria-label={`${branch} customers discount`}>
      <div className="fth-head">
        <div>
          <h1>Customers Discount</h1>
          <p>{branch} customer list (separate from other branches)</p>
        </div>
      </div>

      {missingTable ? (
        <div className="catalog-setup">
          <div>
            <strong>Customers Discount setup required</strong>
            <p>
              Customers Discount tables are missing. Click <b>Copy SQL</b>, paste it in the{' '}
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
            <span>{branch} customer</span>
            <select
              className="fth-route-select"
              value={selectedId ?? ''}
              disabled={loading || groups.length === 0}
              onChange={(event) => setSelectedId(event.target.value || null)}
            >
              {groups.length === 0 ? (
                <option value="">No {branch} customers yet</option>
              ) : (
                groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="fth-route-actions">
            <button
              type="button"
              className="fth-route-add"
              aria-label={`Add ${branch} customer`}
              title={`Add ${branch} customer`}
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
                  aria-label="Edit customer"
                  title="Edit customer"
                  onClick={() => setModal('edit')}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="catalog-delete"
                  onClick={() => void handleDeleteCustomer()}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && !missingTable && groups.length === 0 ? (
        <p className="catalog-empty">
          <span className="catalog-empty-title">No {branch} customers yet</span>
          Click + to add a customer for the {branch} list, then enter discounts for SKU products.
        </p>
      ) : null}

      {selectedId ? <CustomersDiscountSkuView groupId={selectedId} branch={branch} /> : null}

      <NameModal
        open={modal === 'add'}
        submitting={submitting}
        title={`Add ${branch} customer`}
        description={`Create a customer for the ${branch} discount list. Discounts you save stay on this branch only.`}
        fieldLabel="Customer name"
        placeholder="Walk-in"
        submitLabel="Save customer"
        onClose={() => setModal(null)}
        onSave={handleSaveCustomer}
      />

      <NameModal
        open={modal === 'edit'}
        submitting={submitting}
        title={`Edit ${branch} customer`}
        description="Rename this customer. Saved discounts stay linked to it."
        fieldLabel="Customer name"
        placeholder="Walk-in"
        submitLabel="Save changes"
        initialName={selected?.name ?? ''}
        onClose={() => setModal(null)}
        onSave={handleSaveCustomer}
      />
    </section>
  )
}
