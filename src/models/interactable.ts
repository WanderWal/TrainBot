import { config } from '../config.js';
import { fetchFn } from '../api.js';

export interface InteractableRecord {
    id: number;
    name: string;
}

export async function getAskableInteractables(discordChannelId?: string): Promise<InteractableRecord[]> {
    const filterOpts = {
        _or: [
            { related_actions: { actions_id: { name: { _eq: 'Ask' } } } },
            { related_actions: { actions_id: { name: { _eq: 'Talk' } } } }
        ]
    };

    const finalFilter = discordChannelId 
        ? { _and: [ filterOpts, { channel: { discord_id: { _eq: discordChannelId } } } ] }
        : filterOpts;

    const query = new URLSearchParams({
        fields: 'id,name',
        filter: JSON.stringify(finalFilter)
    });

    const url = `${config.directusUrl}/items/interactables?${query.toString()}`;
    const headers: Record<string, string> = {};
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, { headers });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get interactables: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: InteractableRecord[] };
    return result.data || [];
}

export async function getInteractableById(id: number): Promise<InteractableRecord | null> {
    const url = `${config.directusUrl}/items/interactables/${id}?fields=id,name`;
    const headers: Record<string, string> = {};
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const response = await fetchFn(url, { headers });

    if (!response.ok) {
        if (response.status === 404) return null;
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get interactable: ${text || response.statusText}`);
    }

    const result = await response.json() as { data: InteractableRecord };
    return result.data;
}
