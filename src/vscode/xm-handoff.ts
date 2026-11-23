/**
 * The hand-off to Axyome XM ("piggy back on Axyome XM").
 * XM installed → run its dashboard command; not installed → open XM's Marketplace page.
 * The one-time hint (after the first export) is stored as one boolean in globalState.
 */
import type * as vscodeTypes from 'vscode';
import { XM_DASHBOARD_COMMAND, XM_EXTENSION_ID, XM_LISTING_URL } from '../model';

type Api = Pick<typeof vscodeTypes, 'extensions' | 'commands' | 'env' | 'Uri' | 'window'>;

export const XM_HINT_KEY = 'axyomeLite.xmHintShown';

export function isXmInstalled(api: Pick<typeof vscodeTypes, 'extensions'>): boolean {
    return api.extensions.getExtension(XM_EXTENSION_ID) !== undefined;
}

export async function xmHandoff(api: Api): Promise<'xm' | 'listing'> {
    if (isXmInstalled(api)) {
        await api.commands.executeCommand(XM_DASHBOARD_COMMAND);
        return 'xm';
    }
    await api.env.openExternal(api.Uri.parse(XM_LISTING_URL));
    return 'listing';
}

/** Shows the hint once, only when XM is not installed. Returns true when it was shown. */
export async function maybeShowXmHint(api: Api, state: vscodeTypes.Memento): Promise<boolean> {
    if (isXmInstalled(api) || state.get<boolean>(XM_HINT_KEY) === true) { return false; }
    await state.update(XM_HINT_KEY, true);
    const learn = 'Learn more';
    const pick = await api.window.showInformationMessage(
        'Search every chat, replay any coding day and give Copilot and Claude Code a memory of your work: Axyome XM.',
        learn, "Don't show again",
    );
    if (pick === learn) { await api.env.openExternal(api.Uri.parse(XM_LISTING_URL)); }
    return true;
}
