# Changelog

All notable changes to the "pixi-code" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Pre-release]

- Fix `pixi-code.pixiExecutable` setting not being read
- Fix subprocess runner race condition between exit and close events
- Fix fire-and-forget promises in environment selection
- Remove broken `deactivate` function (VS Code handles cleanup automatically)
- Extract shared helpers and parallelize environment discovery
- Add pre-release pipeline for continuous updates on every push to main
- Revert 0.1.5 `activatedRun` change now that https://github.com/microsoft/vscode-python-debugger/pull/949 was merged
- Remove `defaultInterpreterPath` support for setting the active environment

## [0.1.5]

- Fix debugging Pixi projects in the new version of the Python Environments extension by fixing the `activatedRun`
  command.

## [0.1.4]

- Check if project path exists before running Pixi commands
- Check minimum Pixi version on activation
- Remove unsupported actions (create, quick create and remove) for better UX

## [0.1.3]

### Added

- If `defaultInterpreterPath` is set and no Pixi environment was manually selected, use it as the project's interpreter
- Publish to OpenVSX

## [0.1.2]

### Fixed

- Deduplicate envs returned by getEnvironments

## [0.1.1]

### Fixed

- Fix error messages only showing in debug mode

## [0.1.0]

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
