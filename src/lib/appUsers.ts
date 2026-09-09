import { isMissingCatalogTable } from './catalog'
import { supabase } from './supabase'

export const CHAT_AVATARS_BUCKET = 'chat-avatars'
export const CHAT_AVATAR_MAX_BYTES = 5 * 1024 * 1024

export type AppUserRecord = {
  id: string
  email: string
  full_name: string
  branch: string | null
  role: string
  created_at: string
  avatar_path?: string | null
  avatar_url?: string | null
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'User directory is not set up yet. Run supabase/app_users_schema.sql in the SQL Editor, then try again.'
  }
  return error.message ?? 'Something went wrong.'
}

export function getChatAvatarPublicUrl(path: string | null | undefined) {
  if (!path) return null
  const { data } = supabase.storage.from(CHAT_AVATARS_BUCKET).getPublicUrl(path)
  return data.publicUrl || null
}

function withAvatarUrl(row: AppUserRecord): AppUserRecord {
  return {
    ...row,
    avatar_url: getChatAvatarPublicUrl(row.avatar_path),
  }
}

export async function listAppUsers(search = '') {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, full_name, branch, role, created_at, avatar_path')
    .order('created_at', { ascending: false })

  if (error) {
    // Older schemas may not have avatar_path yet — fall back.
    if (String(error.message).toLowerCase().includes('avatar_path')) {
      const fallback = await supabase
        .from('app_users')
        .select('id, email, full_name, branch, role, created_at')
        .order('created_at', { ascending: false })
      if (fallback.error) {
        return {
          data: [] as AppUserRecord[],
          error: mapError(fallback.error),
          missingTable: isMissingCatalogTable(fallback.error),
        }
      }
      const rows = ((fallback.data ?? []) as AppUserRecord[]).map(withAvatarUrl)
      return filterUsers(rows, search)
    }
    return {
      data: [] as AppUserRecord[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const rows = ((data ?? []) as AppUserRecord[]).map(withAvatarUrl)
  return filterUsers(rows, search)
}

function filterUsers(rows: AppUserRecord[], search: string) {
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
    data: withAvatarUrl(data as AppUserRecord),
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

export function validateChatAvatar(file: File) {
  if (!file.type.startsWith('image/')) return 'Profile picture must be an image.'
  if (file.size <= 0) return 'Image is empty.'
  if (file.size > CHAT_AVATAR_MAX_BYTES) return 'Image is too large (max 5 MB).'
  return null
}

function avatarExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 5) return fromName
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

/** Upload / replace the signed-in user's chat profile picture. */
export async function updateOwnChatAvatar(userId: string, file: File) {
  const validationError = validateChatAvatar(file)
  if (validationError) {
    return {
      data: null as AppUserRecord | null,
      error: validationError,
      missingTable: false,
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('app_users')
    .select('id, email, full_name, branch, role, created_at, avatar_path')
    .eq('id', userId)
    .maybeSingle()

  if (existingError) {
    return {
      data: null as AppUserRecord | null,
      error: mapError(existingError),
      missingTable: isMissingCatalogTable(existingError),
    }
  }

  const ext = avatarExtension(file)
  const path = `${userId}/avatar-${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(CHAT_AVATARS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })

  if (uploadError) {
    const message = uploadError.message.toLowerCase().includes('bucket')
      ? 'Chat avatars storage is not set up. Re-run supabase/user_chat_schema.sql, then refresh.'
      : uploadError.message
    return {
      data: null as AppUserRecord | null,
      error: message,
      missingTable: false,
    }
  }

  const { data, error } = await supabase
    .from('app_users')
    .update({
      avatar_path: path,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, email, full_name, branch, role, created_at, avatar_path')
    .single()

  if (error || !data) {
    void supabase.storage.from(CHAT_AVATARS_BUCKET).remove([path])
    return {
      data: null as AppUserRecord | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const previousPath = existing?.avatar_path
  if (previousPath && previousPath !== path) {
    void supabase.storage.from(CHAT_AVATARS_BUCKET).remove([previousPath])
  }

  return {
    data: withAvatarUrl(data as AppUserRecord),
    error: null as string | null,
    missingTable: false,
  }
}

export async function removeOwnChatAvatar(userId: string) {
  const { data: existing, error: existingError } = await supabase
    .from('app_users')
    .select('id, email, full_name, branch, role, created_at, avatar_path')
    .eq('id', userId)
    .maybeSingle()

  if (existingError) {
    return {
      data: null as AppUserRecord | null,
      error: mapError(existingError),
      missingTable: isMissingCatalogTable(existingError),
    }
  }

  const previousPath = existing?.avatar_path ?? null
  const { data, error } = await supabase
    .from('app_users')
    .update({
      avatar_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, email, full_name, branch, role, created_at, avatar_path')
    .single()

  if (error || !data) {
    return {
      data: null as AppUserRecord | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  if (previousPath) {
    void supabase.storage.from(CHAT_AVATARS_BUCKET).remove([previousPath])
  }

  return {
    data: withAvatarUrl(data as AppUserRecord),
    error: null as string | null,
    missingTable: false,
  }
}
