# Contributing to Deadlock API

Thank you for considering contributing to Deadlock API! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please create an issue with the following information:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Any relevant logs or screenshots
- Your environment (OS, Rust version, etc.)

### Suggesting Features

We welcome feature suggestions! Please create an issue with:

- A clear, descriptive title
- A detailed description of the proposed feature
- Any relevant examples or mockups
- The motivation behind the feature

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests and ensure they pass (`cargo test`)
5. Format your code (`cargo fmt`)
6. Run linting checks (`cargo clippy`)
7. Commit your changes (`git commit -am 'Add my feature'`)
8. Push to the branch (`git push origin feature/my-feature`)
9. Create a new Pull Request

## Development Setup

1. Install Rust (stable toolchain)
2. Install Protocol Buffers compiler
3. Clone the repository
4. Copy `.env.example` to `.env` and configure as needed
5. Run `cargo build` to build the project

## Coding Guidelines

### Rust Style

- Follow the [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Use `cargo fmt` to format your code
- Use `cargo clippy` to check for common mistakes and improve code quality

### Documentation

- Document public API functions, structs, and traits
- Keep documentation up-to-date with code changes
- Use examples where appropriate

### Testing

- Write tests for new features and bug fixes
- Ensure all tests pass before submitting a PR
- Consider edge cases in your tests

### Commit Messages

- Use clear, descriptive commit messages
- Start with a verb in the present tense (e.g., "Add", "Fix", "Update")
- Reference issue numbers when applicable

## Review Process

- All PRs will be reviewed by at least one maintainer
- Feedback may be provided for changes or improvements
- Once approved, a maintainer will merge your PR

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

Thank you for contributing to Deadlock API!
