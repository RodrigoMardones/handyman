export type IntakeResult = {
    status: "root_required";
} | {
    status: "empty_draft";
} | {
    status: "root_not_registered";
} | {
    status: "workspace_error";
} | {
    status: "write_error";
} | {
    status: "ok";
    path: string;
    files: number;
};
export declare function writeIntake(hroot: string, root: string, draftMd: string, fileRels: string[]): IntakeResult;
/**
 * The HTTP mapping of an IntakeResult, byte-identical to the observer's
 * historical responses. Shared by toolbox_serve.ts and the Next route
 * handler so status codes and bodies can never drift.
 */
export declare function intakeHttp(result: IntakeResult): {
    status: number;
    body: unknown;
};
