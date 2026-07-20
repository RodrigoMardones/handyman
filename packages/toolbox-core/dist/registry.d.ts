export interface RegistryEntry {
    project_root: string;
    registered: string;
}
export interface Registry {
    version: number;
    harnesses: RegistryEntry[];
}
/** toolBox root: --handyman-root flag, else $HANDYMAN_ROOT, else ~/HANDYMAN. */
export declare function handymanRoot(cliOverride: string | null): string;
export declare function registryPath(hroot: string): string;
/**
 * Return [registry, error]. Missing file -> empty registry, no error.
 * A corrupted registry is returned empty WITH an error so read-only
 * commands can degrade while writing commands refuse to clobber it.
 */
export declare function loadRegistry(hroot: string): [Registry, string | null];
export declare function saveRegistry(hroot: string, data: Registry): void;
/** A registrable root resolves a workspace holding feature_list.json. */
export declare function isHarnessRoot(root: string): boolean;
