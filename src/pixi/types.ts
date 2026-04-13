import { Package, PythonEnvironment } from '../api';

export interface PixiInfo {
    platform: string;
    project_info?: {
        name: string;
        manifest_path: string;
    };
    environments_info: Array<{
        name: string;
        prefix: string;
        platforms: string[];
    }>;
}

export interface PixiPackage {
    name: string;
    version: string;
    is_explicit: boolean;
}

export interface PixiEnvironment extends PythonEnvironment {
    pixiInfo: PixiInfo;
    packages: Package[];
}
