import { config } from '../config.js';
import { fetchFn } from '../api.js';

export interface AskRecord {
    id: number;
    discord_id: string;
    channel_id: string;
    character_id: number;
    ask: string;
    answer?: string;
    date_created?: string;
}

export async function createAsk(discord_id: string, channel_id: string, character_id: number, ask: string): Promise<AskRecord> {
    const url = `${config.directusUrl}/items/asks`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ discord_id, channel_id, character_id, ask })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to create ask: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: AskRecord };
    return result.data;
}

export async function getAsk(id: number): Promise<AskRecord | null> {
    const url = `${config.directusUrl}/items/asks/${id}`;
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
