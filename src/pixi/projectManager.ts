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
import { PixiEnvironment } from './types';
import { listPixiPackages, pixiPkgsToPackages } from './utils';

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
                if (!environment.pixiInfo.project_info) {
                    traceVerbose('No project info found in pixiInfo; skipping package refresh.');
                    return;
                }

                const projectPath = path.dirname(environment.pixiInfo.project_info.manifest_path);
                const pixiPackages = await listPixiPackages(environment.name, projectPath);

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
        const beforeByName = new Map(before.map((p) => [p.name, p]));
        const afterByName = new Map(after.map((p) => [p.name, p]));

        for (const pkg of before) {
            if (!afterByName.has(pkg.name)) {
                changes.push({ kind: PackageChangeKind.remove, pkg });
            }
        }

        // Find added and updated packages
        for (const pkg of after) {
            const prev = beforeByName.get(pkg.name);
            if (!prev) {
                // Package was added
                changes.push({ kind: PackageChangeKind.add, pkg });
            } else if (prev.version !== pkg.version) {
                // Package version changed - treat as remove then add
                changes.push({ kind: PackageChangeKind.remove, pkg: prev });
                changes.push({ kind: PackageChangeKind.add, pkg });
            }
        }

        if (changes.length > 0) {
            this._onDidChangePackages.fire({ environment, manager: this, changes });
        }
    }
}
