import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonInteraction, EmbedBuilder, ButtonBuilder, ButtonStyle, TextChannel, Client } from 'discord.js';
import { getAllCharacters, getCharacterById } from '../models/character.js';
import { createAsk, getAsk, updateAskAnswer } from '../models/ask.js';

const ASKS_CHANNEL_ID = '1479867524517597490';

export async function handleAskCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const characters = await getAllCharacters();
        if (characters.length === 0) {
            await interaction.reply({ content: '❌ No characters found.', ephemeral: true });
            return;
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('ask_npc_select')
            .setPlaceholder('Select an NPC to ask...')
            .addOptions(
                characters.slice(0, 25).map(char => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(char.name)
                        .setValue(char.id.toString())
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
    const characterIdStr = interaction.customId.replace('ask_modal_', '');
    const characterId = parseInt(characterIdStr, 10);
    const question = interaction.fields.getTextInputValue('question_input');

    await interaction.deferReply({ ephemeral: true });

    try {
        const character = await getCharacterById(characterId);
        const charName = character ? character.name : `Unknown NPC (${characterId})`;

        const channelId = interaction.channelId || '';

        const askRecord = await createAsk(interaction.user.id, channelId, characterId, question);

        // Send to admin channel
        const asksChannel = await client.channels.fetch(ASKS_CHANNEL_ID) as TextChannel;
        if (asksChannel) {
            const embed = new EmbedBuilder()
                .setTitle(`New Question for ${charName}`)
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

        await interaction.editReply({ content: `✅ Your question has been asked to **${charName}**. They will reply in this channel soon!` });

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

        // Fetch character for name
        const character = await getCharacterById(askRecord.character_id);
        const charName = character ? character.name : 'Unknown NPC';

        // Send to the original channel
        if (askRecord.channel_id) {
            const originalChannel = await client.channels.fetch(askRecord.channel_id) as TextChannel;
            if (originalChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(`Response from ${charName}`)
                    .setDescription(`**Question:**\n${askRecord.ask}\n\n**Reply:**\n${answer}`)
                    .setColor('#00FF00')
                    .setTimestamp();
                
                await originalChannel.send({ content: `<@${askRecord.discord_id}>`, embeds: [embed] }).catch(err => {
                    console.error(`Could not send message to channel ${askRecord.channel_id}:`, err);
                    throw new Error('Bot lacks permission to send messages in the original channel.');
                });
            }
        } else {
            console.error(`No channel_id saved for ask ${askId}`);
            // Fallback to DM if possible (for backward compatibility if old asks exist)
            const user = await client.users.fetch(askRecord.discord_id);
            if (user) {
                const embed = new EmbedBuilder()
                    .setTitle(`Response from ${charName}`)
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
