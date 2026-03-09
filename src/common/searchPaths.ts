import fg from 'fast-glob';
import * as path from 'path';
import { workspace } from 'vscode';

import { traceError, traceVerbose } from './logging';
import { untildify } from './utils';

/**
 * Reads `python-envs.workspaceSearchPaths` and `python-envs.globalSearchPaths`,
 * resolves glob patterns, and returns deduplicated pixi project root paths.
 */
export async function resolvePixiProjectPaths(): Promise<string[]> {
    const workspacePaths = getWorkspaceSearchPaths();
    const globalPaths = getGlobalSearchPaths();

    const resolvedWorkspace = resolveWorkspacePaths(workspacePaths);
    const resolvedGlobal = globalPaths.map(untildify);

    const allPatterns = [...resolvedWorkspace, ...resolvedGlobal];

    if (allPatterns.length === 0) {
        return [];
    }

    const pixiDirs = await findPixiDirectories(allPatterns);
    const projectRoots = pixiDirs.map((dir) => path.dirname(dir));

    return [...new Set(projectRoots.map(path.normalize))];
}

function getWorkspaceSearchPaths(): string[] {
    try {
        const config = workspace.getConfiguration('python-envs');
        const inspection = config.inspect<string[]>('workspaceSearchPaths');

        return inspection?.workspaceFolderValue ?? inspection?.workspaceValue ?? inspection?.defaultValue ?? [];
    } catch (error) {
        traceError('Error reading python-envs.workspaceSearchPaths:', error);
        return [];
    }
}

function getGlobalSearchPaths(): string[] {
    try {
        const config = workspace.getConfiguration('python-envs');
        const inspection = config.inspect<string[]>('globalSearchPaths');

        return inspection?.globalValue ?? [];
    } catch (error) {
        traceError('Error reading python-envs.globalSearchPaths:', error);
        return [];
    }
}

function resolveWorkspacePaths(searchPaths: string[]): string[] {
    const folders = workspace.workspaceFolders;
    const resolved: string[] = [];

    for (const rawPath of searchPaths) {
        const expanded = untildify(rawPath.trim());
        if (!expanded) {
            continue;
        }

        if (path.isAbsolute(expanded)) {
            resolved.push(expanded);
        } else if (folders) {
            for (const folder of folders) {
                resolved.push(path.resolve(folder.uri.fsPath, expanded));
            }
        }
    }

    return resolved;
}

async function findPixiDirectories(patterns: string[]): Promise<string[]> {
    const pixiPatterns: string[] = [];

    for (const pattern of patterns) {
        const normalized = pattern.replace(/\\/g, '/').replace(/\/$/, '');
        const lastSegment = path.posix.basename(normalized);

        if (lastSegment === '.pixi') {
            // Pattern explicitly targets .pixi directories
            pixiPatterns.push(normalized);
        } else if (lastSegment.startsWith('.')) {
            // Targets another env type (e.g., .venv) — skip
            continue;
        } else {
            // Generic directory — search for .pixi inside
            pixiPatterns.push(`${normalized}/**/.pixi`);
        }
    }

    if (pixiPatterns.length === 0) {
        return [];
    }

    traceVerbose('Searching for .pixi directories with patterns:', pixiPatterns);

    try {
        const results = await fg(pixiPatterns, {
            onlyDirectories: true,
            absolute: true,
            dot: true,
            followSymbolicLinks: false,
            deep: 10,
            suppressErrors: true,
        });

        traceVerbose(`Found ${results.length} .pixi directories`);
        return results;
    } catch (error) {
        traceError('Error searching for .pixi directories:', error);
        return [];
    }
}
