import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { formatAuthError } from '../lib/authErrors'
import { upsertAppUser } from '../lib/appUsers'
import { isMasterAdmin, isMasterAdminEmail, MASTER_ADMIN_EMAIL } from '../lib/roles'
import { supabase } from '../lib/supabase'

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  isMasterAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>
  createUser: (
    email: string,
    password: string,
    fullName: string,
    branch: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const REGISTER_DENIED = 'Only the master admin can register users.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ? formatAuthError(error.message) : null }
  }, [])

  // Only the master admin email may self-register (bootstrap). Everyone else must be added by admin.
  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!isMasterAdminEmail(email)) {
      return { error: REGISTER_DENIED, needsEmailConfirmation: false }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'master_admin',
        },
      },
    })
    if (error) {
      return { error: formatAuthError(error.message), needsEmailConfirmation: false }
    }

    const needsEmailConfirmation = Boolean(data.user) && !data.session
    return { error: null, needsEmailConfirmation }
  }, [])

  const createUser = useCallback(
    async (email: string, password: string, fullName: string, branch: string) => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (!isMasterAdmin(currentSession?.user)) {
        return { error: REGISTER_DENIED, needsEmailConfirmation: false }
      }

      if (isMasterAdminEmail(email)) {
        return {
          error: `${MASTER_ADMIN_EMAIL} is reserved for the master admin.`,
          needsEmailConfirmation: false,
        }
      }

      if (!branch.trim()) {
        return { error: 'Branch is required.', needsEmailConfirmation: false }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'user',
            branch: branch.trim(),
          },
        },
      })

      if (error) {
        return { error: formatAuthError(error.message), needsEmailConfirmation: false }
      }

      if (data.user) {
        await upsertAppUser({
          id: data.user.id,
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          branch: branch.trim(),
          role: 'user',
        })
      }

      if (currentSession && data.session) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        })
      }

      const needsEmailConfirmation = Boolean(data.user) && !data.session
      return { error: null, needsEmailConfirmation }
    },
    [],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const user = session?.user ?? null
  const masterAdmin = isMasterAdmin(user)

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      isMasterAdmin: masterAdmin,
      signIn,
      signUp,
      createUser,
      signOut,
    }),
    [session, user, loading, masterAdmin, signIn, signUp, createUser, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
