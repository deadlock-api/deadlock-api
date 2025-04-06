# Deadlock API

[![Rust CI/CD](https://github.com/deadlock-api/deadlock-api-rust/actions/workflows/rust.yml/badge.svg)](https://github.com/deadlock-api/deadlock-api-rust/actions/workflows/rust.yml)

**Live API Documentation**: [https://api.deadlock-api.com/docs](https://api.deadlock-api.com/docs)

> **Note**: deadlock-api.com is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone
> officially involved in producing or managing Valve properties. Valve and all associated properties are trademarks or
> registered trademarks of Valve Corporation.

## 📖 Overview

Deadlock API is a Rust-based REST API that provides data and statistics for the game Deadlock. It offers endpoints for
player statistics, match history, leaderboards, hero analytics, build information, and more.

The API is built with:

- [Axum](https://github.com/tokio-rs/axum) - Web framework
- [Tokio](https://tokio.rs/) - Async runtime
- [Utoipa](https://github.com/juhaku/utoipa) - OpenAPI documentation
- [SQLx](https://github.com/launchbadge/sqlx) - SQL toolkit
- [Redis](https://redis.io/) - Caching
- [ClickHouse](https://clickhouse.com/) - Analytics database
- [PostgreSQL](https://www.postgresql.org/) - Relational database

## 🚀 Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Protocol Buffers compiler](https://grpc.io/docs/protoc-installation/)
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (for
  deployment)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/deadlock-api/deadlock-api-rust.git
   cd deadlock-api-rust
   ```

2. Install the Protocol Buffers compiler:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y protobuf-compiler libprotobuf-dev

   # macOS
   brew install protobuf
   ```

3. Build the project:
   ```bash
   cargo build
   ```

### Configuration

The application uses environment variables for configuration. Create a `.env` file in the project root with the
following variables (adjust as needed):

```env
# General Settings
EMERGENCY_MODE=false
STEAM_API_KEY=your_steam_api_key
INTERNAL_API_KEY=your_internal_api_key
STEAM_PROXY_URL=your_steam_proxy_url
STEAM_PROXY_API_KEY=your_steam_proxy_api_key

# Redis
REDIS_URL=redis://localhost:6379

# S3 Storage
S3_REGION=your_region
S3_BUCKET=your_bucket
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT=your_endpoint

# S3 Cache
S3_CACHE_REGION=your_region
S3_CACHE_BUCKET=your_bucket
S3_CACHE_ACCESS_KEY_ID=your_access_key
S3_CACHE_SECRET_ACCESS_KEY=your_secret_key
S3_CACHE_ENDPOINT=your_endpoint

# ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_HTTP_PORT=8123
CLICKHOUSE_NATIVE_PORT=9000
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DBNAME=default

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DBNAME=postgres
POSTGRES_POOL_SIZE=10
```

### Running the API

#### Local Development

```bash
# Run in development mode
cargo run
```

The API will be available at http://localhost:3000. The OpenAPI documentation is accessible
at http://localhost:3000/docs.

#### Using Docker

```bash
# Build and start the container
docker-compose up -d
```

## 🧪 Testing

Run the test suite with:

```bash
cargo test
```

## 📚 API Endpoints

The API provides endpoints for:

- **Matches**: Match data and statistics
- **Players**: Player profiles and statistics
- **Leaderboard**: Competitive rankings
- **Analytics**: Game analytics and statistics
- **Builds**: Hero build information
- **Patches**: Game update information
- **Commands**: Streamkit integration
- **Info**: General API information

For detailed API documentation, visit the [live API docs](https://api.deadlock-api.com/docs) or run the API locally and
navigate to `/docs`.

## 📝 Examples

Check out the `examples/` directory for sample code demonstrating how to use the API:

```bash
# Run an example
cargo run --example basic_usage
```

Available examples:

- `basic_usage.rs`: Shows how to make basic API requests
- `run_local_api.rs`: Demonstrates how to run the API locally

## 🤝 Contributing

Contributions are welcome! Here's how you can contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

### Development Guidelines

- Follow the [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Write tests for new features
- Update documentation as needed
- Run `cargo fmt` and `cargo clippy` before committing

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- https://deadlock-api.com/
- [Discord Community](https://discord.gg/XMF9Xrgfqu)
- [Deadlock Game](https://store.steampowered.com/app/1422450)
- [Deadlock Streamkit](https://streamkit.deadlock-api.com/)
