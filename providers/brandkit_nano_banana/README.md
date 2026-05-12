# Nano Banana BrandKit provider

OpenRouter CLI provider for KitYourBrand.

Model: `google/gemini-2.5-flash-image`

Required env:

```bash
OPENROUTER_API_KEY=...
```

The provider is intended to be launched by the main FastAPI app via subprocess.
Outputs are saved into `out/nano_banana/<brand_id>/...`.
