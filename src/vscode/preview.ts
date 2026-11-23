/**
 * Read-only Markdown documents under the `axyome-lite:` scheme (conversations and the "where" report).
 * The provider only returns text; nothing is written.
 */
import type * as vscodeTypes from 'vscode';

export const PREVIEW_SCHEME = 'axyome-lite';

export class ConversationDocumentProvider implements vscodeTypes.TextDocumentContentProvider {
    private readonly docs = new Map<string, string>();

    /** Registers text for a virtual path and returns the URI string to open. */
    put(pathKey: string, text: string): string {
        const key = pathKey.startsWith('/') ? pathKey : `/${pathKey}`;
        this.docs.set(key, text);
        return `${PREVIEW_SCHEME}:${key}`;
    }

    provideTextDocumentContent(uri: vscodeTypes.Uri): string {
        return this.docs.get(uri.path) ?? '# Not available\n\nReopen it from the Chats view.\n';
    }
}
