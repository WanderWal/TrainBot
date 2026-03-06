import { config } from './config.js';
import { CharacterLink } from './types.js';

let fetchFn: typeof fetch;
if (globalThis.fetch) {
    fetchFn = globalThis.fetch.bind(globalThis);
} else {
    fetchFn = ((...args: Parameters<typeof fetch>) =>
        import('node-fetch').then(({ default: fetch }) =>
            (fetch as unknown as typeof globalThis.fetch)(...args)
        )) as typeof fetch;
}

export async function createOrUpdateCharacterLink(discordUserId: string, actorUuid: string, actorName: string): Promise<CharacterLink> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    // 1. Ensure the player exists
    let playerId: number | string;
    const playerSearchUrl = `${config.directusUrl}/items/players?filter[discord_id][_eq]=${discordUserId}`;
    const playerSearchRes = await fetchFn(playerSearchUrl, { headers });
    const playerSearchResult = await playerSearchRes.json() as { data: any[] };

    if (playerSearchResult.data && playerSearchResult.data.length > 0) {
        playerId = playerSearchResult.data[0].id;
    } else {
        // Create player
        const playerCreateRes = await fetchFn(`${config.directusUrl}/items/players`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ discord_id: discordUserId })
        });
        const playerCreateResult = await playerCreateRes.json() as { data: any };
        playerId = playerCreateResult.data.id;
    }

    // 2. Check if this exact character is already linked
    let url = `${config.directusUrl}/items/characters?filter[foundry_uuid][_eq]=${actorUuid}&filter[player_id][_eq]=${playerId}`;
    const charSearchRes = await fetchFn(url, { headers });
    const charSearchResult = await charSearchRes.json() as { data: any[] };

    let method = 'POST';
    url = `${config.directusUrl}/items/characters`;
    
    if (charSearchResult.data && charSearchResult.data.length > 0) {
        url = `${config.directusUrl}/items/characters/${charSearchResult.data[0].id}`;
        method = 'PATCH';
    }

    // Configure the body for Directus
    const body = {
        player_id: playerId,
        foundry_uuid: actorUuid,
        name: actorName // Assumes 'name' field, update if different in your characters collection
    };

    const response = await fetchFn(url, {
        method,
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to create/update character link: ${text || response.statusText}`);
    }

    const charResult = await response.json() as { data: any };
    
    // Map back to expected output format
    return {
        id: charResult.data.id,
        discordUserId: discordUserId,
        actorUuid: charResult.data.foundry_uuid,
        actorName: charResult.data.name || actorName,
        createdAt: charResult.data.date_created || new Date().toISOString(),
        updatedAt: charResult.data.date_updated || new Date().toISOString()
    };
}

export async function getCharacterLink(discordUserId: string): Promise<CharacterLink | null> {
    // Deep filter to find a character linked to this discordant user
    const url = `${config.directusUrl}/items/characters?filter[player_id][discord_id][_eq]=${discordUserId}&fields=*,player_id.discord_id`;
    const headers: Record<string, string> = {};
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, { headers });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get character link: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: any[] };
    if (!result.data || result.data.length === 0) return null;

    const char = result.data[0];
    return {
        id: char.id,
        discordUserId: char.player_id?.discord_id || discordUserId,
        actorUuid: char.foundry_uuid,
        actorName: char.name,
        createdAt: char.date_created || new Date().toISOString(),
        updatedAt: char.date_updated || new Date().toISOString()
    };
}

export async function deleteCharacterLink(discordUserId: string): Promise<void> {
    const existing = await getCharacterLink(discordUserId);
    if (!existing || !existing.id) return;

    const url = `${config.directusUrl}/items/characters/${existing.id}`;
    const headers: Record<string, string> = {};
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, { method: 'DELETE', headers });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to delete character link: ${text || response.statusText}`);
    }
}

export async function getAllCharacterLinks(): Promise<CharacterLink[]> {
    const url = `${config.directusUrl}/items/characters?fields=*,player_id.discord_id`;
    const headers: Record<string, string> = {};
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, { headers });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get all character links: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: any[] };
    return (result.data || []).map(char => ({
        id: char.id,
        discordUserId: char.player_id?.discord_id || '',
        actorUuid: char.foundry_uuid,
        actorName: char.name,
        createdAt: char.date_created || new Date().toISOString(),
        updatedAt: char.date_updated || new Date().toISOString()
    }));
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
