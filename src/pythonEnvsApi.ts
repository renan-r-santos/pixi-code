import { extensions, window } from 'vscode';

import { PythonEnvironmentApi } from './api';

let _extApi: PythonEnvironmentApi | undefined;

export async function getEnvExtApi(): Promise<PythonEnvironmentApi> {
    if (_extApi) {
        return _extApi;
    }

    const extension = extensions.getExtension('ms-python.vscode-python-envs');

    if (!extension) {
        const errorMsg = 'Python Environments extension not found.';
        window.showErrorMessage(errorMsg);
        throw new Error(errorMsg);
    }

    if (extension?.isActive) {
        _extApi = extension.exports as PythonEnvironmentApi;
        return _extApi;
    }

    await extension.activate();

    _extApi = extension.exports as PythonEnvironmentApi;
    return _extApi;
}
