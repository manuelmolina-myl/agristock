import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Organization, Season, UserRole } from '@/lib/database.types'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  organization: Organization | null
  activeSeason: Season | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ role: UserRole }>
  signUp: (email: string, password: string, fullName: string, orgName: string) => Promise<void>
  signOut: () => Promise<void>
  setActiveSeason: (season: Season) => void
  refreshOrganization: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

async function fetchUserData(userId: string) {
  try {
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileErr || !profile) {
      console.error('Error fetching profile:', profileErr?.message)
      return null
    }

    const { data: organization } = await db
      .from('organizations')
      .select('*')
      .eq('id', (profile as Profile).organization_id)
      .single()

    const { data: season } = await db
      .from('seasons')
      .select('*')
      .eq('organization_id', (profile as Profile).organization_id)
      .eq('status', 'active')
      .maybeSingle()

    return {
      profile: profile as Profile,
      organization: (organization as Organization) ?? null,
      season: (season as Season) ?? null,
    }
  } catch (e) {
    console.error('fetchUserData error:', e)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    organization: null,
    activeSeason: null,
    isLoading: true,
  })
  // Skip onAuthStateChange handler when signIn is managing state directly
  const signingIn = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip if signIn() is handling this
        if (signingIn.current) return

        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            const userData = await fetchUserData(session.user.id)
            setState({
              user: session.user,
              session,
              profile: userData?.profile ?? null,
              organization: userData?.organization ?? null,
              activeSeason: userData?.season ?? null,
              isLoading: false,
            })
          } else {
            setState(prev => ({ ...prev, isLoading: false }))
          }
        } else if (event === 'SIGNED_OUT') {
          setState({
            user: null,
            session: null,
            profile: null,
            organization: null,
            activeSeason: null,
            isLoading: false,
          })
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setState(prev => ({ ...prev, session, user: session.user }))
        }
        // Ignore SIGNED_IN — handled by signIn() directly
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    signingIn.current = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const userData = await fetchUserData(data.user.id)
      if (!userData?.profile) throw new Error('Perfil no encontrado')

      setState({
        user: data.user,
        session: data.session,
        profile: userData.profile,
        organization: userData.organization,
        activeSeason: userData.season,
        isLoading: false,
      })

      return { role: userData.profile.role }
    } finally {
      // Small delay to let any pending SIGNED_IN events pass
      setTimeout(() => { signingIn.current = false }, 1000)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string, orgName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, org_name: orgName },
      },
    })
    if (error) throw error
    // The DB trigger (migration 010) creates the org + profile automatically
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const setActiveSeason = useCallback((season: Season) => {
    setState(prev => ({ ...prev, activeSeason: season }))
  }, [])

  const refreshOrganization = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const userData = await fetchUserData(user.id)
    if (userData) {
      setState(prev => ({
        ...prev,
        organization: userData.organization,
        activeSeason: userData.season,
        profile: userData.profile,
      }))
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, setActiveSeason, refreshOrganization }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
