# Deadlock API Tools

A collection of microservices for scraping, processing, and serving data related to Deadlock game matches, player profiles, and game statistics.

## Project Overview

Deadlock API Tools is a suite of Rust-based microservices designed to collect, process, and serve data for the Deadlock game. The project consists of multiple components that work together to provide a comprehensive data pipeline for game statistics, player profiles, match data, and more.

## Components

The project consists of the following main components:

- **active-matches-scraper**: Scrapes active match data from the game API
- **builds-fetcher**: Fetches hero build data from the game API
- **history-fetcher**: Retrieves match history data for player accounts
- **hltv-scraper**: Scrapes HLTV (game spectator) data and provides spectator bot functionality
- **ingest-worker**: Processes and ingests data into the database
- **matchdata-downloader**: Downloads match data from the game API
- **salt-scraper**: Scrapes match salt data (used for replay identification)
- **steam-profile-fetcher**: Fetches player profile data from Steam API
- **common**: Shared library code used by all components

## Architecture

The system uses a microservice architecture with the following technologies:

- **Rust**: Primary programming language for most components
- **Docker**: Containerization for all services
- **ClickHouse**: Database for storing match and player data
- **PostgreSQL**: Database for storing build data and API keys
- **Redis**: Used for caching and rate limiting
- **S3-compatible storage**: For storing match data and other assets

## Prerequisites

To run this project, you'll need:

- Rust 1.85.0 or later
- Docker and Docker Compose
- PostgreSQL
- ClickHouse
- Redis
- S3-compatible storage (like MinIO)
- Protobuf compiler

## Setup and Installation

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/deadlock-api/deadlock-api-tools.git
   cd deadlock-api-tools
   ```

2. Install Rust and required dependencies:
   ```bash
   # Install Rust
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # Install protobuf compiler
   sudo apt-get install -y protobuf-compiler libprotobuf-dev

   # Install cargo-chef for optimized Docker builds
   cargo install cargo-chef
   ```

3. Create a `.env` file in the project root with the required environment variables (see Configuration section below)

4. Build the project:
   ```bash
   cargo build
   ```

5. Run a specific component:
   ```bash
   cargo run --bin <component-name>
   ```

### Docker Deployment

1. Create a `.env` file with the required environment variables

2. Build and run using Docker Compose:
   ```bash
   docker-compose up -d
   ```

## Configuration

The project uses environment variables for configuration. Create a `.env` file in the project root with the following variables:

### Database Configuration
```
# ClickHouse
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DB=deadlock

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DBNAME=deadlock
```

### Storage Configuration
```
# S3 Main Storage
S3_REGION=us-east-1
S3_BUCKET_NAME=deadlock
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT_URL=http://minio:9000

# S3 Cache Storage
S3_CACHE_REGION=us-east-1
S3_CACHE_BUCKET_NAME=deadlock-cache
S3_CACHE_ACCESS_KEY_ID=your_access_key
S3_CACHE_SECRET_ACCESS_KEY=your_secret_key
S3_CACHE_ENDPOINT_URL=http://minio:9000
```

### Redis Configuration
```
REDIS_URL=redis://redis:6379
```

### Steam API Configuration
```
STEAM_PROXY_URL=http://your-steam-proxy-url
STEAM_PROXY_API_KEY=your_api_key
```

### Component-Specific Configuration
```
# For steam-profile-fetcher
FETCH_INTERVAL_SECONDS=600

# For salt-scraper
SALTS_COOLDOWN_MILLIS=36000

# For hltv-scraper
SPECTATE_BOT_URL=http://your-spectate-bot-url
PROXY_API_TOKEN=your_proxy_api_token
PROXY_URL=http://your-proxy-url
```

### Logging and Telemetry
```
RUST_LOG=info
```

## Database Migrations

The project includes database migration scripts for both PostgreSQL and ClickHouse in the `migrations` directory.

## Development Workflow

1. Make changes to the codebase
2. Run tests to ensure functionality
3. Build and test locally
4. Submit a pull request

## Deployment

The project uses GitHub Actions for CI/CD. When changes are pushed to the master branch, Docker images are automatically built and pushed to GitHub Container Registry.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For questions or feedback, please open an issue on GitHub or contact the project maintainers.
