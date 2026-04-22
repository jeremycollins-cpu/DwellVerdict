# syntax=docker/dockerfile:1.7

# ═══════════════════════════════════════════════════════════════════════
# Stage 1: builder
#
# A multi-stage build defines two images in one Dockerfile. The builder
# has uv, lockfile, and dev tooling. The runtime (below) has only what's
# needed to run — no uv, no build cache, no dev deps. This is how we
# keep the final image small.
# ═══════════════════════════════════════════════════════════════════════
FROM python:3.12-slim-bookworm AS builder

# Copy uv's binary from Astral's official image rather than `pip install uv`.
# A specific version pin (0.5.11) keeps builds reproducible; bumping uv
# becomes an explicit PR instead of silent drift.
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

# uv env tuning:
# - UV_LINK_MODE=copy         → materialize venv with real files (safer
#                                on container FS than symlinks)
# - UV_COMPILE_BYTECODE=1     → pre-compile .pyc files during install so
#                                cold starts on Fly don't pay the compile
#                                cost (matters for scale-to-zero)
# - UV_PROJECT_ENVIRONMENT     → deterministic venv location
# - UV_PYTHON_DOWNLOADS=never → use the Python already in the base image,
#                                don't let uv download its own
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=python3.12

WORKDIR /app

# Docker layer caching: each COPY/RUN produces a layer cached by content
# hash. Copying lockfile FIRST and installing deps BEFORE copying source
# means editing a .py file invalidates only the source layer, not the
# dep-install layer (which takes tens of seconds). Biggest Docker speedup.
COPY pyproject.toml uv.lock ./

# --no-install-project: install deps only, skip the project itself.
#                       Project gets installed in a second pass below.
# --frozen:             fail if uv.lock and pyproject.toml disagree —
#                       protects against stale lockfiles in production.
# --no-dev:             skip pytest, ruff, mypy — no place in runtime.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# NOW copy the source and install the project itself.
COPY dwellverdict_modeling/ dwellverdict_modeling/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ═══════════════════════════════════════════════════════════════════════
# Stage 2: runtime
#
# Fresh python:3.12-slim. We copy ONLY the built venv and source from
# the builder stage. No uv, no apt cache, no test files. This is what
# actually ships to Fly.
# ═══════════════════════════════════════════════════════════════════════
FROM python:3.12-slim-bookworm AS runtime

# Create a non-root user. Running as root inside a container isn't the
# security hole it is on a real host (namespaces + capabilities limit
# damage), but non-root is free defense-in-depth.
RUN groupadd --system --gid 1000 app \
 && useradd --system --uid 1000 --gid app --shell /bin/bash --create-home app

WORKDIR /app

# --chown=app:app sets the owner of the copied files so the non-root
# user can read them without a separate chmod pass.
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/dwellverdict_modeling /app/dwellverdict_modeling

# Put the venv's bin directory on PATH so `uvicorn` resolves without
# activation. PYTHONUNBUFFERED=1 flushes print/log output immediately so
# Fly's log stream sees it in real time.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app

# Document which port the container listens on. Doesn't open the port —
# Fly's fly.toml does that — but it's convention and tooling reads it.
EXPOSE 8080

# --proxy-headers + --forwarded-allow-ips=* tell uvicorn to trust
# X-Forwarded-For/Proto headers that Fly's edge proxy sets. Without
# these, any code that reads request.client.host or request.url.scheme
# sees Fly's internal network, not the real user / https.
CMD ["uvicorn", "dwellverdict_modeling.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
