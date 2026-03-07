import { ChatInputCommandInteraction } from 'discord.js';
import { requiredConfig } from '../config.js';
import { addChannelToDirectus } from '../models/channel.js';

export async function handleAddChannelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member;
    const hasSupport = member && 'roles' in member && (Array.isArray(member.roles) ? member.roles.includes(requiredConfig.supportRoleId) : member.roles.cache.has(requiredConfig.supportRoleId));
    if (!hasSupport) {
        await interaction.reply({ content: '❌ You do not have permission to use this command. Only support staff can add channels.', ephemeral: true });
        return;
    }

    const channel = interaction.channel;
    const channelName = channel && 'name' in channel ? channel.name : 'Unknown Channel';
    const channelId = interaction.channelId;

    if (!channelId) {
        await interaction.reply({ content: '❌ Could not retrieve channel information.', ephemeral: true });
        return;
    }

    try {
        await addChannelToDirectus(channelName!, channelId);
        await interaction.reply({ content: `✅ Successfully added channel \`${channelName}\` to Directus.`, ephemeral: true });
    } catch (error) {
        await interaction.reply({ content: `❌ Failed to add channel. Error: ${(error as Error).message}`, ephemeral: true });
    }
}
