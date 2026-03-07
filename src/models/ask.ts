import { config } from '../config.js';
import { fetchFn } from '../api.js';

export interface AskRecord {
    id: number;
    character?: any;
    channel?: any;
    interactable: any;
    ask: string;
    answer?: string;
    date_created?: string;
}

export async function createAsk(character_id: number | undefined, channel_id: number | undefined, interactable_id: number, ask: string): Promise<AskRecord> {
    const url = `${config.directusUrl}/items/asks`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const payload: any = {
        interactable: interactable_id,
        ask: ask
    };
    if (character_id !== undefined) payload.character = character_id;
    if (channel_id !== undefined) payload.channel = channel_id;

    const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to create ask: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: AskRecord };
    return result.data;
}

export async function getAsk(id: number): Promise<AskRecord | null> {
    const url = `${config.directusUrl}/items/asks/${id}?fields=*,channel.discord_id,character.player_id.discord_id,interactable.name`;
    const headers: Record<string, string> = {};
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, { headers });

    if (!response.ok) {
        if (response.status === 404) return null;
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get ask: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: AskRecord };
    return result.data;
}

export async function updateAskAnswer(id: number, answer: string): Promise<AskRecord> {
    const url = `${config.directusUrl}/items/asks/${id}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ answer })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to update ask answer: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: AskRecord };
    return result.data;
}
