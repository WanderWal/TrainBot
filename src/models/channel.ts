import { fetchFn } from '../api.js';
import { config } from '../config.js';

export async function addChannelToDirectus(name: string, discord_id: string): Promise<any> {
    const url = `${config.directusUrl}/items/channels`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (config.directusToken) {
        headers['Authorization'] = `Bearer ${config.directusToken}`;
    }

    const payload = {
        name,
        discord_id
    };

    const res = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        let errMessage = res.statusText;
        try {
            const errBody = await res.json() as { errors?: { message: string }[] };
            if (errBody.errors && errBody.errors.length > 0) {
                errMessage = errBody.errors[0].message;
            }
        } catch (e) {
            // failed to parse json, keep statusText
        }
        throw new Error(`Failed to add channel: ${errMessage}`);
    }

    return await res.json();
}
