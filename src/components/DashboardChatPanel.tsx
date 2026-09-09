import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { listAppUsers, removeOwnChatAvatar, updateOwnChatAvatar, type AppUserRecord } from '../lib/appUsers'
import {
  buildUnreadByPeer,
  CHAT_REACTION_EMOJIS,
  formatChatFileSize,
  getChatAttachmentKind,
  listChatReactions,
  listDirectChatMessages,
  listIncomingChatMessages,
  loadChatReadMap,
  markChatPeerRead,
  mergeDirectChatMessages,
  playChatNotifySound,
  sendDirectChatMessage,
  subscribeChatReactions,
  subscribeDirectChatMessages,
  toggleChatReaction,
  validateChatAttachment,
  type ChatReactionEmoji,
  type UserChatMessage,
  type UserChatReaction,
} from '../lib/userChat'
import './DashboardChatPanel.css'

type DashboardChatPanelProps = {
  currentUserId: string
  currentUserName: string
}

type ReactionSummary = {
  emoji: string
  count: number
  mine: boolean
}

function displayName(user: AppUserRecord) {
  return user.full_name.trim() || user.email || 'User'
}

function UserAvatar({
  name,
  url,
  className,
}: {
  name: string
  url?: string | null
  className?: string
}) {
  const initial = name.slice(0, 1).toUpperCase() || '?'
  if (url) {
    return (
      <span className={className ?? 'dash-chat-popup__user-avatar'}>
        <img src={url} alt="" />
      </span>
    )
  }
  return <span className={className ?? 'dash-chat-popup__user-avatar'}>{initial}</span>
}

function formatChatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function summarizeReactions(
  reactions: UserChatReaction[],
  messageId: string,
  currentUserId: string,
): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>()
  for (const reaction of reactions) {
    if (reaction.message_id !== messageId) continue
    const prev = map.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false }
    prev.count += 1
    if (reaction.user_id === currentUserId) prev.mine = true
    map.set(reaction.emoji, prev)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function MessageAttachment({ message }: { message: UserChatMessage }) {
  if (!message.attachment_path) return null
  const kind = getChatAttachmentKind(message.attachment_mime)
  const url = message.attachment_url
  const name = message.attachment_name || 'Attachment'
  const size = formatChatFileSize(message.attachment_size)

  if (kind === 'image' && url) {
    return (
      <a className="dash-chat-popup__media" href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={name} />
      </a>
    )
  }

  if (kind === 'video' && url) {
    return (
      <video className="dash-chat-popup__video" controls preload="metadata" src={url}>
        <track kind="captions" />
      </video>
    )
  }

  return (
    <a
      className="dash-chat-popup__file"
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={name}
    >
      <span className="dash-chat-popup__file-icon" aria-hidden="true">
        📎
      </span>
      <span className="dash-chat-popup__file-meta">
        <span className="dash-chat-popup__file-name">{name}</span>
        {size ? <span className="dash-chat-popup__file-size">{size}</span> : null}
      </span>
    </a>
  )
}

export function DashboardChatPanel({ currentUserId, currentUserName }: DashboardChatPanelProps) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<AppUserRecord[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [peer, setPeer] = useState<AppUserRecord | null>(null)
  const [messages, setMessages] = useState<UserChatMessage[]>([])
  const [reactions, setReactions] = useState<UserChatReaction[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [search, setSearch] = useState('')
  const [unreadByPeer, setUnreadByPeer] = useState<Record<string, number>>({})
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const openRef = useRef(open)
  const peerRef = useRef(peer)
  const messageIdsRef = useRef<Set<string>>(new Set())

  openRef.current = open
  peerRef.current = peer
  messageIdsRef.current = new Set(messages.map((row) => row.id))

  const unreadTotal = Object.values(unreadByPeer).reduce((sum, n) => sum + n, 0)
  const canSend = Boolean(draft.trim() || pendingFile)

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  useEffect(() => {
    let cancelled = false

    async function seedUnread() {
      const result = await listIncomingChatMessages(currentUserId)
      if (cancelled) return
      if (result.missingTable) {
        setMissingTable(true)
        return
      }
      const readMap = loadChatReadMap(currentUserId)
      setUnreadByPeer(buildUnreadByPeer(result.data, readMap))
    }

    void seedUnread()
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  useEffect(() => {
    if (!open || peer) return

    let cancelled = false

    async function refreshUnread() {
      const result = await listIncomingChatMessages(currentUserId)
      if (cancelled || result.error) return
      const readMap = loadChatReadMap(currentUserId)
      setUnreadByPeer(buildUnreadByPeer(result.data, readMap))
    }

    const intervalId = window.setInterval(() => {
      void refreshUnread()
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [open, peer, currentUserId])

  useEffect(() => {
    return subscribeDirectChatMessages(currentUserId, (message) => {
      const viewingPeer =
        openRef.current &&
        peerRef.current &&
        ((message.sender_id === currentUserId && message.recipient_id === peerRef.current.id) ||
          (message.sender_id === peerRef.current.id && message.recipient_id === currentUserId))

      if (viewingPeer) {
        setMessages((prev) => {
          const existing = prev.find((row) => row.id === message.id)
          if (existing) {
            if (!message.attachment_url || existing.attachment_url === message.attachment_url) {
              return prev
            }
            return prev.map((row) =>
              row.id === message.id
                ? { ...row, attachment_url: message.attachment_url ?? row.attachment_url }
                : row,
            )
          }
          return [...prev, message]
        })
        if (message.sender_id === peerRef.current!.id) {
          markChatPeerRead(currentUserId, message.sender_id, message.created_at)
          setUnreadByPeer((prev) => {
            if (!prev[message.sender_id]) return prev
            const next = { ...prev }
            delete next[message.sender_id]
            return next
          })
        }
        return
      }

      if (message.recipient_id !== currentUserId) return

      setUnreadByPeer((prev) => ({
        ...prev,
        [message.sender_id]: (prev[message.sender_id] ?? 0) + 1,
      }))
      playChatNotifySound()
    })
  }, [currentUserId])

  // Poll the open thread so messages appear even if Realtime is unavailable (common on self-hosted).
  useEffect(() => {
    if (!open || !peer) return

    let cancelled = false
    const peerId = peer.id

    async function refreshThread() {
      const result = await listDirectChatMessages(currentUserId, peerId)
      if (cancelled || result.error || result.missingTable) return

      setMessages((prev) => mergeDirectChatMessages(prev, result.data))

      const reactionResult = await listChatReactions(result.data.map((row) => row.id))
      if (cancelled || reactionResult.error) return
      setReactions(reactionResult.data)

      markChatPeerRead(currentUserId, peerId)
      setUnreadByPeer((prev) => {
        if (!prev[peerId]) return prev
        const next = { ...prev }
        delete next[peerId]
        return next
      })
    }

    const intervalId = window.setInterval(() => {
      void refreshThread()
    }, 2000)

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshThread()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [open, peer, currentUserId])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function loadUsers() {
      setUsersLoading(true)
      setUsersError(null)
      const result = await listAppUsers()
      if (cancelled) return
      const me = result.data.find((row) => row.id === currentUserId)
      setMyAvatarUrl(me?.avatar_url ?? null)
      setUsers(result.data.filter((row) => row.id !== currentUserId))
      setUsersError(result.error)
      setUsersLoading(false)
    }

    void loadUsers()
    return () => {
      cancelled = true
    }
  }, [open, currentUserId])

  useEffect(() => {
    if (!open || !peer) {
      setMessages([])
      setReactions([])
      setPickerFor(null)
      return
    }

    let cancelled = false

    async function loadMessages() {
      setMessagesLoading(true)
      setChatError(null)
      const result = await listDirectChatMessages(currentUserId, peer!.id)
      if (cancelled) return
      setMessages(result.data)
      setMissingTable(result.missingTable)
      setChatError(result.error)
      setMessagesLoading(false)

      markChatPeerRead(currentUserId, peer!.id)
      setUnreadByPeer((prev) => {
        if (!prev[peer!.id]) return prev
        const next = { ...prev }
        delete next[peer!.id]
        return next
      })

      if (result.data.length > 0) {
        const reactionResult = await listChatReactions(result.data.map((row) => row.id))
        if (cancelled) return
        setReactions(reactionResult.data)
      } else {
        setReactions([])
      }
    }

    void loadMessages()
    return () => {
      cancelled = true
    }
  }, [open, peer, currentUserId])

  useEffect(() => {
    if (!open || !peer) return
    return subscribeChatReactions((event, row) => {
      if (!messageIdsRef.current.has(row.message_id) && event !== 'DELETE') return
      setReactions((prev) => {
        if (event === 'DELETE') {
          return prev.filter((item) => item.id !== row.id)
        }
        const without = prev.filter((item) => item.id !== row.id)
        return [...without, row]
      })
    })
  }, [open, peer])

  useEffect(() => {
    if (!open || !peer) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, open, peer, messagesLoading])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      setOpen(false)
      setPickerFor(null)
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (pickerFor) {
          setPickerFor(null)
          return
        }
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, pickerFor])

  const filteredUsers = users.filter((user) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [user.full_name, user.email, user.branch ?? ''].join(' ').toLowerCase().includes(q)
  })

  function clearPendingFile() {
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function acceptAttachmentFile(file: File | null) {
    if (!file) {
      clearPendingFile()
      return
    }
    const error = validateChatAttachment(file)
    if (error) {
      setChatError(error)
      clearPendingFile()
      return
    }
    setChatError(null)
    setPendingFile(file)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptAttachmentFile(event.target.files?.[0] ?? null)
  }

  function hasDragFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function handleDragEnter(event: DragEvent) {
    if (!peer || sending || missingTable || messagesLoading) return
    if (!hasDragFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setDragActive(true)
  }

  function handleDragOver(event: DragEvent) {
    if (!peer || sending || missingTable || messagesLoading) return
    if (!hasDragFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: DragEvent) {
    if (!hasDragFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setDragActive(false)
    if (!peer || sending || missingTable || messagesLoading) return
    const file = event.dataTransfer.files?.[0] ?? null
    acceptAttachmentFile(file)
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault()
    if (!peer || sending || missingTable) return
    const body = draft.trim()
    if (!body && !pendingFile) return

    setSending(true)
    setChatError(null)
    const result = await sendDirectChatMessage({
      senderId: currentUserId,
      recipientId: peer.id,
      senderName: currentUserName,
      body,
      file: pendingFile,
    })
    setSending(false)

    if (result.error) {
      setMissingTable(result.missingTable)
      setChatError(result.error)
      return
    }

    if (result.data) {
      setMessages((prev) => {
        if (prev.some((row) => row.id === result.data!.id)) return prev
        return [...prev, result.data!]
      })
    }
    setDraft('')
    clearPendingFile()
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  async function handleReact(messageId: string, emoji: ChatReactionEmoji) {
    const target = messages.find((row) => row.id === messageId)
    if (!target || target.sender_id === currentUserId) return

    setPickerFor(null)
    const result = await toggleChatReaction({
      messageId,
      userId: currentUserId,
      emoji,
    })
    if (result.error) {
      setChatError(result.error)
      setMissingTable(result.missingTable)
      return
    }

    setReactions((prev) => {
      const withoutMine = prev.filter(
        (row) => !(row.message_id === messageId && row.user_id === currentUserId),
      )
      if (result.removed || !result.data) return withoutMine
      return [...withoutMine, result.data]
    })
  }

  function openPeer(user: AppUserRecord) {
    setPeer(user)
    setDraft('')
    clearPendingFile()
    setChatError(null)
    setPickerFor(null)
    setDragActive(false)
    dragDepthRef.current = 0
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (avatarInputRef.current) avatarInputRef.current.value = ''
    if (!file) return

    setAvatarBusy(true)
    setChatError(null)
    const result = await updateOwnChatAvatar(currentUserId, file)
    setAvatarBusy(false)

    if (result.error) {
      setChatError(result.error)
      return
    }
    setMyAvatarUrl(result.data?.avatar_url ?? null)
  }

  async function handleAvatarRemove() {
    if (!myAvatarUrl) return
    if (!window.confirm('Remove your chat profile picture?')) return
    setAvatarBusy(true)
    setChatError(null)
    const result = await removeOwnChatAvatar(currentUserId)
    setAvatarBusy(false)
    if (result.error) {
      setChatError(result.error)
      return
    }
    setMyAvatarUrl(null)
  }

  const pendingKind = pendingFile ? getChatAttachmentKind(pendingFile.type) : null

  return (
    <div className="dash-chat-float no-print" ref={panelRef}>
      {open ? (
        <div className="dash-chat-popup" role="dialog" aria-label="Direct messages">
          {!peer ? (
            <>
              <header className="dash-chat-popup__header">
                <div>
                  <h2>Messages</h2>
                  <p>Select a user to chat</p>
                </div>
                <button
                  type="button"
                  className="dash-chat-popup__close"
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                >
                  ×
                </button>
              </header>

              <div className="dash-chat-popup__profile">
                <UserAvatar
                  name={currentUserName}
                  url={myAvatarUrl}
                  className="dash-chat-popup__profile-avatar"
                />
                <div className="dash-chat-popup__profile-meta">
                  <span className="dash-chat-popup__profile-name">{currentUserName}</span>
                  <span className="dash-chat-popup__profile-hint">Your chat photo</span>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="dash-chat-popup__file-input"
                  onChange={(event) => void handleAvatarChange(event)}
                  disabled={avatarBusy}
                />
                <button
                  type="button"
                  className="dash-chat-popup__profile-btn"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? 'Saving…' : 'Change'}
                </button>
                {myAvatarUrl ? (
                  <button
                    type="button"
                    className="dash-chat-popup__profile-btn is-ghost"
                    onClick={() => void handleAvatarRemove()}
                    disabled={avatarBusy}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="dash-chat-popup__search">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users…"
                  aria-label="Search users"
                />
              </div>

              <div className="dash-chat-popup__users">
                {usersLoading ? <p className="dash-chat-popup__status">Loading users…</p> : null}
                {!usersLoading && usersError ? (
                  <p className="dash-chat-popup__error">{usersError}</p>
                ) : null}
                {!usersLoading && !usersError && filteredUsers.length === 0 ? (
                  <p className="dash-chat-popup__status">No other users found.</p>
                ) : null}
                {!usersLoading && !usersError
                  ? filteredUsers.map((user) => {
                      const unread = unreadByPeer[user.id] ?? 0
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className="dash-chat-popup__user"
                          onClick={() => openPeer(user)}
                        >
                          <UserAvatar name={displayName(user)} url={user.avatar_url} />
                          <span className="dash-chat-popup__user-meta">
                            <span className="dash-chat-popup__user-name">{displayName(user)}</span>
                            <span className="dash-chat-popup__user-sub">
                              {[user.branch, user.email].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {unread > 0 ? (
                            <span className="dash-chat-popup__user-unread" aria-label={`${unread} unread`}>
                              {unread > 9 ? '9+' : unread}
                            </span>
                          ) : null}
                        </button>
                      )
                    })
                  : null}
              </div>
            </>
          ) : (
            <>
              <div
                className={
                  dragActive
                    ? 'dash-chat-popup__thread-wrap is-dragover'
                    : 'dash-chat-popup__thread-wrap'
                }
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
              <header className="dash-chat-popup__header dash-chat-popup__header--thread">
                <button
                  type="button"
                  className="dash-chat-popup__back"
                  onClick={() => {
                    setPeer(null)
                    setDragActive(false)
                    dragDepthRef.current = 0
                  }}
                  aria-label="Back to users"
                >
                  ‹
                </button>
                <div className="dash-chat-popup__peer-head">
                  <UserAvatar
                    name={displayName(peer)}
                    url={peer.avatar_url}
                    className="dash-chat-popup__peer-avatar"
                  />
                  <div>
                    <h2>{displayName(peer)}</h2>
                    <p>{[peer.branch, peer.email].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dash-chat-popup__close"
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                >
                  ×
                </button>
              </header>

              <div className="dash-chat-popup__thread">
                {messagesLoading ? (
                  <p className="dash-chat-popup__status">Loading messages…</p>
                ) : null}
                {!messagesLoading && missingTable ? (
                  <div className="dash-chat-popup__setup">
                    <p className="dash-chat-popup__setup-title">Chat setup required</p>
                    <p>
                      Run <code>supabase/user_chat_schema.sql</code> in the Supabase SQL Editor,
                      then refresh.
                    </p>
                  </div>
                ) : null}
                {!messagesLoading && chatError ? (
                  <p className="dash-chat-popup__error">{chatError}</p>
                ) : null}
                {!messagesLoading && !missingTable && messages.length === 0 ? (
                  <p className="dash-chat-popup__status">
                    No messages yet. Say hello to {displayName(peer)}.
                  </p>
                ) : null}
                {!messagesLoading && !missingTable
                  ? messages.map((message) => {
                      const mine = message.sender_id === currentUserId
                      const summary = summarizeReactions(reactions, message.id, currentUserId)
                      const showBody =
                        message.body.trim() &&
                        !(
                          message.attachment_name &&
                          message.body.trim() === `Shared ${message.attachment_name}`
                        )
                      return (
                        <div
                          key={message.id}
                          className={
                            mine ? 'dash-chat-popup__msg is-mine' : 'dash-chat-popup__msg'
                          }
                          onMouseLeave={() => {
                            if (pickerFor === message.id) setPickerFor(null)
                          }}
                        >
                          <div className="dash-chat-popup__msg-row">
                            <article
                              className={
                                mine
                                  ? 'dash-chat-popup__bubble is-mine'
                                  : 'dash-chat-popup__bubble'
                              }
                            >
                              <header className="dash-chat-popup__bubble-meta">
                                <span>{mine ? 'You' : message.sender_name || 'User'}</span>
                                <time dateTime={message.created_at}>
                                  {formatChatTime(message.created_at)}
                                </time>
                              </header>
                              <MessageAttachment message={message} />
                              {showBody ? <p>{message.body}</p> : null}

                              {summary.length > 0 ? (
                                <div className="dash-chat-popup__react-summary">
                                  {summary.map((item) =>
                                    mine ? (
                                      <span
                                        key={item.emoji}
                                        className="dash-chat-popup__react-chip"
                                        aria-label={`${item.emoji} ${item.count}`}
                                      >
                                        <span>{item.emoji}</span>
                                        <span>{item.count}</span>
                                      </span>
                                    ) : (
                                      <button
                                        key={item.emoji}
                                        type="button"
                                        className={
                                          item.mine
                                            ? 'dash-chat-popup__react-chip is-mine'
                                            : 'dash-chat-popup__react-chip'
                                        }
                                        onClick={() =>
                                          void handleReact(
                                            message.id,
                                            item.emoji as ChatReactionEmoji,
                                          )
                                        }
                                        aria-label={`${item.emoji} ${item.count}`}
                                      >
                                        <span>{item.emoji}</span>
                                        <span>{item.count}</span>
                                      </button>
                                    ),
                                  )}
                                </div>
                              ) : null}
                            </article>

                            {!mine ? (
                              <div className="dash-chat-popup__react-side">
                                <button
                                  type="button"
                                  className="dash-chat-popup__react-toggle"
                                  aria-label="Add reaction"
                                  onClick={() =>
                                    setPickerFor((prev) =>
                                      prev === message.id ? null : message.id,
                                    )
                                  }
                                >
                                  🙂
                                </button>
                                {pickerFor === message.id ? (
                                  <div
                                    className="dash-chat-popup__react-picker"
                                    role="listbox"
                                    aria-label="Reactions"
                                  >
                                    {CHAT_REACTION_EMOJIS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        className="dash-chat-popup__react-emoji"
                                        onClick={() => void handleReact(message.id, emoji)}
                                        aria-label={`React ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  : null}
                <div ref={bottomRef} />
              </div>

              <form
                className="dash-chat-popup__composer"
                onSubmit={(event) => void handleSend(event)}
              >
                {pendingFile ? (
                  <div className="dash-chat-popup__attach-preview">
                    {pendingKind === 'image' && previewUrl ? (
                      <img src={previewUrl} alt={pendingFile.name} />
                    ) : pendingKind === 'video' && previewUrl ? (
                      <video src={previewUrl} muted />
                    ) : (
                      <span className="dash-chat-popup__attach-file">📎 {pendingFile.name}</span>
                    )}
                    <button
                      type="button"
                      className="dash-chat-popup__attach-clear"
                      onClick={clearPendingFile}
                      aria-label="Remove attachment"
                    >
                      ×
                    </button>
                  </div>
                ) : null}

                <div className="dash-chat-popup__composer-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="dash-chat-popup__file-input"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                    onChange={handleFileChange}
                    disabled={sending || missingTable || messagesLoading}
                  />
                  <button
                    type="button"
                    className="dash-chat-popup__attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || missingTable || messagesLoading}
                    aria-label="Attach file, image, or video"
                    title="Attach file, image, or video"
                  >
                    +
                  </button>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={`Message ${displayName(peer)}…`}
                    rows={2}
                    disabled={sending || missingTable || messagesLoading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || missingTable || messagesLoading || !canSend}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>

              {dragActive ? (
                <div className="dash-chat-popup__drop-overlay" aria-hidden="true">
                  <p>Drop file, image, or video to attach</p>
                </div>
              ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className={open ? 'dash-chat-fab is-open' : 'dash-chat-fab'}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={
          open
            ? 'Close chat'
            : unreadTotal > 0
              ? `Open chat, ${unreadTotal} unread`
              : 'Open chat'
        }
        aria-expanded={open}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4 3.5V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {!open && unreadTotal > 0 ? (
          <span className="dash-chat-fab__badge">{unreadTotal > 9 ? '9+' : unreadTotal}</span>
        ) : null}
      </button>
    </div>
  )
}
