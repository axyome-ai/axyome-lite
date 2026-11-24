/**
 * The Chats view. Assistant → project → conversation (newest first).
 * Titles come from a 64 KB head peek of at most PEEK_LIMIT conversations per group; listing itself reads no content.
 */
import type * as vscodeTypes from 'vscode';
import { ASSISTANT_LABEL, ASSISTANTS, type Assistant, type SessionRef } from '../model';
import { peekSession, type Peek } from '../read';
import { readHead } from '../read/line-stream';

type Api = Pick<typeof vscodeTypes, 'TreeItem' | 'TreeItemCollapsibleState' | 'EventEmitter' | 'ThemeIcon'>;

export const PEEK_LIMIT = 200;

export type ChatNode =
    | { kind: 'assistant'; assistant: Assistant; count: number }
    | { kind: 'project'; assistant: Assistant; project: string; refs: SessionRef[] }
    | { kind: 'conversation'; ref: SessionRef; title?: string };

function dateOf(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export class ChatsTreeProvider implements vscodeTypes.TreeDataProvider<ChatNode> {
    private sessions: SessionRef[] = [];
    private readonly peeks = new Map<string, Peek>();
    private readonly emitter: vscodeTypes.EventEmitter<ChatNode | undefined | void>;
    readonly onDidChangeTreeData: vscodeTypes.Event<ChatNode | undefined | void>;

    constructor(private readonly api: Api, private readonly peek: (ref: SessionRef) => Peek = (r) => peekSession(r, (f) => readHead(f, 64 * 1024))) {
        this.emitter = new api.EventEmitter<ChatNode | undefined | void>();
        this.onDidChangeTreeData = this.emitter.event;
    }

    setSessions(sessions: readonly SessionRef[]): void {
        this.sessions = [...sessions].sort((a, b) => b.mtimeMs - a.mtimeMs);
        this.peeks.clear();
        this.emitter.fire();
    }

    getSessions(): readonly SessionRef[] {
        return this.sessions;
    }

    /** The title shown for a conversation: the indexed one, else the head peek (cached). */
    titleOf(ref: SessionRef): string | undefined {
        return ref.title ?? this.peekOf(ref).title;
    }

    private peekOf(ref: SessionRef): Peek {
        let p = this.peeks.get(ref.id);
        if (!p) { p = this.peek(ref); this.peeks.set(ref.id, p); }
        return p;
    }

    getChildren(node?: ChatNode): ChatNode[] {
        if (!node) {
            return ASSISTANTS
                .map((a) => ({ kind: 'assistant' as const, assistant: a, count: this.sessions.filter((s) => s.assistant === a).length }))
                .filter((n) => n.count > 0);
        }
        if (node.kind === 'assistant') {
            const groups = new Map<string, SessionRef[]>();
            for (const s of this.sessions) {
                if (s.assistant !== node.assistant) { continue; }
                const key = s.project ?? '(no folder)';
                groups.set(key, [...(groups.get(key) ?? []), s]);
            }
            return [...groups.entries()].map(([project, refs]) => ({ kind: 'project' as const, assistant: node.assistant, project, refs }));
        }
        if (node.kind === 'project') {
            return node.refs.map((ref, i) => ({
                kind: 'conversation' as const,
                ref,
                title: i < PEEK_LIMIT ? this.peekOf(ref).title : undefined,
            }));
        }
        return [];
    }

    /** Project label: Claude Code slugs are shown as the folder name from the newest session's cwd when known. */
    private projectLabel(node: Extract<ChatNode, { kind: 'project' }>): string {
        if (node.assistant === 'claude' && node.refs[0]) {
            const p = this.peekOf(node.refs[0]).project;
            if (p) { return p; }
        }
        return node.project;
    }

    getTreeItem(node: ChatNode): vscodeTypes.TreeItem {
        const S = this.api.TreeItemCollapsibleState;
        if (node.kind === 'assistant') {
            const item = new this.api.TreeItem(ASSISTANT_LABEL[node.assistant], S.Collapsed);
            item.description = String(node.count);
            item.contextValue = 'assistant';
            return item;
        }
        if (node.kind === 'project') {
            const item = new this.api.TreeItem(this.projectLabel(node), S.Collapsed);
            item.description = String(node.refs.length);
            item.tooltip = node.project;
            item.contextValue = 'project';
            return item;
        }
        const label = `${dateOf(node.ref.mtimeMs)}  ${node.title ?? node.ref.id.split(':')[1]?.slice(0, 8) ?? ''}`;
        const item = new this.api.TreeItem(label, S.None);
        item.tooltip = `${node.title ?? ''}\n${node.ref.file}\n${(node.ref.size / 1024).toFixed(0)} KB`;
        item.contextValue = 'conversation';
        item.command = { command: 'axyomeLite.openConversation', title: 'Open', arguments: [node.ref.id] };
        return item;
    }
}
