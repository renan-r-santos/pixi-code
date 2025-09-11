import * as path from 'path';
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
    PythonProject,
    RefreshEnvironmentsScope,
    ResolveEnvironmentContext,
    SetEnvironmentScope,
} from '../api';
import { getDefaultInterpreterPath } from '../common/defaultInterpreter';
import { createDeferred, Deferred } from '../common/deferred';
import { traceVerbose } from '../common/logging';
import { EXTENSION_ID } from '../common/utils';
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
    private activeEnv: Map<string, PythonEnvironment> = new Map(); // Selected environment for each project
    private projectToEnvs: Map<string, PixiEnvironment[]> = new Map(); // Maps a project path to its `pixi info` output

    private readonly _onDidChangeEnvironment = new EventEmitter<DidChangeEnvironmentEventArgs>();
    public readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

    private readonly _onDidChangeEnvironments = new EventEmitter<DidChangeEnvironmentsEventArgs>();
    public readonly onDidChangeEnvironments = this._onDidChangeEnvironments.event;

    constructor(
        private readonly api: PythonEnvironmentApi,
        public readonly log: LogOutputChannel,
    ) {
        this.name = 'pixi';
        this.displayName = 'Pixi';
        this.preferredPackageManagerId = `${EXTENSION_ID}:pixi`;
        this.tooltip = 'Pixi Environment Manager';
        this.iconPath = new ThemeIcon('prefix-dev');
    }

    name: string;
    displayName: string;
    preferredPackageManagerId: string;
    description?: string;
    tooltip: string | MarkdownString;
    iconPath?: IconPath;

    public dispose() {
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
            return [
                ...new Map(
                    Array.from(this.projectToEnvs.values()).flatMap((envs) => envs.map((env) => [env.envId.id, env])),
                ).values(),
            ];
        }

        if (scope instanceof Uri) {
            const project = this.api.getPythonProject(scope);
            if (!project) {
                return [];
            }

            return this.projectToEnvs.get(project.uri.fsPath) || [];
        }

        // Skip 'global'. Pixi does not have global or base environments like Conda
        return [];
    }

    async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
        traceVerbose(`Called get with scope: ${scope}`);

        await this.initialize();

        if (!scope) {
            return this.globalEnv;
        }

        const project = this.api.getPythonProject(scope);
        if (!project) {
            return this.globalEnv;
        }

        return this.activeEnv.get(project.uri.fsPath);
    }

    async set(scope: SetEnvironmentScope, environment?: PythonEnvironment) {
        traceVerbose(`Called set with scope: ${scope}, environment: ${JSON.stringify(environment)}`);

        if (scope === undefined) {
            await setGlobalEnvId(environment?.envId.id);
            this.triggerDidChangeEnvironment(undefined, this.globalEnv, environment);
            this.globalEnv = environment;
            return;
        }

        if (scope instanceof Uri) {
            scope = [scope];
        }

        scope.forEach(async (scope) => {
            const project = this.api.getPythonProject(scope);
            if (!project) {
                return;
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
        });
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

    private async refreshAll(): Promise<void> {
        await window.withProgress(
            {
                location: ProgressLocation.Window,
                title: 'Discovering Pixi environments',
            },
            async () => {
                const add: DidChangeEnvironmentsEventArgs = [];
                const remove: DidChangeEnvironmentsEventArgs = [];

                const oldProjectToEnvs = new Map(this.projectToEnvs);
                this.projectToEnvs.clear();

                const projects = this.api.getPythonProjects();

                for (const project of projects) {
                    const projectPath = project.uri.fsPath;

                    const newEnvs = await refreshPixi(projectPath);
                    const defaultEnvs = await this.getDefaultPathEnvironments(project);
                    newEnvs.push(...defaultEnvs);

                    const oldEnvs = oldProjectToEnvs.get(projectPath) || [];

                    const oldEnvIds = new Set(oldEnvs.map((env) => env.envId.id));
                    const newEnvIds = new Set(newEnvs.map((env) => env.envId.id));

                    oldEnvs
                        .filter((env) => !newEnvIds.has(env.envId.id))
                        .forEach((env) => remove.push({ environment: env, kind: EnvironmentChangeKind.remove }));

                    newEnvs
                        .filter((env) => !oldEnvIds.has(env.envId.id))
                        .forEach((env) => add.push({ environment: env, kind: EnvironmentChangeKind.add }));

                    this.projectToEnvs.set(projectPath, newEnvs);
                }

                this._onDidChangeEnvironments.fire([...remove, ...add]);

                const envIdToEnv = new Map(
                    Array.from(this.projectToEnvs.values()).flatMap((envs) => envs.map((env) => [env.envId.id, env])),
                );

                // Update global environment
                const globalEnvId = await getGlobalEnvId();
                const globalEnv = globalEnvId ? envIdToEnv.get(globalEnvId) : undefined;

                this.triggerDidChangeEnvironment(undefined, this.globalEnv, globalEnv);
                this.globalEnv = globalEnv;

                // Update active environments for each project
                const oldActiveEnv = new Map(this.activeEnv);
                this.activeEnv.clear();

                for (const project of projects) {
                    const projectPath = project.uri.fsPath;

                    const envId = await getProjectEnvId(projectPath);
                    let env = envId ? envIdToEnv.get(envId) : undefined;

                    if (env) {
                        this.activeEnv.set(projectPath, env);
                    } else {
                        env = await this.trySetActiveFromDefault(project, projectPath);
                    }

                    this.triggerDidChangeEnvironment(project.uri, oldActiveEnv.get(projectPath), env);
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
        const defaultEnvs = await this.getDefaultPathEnvironments(project);
        newEnvs.push(...defaultEnvs);

        const oldEnvIds = new Set(oldEnvs.map((env) => env.envId.id));
        const newEnvIds = new Set(newEnvs.map((env) => env.envId.id));

        const add: DidChangeEnvironmentsEventArgs = [];
        const remove: DidChangeEnvironmentsEventArgs = [];

        oldEnvs
            .filter((env) => !newEnvIds.has(env.envId.id))
            .forEach((env) => remove.push({ environment: env, kind: EnvironmentChangeKind.remove }));

        newEnvs
            .filter((env) => !oldEnvIds.has(env.envId.id))
            .forEach((env) => add.push({ environment: env, kind: EnvironmentChangeKind.add }));

        this.projectToEnvs.set(projectPath, newEnvs);
        this._onDidChangeEnvironments.fire([...remove, ...add]);

        // Update the active environment for this project
        const envIdToEnv = new Map(
            Array.from(this.projectToEnvs.values()).flatMap((envs) => envs.map((env) => [env.envId.id, env])),
        );

        const envId = await getProjectEnvId(projectPath);
        let env = envId ? envIdToEnv.get(envId) : undefined;
        this.triggerDidChangeEnvironment(project.uri, this.activeEnv.get(projectPath), env);

        if (env) {
            this.activeEnv.set(projectPath, env);
        } else {
            env = await this.trySetActiveFromDefault(project, projectPath);
        }
    }

    private async getDefaultPathEnvironments(project: PythonProject): Promise<PixiEnvironment[]> {
        const defaultInterpreterPath = getDefaultInterpreterPath(project);

        if (!defaultInterpreterPath) {
            return [];
        }

        const binPath = path.dirname(defaultInterpreterPath);
        traceVerbose(`Also refreshing Pixi environments using defaultInterpreterPath: ${binPath}`);
        return await refreshPixi(binPath);
    }

    private async trySetActiveFromDefault(
        project: PythonProject,
        projectPath: string,
    ): Promise<PixiEnvironment | undefined> {
        const defaultInterpreterPath = getDefaultInterpreterPath(project);

        if (defaultInterpreterPath) {
            const projectEnvs = this.projectToEnvs.get(projectPath) || [];
            const matchingEnv = projectEnvs.find((env) =>
                defaultInterpreterPath.startsWith(env.environmentPath.fsPath),
            );

            if (matchingEnv) {
                traceVerbose(
                    `Setting active environment for project ${projectPath} based on default interpreter path ${defaultInterpreterPath}`,
                );
                this.activeEnv.set(projectPath, matchingEnv);
                await setProjectEnvId(projectPath, matchingEnv.envId.id);
                return matchingEnv;
            }
        }

        return undefined;
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
