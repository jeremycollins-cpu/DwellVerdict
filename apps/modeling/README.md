# apps/modeling

FastAPI service for DwellVerdict. Hosts the forecast engine, comp engine, and AI retrieval (Scout) in later phases. Phase 0 ships a single `GET /health` endpoint.

## Local development

```bash
uv sync
uv run uvicorn dwellverdict_modeling.main:app --reload
# → http://127.0.0.1:8000/health
```

## Tests

```bash
uv run pytest
```

## Lint / format

```bash
uv run ruff check .
uv run ruff format .
```

## Deployment

Deployed to Fly.io with scale-to-zero. Config lands in `infra/fly.modeling.toml` in Milestone 4.
