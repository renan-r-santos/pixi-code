import * as fs from 'fs';
import * as os from 'os';

export const EXTENSION_ID = 'renan-r-santos.pixi-code';

export const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch((_) => false));

export function untildify(path: string): string {
    return path.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
}

export function getUserHomeDir(): string {
    return os.homedir();
}
