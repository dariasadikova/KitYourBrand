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
  demo_mode?: boolean
  demo_project_slug?: string
  demo_generation_used?: boolean
  demo_limits?: Record<string, unknown>
  error?: string
}

export type ClaimedDemoProject = {
  slug: string
  name: string
  editor_url: string
  results_url: string
}

export type LoginResponse = AuthMeResponse & {
  claimed_demo_project?: ClaimedDemoProject
  message?: string
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
