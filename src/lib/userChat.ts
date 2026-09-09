import { supabase } from './supabase'
import { isMissingCatalogTable } from './catalog'

export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments'
export const CHAT_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

const MESSAGE_COLUMNS =
  'id, sender_id, recipient_id, body, sender_name, attachment_path, attachment_name, attachment_mime, attachment_size, created_at'

export type UserChatMessage = {
  id: string
  sender_id: string
  recipient_id: string
  body: string
  sender_name: string
  attachment_path: string | null
  attachment_name: string | null
  attachment_mime: string | null
  attachment_size: number | null
  created_at: string
  attachment_url?: string | null
}

export type UserChatReaction = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😆', '😮', '😢', '😡'] as const
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number]

export type ChatAttachmentKind = 'image' | 'video' | 'file'

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Chat is not set up yet. Run supabase/user_chat_schema.sql in the SQL Editor, then refresh.'
  }
  return error.message ?? 'Something went wrong with chat.'
}

function readMapKey(userId: string) {
  return `cmj-chat-read:${userId}`
}

export function loadChatReadMap(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(readMapKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function markChatPeerRead(userId: string, peerId: string, at = new Date().toISOString()) {
  const map = loadChatReadMap(userId)
  map[peerId] = at
  localStorage.setItem(readMapKey(userId), JSON.stringify(map))
}

export function getChatAttachmentKind(mime: string | null | undefined): ChatAttachmentKind {
  if (!mime) return 'file'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

export function formatChatFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 120) || 'file'
}

export function validateChatAttachment(file: File) {
  if (file.size <= 0) return 'File is empty.'
  if (file.size > CHAT_MAX_ATTACHMENT_BYTES) {
    return 'File is too large (max 50 MB).'
  }
  return null
}

async function signAttachmentUrl(path: string | null | undefined) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(CHAT_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function enrichChatMessagesWithUrls(messages: UserChatMessage[]) {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachment_url: await signAttachmentUrl(message.attachment_path),
    })),
  )
}

export async function listDirectChatMessages(
  currentUserId: string,
  peerUserId: string,
  limit = 150,
) {
  const { data, error } = await supabase
    .from('user_chat_messages')
    .select(MESSAGE_COLUMNS)
    .or(
      `and(sender_id.eq.${currentUserId},recipient_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},recipient_id.eq.${currentUserId})`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return {
      data: [] as UserChatMessage[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const rows = ((data ?? []) as UserChatMessage[]).slice().reverse()
  return {
    data: await enrichChatMessagesWithUrls(rows),
    error: null as string | null,
    missingTable: false,
  }
}

/** Recent inbound DMs for unread badge seeding. */
export async function listIncomingChatMessages(currentUserId: string, limit = 80) {
  const { data, error } = await supabase
    .from('user_chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('recipient_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return {
      data: [] as UserChatMessage[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as UserChatMessage[],
    error: null as string | null,
    missingTable: false,
  }
}

export function buildUnreadByPeer(
  incoming: UserChatMessage[],
  readMap: Record<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const message of incoming) {
    const lastRead = readMap[message.sender_id]
    if (lastRead && new Date(message.created_at).getTime() <= new Date(lastRead).getTime()) {
      continue
    }
    counts[message.sender_id] = (counts[message.sender_id] ?? 0) + 1
  }
  return counts
}

async function uploadChatAttachment(senderId: string, file: File) {
  const validationError = validateChatAttachment(file)
  if (validationError) {
    return { path: null as string | null, error: validationError }
  }

  const safeName = sanitizeFileName(file.name)
  const path = `${senderId}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })

  if (error) {
    const message = error.message.toLowerCase().includes('bucket')
      ? 'Chat attachments storage is not set up. Re-run supabase/user_chat_schema.sql, then refresh.'
      : error.message
    return { path: null as string | null, error: message }
  }

  return { path, error: null as string | null }
}

export async function sendDirectChatMessage(input: {
  senderId: string
  recipientId: string
  senderName: string
  body: string
  file?: File | null
}) {
  const body = input.body.trim()
  if (!body && !input.file) {
    return {
      data: null as UserChatMessage | null,
      error: 'Message cannot be empty.',
      missingTable: false,
    }
  }
  if (input.senderId === input.recipientId) {
    return {
      data: null as UserChatMessage | null,
      error: 'You cannot message yourself.',
      missingTable: false,
    }
  }

  let attachmentPath: string | null = null
  let attachmentName: string | null = null
  let attachmentMime: string | null = null
  let attachmentSize: number | null = null

  if (input.file) {
    const uploaded = await uploadChatAttachment(input.senderId, input.file)
    if (uploaded.error || !uploaded.path) {
      return {
        data: null as UserChatMessage | null,
        error: uploaded.error ?? 'Upload failed.',
        missingTable: false,
      }
    }
    attachmentPath = uploaded.path
    attachmentName = input.file.name
    attachmentMime = input.file.type || 'application/octet-stream'
    attachmentSize = input.file.size
  }

  const { data, error } = await supabase
    .from('user_chat_messages')
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      sender_name: input.senderName.trim() || 'User',
      body: body || (attachmentName ? `Shared ${attachmentName}` : ''),
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
      attachment_mime: attachmentMime,
      attachment_size: attachmentSize,
    })
    .select(MESSAGE_COLUMNS)
    .single()

  if (error || !data) {
    if (attachmentPath) {
      void supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).remove([attachmentPath])
    }
    return {
      data: null as UserChatMessage | null,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const message = data as UserChatMessage
  return {
    data: {
      ...message,
      attachment_url: await signAttachmentUrl(message.attachment_path),
    },
    error: null as string | null,
    missingTable: false,
  }
}

export async function listChatReactions(messageIds: string[]) {
  if (messageIds.length === 0) {
    return { data: [] as UserChatReaction[], error: null as string | null, missingTable: false }
  }

  const { data, error } = await supabase
    .from('user_chat_reactions')
    .select('id, message_id, user_id, emoji, created_at')
    .in('message_id', messageIds)

  if (error) {
    return {
      data: [] as UserChatReaction[],
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  return {
    data: (data ?? []) as UserChatReaction[],
    error: null as string | null,
    missingTable: false,
  }
}

/** Toggle Facebook-style reaction: same emoji removes, different emoji replaces. */
export async function toggleChatReaction(input: {
  messageId: string
  userId: string
  emoji: ChatReactionEmoji
}) {
  const { data: existing, error: existingError } = await supabase
    .from('user_chat_reactions')
    .select('id, emoji')
    .eq('message_id', input.messageId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (existingError) {
    return {
      data: null as UserChatReaction | null,
      removed: false,
      error: mapError(existingError),
      missingTable: isMissingCatalogTable(existingError),
    }
  }

  if (existing && existing.emoji === input.emoji) {
    const { error } = await supabase.from('user_chat_reactions').delete().eq('id', existing.id)
    return {
      data: null as UserChatReaction | null,
      removed: true,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  if (existing) {
    const { data, error } = await supabase
      .from('user_chat_reactions')
      .update({ emoji: input.emoji })
      .eq('id', existing.id)
      .select('id, message_id, user_id, emoji, created_at')
      .single()

    return {
      data: (data as UserChatReaction | null) ?? null,
      removed: false,
      error: mapError(error),
      missingTable: isMissingCatalogTable(error),
    }
  }

  const { data, error } = await supabase
    .from('user_chat_reactions')
    .insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    })
    .select('id, message_id, user_id, emoji, created_at')
    .single()

  return {
    data: (data as UserChatReaction | null) ?? null,
    removed: false,
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

/** Subscribe to DM inserts involving the current user. */
export function subscribeDirectChatMessages(
  currentUserId: string,
  onInsert: (message: UserChatMessage) => void,
) {
  const channel = supabase
    .channel(`user-chat:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_chat_messages',
      },
      (payload) => {
        const row = payload.new as UserChatMessage
        if (!row?.id) return
        if (row.sender_id !== currentUserId && row.recipient_id !== currentUserId) return
        void enrichChatMessagesWithUrls([row]).then(([enriched]) => onInsert(enriched))
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function subscribeChatReactions(
  onChange: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: UserChatReaction) => void,
) {
  const channel = supabase
    .channel('user-chat-reactions')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_chat_reactions',
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const row = (eventType === 'DELETE' ? payload.old : payload.new) as UserChatReaction
        if (!row?.id && !row?.message_id) return
        onChange(eventType, row)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function playChatNotifySound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    window.setTimeout(() => void ctx.close(), 300)
  } catch {
    // ignore autoplay / audio errors
  }
}
