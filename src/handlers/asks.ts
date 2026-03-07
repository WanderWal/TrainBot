import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonInteraction, EmbedBuilder, ButtonBuilder, ButtonStyle, TextChannel, Client } from 'discord.js';
import { getAskableInteractables, getInteractableById } from '../models/interactable.js';
import { createAsk, getAsk, updateAskAnswer } from '../models/ask.js';
import { getCharacterLink, getCharacterById, getAllCharacters } from '../models/character.js';
import { getChannelByDiscordId } from '../models/channel.js';

const ASKS_CHANNEL_ID = '1479867524517597490';

export async function handleAskCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const characterLink = await getCharacterLink(interaction.user.id);
        if (!characterLink) {
            await interaction.reply({ content: '❌ You need a linked character to ask questions.', ephemeral: true });
            return;
        }

        const channelId = interaction.channelId;
        const interactables = await getAskableInteractables(channelId);
        if (interactables.length === 0) {
            await interaction.reply({ content: '❌ No NPCs are available to talk to in this channel.', ephemeral: true });
            return;
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('ask_npc_select')
            .setPlaceholder('Select an NPC to ask...')
            .addOptions(
                interactables.slice(0, 25).map(npc => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(npc.name)
                        .setValue(npc.id.toString())
                )
            );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        await interaction.reply({
            content: 'Who would you like to ask a question?',
            components: [row],
            ephemeral: true
        });
    } catch (error: any) {
        console.error('Error in handleAskCommand:', error);
        await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
}

export async function handleAskNpcSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        const characterId = interaction.values[0];
        
        const modal = new ModalBuilder()
            .setCustomId(`ask_modal_${characterId}`)
            .setTitle('Ask a Question');

        const questionInput = new TextInputBuilder()
            .setCustomId('question_input')
            .setLabel('Your Question')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Type your question here...');

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    } catch (error: any) {
        console.error('Error showing ask modal:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Failed to show question form.', ephemeral: true });
        }
    }
}

export async function handleAskModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
    const interactableIdStr = interaction.customId.replace('ask_modal_', '');
    const interactableId = parseInt(interactableIdStr, 10);
    const question = interaction.fields.getTextInputValue('question_input');

    await interaction.deferReply({ ephemeral: true });

    try {
        const interactable = await getInteractableById(interactableId);
        const npcName = interactable ? interactable.name : `Unknown NPC (${interactableId})`;

        const discordChannelId = interaction.channelId || '';
        
        let channelRecordId: number | undefined = undefined;
        if (discordChannelId) {
            const channelRec = await getChannelByDiscordId(discordChannelId);
            if (channelRec) channelRecordId = channelRec.id;
        }

        let characterRecordId: number | undefined = undefined;
        const charLink = await getCharacterLink(interaction.user.id);
        if (charLink) characterRecordId = charLink.id;

        const askRecord = await createAsk(characterRecordId, channelRecordId, interactableId, question);

        // Send to admin channel
        try {
            const asksChannel = await client.channels.fetch(ASKS_CHANNEL_ID) as TextChannel;
            if (asksChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(`New Question for ${npcName}`)
                    .setDescription(`**Player:** <@${interaction.user.id}>\n**Question:**\n${question}`)
                    .setColor('#FFFF00')
                    .setFooter({ text: `Ask ID: ${askRecord.id}` })
                    .setTimestamp();

                const replyBtn = new ButtonBuilder()
                    .setCustomId(`ask_reply_${askRecord.id}`)
                    .setLabel('Reply')
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(replyBtn);

                await asksChannel.send({ embeds: [embed], components: [row] });
            } else {
                console.error(`Admin asks channel ${ASKS_CHANNEL_ID} not found.`);
            }
        } catch (adminErr) {
            console.error(`Failed to send to admin channel (Missing Access or invalid ID?):`, adminErr);
        }

        await interaction.editReply({ content: `✅ Your question has been asked to **${npcName}**. They will reply in this channel soon!` });

        // Try to delete the original message with the select menu
        try {
            await interaction.message?.delete();
        } catch (e) {
            // Ignore error if we couldn't delete the ephemeral message
        }
    } catch (error: any) {
        console.error('Error submitting ask:', error);
        await interaction.editReply({ content: `❌ Error submitting question: ${error.message}` });
    }
}

export async function handleAskReplyButton(interaction: ButtonInteraction): Promise<void> {
    const askId = interaction.customId.replace('ask_reply_', '');

    const modal = new ModalBuilder()
        .setCustomId(`ask_reply_modal_${askId}`)
        .setTitle('Reply to Question');

    const replyInput = new TextInputBuilder()
        .setCustomId('reply_input')
        .setLabel('Response')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Type the NPC response here...');

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(replyInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

export async function handleAskReplyModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
    const askIdStr = interaction.customId.replace('ask_reply_modal_', '');
    const askId = parseInt(askIdStr, 10);
    const answer = interaction.fields.getTextInputValue('reply_input');

    await interaction.deferReply({ ephemeral: true });

    try {
        const askRecord = await getAsk(askId);
        if (!askRecord) {
            await interaction.editReply({ content: '❌ Could not find this question in the database.' });
            return;
        }

        // Update record
        const updatedAsk = await updateAskAnswer(askId, answer);

        const npcName = askRecord.interactable?.name || 'Unknown NPC';
        const targetChannelDiscordId = askRecord.channel?.discord_id;
        const targetUserDiscordId = askRecord.character?.player_id?.discord_id;

        // Send to the original channel
        if (targetChannelDiscordId) {
            const originalChannel = await client.channels.fetch(targetChannelDiscordId) as TextChannel;
            if (originalChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(`Response from ${npcName}`)
                    .setDescription(`**Question:**\n${askRecord.ask}\n\n**Reply:**\n${answer}`)
                    .setColor('#00FF00')
                    .setTimestamp();
                
                const pingContent = targetUserDiscordId ? `<@${targetUserDiscordId}>` : '';
                await originalChannel.send({ content: pingContent, embeds: [embed] }).catch(err => {
                    console.error(`Could not send message to channel ${targetChannelDiscordId}:`, err);
                    throw new Error('Bot lacks permission to send messages in the original channel.');
                });
            }
        } else if (targetUserDiscordId) {
            console.error(`No channel saved for ask ${askId}`);
            // Fallback to DM
            const user = await client.users.fetch(targetUserDiscordId);
            if (user) {
                const embed = new EmbedBuilder()
                    .setTitle(`Response from ${npcName}`)
                    .setDescription(`**Your Question:**\n${askRecord.ask}\n\n**Reply:**\n${answer}`)
                    .setColor('#00FF00')
                    .setTimestamp();
                
                await user.send({ embeds: [embed] }).catch(() => {});
            }
        }

        // Update the original message to remove the button and show it's answered
        const originalMessage = interaction.message;
        if (originalMessage) {
            const embed = EmbedBuilder.from(originalMessage.embeds[0])
                .setColor('#00FF00')
                .addFields({ name: 'Answered By', value: `<@${interaction.user.id}>` })
                .addFields({ name: 'Answer', value: answer });

            await originalMessage.edit({ embeds: [embed], components: [] });
        }

        await interaction.editReply({ content: '✅ Reply sent successfully!' });

    } catch (error: any) {
        console.error('Error submitting reply:', error);
        await interaction.editReply({ content: `❌ Error submitting reply: ${error.message}` });
    }
}
