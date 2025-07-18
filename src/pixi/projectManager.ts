import * as path from 'path';
import {
    Disposable,
    Event,
    EventEmitter,
    LogOutputChannel,
    MarkdownString,
    ProgressLocation,
    ThemeIcon,
    window,
} from 'vscode';

import {
    DidChangePackagesEventArgs,
    IconPath,
    Package,
    PackageChangeKind,
    PackageManagementOptions,
    PackageManager,
    PythonEnvironment,
    PythonEnvironmentApi,
} from '../api';
import { traceVerbose } from '../common/logging';
import { PixiEnvironment, PixiPackage } from './types';
import { pixiPkgsToPackages, runPixi } from './utils';

export class PixiPackageManager implements PackageManager, Disposable {
    private readonly _onDidChangePackages = new EventEmitter<DidChangePackagesEventArgs>();
    onDidChangePackages: Event<DidChangePackagesEventArgs> = this._onDidChangePackages.event;

    constructor(
        public readonly api: PythonEnvironmentApi,
        public readonly log: LogOutputChannel,
    ) {
        this.name = 'pixi';
        this.displayName = 'Pixi';
        this.description = 'Pixi Package Manager';
        this.tooltip = 'Pixi Package Manager';
        this.iconPath = new ThemeIcon('prefix-dev');
    }

    readonly name: string;
    readonly displayName?: string;
    readonly description?: string;
    readonly tooltip?: string | MarkdownString;
    readonly iconPath?: IconPath;

    dispose() {
        this._onDidChangePackages.dispose();
    }

    async manage(environment: PythonEnvironment, options: PackageManagementOptions): Promise<void> {
        traceVerbose(
            `Called manage with environment: ${JSON.stringify(environment)}, options: ${JSON.stringify(options)}`,
        );

        window.showErrorMessage('The Pixi extension does not support managing packages. Please use the CLI directly.');
    }

    async refresh(environment: PixiEnvironment): Promise<void> {
        traceVerbose(`Called refresh for environment: ${JSON.stringify(environment)}`);

        await window.withProgress(
            {
                location: ProgressLocation.Window,
                title: 'Refreshing Pixi packages',
            },
            async () => {
                const manifest_path = environment.pixiInfo.project_info.manifest_path;
                const project_path = path.dirname(manifest_path);

                const stdout = await runPixi(
                    ['list', '--no-lockfile-update', '--json', '--environment', environment.name],
                    {
                        cwd: project_path,
                    },
                );
                const pixiPackages: PixiPackage[] = JSON.parse(stdout);

                const before = environment.packages;
                const after = pixiPkgsToPackages(pixiPackages, environment.envId.id);

                environment.packages = after;
                this.triggerOnDidChangePackages(environment, before, after);
            },
        );
    }

    async getPackages(environment: PixiEnvironment): Promise<Package[] | undefined> {
        traceVerbose(`Called getPackages for environment: ${JSON.stringify(environment)}`);

        return environment.packages;
    }

    private triggerOnDidChangePackages(environment: PixiEnvironment, before: Package[], after: Package[]): void {
        const changes: { kind: PackageChangeKind; pkg: Package }[] = [];

        // Find removed packages
        for (const beforePkg of before) {
            const found = after.find((p) => p.name === beforePkg.name);
            if (!found) {
                changes.push({ kind: PackageChangeKind.remove, pkg: beforePkg });
            }
        }

        // Find added and updated packages
        for (const afterPkg of after) {
            const beforePkg = before.find((p) => p.name === afterPkg.name);
            if (!beforePkg) {
                // Package was added
                changes.push({ kind: PackageChangeKind.add, pkg: afterPkg });
            } else if (beforePkg.version !== afterPkg.version) {
                // Package version changed - treat as remove then add
                changes.push({ kind: PackageChangeKind.remove, pkg: beforePkg });
                changes.push({ kind: PackageChangeKind.add, pkg: afterPkg });
            }
        }

        if (changes.length > 0) {
            this._onDidChangePackages.fire({
                environment,
                manager: this,
                changes,
            });
        }
    }
}
