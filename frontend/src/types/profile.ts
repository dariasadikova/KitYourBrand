export type ProfileApiKeyState = {
  configured: boolean
  masked: string
}

export type YandexCloudApiKeyState = {
  configured: boolean
  api_key_configured: boolean
  api_key_masked: string
  folder_configured: boolean
  folder_masked: string
}

export type Profile = {
  name: string
  email: string
  initial: string
  avatar_url: string
  api_keys?: {
    recraft: ProfileApiKeyState
    openrouter: ProfileApiKeyState
    yandex_cloud: YandexCloudApiKeyState
  }
}

export type ProfileResponse = {
  ok: boolean
  profile: Profile
  error?: string
}
