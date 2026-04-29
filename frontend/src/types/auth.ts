export type SessionUser = {
  id: number
  name: string
  email: string
}

export type AuthMeResponse = {
  ok: boolean
  authenticated: boolean
  user: SessionUser | null
}
