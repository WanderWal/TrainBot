import 'dotenv/config';

export const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    ticketChannelId: process.env.TICKET_CHANNEL_ID,
    supportRoleId: process.env.SUPPORT_ROLE_ID,
    ticketCategoryId: process.env.TICKET_CATEGORY_ID,
    foundryApiKey: process.env.FOUNDRY_API_KEY,
    foundryRelayUrl: process.env.FOUNDRY_RELAY_URL || 'https://foundryvtt-rest-api-relay.fly.dev',
    foundryRelayClientId: process.env.FOUNDRY_RELAY_CLIENT_ID,
    foundrySearchEndpoint: process.env.FOUNDRY_SEARCH_ENDPOINT
};

export type RequiredConfig = typeof config & {
    token: string;
    clientId: string;
    guildId: string;
    ticketChannelId: string;
    supportRoleId: string;
    ticketCategoryId: string;
};

export function getRequiredConfig(cfg: typeof config): RequiredConfig {
    const missing: string[] = [];
    if (!cfg.token) missing.push('DISCORD_TOKEN');
    if (!cfg.clientId) missing.push('CLIENT_ID');
    if (!cfg.guildId) missing.push('GUILD_ID');
    if (!cfg.ticketChannelId) missing.push('TICKET_CHANNEL_ID');
    if (!cfg.supportRoleId) missing.push('SUPPORT_ROLE_ID');
    if (!cfg.ticketCategoryId) missing.push('TICKET_CATEGORY_ID');

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return cfg as RequiredConfig;
}

export const requiredConfig = getRequiredConfig(config);
