# Contributing to Pixi Code

Thank you for your interest in contributing to Pixi Code! This document provides guidelines for contributing to this VS
Code extension that integrates Pixi environments with the Python Environments extension.

## Development setup

1. **Prerequisites**
    - Node.js 20+
    - VS Code with the Python Environments extension installed
    - Pixi installed on your system

2. **Clone and setup**

    ```bash
    git clone https://github.com/renan-r-santos/pixi-code.git
    cd pixi-code
    npm install
    ```

3. **Development workflow**
    ```bash
    npm run compile    # Build the extension
    npm run watch      # Watch for changes during development
    ```

## Code style and quality

This project maintains strict code quality standards using TypeScript, ESLint, and Prettier. All code must pass these
quality checks before being merged.

```bash
npm run lint            # Check for linting issues
npm run format:check    # Check code formatting
npm run compile         # Build and verify compilation
```

Fixing issues:

```bash
npm run format          # Auto-fix formatting issues
npm run lint -- --fix   # Auto-fix linting issues where possible
```

## Making a contribution

### 1. Fork and branch

Fork the repository and create a feature branch:

```bash
git checkout -b feature/your-feature-name
```

### 2. Development guidelines

- **Follow existing patterns**: Study the codebase structure and maintain consistency
- **TypeScript strict mode**: Leverage strong typing throughout
- **Import organization**: ESLint automatically sorts and organizes imports
- **Code formatting**: Use Prettier to format your code
- **Logging**: Use the provided logging utilities in `src/common/logging.ts`

### 3. Extension testing

Test the extension functionality:

1. Press `F5` in launch VS Code in debug mode
2. Open a project containing `pixi.toml` or `pyproject.toml`
3. Verify Pixi environments are discovered and functional
4. Test environment switching and terminal activation

### 4. Commit and submit

- Reference any related issues
- Submit a pull request with detailed description
