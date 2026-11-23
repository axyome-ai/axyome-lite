/** The shapes shared by the locators, readers, renderer, stats, CLI and extension. */

export type Assistant = 'copilot' | 'claude' | 'codex';

export const ASSISTANTS: readonly Assistant[] = ['copilot', 'claude', 'codex'];

export const ASSISTANT_LABEL: Readonly<Record<Assistant, string>> = {
    copilot: 'Copilot',
    claude: 'Claude Code',
    codex: 'Codex',
};

/** A conversation file found on disk. Listing reads metadata only: no content. */
export interface SessionRef {
    assistant: Assistant;
    /** `<assistant>:<sessionId>` as printed by `list`. */
    id: string;
    /** Absolute path after realpath. */
    file: string;
    /** Workspace folder name (Copilot) or project folder (Claude Code, Codex) when known. */
    project?: string;
    /** Title when it is known without reading the file (Codex session index). */
    title?: string;
    size: number;
    mtimeMs: number;
    /** Editor product for Copilot ("Code", "Code - Insiders", "custom"). */
    editor?: string;
}

export interface Turn {
    role: 'user' | 'assistant';
    text: string;
    at?: string;
    tools?: string[];
}

export interface Conversation {
    assistant: Assistant;
    id: string;
    title: string;
    project?: string;
    startedAt?: string;
    file: string;
    turns: Turn[];
}

export interface EditorDir {
    product: string;
    path: string;
}

/** Copilot sessions are read whole (the vendored reconstructor reads the whole file); above this size Lite refuses. */
export const MAX_WHOLE_FILE_BYTES = 64 * 1024 * 1024;

/** Thrown with a user-facing message; the CLI maps `code` to its exit codes. */
export class LiteError extends Error {
    constructor(message: string, readonly code: 'not-found' | 'unreadable' | 'too-large' | 'refused') {
        super(message);
        this.name = 'LiteError';
    }
}

export const XM_LISTING_URL = 'https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-ai-xm';
export const XM_EXTENSION_ID = 'axyome-ai.axyome-ai-xm';
export const XM_DASHBOARD_COMMAND = 'axyome-xm.showDashboard';
export const FOOTER_TEXT = 'Exported with Axyome Lite · https://axyome.ai';
