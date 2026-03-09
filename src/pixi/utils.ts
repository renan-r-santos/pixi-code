import * as ch from 'child_process';
import { CancellationError, CancellationToken, Uri, window, workspace } from 'vscode';
import which from 'which';

import { Package } from '../api';
import { createDeferred } from '../common/deferred';
import { quoteArgs } from '../common/execUtils';
import { findPythonExecutable } from '../common/findPython';
import { traceError, traceInfo, traceVerbose } from '../common/logging';
import { getWorkspacePersistentState } from '../common/persistentState';
import { PIXI_MANAGER_ID, untildify } from '../common/utils';
import { PixiEnvironment, PixiInfo, PixiPackage } from './types';

const PIXI_WORKSPACE_KEY = `${PIXI_MANAGER_ID}:WORKSPACE_SELECTED`;
const PIXI_GLOBAL_KEY = `${PIXI_MANAGER_ID}:GLOBAL_SELECTED`;

async function findPixi(): Promise<string | undefined> {
    try {
        return await which('pixi');
    } catch {
        return undefined;
    }
}

export async function getPixi(): Promise<string> {
    const config = workspace.getConfiguration('pixi-code');
    const value = config.get<string>('pixiExecutable');

    if (value) {
        return untildify(value);
    }

    const pixiPath = await findPixi();
    if (!pixiPath) {
        const errorMsg =
            'Pixi executable not found. Please install Pixi or set "pixi-code.pixiExecutable" in your settings.';
        window.showErrorMessage(errorMsg);
        throw new Error(errorMsg);
    }
    return pixiPath;
}

async function _runPixi(
    pixi: string,
    args: string[],
    options?: ch.SpawnOptions,
    token?: CancellationToken,
): Promise<string> {
    const deferred = createDeferred<string>();
    args = quoteArgs(args);
    const proc = ch.spawn(pixi, args, { shell: true, ...options });

    const cancelDisposable = token?.onCancellationRequested(() => {
        proc.kill();
        deferred.reject(new CancellationError());
    });

    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;

    proc.stdout?.on('data', (data) => {
        stdout += data.toString('utf-8');
    });
    proc.stderr?.on('data', (data) => {
        const d = data.toString('utf-8');
        stderr += d;
        traceError(d.trim());
    });
    proc.on('error', (err) => {
        deferred.reject(err);
    });
    proc.on('exit', (code) => {
        exitCode = code;
    });
    proc.on('close', () => {
        cancelDisposable?.dispose();
        if (exitCode !== 0) {
            deferred.reject(new Error(`Failed to run "pixi ${args.join(' ')}":\n ${stderr}`));
        } else {
            deferred.resolve(stdout);
        }
    });

    return deferred.promise;
}

export async function runPixi(args: string[], options?: ch.SpawnOptions, token?: CancellationToken): Promise<string> {
    const pixi = await getPixi();
    return _runPixi(pixi, args, options, token);
}

export async function listPixiPackages(envName: string, projectPath: string): Promise<PixiPackage[]> {
    const stdout = await runPixi(['list', '--no-install', '--frozen', '--json', '--environment', envName], {
        cwd: projectPath,
    });
    return JSON.parse(stdout);
}

export async function refreshPixi(projectPath: string): Promise<PixiEnvironment[]> {
    try {
        const pixi = await getPixi();
        const stdout = await _runPixi(pixi, ['info', '--json'], { cwd: projectPath });
        const pixiInfo: PixiInfo = JSON.parse(stdout);

        if (!pixiInfo.project_info) {
            traceVerbose(`No project info found for Pixi project at ${projectPath}`);
            return [];
        }

        const projectName = pixiInfo.project_info.name;
        const manifestPath = pixiInfo.project_info.manifest_path;

        const results = await Promise.all(
            pixiInfo.environments_info.map(async (pixiEnv) => {
                const pixiPackages = await listPixiPackages(pixiEnv.name, projectPath);
                const pythonPackage = pixiPackages.find((pkg) => pkg.name === 'python');

                if (!pythonPackage) {
                    return null;
                }

                const pythonExecutable = (await findPythonExecutable(pixiEnv.prefix)) || '';

                return {
                    name: pixiEnv.name,
                    displayName: pixiEnv.name,
                    shortDisplayName: pixiEnv.name,
                    displayPath: pixiEnv.prefix,
                    version: pythonPackage.version,
                    environmentPath: Uri.file(pixiEnv.prefix),
                    description: `Python ${pythonPackage.version}`,
                    execInfo: {
                        run: { executable: pythonExecutable },
                        activatedRun: {
                            executable: pixi,
                            args: ['run', '--manifest-path', manifestPath, '-e', pixiEnv.name, 'python'],
                        },
                        activation: [
                            {
                                executable: pixi,
                                args: ['shell', '--manifest-path', manifestPath, '-e', pixiEnv.name],
                            },
                        ],
                        deactivation: [{ executable: 'exit', args: [] }],
                    },
                    sysPrefix: pixiEnv.prefix,
                    group: projectName,
                    envId: {
                        id: pixiEnv.prefix,
                        managerId: PIXI_MANAGER_ID,
                    },
                    pixiInfo,
                    packages: pixiPkgsToPackages(pixiPackages, pixiEnv.prefix),
                } as PixiEnvironment;
            }),
        );

        return results.filter((env): env is PixiEnvironment => env !== null);
    } catch (error) {
        traceInfo(`Failed to get pixi environments: ${error}`);
        return [];
    }
}

export function pixiPkgsToPackages(pixiPackages: PixiPackage[], environmentId: string): Package[] {
    return pixiPackages
        .filter((pkg) => pkg.is_explicit)
        .map((pkg) => ({
            name: pkg.name,
            displayName: pkg.name,
            description: pkg.version,
            version: pkg.version,
            pkgId: {
                id: pkg.name,
                managerId: PIXI_MANAGER_ID,
                environmentId,
            },
        }));
}

type PixiPersistentState = {
    [projectPath: string]: string;
};

export async function clearExtensionCache() {
    const state = await getWorkspacePersistentState();
    await state.clear([PIXI_WORKSPACE_KEY, PIXI_GLOBAL_KEY]);
}

export async function getGlobalEnvId(): Promise<string | undefined> {
    const state = await getWorkspacePersistentState();
    return state.get(PIXI_GLOBAL_KEY);
}

export async function setGlobalEnvId(envId: string | undefined) {
    const state = await getWorkspacePersistentState();
    await state.set(PIXI_GLOBAL_KEY, envId);
}

export async function getProjectEnvId(projectPath: string): Promise<string | undefined> {
    const state = await getWorkspacePersistentState();
    const data: PixiPersistentState = (await state.get(PIXI_WORKSPACE_KEY)) ?? {};
    return data[projectPath];
}

export async function setProjectEnvId(projectPath: string, envId: string | undefined) {
    const state = await getWorkspacePersistentState();
    const data: PixiPersistentState = (await state.get(PIXI_WORKSPACE_KEY)) ?? {};
    if (envId) {
        data[projectPath] = envId;
    } else {
        delete data[projectPath];
    }
    await state.set(PIXI_WORKSPACE_KEY, data);
}
