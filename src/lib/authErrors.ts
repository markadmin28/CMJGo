export function formatAuthError(message: string | null | undefined) {
  if (!message) return 'Something went wrong. Please try again.'

  const lower = message.toLowerCase()

  if (lower.includes('email rate limit exceeded')) {
    return 'Supabase email limit reached. In the dashboard, turn off Authentication → Providers → Email → Confirm email, then try again.'
  }

  return message
}
