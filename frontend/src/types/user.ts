export interface User {
  id: number
  name: string
  email: string
  avatar_url?: string | null
}

export interface UserProfile extends User {
  had_projects: boolean
}
