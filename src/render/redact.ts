/**
 * Secret redaction for exports, with Axyome XM's own rules (vendored scrubSecrets,
 * claude-code-parser.ts): AWS keys, GitHub tokens, OpenAI/Anthropic keys, Slack tokens, JWTs, UUIDs and
 * `password=`-style assignments are replaced by [REDACTED].
 */
import { scrubSecrets } from '../xm-core/capture/claude-code-parser';

export function redactForExport(text: string): string {
    return scrubSecrets(text);
}
