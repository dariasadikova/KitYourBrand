export type ProviderError = {
  message?: string | null;
  hint?: string | null;
} | null;

export type GenerationJob = {
  id: string;
  status: string;
  progress: number;
  message: string;
  project_slug: string;
  current_provider?: string | null;
  failed_provider?: string | null;
  providers: Record<string, string>;
  provider_errors: Record<string, ProviderError>;
  logs: string[];
  cancel_requested: boolean;
};

export type GenerationAsset = {
  provider: string;
  name: string;
  filename: string;
  url: string;
};

export type GenerationResult = {
  brand_id: string;
  logos: GenerationAsset[];
  icons: GenerationAsset[];
  patterns: GenerationAsset[];
  illustrations: GenerationAsset[];
  has_errors?: boolean;
  error?: string | null;
  error_hint?: string | null;
};

export type GenerationHistoryRow = {
  job_id: string;
  started_display: string;
  project_name: string;
  project_slug: string;
  status_key: 'running' | 'success' | 'error' | string;
  duration_display: string;
  action: 'cancel' | 'open' | 'restore' | 'repeat' | string;
  results_url: string;
  editor_url: string;
  error_message: string;
  error_hint: string;
  interrupted: boolean;
  project_deleted: boolean;
};

export type GenerationHistoryStats = {
  total: number;
  successful: number;
  avg_duration: number | null;
  projects_with_generations: number;
};

export type GenerationStartPayload = {
  brand_id?: string;
  style_id?: string;
  logos_count: number;
  icons_count: number;
  patterns_count: number;
  illustrations_count: number;
  build_style?: boolean;
};
