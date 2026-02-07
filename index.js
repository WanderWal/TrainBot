const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require('discord.js');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
    ]
});

// Store active tickets
const activeTickets = new Map();

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

client.login(config.token);
