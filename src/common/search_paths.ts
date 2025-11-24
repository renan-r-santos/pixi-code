import * as path from 'path';
import { Uri, workspace } from 'vscode';

import { traceError, traceLog, traceWarn } from './logging';
import { untildify } from './utils';

/**
 * NOTE: The helpers below are reproduced verbatim from
 * https://github.com/microsoft/vscode-python-environments/blob/main/src/managers/common/nativePythonFinder.ts
 * so Pixi discovery stays behaviourally aligned. Please keep them in sync with upstream.
 * Tracking upstream request: https://github.com/microsoft/vscode-python-environments/issues/960
 */
function untildifyArray(values: string[] | undefined): string[] {
    if (!values || values.length === 0) {
        return [];
    }
    return values.map((value) => untildify(value));
}

function getPythonSettingAndUntildify<T>(name: string, scope?: Uri): T | undefined {
    const config = workspace.getConfiguration('python', scope);
    const value = config.get<unknown>(name);
    if (typeof value === 'string') {
        return value ? (untildify(value) as unknown as T) : undefined;
    }
    if (Array.isArray(value)) {
        return (value.map((item) => (typeof item === 'string' ? untildify(item) : item)) as unknown as T);
    }
    return value as T | undefined;
}

function getCustomVirtualEnvDirsLegacy(): string[] {
    const venvDirs: string[] = [];
    const venvPath = getPythonSettingAndUntildify<string>('venvPath');
    if (venvPath) {
        venvDirs.push(venvPath);
    }

    const venvFolders = getPythonSettingAndUntildify<string[]>('venvFolders') ?? [];
    venvFolders.forEach((folder) => venvDirs.push(folder));
    return Array.from(new Set(venvDirs));
}

function getGlobalSearchPaths(): string[] {
    try {
        const envConfig = workspace.getConfiguration('python-env');
        const inspection = envConfig.inspect<string[]>('globalSearchPaths');

        const globalPaths = inspection?.globalValue || [];
        return untildifyArray(globalPaths);
    } catch (error) {
        traceError('Error getting globalSearchPaths:', error);
        return [];
    }
}

function getWorkspaceSearchPaths(): string[] {
    try {
        const envConfig = workspace.getConfiguration('python-env');
        const inspection = envConfig.inspect<string[]>('workspaceSearchPaths');

        if (inspection?.globalValue) {
            traceError(
                'Error: python-env.workspaceSearchPaths is set at the user/global level, but this setting can only be set at the workspace or workspace folder level.',
            );
        }

        if (inspection?.workspaceFolderValue) {
            return inspection.workspaceFolderValue;
        }

        if (inspection?.workspaceValue) {
            return inspection.workspaceValue;
        }

        return [];
    } catch (error) {
        traceError('Error getting workspaceSearchPaths:', error);
        return [];
    }
}

export async function getAllExtraSearchPaths(): Promise<string[]> {
    const searchDirectories: string[] = [];

    const customVenvDirs = getCustomVirtualEnvDirsLegacy();
    searchDirectories.push(...customVenvDirs);

    const globalSearchPaths = getGlobalSearchPaths().filter((p) => p && p.trim() !== '');
    searchDirectories.push(...globalSearchPaths);

    const workspaceSearchPaths = getWorkspaceSearchPaths();
    for (const searchPath of workspaceSearchPaths) {
        if (!searchPath || searchPath.trim() === '') {
            continue;
        }

        const trimmedPath = searchPath.trim();
        if (path.isAbsolute(trimmedPath)) {
            searchDirectories.push(trimmedPath);
            continue;
        }

        const folders = workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            traceWarn('Warning: No workspace folders found for relative path:', trimmedPath);
            continue;
        }

        for (const folder of folders) {
            const resolvedPath = path.resolve(folder.uri.fsPath, trimmedPath);
            searchDirectories.push(resolvedPath);
        }
    }

    const uniquePaths = Array.from(new Set(searchDirectories));
    traceLog(
        'getAllExtraSearchPaths completed. Total unique search directories:',
        uniquePaths.length,
        'Paths:',
        uniquePaths,
    );
    return uniquePaths;
}
