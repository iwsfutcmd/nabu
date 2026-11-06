# syntax=docker/dockerfile:1.7
# The speech service (`nabu speech serve`, gameplan §10.4): tiers 1–2, for `--profile speech`.
# CPU PyTorch and the recognizers make it several gigabytes; the models download on first use
# into the hf volume. Not built in CI.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy HF_HOME=/srv/hf
WORKDIR /srv/nabu/pipeline
COPY pipeline/ ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    uv sync --frozen --no-default-groups --group speech
EXPOSE 8790
# Only the API's network reaches it (compose); recordings are scored and dropped, never kept.
CMD ["uv", "run", "--no-sync", "nabu", "speech", "serve", "--host", "0.0.0.0"]
