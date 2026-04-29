export type SessionUser = {
  id: number
  name: string
  email: string
}

export type AuthMeResponse = {
  ok: boolean
  authenticated: boolean
  user: SessionUser | null
  error?: string
}

export type LoginPayload = {
  email: string
  password: string
}

export type RegisterPayload = {
  name: string
  email: string
  password: string
  password_confirm: string
}
