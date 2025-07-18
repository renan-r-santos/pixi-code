import { ExtensionContext, window } from 'vscode';

import { registerLogger, traceError, traceInfo } from './common/logging';
import { setPersistentState } from './common/persistentState';
import { PixiEnvManager } from './pixi/envManager';
import { PixiPackageManager } from './pixi/projectManager';
import { getPixi, runPixi } from './pixi/utils';
import { getEnvExtApi } from './pythonEnvsApi';

export interface IDisposable {
    dispose(): void | undefined | Promise<void>;
}

export async function activate(context: ExtensionContext) {
    const api = await getEnvExtApi();

    const log = window.createOutputChannel('Pixi Environment Manager', {
        log: true,
    });
    context.subscriptions.push(log, registerLogger(log));

    // Validate Pixi installation
    const stdout = await runPixi(['--version']);
    const versionMatch = stdout.trim().match(/^pixi (\d+\.\d+\.\d+)/);
    if (!versionMatch) {
        const errorMsg = `Found invalid Pixi binary at ${getPixi()}.`;
        traceError(errorMsg);
        throw new Error(errorMsg);
    }

    // Setup the persistent state for the extension.
    setPersistentState(context);

    const manager = new PixiEnvManager(api, log);
    context.subscriptions.push(api.registerEnvironmentManager(manager));

    const packageManager = new PixiPackageManager(api, log);
    context.subscriptions.push(api.registerPackageManager(packageManager));
}

export async function disposeAll(disposables: IDisposable[]): Promise<void> {
    await Promise.all(
        disposables.map(async (d) => {
            try {
                return Promise.resolve(d.dispose());
            } catch {
                // do nothing
            }
            return Promise.resolve();
        }),
    );
}

export async function deactivate(context: ExtensionContext) {
    await disposeAll(context.subscriptions);
    context.subscriptions.length = 0; // Clear subscriptions to prevent memory leaks
    traceInfo('Pixi Environment Manager extension deactivated.');
}
