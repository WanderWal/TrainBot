import { ActionRowBuilder, ChannelType, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuInteraction, Client } from 'discord.js';
import { requiredConfig } from '../config.js';
import { activeTickets } from '../state.js';

export async function handleTicketCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.channelId !== requiredConfig.ticketChannelId) {
        await interaction.reply({ content: '❌ This command can only be used in the ticket channel.', ephemeral: true });
        return;
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_type')
        .setPlaceholder('Select a ticket type')
        .addOptions([
            { label: 'Character Concept', description: 'Discuss your character concept idea', value: 'character_concept', emoji: '💡' },
            { label: 'Forge Access', description: 'Get help with forge access', value: 'forge_access', emoji: '🔨' },
            { label: 'Character Creation', description: 'Get help creating your character', value: 'character_creation', emoji: '✨' },
            { label: 'Character Submission', description: 'Submit your completed character', value: 'character_submission', emoji: '📋' }
        ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({ content: '🎫 Please select the type of ticket you want to create:', components: [row], ephemeral: true });
}

export async function handleTicketSelection(interaction: StringSelectMenuInteraction, client: Client): Promise<void> {
    const ticketType = interaction.values[0];
    const user = interaction.user;
    const guild = interaction.guild;

    if (!guild) {
        await interaction.update({ content: '❌ Tickets can only be created inside a server.', components: [] });
        return;
    }

    if (activeTickets.has(user.id)) {
        await interaction.update({ content: '❌ You already have an active ticket!', components: [] });
        return;
    }

    await interaction.update({ content: '⏳ Creating your ticket...', components: [] });

    try {
        const supportRole = await guild.roles.fetch(requiredConfig.supportRoleId);
        if (!supportRole) throw new Error('Support role not found.');

        let category = await guild.channels.fetch(requiredConfig.ticketCategoryId).catch(() => null);
        if (!category || category.type !== ChannelType.GuildCategory) {
            category = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory });
        }

        const ticketTypeName = ticketType.replace(/_/g, '-');

        const textChannel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: client.user?.id ?? guild.client.user?.id ?? '', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: requiredConfig.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ]
        });

        const voiceChannel = await guild.channels.create({
            name: `🎤 ${user.username}`,
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: client.user?.id ?? guild.client.user?.id ?? '', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                { id: requiredConfig.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
            ]
        });

        activeTickets.set(user.id, { textChannelId: textChannel.id, voiceChannelId: voiceChannel.id, ticketType });

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
            .addFields({ name: 'Ticket Type', value: displayName, inline: true }, { name: 'Created By', value: user.tag, inline: true })
            .setFooter({ text: 'Use /close to close this ticket' })
            .setTimestamp();

        await textChannel.send({ content: `${user} ${supportRole}`, embeds: [welcomeEmbed] });
        await interaction.followUp({ content: `✅ Your ticket has been created! Check ${textChannel}`, ephemeral: true });
    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.followUp({ content: '❌ There was an error creating your ticket. Please try again later.', ephemeral: true });
    }
}

export async function handleCloseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.channel;
    if (!channel || !interaction.guild) {
        await interaction.reply({ content: '❌ This command can only be used in ticket channels.', ephemeral: true });
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
        await interaction.reply({ content: '❌ This command can only be used in ticket channels.', ephemeral: true });
        return;
    }

    const member = interaction.member;
    const canClose = ticketUserId === interaction.user.id || (member && 'roles' in member && (Array.isArray(member.roles) ? member.roles.includes(requiredConfig.supportRoleId) : member.roles.cache.has(requiredConfig.supportRoleId)));

    if (!canClose) {
        await interaction.reply({ content: '❌ You do not have permission to close this ticket.', ephemeral: true });
        return;
    }

    await interaction.reply('🔒 Closing ticket in 5 seconds...');
    const ticketData = activeTickets.get(ticketUserId);
    if (!ticketData) return;

    setTimeout(async () => {
        try {
            const voiceChannel = await interaction.guild?.channels.fetch(ticketData.voiceChannelId).catch(() => null);
            if (voiceChannel) await voiceChannel.delete();
            await channel.delete();
            activeTickets.delete(ticketUserId);
        } catch (error) {
            console.error('Error closing ticket:', error);
        }
    }, 5000);
}
