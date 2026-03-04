require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

let fetchFn = globalThis.fetch;
if (!fetchFn) {
    fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
    ]
});

// Store active tickets
const activeTickets = new Map();

// Store character-user links
const characterLinksFile = path.join(__dirname, 'character-links.json');
const characterLinks = loadCharacterLinks();

// Load character links from file
function loadCharacterLinks() {
    try {
        if (fs.existsSync(characterLinksFile)) {
            const data = fs.readFileSync(characterLinksFile, 'utf8');
            return new Map(JSON.parse(data));
        }
    } catch (error) {
        console.error('Error loading character links:', error);
    }
    return new Map();
}

// Save character links to file
function saveCharacterLinks() {
    try {
        const data = JSON.stringify([...characterLinks]);
        fs.writeFileSync(characterLinksFile, data, 'utf8');
    } catch (error) {
        console.error('Error saving character links:', error);
    }
}

async function fetchFoundryActorUuidByName(characterName) {
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
    searchUrl.searchParams.set('clientId', config.foundryRelayClientId);
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

    const data = await response.json();
    console.log(data);

    const results = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.results)
                ? data.results
                : [];

    const target = normalizeName(characterName);
    const match = results.find(result => {
        const resultName = result?.name ?? result?.data?.name ?? result?.title;
        return normalizeName(resultName) === target;
    });

    const uuid = match?.uuid ?? match?.data?.uuid ?? match?._id ?? null;
    return uuid ? { uuid, match } : null;
}

function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}

async function verifyFoundryCharacterName(characterName) {
    const result = await fetchFoundryActorUuidByName(characterName);

    if (!result) {
        return { ok: false, reason: 'not_found' };
    }

    return { ok: true, actor: result.match, uuid: result.uuid };
}

client.once('clientReady', async () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    
    // Register slash commands
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
                    type: 3, // STRING
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
            description: 'View another user\'s linked character',
            options: [
                {
                    name: 'user',
                    type: 6, // USER
                    description: 'The user whose character you want to view',
                    required: true
                }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    // Handle slash commands
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
        }
    }

    // Handle select menu interactions
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_type') {
            await handleTicketSelection(interaction);
        }
    }
});

async function handleTicketCommand(interaction) {
    // Check if command is used in the designated ticket channel
    if (interaction.channelId !== config.ticketChannelId) {
        return interaction.reply({
            content: '❌ This command can only be used in the ticket channel.',
            ephemeral: true
        });
    }

    // Create select menu for ticket type
    const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

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

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: '🎫 Please select the type of ticket you want to create:',
        components: [row],
        ephemeral: true
    });
}

async function handleTicketSelection(interaction) {
    const ticketType = interaction.values[0];
    const user = interaction.user;
    const guild = interaction.guild;

    // Check if user already has an active ticket
    if (activeTickets.has(user.id)) {
        return interaction.update({
            content: '❌ You already have an active ticket!',
            components: [],
            ephemeral: true
        });
    }

    await interaction.update({
        content: '⏳ Creating your ticket...',
        components: [],
        ephemeral: true
    });

    try {
        // Get the support role
        const supportRole = await guild.roles.fetch(config.supportRoleId);
        
        // Get or create category for tickets
        let category = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
        
        if (!category) {
            category = await guild.channels.create({
                name: 'Tickets',
                type: 4, // Category type
            });
        }

        // Format ticket type for display
        const ticketTypeName = ticketType.replace(/_/g, '-');
        
        // Create text channel
        const textChannel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: 0, // Text channel
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ReadMessageHistory,
                    ],
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                    ],
                },
                {
                    id: config.supportRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                    ],
                },
            ],
        });

        // Create voice channel
        const voiceChannel = await guild.channels.create({
            name: `🎤 ${user.username}`,
            type: 2, // Voice channel
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                    ],
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                    ],
                },
                {
                    id: config.supportRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                    ],
                },
            ],
        });

        // Store ticket info
        activeTickets.set(user.id, {
            textChannelId: textChannel.id,
            voiceChannelId: voiceChannel.id,
            ticketType: ticketType,
        });

        // Get ticket type display name
        const typeDisplayNames = {
            'character_concept': 'Character Concept',
            'character_creation': 'Character Creation',
            'character_submission': 'Character Submission'
        };
        const displayName = typeDisplayNames[ticketType] || ticketType;

        // Send welcome message in the ticket channel
        const { EmbedBuilder } = require('discord.js');
        
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

        // Update the ephemeral message
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

async function handleCloseCommand(interaction) {
    const channel = interaction.channel;
    
    // Check if this is a ticket channel
    let ticketUserId = null;
    for (const [userId, ticketData] of activeTickets.entries()) {
        if (ticketData.textChannelId === channel.id) {
            ticketUserId = userId;
            break;
        }
    }

    if (!ticketUserId) {
        return interaction.reply({
            content: '❌ This command can only be used in ticket channels.',
            ephemeral: true
        });
    }

    // Check if user has permission to close (ticket owner or support role)
    const member = interaction.member;
    const canClose = ticketUserId === interaction.user.id || member.roles.cache.has(config.supportRoleId);

    if (!canClose) {
        return interaction.reply({
            content: '❌ You do not have permission to close this ticket.',
            ephemeral: true
        });
    }

    await interaction.reply('🔒 Closing ticket in 5 seconds...');

    const ticketData = activeTickets.get(ticketUserId);

    setTimeout(async () => {
        try {
            // Delete voice channel
            const voiceChannel = await interaction.guild.channels.fetch(ticketData.voiceChannelId).catch(() => null);
            if (voiceChannel) await voiceChannel.delete();

            // Delete text channel
            await channel.delete();

            // Remove from active tickets
            activeTickets.delete(ticketUserId);

        } catch (error) {
            console.error('Error closing ticket:', error);
        }
    }, 5000);
}

// Link character command
async function handleLinkCharacterCommand(interaction) {
    const characterName = interaction.options.getString('character_name');
    const userId = interaction.user.id;

    let verification;
    try {
        verification = await verifyFoundryCharacterName(characterName);
    } catch (error) {
        console.error('Foundry verification error:', error);
        return interaction.reply({
            content: `❌ Unable to verify character name against Foundry. ${error.message}`,
            ephemeral: true
        });
    }

    if (!verification.ok) {
        return interaction.reply({
            content: `❌ Character "${characterName}" not found on the Foundry instance. Check the exact sheet name and try again.`,
            ephemeral: true
        });
    }

    // Store the link
    characterLinks.set(userId, {
        characterName: characterName,
        actorUuid: verification.uuid,
        linkedAt: new Date().toISOString()
    });

    saveCharacterLinks();

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Character Linked')
        .setDescription(`Your FoundryVTT character has been linked!`)
        .addFields(
            { name: 'Character Name', value: characterName, inline: true },
            { name: 'Actor UUID', value: verification.uuid, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Unlink character command
async function handleUnlinkCharacterCommand(interaction) {
    const userId = interaction.user.id;

    if (!characterLinks.has(userId)) {
        return interaction.reply({
            content: '❌ You don\'t have a linked character.',
            ephemeral: true
        });
    }

    const characterData = characterLinks.get(userId);
    characterLinks.delete(userId);
    saveCharacterLinks();

    await interaction.reply({
        content: `✅ Your character "${characterData.characterName}" has been unlinked.`,
        ephemeral: true
    });
}

// My character command
async function handleMyCharacterCommand(interaction) {
    const userId = interaction.user.id;

    if (!characterLinks.has(userId)) {
        return interaction.reply({
            content: '❌ You don\'t have a linked character. Use `/linkcharacter` to link one.',
            ephemeral: true
        });
    }

    const characterData = characterLinks.get(userId);
    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📜 Your FoundryVTT Character')
        .setDescription(`Character linked to ${interaction.user}`)
        .addFields(
            { name: 'Character Name', value: characterData.characterName, inline: true },
            { name: 'Actor UUID', value: characterData.actorUuid || 'Unknown', inline: true },
            { name: 'Linked Since', value: `<t:${Math.floor(new Date(characterData.linkedAt).getTime() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Use /unlinkcharacter to remove this link' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// View character command
async function handleViewCharacterCommand(interaction) {
    const targetUser = interaction.options.getUser('user');
    const userId = targetUser.id;

    if (!characterLinks.has(userId)) {
        return interaction.reply({
            content: `❌ ${targetUser.tag} doesn't have a linked character.`,
            ephemeral: true
        });
    }

    const characterData = characterLinks.get(userId);
    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📜 FoundryVTT Character')
        .setDescription(`Character linked to ${targetUser}`)
        .addFields(
            { name: 'Character Name', value: characterData.characterName, inline: true },
            { name: 'Actor UUID', value: characterData.actorUuid || 'Unknown', inline: true },
            { name: 'Linked Since', value: `<t:${Math.floor(new Date(characterData.linkedAt).getTime() / 1000)}:R>`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

client.login(config.token);
