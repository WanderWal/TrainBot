import { config } from '../config.js';
import { fetchFn } from '../api.js';
import { CharacterLink } from '../types.js';
import { findOrCreatePlayer } from './player.js';

export async function createOrUpdateCharacterLink(discordUserId: string, actorUuid: string, actorName: string, discordUsername?: string): Promise<CharacterLink> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const playerId = await findOrCreatePlayer(discordUserId, discordUsername);

    let url = `${config.directusUrl}/items/characters?filter[foundry_uuid][_eq]=${actorUuid}&filter[player_id][_eq]=${playerId}`;
    const charSearchRes = await fetchFn(url, { headers });
    const charSearchResult = await charSearchRes.json() as { data: any[] };

    let method = 'POST';
    url = `${config.directusUrl}/items/characters`;
    
    if (charSearchResult.data && charSearchResult.data.length > 0) {
        url = `${config.directusUrl}/items/characters/${charSearchResult.data[0].id}`;
        method = 'PATCH';
    }

    const body = {
        player_id: playerId,
        foundry_uuid: actorUuid,
        name: actorName
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

export async function updateCharacterRawData(characterId: number, rawData: any): Promise<void> {
    const url = `${config.directusUrl}/items/characters/${characterId}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ raw_data: rawData })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to update character raw data: ${text || response.statusText}`);
    }
}
