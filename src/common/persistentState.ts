import { ExtensionContext, Memento } from 'vscode';

import { createDeferred, Deferred } from './deferred';
import { traceError } from './logging';

export interface PersistentState {
    get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    clear(keys?: string[]): Promise<void>;
}

class PersistentStateImpl implements PersistentState {
    private clearing: Deferred<void>;
    constructor(private readonly memento: Memento) {
        this.clearing = createDeferred<void>();
        this.clearing.resolve();
    }
    async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        await this.clearing.promise;
        if (defaultValue === undefined) {
            return this.memento.get<T>(key);
        }
        return this.memento.get<T>(key, defaultValue);
    }
    async set<T>(key: string, value: T): Promise<void> {
        await this.clearing.promise;
        await this.memento.update(key, value);

        const before = JSON.stringify(value);
        const after = JSON.stringify(await this.memento.get<T>(key));
        if (before !== after) {
            await this.memento.update(key, undefined);
            traceError('Error while updating state for key:', key);
        }
    }
    async clear(keys?: string[]): Promise<void> {
        if (this.clearing.completed) {
            this.clearing = createDeferred<void>();
            const _keys = keys ?? this.memento.keys();
            await Promise.all(_keys.map((key) => this.memento.update(key, undefined)));
            this.clearing.resolve();
        }
        return this.clearing.promise;
    }
}

const _workspace = createDeferred<PersistentState>();

export function setPersistentState(context: ExtensionContext): void {
    _workspace.resolve(new PersistentStateImpl(context.workspaceState));
}

export function getWorkspacePersistentState(): Promise<PersistentState> {
    return _workspace.promise;
}
