# Release Process

## Pre-release

Every push to `main` automatically publishes a pre-release version to both the VS Code
Marketplace and OpenVSX. Users who opt-in to pre-release versions in their editor will
receive these updates automatically.

## Stable Release

1. **Create a PR updating package.json version and package-lock.json**

2. **Merge PR**

3. **Create Git Tag**

    ```bash
    git tag vx.x.x
    git push origin vx.x.x
    ```

4. **Verify GitHub Actions**
    - Check that release workflow runs successfully
