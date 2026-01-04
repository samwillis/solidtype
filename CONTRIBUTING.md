# Contributing to SolidType

Thank you for your interest in contributing to SolidType! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/samwillis/solidtype.git
cd solidtype

# Install dependencies
pnpm install

# Run tests
pnpm test

# Start development server
cd packages/app && pnpm dev
```

## Project Structure

```
solidtype/
├── packages/
│   ├── core/          # CAD kernel (OpenCascade.js wrapper)
│   │   ├── src/       # Source code
│   │   └── tests/     # Test files
│   └── app/           # Full CAD application (React + Three.js)
│       ├── src/       # Source code
│       └── tests/     # Test files
├── plan/              # Phase-by-phase implementation plans
└── docs/              # Additional documentation
```

## Development Workflow

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Prettier (run `pnpm format`)
- **Linting**: ESLint (run `pnpm lint`)

```bash
# Format code
pnpm format

# Lint code
pnpm lint

# Fix lint issues
pnpm lint:fix
```

### Testing

We use Vitest for testing. Tests are organized in `tests/` directories.

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests for a specific package
pnpm --filter @solidtype/core test
pnpm --filter @solidtype/app test
```

### Type Checking

```bash
pnpm typecheck
```

## Guidelines

### Before Submitting a PR

1. **Run all checks**: `pnpm test && pnpm lint && pnpm typecheck`
2. **Add tests** for new functionality
3. **Update documentation** if needed
4. **Keep commits focused** and well-described

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add new feature`
- `fix: resolve bug in X`
- `refactor: reorganize Y module`
- `docs: update documentation for Z`
- `test: add tests for W`

### Code Review

All PRs require review before merging. Reviewers will check:

- Code quality and style
- Test coverage
- Documentation
- Performance implications

## Architecture

Please read these documents before making significant changes:

- [`OVERVIEW.md`](OVERVIEW.md) - What SolidType is and why
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - How it's structured
- [`AGENTS.md`](AGENTS.md) - Detailed coding guidelines
- [`/plan/*`](plan/) - Implementation plans

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions for questions and ideas

## License

By contributing, you agree that your contributions will be licensed under the project's MIT license.
