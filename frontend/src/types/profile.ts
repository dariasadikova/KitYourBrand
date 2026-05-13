export type ProfileApiKeyState = {
  configured: boolean
  masked: string
}

export type Profile = {
  name: string
  email: string
  initial: string
  avatar_url: string
  api_keys?: {
    recraft: ProfileApiKeyState
    openrouter: ProfileApiKeyState
  }
}

export type ProfileResponse = {
  ok: boolean
  profile: Profile
  error?: string
}
