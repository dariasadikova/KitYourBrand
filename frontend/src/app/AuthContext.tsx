import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authApi } from '@/api/auth'
import type { User } from '@/types/user'

interface AuthState {
  user: User | null
  loading: boolean
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refetch: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = async () => {
    try {
      const me = await authApi.me()
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
