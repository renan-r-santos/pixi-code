import * as os from 'os';

export const EXTENSION_ID = 'renan-r-santos.pixi-code';
export const PIXI_MANAGER_ID = `${EXTENSION_ID}:pixi`;

export function untildify(path: string): string {
    return path.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
}
