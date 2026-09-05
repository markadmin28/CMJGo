import { isMissingCatalogTable } from './catalog'
import { supabase } from './supabase'

export type AppUserRecord = {
  id: string
  email: string
  full_name: string
  branch: string | null
  role: string
  created_at: string
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'User directory is not set up yet. Run supabase/app_users_schema.sql in the SQL Editor, then try again.'
  }
  return error.message ?? 'Something went wrong.'
}

export async function listAppUsers(search = '') {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, full_name, branch, role, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return {
      data: [] as AppUserRecord[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const rows = (data ?? []) as AppUserRecord[]
  const normalized = search.trim().toLowerCase()
  if (!normalized) {
    return { data: rows, error: null as string | null, missingTable: false }
  }

  const filtered = rows.filter((row) => {
    const haystack = [row.full_name, row.email, row.branch ?? '', row.role]
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })

  return { data: filtered, error: null as string | null, missingTable: false }
}

export async function upsertAppUser(input: {
  id: string
  email: string
  fullName: string
  branch: string | null
  role?: string
}) {
  const { error } = await supabase.from('app_users').upsert(
    {
      id: input.id,
      email: input.email,
      full_name: input.fullName,
      branch: input.branch,
      role: input.role ?? 'user',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    return {
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return { error: null as string | null, missingTable: false }
}

export async function updateAppUser(input: {
  id: string
  fullName: string
  branch: string | null
  email: string
}) {
  const { data, error } = await supabase.rpc('admin_update_app_user', {
    target_id: input.id,
    next_full_name: input.fullName,
    next_branch: input.branch,
    next_email: input.email,
  })

  if (error) {
    return {
      data: null as AppUserRecord | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: data as AppUserRecord,
    error: null as string | null,
    missingTable: false,
  }
}

export async function deleteAppUser(id: string) {
  const { error } = await supabase.rpc('admin_delete_app_user', {
    target_id: id,
  })

  if (error) {
    return {
      data: false as const,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return { data: true as const, error: null as string | null, missingTable: false }
}
