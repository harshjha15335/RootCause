ARG ROOTCAUSE_DEPENDENCY_STAGE=online-dependencies
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .

FROM base AS online-dependencies
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

FROM base AS offline-dependencies
COPY --from=wheelhouse / /wheels
RUN pip install --no-index --find-links=/wheels --no-cache-dir --require-hashes -r requirements.txt && rm -rf /wheels

FROM ${ROOTCAUSE_DEPENDENCY_STAGE} AS runtime
COPY --chown=10001:10001 api api
COPY --chown=10001:10001 agents agents
COPY --chown=10001:10001 engine engine
COPY --chown=10001:10001 debugger debugger
COPY --chown=10001:10001 config config
RUN useradd --create-home --uid 10001 appuser
USER appuser
EXPOSE 8000
CMD ["python", "-m", "api.server"]
