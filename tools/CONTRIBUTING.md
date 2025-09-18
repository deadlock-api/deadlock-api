# Contributing to Deadlock API Tools

Thank you for your interest in contributing to Deadlock API Tools! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and considerate of others when participating in discussions, submitting code, or engaging in any other form of communication within this project.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- Rust 1.90.0 or later
- Protobuf compiler
- Docker and Docker Compose (for running the full stack)
- Git

### Setting Up Your Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/deadlock-api-tools.git
   cd deadlock-api-tools
   ```
3. Add the original repository as an upstream remote:
   ```bash
   git remote add upstream https://github.com/deadlock-api/deadlock-api-tools.git
   ```
4. Create a `.env` file with the necessary environment variables (see README.md for details)
5. Build the project:
   ```bash
   cargo build
   ```

## Development Workflow

### Branching Strategy

- `master` branch is the main branch and should always be stable
- Create feature branches from `master` for your work
- Use the naming convention `feature/your-feature-name` or `fix/issue-description`

### Making Changes

1. Create a new branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes and commit them with clear, descriptive commit messages:
   ```bash
   git commit -m "Add feature X to component Y"
   ```
3. Push your changes to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Style and Quality

- Follow the Rust style guidelines
- Use `cargo fmt` to format your code
- Run `cargo clippy` to check for common mistakes and improve code quality
- Ensure your code has appropriate error handling
- Add comments where necessary to explain complex logic

### Testing

- Write tests for new features and bug fixes
- Ensure all tests pass before submitting a pull request:
  ```bash
  cargo test
  ```
- Consider adding integration tests for complex features

## Pull Request Process

1. Update your branch with the latest changes from upstream:
   ```bash
   git fetch upstream
   git rebase upstream/master
   ```
2. Submit a pull request from your feature branch to the `master` branch of the original repository
3. In your pull request description:
   - Clearly describe the changes you've made
   - Reference any related issues
   - Mention any breaking changes
   - Include any necessary documentation updates
4. Wait for maintainers to review your pull request
5. Address any feedback or requested changes
6. Once approved, your pull request will be merged

## Adding New Components

If you're adding a new component to the project:

1. Create a new directory for your component
2. Add your component to the workspace in `Cargo.toml`
3. Ensure your component follows the project's architecture patterns
4. Update the README.md to include information about your component
5. Add appropriate Docker configuration if needed

## Documentation

- Update documentation when adding or modifying features
- Keep the README.md up to date with any changes to setup or configuration

## Reporting Issues

- Use the GitHub issue tracker to report bugs or suggest features
- Provide as much detail as possible when reporting bugs
- Include steps to reproduce the issue
- Mention your environment (OS, Rust version, etc.)

Thank you for contributing to Deadlock API Tools!
