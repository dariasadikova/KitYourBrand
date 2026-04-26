from __future__ import annotations

from pydantic import BaseModel, Field


class UserDto(BaseModel):
    id: int
    name: str
    email: str
    avatar_url: str | None = None


class ProjectDto(BaseModel):
    id: int
    slug: str
    name: str
    brand_id: str
    created_at: str
    updated_at: str


class ProviderErrorDto(BaseModel):
    message: str | None = None
    hint: str | None = None


class GenerationAssetDto(BaseModel):
    provider: str
    name: str
    filename: str
    url: str


class GenerationResultDto(BaseModel):
    brand_id: str
    logos: list[GenerationAssetDto] = Field(default_factory=list)
    icons: list[GenerationAssetDto] = Field(default_factory=list)
    patterns: list[GenerationAssetDto] = Field(default_factory=list)
    illustrations: list[GenerationAssetDto] = Field(default_factory=list)
    has_errors: bool = False
    error: str | None = None
    error_hint: str | None = None


class GenerationJobDto(BaseModel):
    id: str
    status: str
    progress: int
    message: str
    project_slug: str
    current_provider: str | None = None
    failed_provider: str | None = None
    providers: dict[str, str] = Field(default_factory=dict)
    provider_errors: dict[str, ProviderErrorDto | None] = Field(default_factory=dict)
    logs: list[str] = Field(default_factory=list)
    cancel_requested: bool = False
