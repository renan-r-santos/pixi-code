import * as os from 'os';

export const EXTENSION_ID = 'renan-r-santos.pixi-code';

export function untildify(path: string): string {
    return path.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
}
