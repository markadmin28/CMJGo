export const MASTER_ADMIN_EMAIL = 'markie.gorit@gmail.com'

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isMasterAdminEmail(email: string | null | undefined) {
  if (!email) return false
  return normalizeEmail(email) === MASTER_ADMIN_EMAIL
}

export function isMasterAdmin(user: { email?: string | null } | null | undefined) {
  return isMasterAdminEmail(user?.email)
}
