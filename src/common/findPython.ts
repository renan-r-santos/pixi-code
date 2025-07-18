import * as os from 'os';
import * as path from 'path';

import { fileExists } from './utils';

export async function findPythonExecutable(envPath: string): Promise<string | null> {
    let candidates;

    if (os.platform() === 'win32') {
        candidates = [
            path.join(envPath, 'Scripts', 'python.exe'),
            path.join(envPath, 'Scripts', 'python3.exe'),
            path.join(envPath, 'bin', 'python.exe'),
            path.join(envPath, 'bin', 'python3.exe'),
            path.join(envPath, 'python.exe'),
            path.join(envPath, 'python3.exe'),
        ];
    } else {
        candidates = [
            path.join(envPath, 'bin', 'python'),
            path.join(envPath, 'bin', 'python3'),
            path.join(envPath, 'python'),
            path.join(envPath, 'python3'),
        ];
    }

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }
    return null;
}
