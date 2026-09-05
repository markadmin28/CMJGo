import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  deleteAppUser,
  listAppUsers,
  updateAppUser,
  type AppUserRecord,
} from '../lib/appUsers'
import { USER_BRANCHES, type UserBranch } from '../lib/branches'
import { isMasterAdminEmail } from '../lib/roles'
import schemaSql from '../../supabase/app_users_schema.sql?raw'
import './AddUserModal.css'

function capitalizeWords(value: string) {
  return value.replace(/(^|\s)(\S)/g, (_, space: string, char: string) => {
    return `${space}${char.toUpperCase()}`
  })
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

type AddUserModalProps = {
  open: boolean
  onClose: () => void
}

type ModalView = 'form' | 'search' | 'edit'

export function AddUserModal({ open, onClose }: AddUserModalProps) {
  const { createUser, user: currentUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [branch, setBranch] = useState<UserBranch | ''>('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [view, setView] = useState<ModalView>('form')
  const [userSearch, setUserSearch] = useState('')
  const [users, setUsers] = useState<AppUserRecord[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<AppUserRecord | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editBranch, setEditBranch] = useState<UserBranch | ''>('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return

    setFullName('')
    setEmail('')
    setBranch('')
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(null)
    setSubmitting(false)
    setView('form')
    setUserSearch('')
    setUsers([])
    setUsersError(null)
    setMissingTable(false)
    setCopied(false)
    setSelectedUserId(null)
    setEditingUser(null)
    setEditFullName('')
    setEditEmail('')
    setEditBranch('')
    setEditError(null)
    setEditSaving(false)
    setDeleting(false)
  }, [open])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const filteredUsers = useMemo(() => {
    const normalized = userSearch.trim().toLowerCase()
    if (!normalized) return users
    return users.filter((row) => {
      const haystack = [row.full_name, row.email, row.branch ?? '', row.role]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [users, userSearch])

  const selectedUser = useMemo(
    () => users.find((row) => row.id === selectedUserId) ?? null,
    [users, selectedUserId],
  )

  if (!open) return null

  async function loadUsers() {
    setUsersLoading(true)
    setUsersError(null)

    const result = await listAppUsers()
    setUsersLoading(false)

    if (result.missingTable) {
      setMissingTable(true)
      setUsersError(result.error)
      setUsers([])
      setSelectedUserId(null)
      return
    }
    if (result.error) {
      setUsersError(result.error)
      setUsers([])
      setSelectedUserId(null)
      return
    }

    setMissingTable(false)
    setUsers(result.data)
    setSelectedUserId((prev) =>
      prev && result.data.some((row) => row.id === prev) ? prev : null,
    )
  }

  async function openSearch() {
    setView('search')
    setError(null)
    setSuccess(null)
    setEditError(null)
    setEditingUser(null)
    await loadUsers()
  }

  async function copySql() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function openEdit(user: AppUserRecord) {
    setEditingUser(user)
    setEditFullName(user.full_name)
    setEditEmail(user.email)
    setEditBranch(
      USER_BRANCHES.includes(user.branch as UserBranch) ? (user.branch as UserBranch) : '',
    )
    setEditError(null)
    setView('edit')
  }

  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    if (!branch) {
      setError('Branch is required.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    const { error: createError, needsEmailConfirmation } = await createUser(
      email.trim(),
      password,
      fullName.trim(),
      branch,
    )
    setSubmitting(false)

    if (createError) {
      setError(createError)
      return
    }

    setSuccess(
      needsEmailConfirmation
        ? 'User created. They need to confirm their email before signing in.'
        : 'User created successfully.',
    )
    setFullName('')
    setEmail('')
    setBranch('')
    setPassword('')
    setConfirmPassword('')
  }

  async function handleEditSubmit(event: FormEvent) {
    event.preventDefault()
    if (!editingUser) return

    setEditError(null)

    if (!editFullName.trim()) {
      setEditError('Full name is required.')
      return
    }
    if (!editEmail.trim()) {
      setEditError('Email is required.')
      return
    }
    if (!isMasterAdminEmail(editingUser.email) && !editBranch) {
      setEditError('Branch is required.')
      return
    }

    setEditSaving(true)
    const result = await updateAppUser({
      id: editingUser.id,
      fullName: editFullName.trim(),
      email: editEmail.trim(),
      branch: editBranch || null,
    })
    setEditSaving(false)

    if (result.missingTable) {
      setMissingTable(true)
      setEditError(result.error)
      return
    }
    if (result.error) {
      setEditError(result.error)
      return
    }

    setView('search')
    setEditingUser(null)
    setSelectedUserId(result.data?.id ?? editingUser.id)
    await loadUsers()
  }

  async function handleDeleteSelected() {
    if (!selectedUser) return

    if (selectedUser.id === currentUser?.id || isMasterAdminEmail(selectedUser.email)) {
      setUsersError(
        isMasterAdminEmail(selectedUser.email)
          ? 'The master admin account cannot be deleted.'
          : 'You cannot delete your own account.',
      )
      return
    }

    const label = selectedUser.full_name || selectedUser.email
    const confirmed = window.confirm(`Delete user ${label}? This cannot be undone.`)
    if (!confirmed) return

    setDeleting(true)
    setUsersError(null)
    const result = await deleteAppUser(selectedUser.id)
    setDeleting(false)

    if (result.missingTable) {
      setMissingTable(true)
      setUsersError(result.error)
      return
    }
    if (result.error) {
      setUsersError(result.error)
      return
    }

    setSelectedUserId(null)
    await loadUsers()
  }

  const title =
    view === 'search' ? 'Users' : view === 'edit' ? 'Edit user' : 'Add new user'
  const subtitle =
    view === 'search'
      ? 'Select a user to edit or delete.'
      : view === 'edit'
        ? 'Update name, email, or branch for the selected user.'
        : 'Create an account for someone on your CMJ team.'

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={view === 'search' ? 'modal-panel modal-panel--wide' : 'modal-panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="add-user-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="modal-header-actions">
            {view === 'form' ? (
              <button
                type="button"
                className="btn-secondary modal-search-btn"
                onClick={() => void openSearch()}
              >
                <SearchIcon />
                Search
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setView('form')}>
                Add user
              </button>
            )}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>

        {view === 'form' ? (
          <form className="modal-form" onSubmit={(event) => void handleCreateSubmit(event)} noValidate>
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                name="fullName"
                autoComplete="name"
                placeholder="Juan Dela Cruz"
                value={fullName}
                onChange={(e) => setFullName(capitalizeWords(e.target.value))}
                required
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Branch</span>
              <select
                name="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value as UserBranch | '')}
                required
              >
                <option value="" disabled>
                  Select branch
                </option>
                {USER_BRANCHES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>

            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>

            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {success ? <p className="form-success" role="status">{success}</p> : null}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Add user'}
              </button>
            </div>
          </form>
        ) : null}

        {view === 'search' ? (
          <div className="modal-form add-user-search">
            <label className="field">
              <span>Search users</span>
              <input
                type="search"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Name, email, or branch"
              />
            </label>

            {missingTable ? (
              <div className="add-user-setup">
                <p>
                  User directory tables are missing or out of date. Click <b>Copy SQL</b>, paste it
                  in the Supabase SQL Editor, press <b>Run</b>, then search again.
                </p>
                <button type="button" className="btn-secondary" onClick={() => void copySql()}>
                  {copied ? 'Copied' : 'Copy SQL'}
                </button>
              </div>
            ) : null}

            {usersError ? <p className="form-error" role="alert">{usersError}</p> : null}
            {usersLoading ? <p className="add-user-search-empty">Loading users…</p> : null}

            {!usersLoading && !usersError && filteredUsers.length === 0 ? (
              <p className="add-user-search-empty">No users found.</p>
            ) : null}

            {!usersLoading && filteredUsers.length > 0 ? (
              <div className="add-user-table-wrap">
                <table className="add-user-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Branch</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((row) => {
                      const selected = row.id === selectedUserId
                      return (
                        <tr
                          key={row.id}
                          className={selected ? 'is-selected' : undefined}
                          tabIndex={0}
                          role="button"
                          aria-pressed={selected}
                          aria-label={`Select ${row.full_name || row.email}`}
                          onClick={() => setSelectedUserId(row.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedUserId(row.id)
                            }
                          }}
                        >
                          <td>{row.full_name || '—'}</td>
                          <td>{row.email}</td>
                          <td>{row.branch || '—'}</td>
                          <td>{row.role === 'master_admin' ? 'Admin' : 'User'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="modal-actions modal-actions--split">
              <div className="modal-actions-left">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!selectedUser || deleting}
                  onClick={() => selectedUser && openEdit(selectedUser)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-secondary add-user-delete-btn"
                  disabled={
                    !selectedUser ||
                    deleting ||
                    selectedUser.id === currentUser?.id ||
                    isMasterAdminEmail(selectedUser.email)
                  }
                  onClick={() => void handleDeleteSelected()}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
              <div className="modal-actions-right">
                <button type="button" className="btn-secondary" onClick={() => void loadUsers()}>
                  Refresh
                </button>
                <button type="button" className="btn-primary" onClick={() => setView('form')}>
                  Back to add user
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view === 'edit' && editingUser ? (
          <form className="modal-form" onSubmit={(event) => void handleEditSubmit(event)} noValidate>
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={editFullName}
                onChange={(e) => setEditFullName(capitalizeWords(e.target.value))}
                required
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
                disabled={isMasterAdminEmail(editingUser.email)}
              />
            </label>

            <label className="field">
              <span>Branch</span>
              <select
                value={editBranch}
                onChange={(e) => setEditBranch(e.target.value as UserBranch | '')}
                required={!isMasterAdminEmail(editingUser.email)}
              >
                <option value="" disabled>
                  Select branch
                </option>
                {USER_BRANCHES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {editError ? <p className="form-error" role="alert">{editError}</p> : null}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setView('search')
                  setEditingUser(null)
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
