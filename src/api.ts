import { config } from './config.js';

export let fetchFn: typeof fetch;
if (globalThis.fetch) {
    fetchFn = globalThis.fetch.bind(globalThis);
} else {
    fetchFn = ((...args: Parameters<typeof fetch>) =>
        import('node-fetch').then(({ default: fetch }) =>
            (fetch as unknown as typeof globalThis.fetch)(...args)
        )) as typeof fetch;
}

export async function fetchActorData(actorUuid: string): Promise<any> {
    if (!config.foundryApiKey) throw new Error('FOUNDRY_API_KEY is not configured.');
    if (!config.foundryRelayClientId) throw new Error('FOUNDRY_RELAY_CLIENT_ID is not configured.');

    const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
    const url = new URL(`${relayBase}/get`);
    url.searchParams.set('clientId', config.foundryRelayClientId);
    url.searchParams.set('uuid', actorUuid);

    const response = await fetchFn(url.toString(), {
        headers: { 'x-api-key': config.foundryApiKey }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to fetch actor data: ${text || response.statusText}`);
    }

    return await response.json();
}

export async function fetchFoundryActorUuidByName(characterName: string): Promise<{ uuid: string; match: Record<string, unknown> } | null> {
    if (!config.foundryApiKey) throw new Error('FOUNDRY_API_KEY is not configured.');

    let url = config.foundrySearchEndpoint;

    if (!url) {
        if (config.foundryRelayUrl && config.foundryRelayClientId) {
            const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
            url = `${relayBase}/search`;
        }
    }

    if (!url) throw new Error('Foundry search endpoint is not configured. Set FOUNDRY_SEARCH_ENDPOINT or relay settings.');

    const searchUrl = new URL(url);
    if (config.foundryRelayClientId) searchUrl.searchParams.set('clientId', config.foundryRelayClientId);
    searchUrl.searchParams.set('query', characterName);

    const response = await fetchFn(searchUrl.toString(), {
        headers: { 'x-api-key': `${config.foundryApiKey}` }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Foundry API error (${response.status}): ${text || response.statusText}`);
    }

    const data: unknown = await response.json();

    const results = Array.isArray(data)
        ? data
        : Array.isArray((data as { data?: unknown[] })?.data)
            ? (data as { data: unknown[] }).data
            : Array.isArray((data as { results?: unknown[] })?.results)
                ? (data as { results: unknown[] }).results
                : [];

    if (results.length === 0) return null;

    const target = normalizeName(characterName);
    
    let match = results.find(result => {
        const resultRecord = result as Record<string, unknown> | null;
        const resultName = (resultRecord?.name ?? (resultRecord?.data as Record<string, unknown> | undefined)?.name ?? resultRecord?.title) as string | undefined;
        return normalizeName(resultName) === target;
    }) as Record<string, unknown> | undefined;

    if (!match) {
        const partialMatches = results.filter(result => {
            const resultRecord = result as Record<string, unknown> | null;
            const resultName = (resultRecord?.name ?? (resultRecord?.data as Record<string, unknown> | undefined)?.name ?? resultRecord?.title) as string | undefined;
            const normalizedResultName = normalizeName(resultName);
            return normalizedResultName.includes(target) || target.includes(normalizedResultName);
        });

        if (partialMatches.length > 0) match = partialMatches[0] as Record<string, unknown>;
    }

    if (!match && results.length > 0) match = results[0] as Record<string, unknown>;
    if (!match) return null;

    const uuid = (match?.uuid ?? (match?.data as Record<string, unknown> | undefined)?.uuid ?? match?._id) as string | undefined;
    if (!uuid || !match) return null;

    return { uuid, match };
}

export function normalizeName(name: string | null | undefined): string {
    return String(name || '').trim().toLowerCase();
}

export async function verifyFoundryCharacterName(characterName: string): Promise<{ ok: true; actor: Record<string, unknown>; uuid: string } | { ok: false; reason: 'not_found' }> {
    const result = await fetchFoundryActorUuidByName(characterName);
    if (!result) return { ok: false, reason: 'not_found' };
    return { ok: true, actor: result.match, uuid: result.uuid };
}
