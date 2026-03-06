import { config } from '../config.js';
import { fetchFn } from '../api.js';

export async function findOrCreatePlayer(discordUserId: string, discordUsername?: string): Promise<string | number> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const playerSearchUrl = `${config.directusUrl}/items/players?filter[discord_id][_eq]=${discordUserId}`;
    const playerSearchRes = await fetchFn(playerSearchUrl, { headers });
    const playerSearchResult = await playerSearchRes.json() as { data: any[] };

    if (playerSearchResult.data && playerSearchResult.data.length > 0) {
        return playerSearchResult.data[0].id;
    }

    const playerCreateRes = await fetchFn(`${config.directusUrl}/items/players`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
            discord_id: discordUserId,
            name: discordUsername || `User ${discordUserId}`
        })
    });
    
    if (!playerCreateRes.ok) {
        const text = await playerCreateRes.text().catch(() => '');
        throw new Error(`Failed to create player: ${text || playerCreateRes.statusText}`);
    }

    const playerCreateResult = await playerCreateRes.json() as { data: any };
    return playerCreateResult.data.id;
}
