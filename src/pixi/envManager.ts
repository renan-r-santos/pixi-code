import { EventEmitter, LogOutputChannel, MarkdownString, ProgressLocation, ThemeIcon, Uri, window } from 'vscode';

import {
    DidChangeEnvironmentEventArgs,
    DidChangeEnvironmentsEventArgs,
    EnvironmentChangeKind,
    EnvironmentManager,
    GetEnvironmentScope,
    GetEnvironmentsScope,
    IconPath,
    PythonEnvironment,
    PythonEnvironmentApi,
    RefreshEnvironmentsScope,
    ResolveEnvironmentContext,
    SetEnvironmentScope,
} from '../api';
import { createDeferred, Deferred } from '../common/deferred';
import { traceVerbose } from '../common/logging';
import { resolvePixiProjectPaths } from '../common/searchPaths';
import { PIXI_MANAGER_ID } from '../common/utils';
import { PixiEnvironment } from './types';
import {
    clearExtensionCache,
    getGlobalEnvId,
    getProjectEnvId,
    refreshPixi,
    setGlobalEnvId,
    setProjectEnvId,
} from './utils';

export class PixiEnvManager implements EnvironmentManager {
    private globalEnv: PythonEnvironment | undefined;
    private activeEnv = new Map<string, PythonEnvironment>(); // Selected environment for each project
    private projectToEnvs = new Map<string, PixiEnvironment[]>(); // Maps a project path to its `pixi info` output

    private readonly _onDidChangeEnvironment = new EventEmitter<DidChangeEnvironmentEventArgs>();
    readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

    private readonly _onDidChangeEnvironments = new EventEmitter<DidChangeEnvironmentsEventArgs>();
    readonly onDidChangeEnvironments = this._onDidChangeEnvironments.event;

    constructor(
        private readonly api: PythonEnvironmentApi,
        public readonly log: LogOutputChannel,
    ) {
        this.name = 'pixi';
        this.displayName = 'Pixi';
        this.preferredPackageManagerId = PIXI_MANAGER_ID;
        this.tooltip = 'Pixi Environment Manager';
        this.iconPath = new ThemeIcon('prefix-dev');
    }

    readonly name: string;
    readonly displayName: string;
    readonly preferredPackageManagerId: string;
    readonly description?: string;
    readonly tooltip: string | MarkdownString;
    readonly iconPath?: IconPath;

    dispose() {
        this._onDidChangeEnvironment.dispose();
        this._onDidChangeEnvironments.dispose();
        this.globalEnv = undefined;
        this.activeEnv.clear();
        this.projectToEnvs.clear();
    }

    private _initialized: Deferred<void> | undefined;

    async initialize() {
        if (this._initialized) {
            return this._initialized.promise;
        }

        this._initialized = createDeferred();

        try {
            await this.refreshAll();
        } finally {
            this._initialized.resolve();
        }
    }

    async refresh(scope: RefreshEnvironmentsScope) {
        traceVerbose(`Called refresh with scope: ${scope}`);

        if (scope instanceof Uri) {
            await this.refreshOne(scope);
        } else {
            await this.refreshAll();
        }
    }

    async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
        traceVerbose(`Called getEnvironments with scope: ${scope}`);

        await this.initialize();

        if (scope === 'all') {
            return [...this.buildEnvLookup().values()];
        }

        if (scope instanceof Uri) {
            const project = this.api.getPythonProject(scope);
            return project ? this.projectToEnvs.get(project.uri.fsPath) || [] : [];
        }

        return [];
    }

    async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
        traceVerbose(`Called get with scope: ${scope}`);

        await this.initialize();

        if (!scope) {
            return this.globalEnv;
        }

        const project = this.api.getPythonProject(scope);
        return project ? this.activeEnv.get(project.uri.fsPath) : this.globalEnv;
    }

    async set(scope: SetEnvironmentScope, environment?: PythonEnvironment) {
        traceVerbose(`Called set with scope: ${scope}, environment: ${JSON.stringify(environment)}`);

        if (scope === undefined) {
            await setGlobalEnvId(environment?.envId.id);
            this.triggerDidChangeEnvironment(undefined, this.globalEnv, environment);
            this.globalEnv = environment;
            return;
        }

        const uris = scope instanceof Uri ? [scope] : scope;

        for (const uri of uris) {
            const project = this.api.getPythonProject(uri);
            if (!project) {
                continue;
            }

            const projectPath = project.uri.fsPath;
            const oldEnv = this.activeEnv.get(projectPath);

            if (environment) {
                this.activeEnv.set(projectPath, environment);
            } else {
                this.activeEnv.delete(projectPath);
            }

            await setProjectEnvId(projectPath, environment?.envId.id);
            this.triggerDidChangeEnvironment(project.uri, oldEnv, environment);
        }
    }

    async resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
        traceVerbose(`Called resolve with context: ${context}`);

        const project = this.api.getPythonProject(context);
        return project ? this.activeEnv.get(project.uri.fsPath) : undefined;
    }

    async clearCache() {
        traceVerbose('Called clearCache');

        await clearExtensionCache();
    }

    private buildEnvLookup(): Map<string, PixiEnvironment> {
        return new Map(
            Array.from(this.projectToEnvs.values()).flatMap((envs) => envs.map((env) => [env.envId.id, env])),
        );
    }

    private diffEnvironments(oldEnvs: PixiEnvironment[], newEnvs: PixiEnvironment[]): DidChangeEnvironmentsEventArgs {
        const oldIds = new Set(oldEnvs.map((e) => e.envId.id));
        const newIds = new Set(newEnvs.map((e) => e.envId.id));

        return [
            ...oldEnvs
                .filter((e) => !newIds.has(e.envId.id))
                .map((e) => ({ environment: e, kind: EnvironmentChangeKind.remove })),
            ...newEnvs
                .filter((e) => !oldIds.has(e.envId.id))
                .map((e) => ({ environment: e, kind: EnvironmentChangeKind.add })),
        ];
    }

    private async refreshAll(): Promise<void> {
        await window.withProgress(
            {
                location: ProgressLocation.Window,
                title: 'Discovering Pixi environments',
            },
            async () => {
                const oldProjectToEnvs = new Map(this.projectToEnvs);
                this.projectToEnvs.clear();

                // Collect project paths from registered Python projects and search paths
                const projects = this.api.getPythonProjects();
                const projectMap = new Map(projects.map((p) => [p.uri.fsPath, p]));

                const searchPathRoots = await resolvePixiProjectPaths();
                const projectPaths = new Set([...projectMap.keys(), ...searchPathRoots]);

                const changes: DidChangeEnvironmentsEventArgs = [];

                await Promise.all(
                    [...projectPaths].map(async (projectPath) => {
                        const oldEnvs = oldProjectToEnvs.get(projectPath) || [];
                        const newEnvs = await refreshPixi(projectPath);

                        changes.push(...this.diffEnvironments(oldEnvs, newEnvs));
                        this.projectToEnvs.set(projectPath, newEnvs);
                    }),
                );

                this._onDidChangeEnvironments.fire(changes);

                const envLookup = this.buildEnvLookup();

                // Update global environment
                const globalEnvId = await getGlobalEnvId();
                const globalEnv = globalEnvId ? envLookup.get(globalEnvId) : undefined;
                this.triggerDidChangeEnvironment(undefined, this.globalEnv, globalEnv);
                this.globalEnv = globalEnv;

                // Update active environments for each project
                const oldActiveEnv = new Map(this.activeEnv);
                this.activeEnv.clear();

                for (const projectPath of projectPaths) {
                    const envId = await getProjectEnvId(projectPath);
                    const env = envId ? envLookup.get(envId) : undefined;

                    if (env) {
                        this.activeEnv.set(projectPath, env);
                    }

                    this.triggerDidChangeEnvironment(
                        projectMap.get(projectPath)?.uri,
                        oldActiveEnv.get(projectPath),
                        env,
                    );
                }
            },
        );
    }

    private async refreshOne(scope: Uri): Promise<void> {
        const project = this.api.getPythonProject(scope);
        if (!project) {
            return;
        }

        const projectPath = project.uri.fsPath;
        const oldEnvs = this.projectToEnvs.get(projectPath) || [];
        const newEnvs = await refreshPixi(projectPath);

        this.projectToEnvs.set(projectPath, newEnvs);
        this._onDidChangeEnvironments.fire(this.diffEnvironments(oldEnvs, newEnvs));

        // Update active environment for this project
        const envId = await getProjectEnvId(projectPath);
        const env = envId ? newEnvs.find((e) => e.envId.id === envId) : undefined;
        this.triggerDidChangeEnvironment(project.uri, this.activeEnv.get(projectPath), env);

        if (env) {
            this.activeEnv.set(projectPath, env);
        } else {
            this.activeEnv.delete(projectPath);
        }
    }

    private triggerDidChangeEnvironment(
        uri: Uri | undefined,
        oldEnv: PythonEnvironment | undefined,
        newEnv: PythonEnvironment | undefined,
    ) {
        if (oldEnv?.envId.id !== newEnv?.envId.id) {
            this._onDidChangeEnvironment.fire({ uri, old: oldEnv, new: newEnv });
        }
    }
}
