# Pixi VSCode Extension

VS Code extension that integrates [Pixi](https://pixi.sh) environments with the [Python Environments
extension](https://github.com/microsoft/vscode-python-environments).

## Overview

This extension implements the `EnvironmentManager` and `PackageManager` interfaces for the [Python Environments
extension](https://github.com/microsoft/vscode-python-environments), allowing Pixi environments to appear alongside
conda, venv, and other Python environments in VS Code.

## Features

- Automatic discovery of Python environments created with Pixi
- Automatic interpreter selection when running and debugging Python code
- Support for Pixi features (dev, test, lint, etc.) as separate selectable environments
- Terminal activation
- Persistent environment selection per project
- Package discovery

## Requirements

- Pixi installed on your system
- Python Environments extension (`ms-python.vscode-python-envs`)

## Installation

1. Install Pixi on your system
2. Install this extension from the VS Code Marketplace
3. Open a project with a `pixi.toml` or `pyproject.toml` file

The extension will automatically discover Pixi environments and register them with the Python Environments system.

## Extension Settings

- `pixi-code.pixiExecutable`: Path to the Pixi executable (default: pixi). If empty, autodiscovery will be used.

## Limitations

- **Environment creation and deletion**
- **Adding, updating and removing packages**

These operations are intentionally not supported as Pixi's declarative manifest approach works best through direct CLI
interaction or editing of the `pixi.toml` or `pyproject.toml` files directly.

## Troubleshooting

### Logs

Check the "Pixi Environment Manager" output channel:

1. View → Output
2. Select "Pixi Environment Manager" from dropdown

### Common Issues

**Pixi executable not found**

- Ensure Pixi is installed and in PATH
- Set `pixi-code.pixiExecutable` setting if needed

**No environments discovered**

- Verify `pixi.toml` or `pyproject.toml` exists in project root
- Run `pixi install` to ensure environments are set up

## License

MIT
