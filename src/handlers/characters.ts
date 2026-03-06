import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { requiredConfig } from '../config.js';
import { verifyFoundryCharacterName, fetchActorData } from '../api.js';
import { getAllCharacterLinks, createOrUpdateCharacterLink, getCharacterLink, deleteCharacterLink } from '../models/character.js';

export async function handleLinkCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const characterName = interaction.options.getString('character_name');
    if (!characterName) {
        await interaction.reply({ content: '❌ Character name is required.', ephemeral: true });
        return;
    }

    const userId = interaction.user.id;
    let verification;
    try {
        verification = await verifyFoundryCharacterName(characterName);
    } catch (error) {
        await interaction.reply({ content: `❌ Unable to verify character name against Foundry. ${(error as Error).message}`, ephemeral: true });
        return;
    }

    if (!verification.ok) {
        await interaction.reply({ content: `❌ Character "${characterName}" not found on the Foundry instance. Check the exact sheet name and try again.`, ephemeral: true });
        return;
    }

    try {
        const allLinks = await getAllCharacterLinks();
        const existingClaim = allLinks.find(link => link.actorUuid === verification.uuid && link.discordUserId !== userId);

        if (existingClaim) {
            await interaction.reply({ content: `❌ Character "${characterName}" is already claimed by another user. Please choose a different character.`, ephemeral: true });
            return;
        }

        const link = await createOrUpdateCharacterLink(userId, verification.uuid, characterName, interaction.user.username);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Character Linked')
            .setDescription('Your FoundryVTT character has been linked!')
            .addFields({ name: 'Character Name', value: characterName, inline: true }, { name: 'Actor UUID', value: verification.uuid, inline: true })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        await interaction.reply({ content: `❌ Failed to link character: ${(error as Error).message}`, ephemeral: true });
    }
}

export async function handleUnlinkCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    try {
        const characterData = await getCharacterLink(userId);
        if (!characterData) {
            await interaction.reply({ content: "❌ You don't have a linked character.", ephemeral: true });
            return;
        }
        await deleteCharacterLink(userId);
        await interaction.reply({ content: `✅ Your character "${characterData.actorName}" has been unlinked.`, ephemeral: true });
    } catch (error) {
        await interaction.reply({ content: `❌ Failed to unlink character: ${(error as Error).message}`, ephemeral: true });
    }
}

export async function handleMyCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    try {
        const characterData = await getCharacterLink(userId);
        if (!characterData) {
            await interaction.reply({ content: "❌ You don't have a linked character. Use `/linkcharacter` to link one.", ephemeral: true });
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
        await interaction.reply({ content: `❌ Failed to retrieve character information: ${(error as Error).message}`, ephemeral: true });
    }
}

export async function handleViewCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user');
    if (!targetUser) {
        await interaction.reply({ content: '❌ You must specify a user.', ephemeral: true });
        return;
    }
    const userId = targetUser.id;
    try {
        const characterData = await getCharacterLink(userId);
        if (!characterData) {
            await interaction.reply({ content: `❌ ${targetUser.tag} doesn't have a linked character.`, ephemeral: true });
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
        await interaction.reply({ content: `❌ Failed to retrieve character information: ${(error as Error).message}`, ephemeral: true });
    }
}

export async function handleAssignCharacterCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.member;
    const hasSupport = member && 'roles' in member && (Array.isArray(member.roles) ? member.roles.includes(requiredConfig.supportRoleId) : member.roles.cache.has(requiredConfig.supportRoleId));
    if (!hasSupport) {
        await interaction.reply({ content: '❌ You do not have permission to use this command. Only support staff can assign characters.', ephemeral: true });
        return;
    }
    const targetUser = interaction.options.getUser('user');
    const characterName = interaction.options.getString('character_name');
    if (!targetUser || !characterName) {
        await interaction.reply({ content: '❌ Both user and character name are required.', ephemeral: true });
        return;
    }
    const targetUserId = targetUser.id;
    let verification;
    try {
        verification = await verifyFoundryCharacterName(characterName);
    } catch (error) {
        await interaction.reply({ content: `❌ Unable to verify character name against Foundry. ${(error as Error).message}`, ephemeral: true });
        return;
    }
    if (!verification.ok) {
        await interaction.reply({ content: `❌ Character "${characterName}" not found on the Foundry instance. Check the exact sheet name and try again.`, ephemeral: true });
        return;
    }
    try {
        const allLinks = await getAllCharacterLinks();
        const existingClaim = allLinks.find(link => link.actorUuid === verification.uuid && link.discordUserId !== targetUserId);
        if (existingClaim) {
            await interaction.reply({ content: `❌ Character "${characterName}" is already claimed by another user (<@${existingClaim.discordUserId}>). Unlink it first or choose a different character.`, ephemeral: true });
            return;
        }
        const link = await createOrUpdateCharacterLink(targetUserId, verification.uuid, characterName, targetUser.username);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Character Assigned')
            .setDescription(`Character has been assigned to ${targetUser}`)
            .addFields(
                { name: 'User', value: `<@${targetUserId}>`, inline: true },
                { name: 'Character Name', value: characterName, inline: true },
                { name: 'Actor UUID', value: verification.uuid, inline: false },
                { name: 'Assigned By', value: `${interaction.user.tag}`, inline: true }
            )
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📜 Character Assigned')
                .setDescription(`A FoundryVTT character has been assigned to you by ${interaction.user.tag}!`)
                .addFields({ name: 'Character Name', value: characterName, inline: true })
                .setFooter({ text: 'Use /mycharacter to view your linked character' })
                .setTimestamp();
            await targetUser.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            console.log(`Could not DM user ${targetUser.tag}:`, dmError);
        }
    } catch (error) {
        await interaction.reply({ content: `❌ Failed to assign character: ${(error as Error).message}`, ephemeral: true });
    }
}

export async function handleInventoryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });
    try {
        const characterData = await getCharacterLink(userId);
        if (!characterData) {
            await interaction.editReply({ content: "❌ You don't have a linked character. Use `/linkcharacter` to link one first." });
            return;
        }
        const actor = await fetchActorData(characterData.actorUuid);
        const actorData = actor?.data;
        if (!actorData || !actorData.items) {
            await interaction.editReply({ content: '❌ Failed to retrieve inventory data from Foundry.' });
            return;
        }
        const items = Array.isArray(actorData.items) ? actorData.items : [];
        if (items.length === 0) {
            const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🎒 ${characterData.actorName}'s Inventory`).setDescription('Your inventory is empty.').setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        let itemsByType: { [key: string]: any[] } = {};
        for (const item of items) {
            const itemType = item.type || 'other';
            if (!itemsByType[itemType]) itemsByType[itemType] = [];
            itemsByType[itemType].push(item);
        }
        const excludedTypes = ['class', 'feat', 'race', 'background', 'subclass'];
        itemsByType = Object.fromEntries(Object.entries(itemsByType).filter(([type]) => !excludedTypes.includes(type.toLowerCase())));
        const filteredItemCount = Object.values(itemsByType).reduce((sum, typeItems) => sum + typeItems.length, 0);
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🎒 ${characterData.actorName}'s Inventory`).setDescription(`Total Items: ${filteredItemCount}`).setTimestamp();
        let fieldCount = 0;
        const maxFields = 25;
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            if (fieldCount >= maxFields) break;
            const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
            const itemList = typeItems.slice(0, 10).map(item => {
                const name = item.name || 'Unknown';
                const qty = item.system?.quantity || item.data?.quantity || 1;
                const equipped = item.system?.equipped || item.data?.equipped;
                const equippedStr = equipped ? ' ⚔️' : '';
                return qty > 1 ? `• ${name} (x${qty})${equippedStr}` : `• ${name}${equippedStr}`;
            }).join('\n');
            const moreItems = typeItems.length > 10 ? `\n_...and ${typeItems.length - 10} more_` : '';
            embed.addFields({ name: `${typeLabel} (${typeItems.length})`, value: itemList + moreItems || 'None', inline: false });
            fieldCount++;
        }
        if (Object.keys(itemsByType).length > maxFields) {
            embed.setFooter({ text: 'Some item types are not shown due to Discord limits' });
        }
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply({ content: `❌ Failed to retrieve inventory: ${(error as Error).message}` });
    }
}
