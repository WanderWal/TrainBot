import { config } from '../config.js';
import { fetchFn } from '../api.js';

export interface InteractableRecord {
    id: number;
    name: string;
}

export async function getAskableInteractables(): Promise<InteractableRecord[]> {
    // Filter interactables where related_actions contain an action named "Ask" (or "Talk" as fallback)
    const url = `${config.directusUrl}/items/interactables?filter[_or][0][related_actions][actions_id][name][_eq]=Ask&filter[_or][1][related_actions][actions_id][name][_eq]=Talk&fields=id,name`;
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
