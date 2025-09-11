# Changelog

All notable changes to the "pixi-code" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Check if project path exists before running Pixi commands

## [0.1.3] - 2024-08-24

### Added

- If `defaultInterpreterPath` is set and no Pixi environment was manually selected, use it as the project's interpreter
- Publish to OpenVSX

## [0.1.2] - 2024-07-27

### Fixed

- Deduplicate envs returned by getEnvironments

## [0.1.1] - 2024-07-27

### Fixed

- Fix error messages only showing in debug mode

## [0.1.0] - 2025-07-27

### Added

- Initial release of Pixi integration for VS Code
- Implements `EnvironmentManager` and `PackageManager` interfaces for the [Python Environments
  extension](https://github.com/microsoft/vscode-python-environments)
- Automatic discovery of Python environments created with Pixi
- Automatic interpreter selection when running and debugging Python code
- Support for Pixi features (dev, test, lint, etc.) as separate selectable environments
- Terminal activation
- Persistent environment selection per project
- Package discovery

### Limitations

- Environment creation and deletion
- Adding, updating and removing packages
