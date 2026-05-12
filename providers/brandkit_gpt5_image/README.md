# GPT-5 Image BrandKit provider

OpenRouter CLI provider for KitYourBrand.

Model: `openai/gpt-5.4-image-2`

Required env:

```bash
OPENROUTER_API_KEY=...
```

The provider is intended to be launched by the main FastAPI app via subprocess.
Outputs are saved into `out/gpt5_image/<brand_id>/...`.
