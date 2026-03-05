import 'dotenv/config';
import {
    ActionRowBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    PermissionFlagsBits,
    REST,
    Routes,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction
} from 'discord.js';
import fs from 'fs';
import path from 'path';

let fetchFn: typeof fetch;
if (globalThis.fetch) {
    fetchFn = globalThis.fetch.bind(globalThis);
} else {
    fetchFn = ((...args: Parameters<typeof fetch>) =>
        import('node-fetch').then(({ default: fetch }) =>
            (fetch as unknown as typeof globalThis.fetch)(...args)
        )) as typeof fetch;
}

const config = {
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

type RequiredConfig = typeof config & {
    token: string;
    clientId: string;
    guildId: string;
    ticketChannelId: string;
    supportRoleId: string;
    ticketCategoryId: string;
};

function getRequiredConfig(cfg: typeof config): RequiredConfig {
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

const requiredConfig = getRequiredConfig(config);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

type ActiveTicket = {
    textChannelId: string;
    voiceChannelId: string;
    ticketType: string;
};

const activeTickets = new Map<string, ActiveTicket>();

type CharacterLink = {
    id: number;
    discordUserId: string;
    actorUuid: string;
    actorName: string;
    createdAt: string;
    updatedAt: string;
};

// API Helper Functions
async function createOrUpdateCharacterLink(discordUserId: string, actorUuid: string, actorName: string): Promise<CharacterLink> {
    if (!config.foundryApiKey) {
        throw new Error('FOUNDRY_API_KEY is not configured.');
    }

    const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
    const response = await fetchFn(`${relayBase}/api/discord/links`, {
        method: 'POST',
        headers: {
            'x-api-key': config.foundryApiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            discordUserId,
            actorUuid,
            actorName
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to create/update character link: ${text || response.statusText}`);
    }

    const result = await response.json() as { success: boolean; data: CharacterLink };
    if (!result.success) {
        throw new Error('Failed to create/update character link');
    }

    return result.data;
}

async function getCharacterLink(discordUserId: string): Promise<CharacterLink | null> {
    if (!config.foundryApiKey) {
        throw new Error('FOUNDRY_API_KEY is not configured.');
    }

    const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
    const response = await fetchFn(`${relayBase}/api/discord/links/${discordUserId}`, {
        headers: {
            'x-api-key': config.foundryApiKey
        }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get character link: ${text || response.statusText}`);
    }

    const result = await response.json() as { success: boolean; data: CharacterLink };
    if (!result.success) {
        throw new Error('Failed to get character link');
    }

    return result.data;
}

async function deleteCharacterLink(discordUserId: string): Promise<void> {
    if (!config.foundryApiKey) {
        throw new Error('FOUNDRY_API_KEY is not configured.');
    }

    const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
    const response = await fetchFn(`${relayBase}/api/discord/links/${discordUserId}`, {
        method: 'DELETE',
        headers: {
            'x-api-key': config.foundryApiKey
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to delete character link: ${text || response.statusText}`);
    }
}

async function getAllCharacterLinks(): Promise<CharacterLink[]> {
    if (!config.foundryApiKey) {
        throw new Error('FOUNDRY_API_KEY is not configured.');
    }

    const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
    const response = await fetchFn(`${relayBase}/api/discord/links`, {
        headers: {
            'x-api-key': config.foundryApiKey
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to get all character links: ${text || response.statusText}`);
    }

    const result = await response.json() as { success: boolean; data: CharacterLink[] };
    if (!result.success) {
        throw new Error('Failed to get all character links');
    }

    return result.data;
}

async function fetchActorData(actorUuid: string): Promise<any> {
    if (!config.foundryApiKey) {
        throw new Error('FOUNDRY_API_KEY is not configured.');
    }

    if (!config.foundryRelayClientId) {
        throw new Error('FOUNDRY_RELAY_CLIENT_ID is not configured.');
    }

    const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
    const url = new URL(`${relayBase}/get`);
    url.searchParams.set('clientId', config.foundryRelayClientId);
    url.searchParams.set('uuid', actorUuid);

    const response = await fetchFn(url.toString(), {
        headers: {
            'x-api-key': config.foundryApiKey
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to fetch actor data: ${text || response.statusText}`);
    }

    const result = await response.json();
    return result;
}

async function fetchFoundryActorUuidByName(characterName: string): Promise<{ uuid: string; match: Record<string, unknown> } | null> {
    if (!config.foundryApiKey) {
        throw new Error('FOUNDRY_API_KEY is not configured.');
    }

    let url = config.foundrySearchEndpoint;

    if (!url) {
        if (config.foundryRelayUrl && config.foundryRelayClientId) {
            const relayBase = config.foundryRelayUrl.replace(/\/$/, '');
            url = `${relayBase}/search`;
        }
    }

    if (!url) {
        throw new Error('Foundry search endpoint is not configured. Set FOUNDRY_SEARCH_ENDPOINT or relay settings.');
    }

    const searchUrl = new URL(url);
    if (config.foundryRelayClientId) {
        searchUrl.searchParams.set('clientId', config.foundryRelayClientId);
    }
    searchUrl.searchParams.set('query', characterName);

    const response = await fetchFn(searchUrl.toString(), {
        headers: {
            'x-api-key': `${config.foundryApiKey}`
        }
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

    if (results.length === 0) {
        return null;
    }

    const target = normalizeName(characterName);
    
    // First try exact match
    let match = results.find(result => {
        const resultRecord = result as Record<string, unknown> | null;
        const resultName = (resultRecord?.name ?? (resultRecord?.data as Record<string, unknown> | undefined)?.name ?? resultRecord?.title) as string | undefined;
        return normalizeName(resultName) === target;
    }) as Record<string, unknown> | undefined;

    // If no exact match, find the closest match (contains the search term)
    if (!match) {
        const partialMatches = results.filter(result => {
            const resultRecord = result as Record<string, unknown> | null;
            const resultName = (resultRecord?.name ?? (resultRecord?.data as Record<string, unknown> | undefined)?.name ?? resultRecord?.title) as string | undefined;
            const normalizedResultName = normalizeName(resultName);
            return normalizedResultName.includes(target) || target.includes(normalizedResultName);
        });

        if (partialMatches.length > 0) {
            // Use the first partial match (or could calculate similarity scores)
            match = partialMatches[0] as Record<string, unknown>;
        }
    }

    // If still no match, just use the first result as closest match
    if (!match && results.length > 0) {
        match = results[0] as Record<string, unknown>;
    }

    if (!match) {
        return null;
    }

    const uuid = (match?.uuid ?? (match?.data as Record<string, unknown> | undefined)?.uuid ?? match?._id) as string | undefined;
    if (!uuid || !match) {
        return null;
    }

    return { uuid, match };
}

function normalizeName(name: string | null | undefined): string {
    return String(name || '').trim().toLowerCase();
}

async function verifyFoundryCharacterName(characterName: string): Promise<{ ok: true; actor: Record<string, unknown>; uuid: string } | { ok: false; reason: 'not_found' }> {
    const result = await fetchFoundryActorUuidByName(characterName);

    if (!result) {
        return { ok: false, reason: 'not_found' };
    }

    return { ok: true, actor: result.match, uuid: result.uuid };
}

client.once(Events.ClientReady, async () => {
    if (!client.user) {
        return;
    }

    console.log(`✅ Bot logged in as ${client.user.tag}`);

    const commands = [
        {
            name: 'ticket',
            description: 'Create a new ticket',
            options: []
        },
        {
            name: 'close',
            description: 'Close the current ticket',
            options: []
        },
        {
            name: 'linkcharacter',
            description: 'Link a FoundryVTT character to your Discord account',
            options: [
                {
                    name: 'character_name',
                    type: 3,
                    description: 'The FoundryVTT character sheet name',
                    required: true
                }
            ]
        },
        {
            name: 'unlinkcharacter',
            description: 'Unlink your FoundryVTT character',
            options: []
        },
        {
            name: 'mycharacter',
            description: 'View your linked FoundryVTT character',
            options: []
        },
        {
            name: 'viewcharacter',
            description: "View another user's linked character",
            options: [
                {
                    name: 'user',
                    type: 6,
                    description: 'The user whose character you want to view',
                    required: true
                }
            ]
        },
        {
            name: 'inventory',
            description: 'View your character\'s inventory from FoundryVTT',
            options: []
        }
    ];

    const rest = new REST({ version: '10' }).setToken(requiredConfig.token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(requiredConfig.clientId, requiredConfig.guildId),
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'ticket') {
            await handleTicketCommand(interaction);
        } else if (commandName === 'close') {
            await handleCloseCommand(interaction);
        } else if (commandName === 'linkcharacter') {
            await handleLinkCharacterCommand(interaction);
        } else if (commandName === 'unlinkcharacter') {
            await handleUnlinkCharacterCommand(interaction);
        } else if (commandName === 'mycharacter') {
            await handleMyCharacterCommand(interaction);
        } else if (commandName === 'viewcharacter') {
            await handleViewCharacterCommand(interaction);
        } else if (commandName === 'inventory') {
            await handleInventoryCommand(interaction);
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_type') {
            await handleTicketSelection(interaction);
        }
    }
});

async function handleTicketCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.channelId !== requiredConfig.ticketChannelId) {
        await interaction.reply({
            content: '❌ This command can only be used in the ticket channel.',
            ephemeral: true
        });
        return;
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_type')
        .setPlaceholder('Select a ticket type')
        .addOptions([
            {
                label: 'Character Concept',
                description: 'Discuss your character concept idea',
                value: 'character_concept',
                emoji: '💡'
            },
            {
                label: 'Forge Access',
                description: 'Get help with forge access',
                value: 'forge_access',
                emoji: '🔨'
            },
            {
                label: 'Character Creation',
                description: 'Get help creating your character',
                value: 'character_creation',
                emoji: '✨'
            },
            {
                label: 'Character Submission',
                description: 'Submit your completed character',
                value: 'character_submission',
                emoji: '📋'
            }
        ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
        content: '🎫 Please select the type of ticket you want to create:',
        components: [row],
        ephemeral: true
    });
}

async function handleTicketSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    const ticketType = interaction.values[0];
    const user = interaction.user;
    const guild = interaction.guild;

    if (!guild) {
        await interaction.update({
            content: '❌ Tickets can only be created inside a server.',
            components: []
        });
        return;
    }

    if (activeTickets.has(user.id)) {
        await interaction.update({
            content: '❌ You already have an active ticket!',
            components: []
        });
        return;
    }

    await interaction.update({
        content: '⏳ Creating your ticket...',
        components: []
    });

    try {
        const supportRole = await guild.roles.fetch(requiredConfig.supportRoleId);
        if (!supportRole) {
            throw new Error('Support role not found.');
        }

        let category = await guild.channels.fetch(requiredConfig.ticketCategoryId).catch(() => null);
        if (!category || category.type !== ChannelType.GuildCategory) {
            category = await guild.channels.create({
                name: 'Tickets',
                type: ChannelType.GuildCategory
            });
        }

        const ticketTypeName = ticketType.replace(/_/g, '-');

        const textChannel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: client.user?.id ?? guild.client.user?.id ?? '',
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: requiredConfig.supportRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ]
        });

        const voiceChannel = await guild.channels.create({
            name: `🎤 ${user.username}`,
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: client.user?.id ?? guild.client.user?.id ?? '',
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                },
                {
                    id: requiredConfig.supportRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                }
            ]
        });

        activeTickets.set(user.id, {
            textChannelId: textChannel.id,
            voiceChannelId: voiceChannel.id,
            ticketType
        });

        const typeDisplayNames: Record<string, string> = {
            character_concept: 'Character Concept',
            character_creation: 'Character Creation',
            character_submission: 'Character Submission'
        };
        const displayName = typeDisplayNames[ticketType] || ticketTypeName;

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎫 Ticket Created')
            .setDescription(`Welcome ${user}! Your ticket has been created.`)
            .addFields(
                { name: 'Ticket Type', value: displayName, inline: true },
                { name: 'Created By', value: user.tag, inline: true }
            )
            .setFooter({ text: 'Use /close to close this ticket' })
            .setTimestamp();

        await textChannel.send({
            content: `${user} ${supportRole}`,
            embeds: [welcomeEmbed]
        });

        await interaction.followUp({
            content: `✅ Your ticket has been created! Check ${textChannel}`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.followUp({
            content: '❌ There was an error creating your ticket. Please try again later.',
            ephemeral: true
        });
    }
}

async function handleCloseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.channel;

    if (!channel || !interaction.guild) {
        await interaction.reply({
            content: '❌ This command can only be used in ticket channels.',
            ephemeral: true
        });
        return;
    }

    let ticketUserId: string | null = null;
    for (const [userId, ticketData] of activeTickets.entries()) {
        if (ticketData.textChannelId === channel.id) {
            ticketUserId = userId;
            break;
        }
    }

    if (!ticketUserId) {
        await interaction.reply({
            content: '❌ This command can only be used in ticket channels.',
            ephemeral: true
        });
        return;
    }

    const member = interaction.member;
    const canClose =
        ticketUserId === interaction.user.id ||
        (member && 'roles' in member && (
            Array.isArray(member.roles)
                ? member.roles.includes(requiredConfig.supportRoleId)
                : member.roles.cache.has(requiredConfig.supportRoleId)
        ));

    if (!canClose) {
        await interaction.reply({
            content: '❌ You do not have permission to close this ticket.',
            ephemeral: true
        });
        return;
    }

    await interaction.reply('🔒 Closing ticket in 5 seconds...');

    const ticketData = activeTickets.get(ticketUserId);
    if (!ticketData) {
        return;
    }

    setTimeout(async () => {
        try {
            const voiceChannel = await interaction.guild?.channels.fetch(ticketData.voiceChannelId).catch(() => null);
            if (voiceChannel) {
                await voiceChannel.delete();
            }

            await channel.delete();
            activeTickets.delete(ticketUserId);
        } catch (error) {
            console.error('Error closing ticket:', error);
        }
    }, 5000);
}

async function handleLinkCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const characterName = interaction.options.getString('character_name');
    if (!characterName) {
        await interaction.reply({
            content: '❌ Character name is required.',
            ephemeral: true
        });
        return;
    }

    const userId = interaction.user.id;

    let verification;
    try {
        verification = await verifyFoundryCharacterName(characterName);
    } catch (error) {
        console.error('Foundry verification error:', error);
        await interaction.reply({
            content: `❌ Unable to verify character name against Foundry. ${(error as Error).message}`,
            ephemeral: true
        });
        return;
    }

    if (!verification.ok) {
        await interaction.reply({
            content: `❌ Character "${characterName}" not found on the Foundry instance. Check the exact sheet name and try again.`,
            ephemeral: true
        });
        return;
    }

    try {
        // Check if this character is already claimed by another user
        const allLinks = await getAllCharacterLinks();
        const existingClaim = allLinks.find(link => 
            link.actorUuid === verification.uuid && link.discordUserId !== userId
        );

        if (existingClaim) {
            await interaction.reply({
                content: `❌ Character "${characterName}" is already claimed by another user. Please choose a different character.`,
                ephemeral: true
            });
            return;
        }

        const link = await createOrUpdateCharacterLink(userId, verification.uuid, characterName);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Character Linked')
            .setDescription('Your FoundryVTT character has been linked!')
            .addFields(
                { name: 'Character Name', value: characterName, inline: true },
                { name: 'Actor UUID', value: verification.uuid, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error linking character:', error);
        await interaction.reply({
            content: `❌ Failed to link character: ${(error as Error).message}`,
            ephemeral: true
        });
    }
}

async function handleUnlinkCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;

    try {
        const characterData = await getCharacterLink(userId);

        if (!characterData) {
            await interaction.reply({
                content: "❌ You don't have a linked character.",
                ephemeral: true
            });
            return;
        }

        await deleteCharacterLink(userId);

        await interaction.reply({
            content: `✅ Your character "${characterData.actorName}" has been unlinked.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error unlinking character:', error);
        await interaction.reply({
            content: `❌ Failed to unlink character: ${(error as Error).message}`,
            ephemeral: true
        });
    }
}

async function handleMyCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;

    try {
        const characterData = await getCharacterLink(userId);

        if (!characterData) {
            await interaction.reply({
                content: "❌ You don't have a linked character. Use `/linkcharacter` to link one.",
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📜 Your FoundryVTT Character')
            .setDescription(`Character linked to ${interaction.user}`)
            .addFields(
                { name: 'Character Name', value: characterData.actorName, inline: true },
                { name: 'Actor UUID', value: characterData.actorUuid, inline: true },
                { name: 'Linked Since', value: `<t:${Math.floor(new Date(characterData.createdAt).getTime() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Use /unlinkcharacter to remove this link' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting character info:', error);
        await interaction.reply({
            content: `❌ Failed to retrieve character information: ${(error as Error).message}`,
            ephemeral: true
        });
    }
}

async function handleViewCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user');

    if (!targetUser) {
        await interaction.reply({
            content: '❌ You must specify a user.',
            ephemeral: true
        });
        return;
    }

    const userId = targetUser.id;

    try {
        const characterData = await getCharacterLink(userId);

        if (!characterData) {
            await interaction.reply({
                content: `❌ ${targetUser.tag} doesn't have a linked character.`,
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📜 FoundryVTT Character')
            .setDescription(`Character linked to ${targetUser}`)
            .addFields(
                { name: 'Character Name', value: characterData.actorName, inline: true },
                { name: 'Actor UUID', value: characterData.actorUuid, inline: true },
                { name: 'Linked Since', value: `<t:${Math.floor(new Date(characterData.createdAt).getTime() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error viewing character:', error);
        await interaction.reply({
            content: `❌ Failed to retrieve character information: ${(error as Error).message}`,
            ephemeral: true
        });
    }
}

async function handleInventoryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    try {
        // Get the user's linked character
        const characterData = await getCharacterLink(userId);

        if (!characterData) {
            await interaction.editReply({
                content: "❌ You don't have a linked character. Use `/linkcharacter` to link one first."
            });
            return;
        }

        // Fetch the actor data from Foundry
        const actor = await fetchActorData(characterData.actorUuid);
        const actorData = actor?.data;


        if (!actorData || !actorData.items) {
            await interaction.editReply({
                content: '❌ Failed to retrieve inventory data from Foundry.'
            });
            return;
        }

        // Parse items from the actor data
        const items = Array.isArray(actorData.items) ? actorData.items : [];
        
        if (items.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎒 ${characterData.actorName}'s Inventory`)
                .setDescription('Your inventory is empty.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Group items by type
        let itemsByType: { [key: string]: any[] } = {};
        for (const item of items) {
            const itemType = item.type || 'other';
            if (!itemsByType[itemType]) {
                itemsByType[itemType] = [];
            }
            itemsByType[itemType].push(item);
        }

        // Filter out Class, Feats, Race and Background
        const excludedTypes = ['class', 'feat', 'race', 'background', 'subclass'];
        itemsByType = Object.fromEntries(
            Object.entries(itemsByType).filter(([type]) => !excludedTypes.includes(type.toLowerCase()))
        );

        // Recalculate total items after filtering
        const filteredItemCount = Object.values(itemsByType).reduce((sum, typeItems) => sum + typeItems.length, 0);

        // Create embeds (Discord has a 25 field limit per embed)
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎒 ${characterData.actorName}'s Inventory`)
            .setDescription(`Total Items: ${filteredItemCount}`)
            .setTimestamp();

        // Add fields for each item type (limit to avoid Discord's field limit)
        let fieldCount = 0;
        const maxFields = 25;

        for (const [type, typeItems] of Object.entries(itemsByType)) {
            if (fieldCount >= maxFields) break;

            const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
            const itemList = typeItems
                .slice(0, 10) // Limit items per type to avoid huge messages
                .map(item => {
                    const name = item.name || 'Unknown';
                    const qty = item.system?.quantity || item.data?.quantity || 1;
                    const equipped = item.system?.equipped || item.data?.equipped;
                    const equippedStr = equipped ? ' ⚔️' : '';
                    return qty > 1 ? `• ${name} (x${qty})${equippedStr}` : `• ${name}${equippedStr}`;
                })
                .join('\n');

            const moreItems = typeItems.length > 10 ? `\n_...and ${typeItems.length - 10} more_` : '';

            embed.addFields({
                name: `${typeLabel} (${typeItems.length})`,
                value: itemList + moreItems || 'None',
                inline: false
            });

            fieldCount++;
        }

        if (Object.keys(itemsByType).length > maxFields) {
            embed.setFooter({ text: 'Some item types are not shown due to Discord limits' });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error fetching inventory:', error);
        await interaction.editReply({
            content: `❌ Failed to retrieve inventory: ${(error as Error).message}`
        });
    }
}

client.login(requiredConfig.token);
