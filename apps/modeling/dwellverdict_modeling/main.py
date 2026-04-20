from fastapi import FastAPI
from pydantic import BaseModel

from . import __version__

app = FastAPI(
    title="DwellVerdict Modeling",
    version=__version__,
    description=(
        "Forecast engine, comp engine, and Scout retrieval for DwellVerdict. "
        "Phase 0 exposes a single health endpoint."
    ),
)


class HealthResponse(BaseModel):
    ok: bool
    version: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, version=__version__)
