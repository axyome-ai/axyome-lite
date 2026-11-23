/**
 * The one type the vendored session-markdown-generator imports from Axyome XM's blob storage.
 * Interface only (ChatSessionMetadata), so XM's storage module (zstd, worker threads, database) is not
 * pulled into Axyome Lite.
 */
export interface ChatSessionMetadata {
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    toolCallsCount: number;
    toolNames?: Map<string, number>;
    sessionTitle?: string;
    sessionStartedAt: string;
    sessionStatus: 'active' | 'archived' | 'deleted';
    modelsUsed?: string[];
    totalInputTokens?: number;
    totalOutputTokens?: number;
    avgResponseTimeMs?: number;
    agentsUsed?: string[];
    mcpServersUsed?: string[];
    customTitle?: string;
    sessionVersion?: number;
    requesterUsername?: string;
    inputState?: string;
    creationDate?: number;
}
