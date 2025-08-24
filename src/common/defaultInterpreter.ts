import * as path from 'path';
import { workspace } from 'vscode';

import { PythonProject } from '../api';
import { expandVariables } from './variableExpansion';

export function getDefaultInterpreterPath(project: PythonProject): string | undefined {
    const defaultInterpreterPath = workspace
        .getConfiguration('python', project.uri)
        .get<string>('defaultInterpreterPath');

    if (!defaultInterpreterPath) {
        return undefined;
    }

    const expandedPath = expandVariables(defaultInterpreterPath, project.uri);
    return path.resolve(project.uri.fsPath, expandedPath);
}
