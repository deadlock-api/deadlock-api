FROM rust:1.94-slim-trixie

ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Rust build dependencies (from api/Dockerfile) + dev utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    protobuf-compiler libprotobuf-dev ca-certificates gcc libssl-dev \
    pkg-config cmake build-essential clang curl mold \
    git jq wget sudo gnupg lsb-release \
    python3 python3-pip python3-venv \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# ClickHouse client (for migrations + data loading)
RUN curl -fsSL https://packages.clickhouse.com/deb/KEY.gpg | gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" \
       > /etc/apt/sources.list.d/clickhouse.list \
    && apt-get update && apt-get install -y --no-install-recommends clickhouse-client \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24 + pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && corepack enable \
    && corepack prepare pnpm@latest --activate \
    && rm -rf /var/lib/apt/lists/*

# Python packages for data loading script
RUN pip3 install --break-system-packages duckdb boto3

# Rust tooling
RUN rustup component add rustfmt clippy rust-analyzer

# Create non-root user
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
WORKDIR /workspaces/deadlock-api
