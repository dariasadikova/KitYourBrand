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

export type GenerationStartPayload = {
  brand_id?: string;
  style_id?: string;
  logos_count: number;
  icons_count: number;
  patterns_count: number;
  illustrations_count: number;
  build_style?: boolean;
};
