export type SessionUser = {
  id: number
  name: string
  email: string
  /** Present when user has a custom avatar (path /profile/avatar/...) */
  avatar_url?: string
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

export type ForgotPasswordResponse = {
  ok: boolean
  message: string
  dev_reset_url?: string
}

export type ResetPasswordPayload = {
  token: string
  password: string
  password_confirm: string
}
