import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { requiredConfig } from './config.js';
import { commands } from './commands.js';
import { handleTicketCommand, handleTicketSelection, handleCloseCommand } from './handlers/tickets.js';
import { handleMyCharacterCommand, handleViewCharacterCommand, handleAssignCharacterCommand, handleInventoryCommand, handleSyncCharactersCommand } from './handlers/characters.js';
import { handleAddChannelCommand } from './handlers/channels.js';
import { handleAskCommand, handleAskNpcSelection, handleAskModalSubmit, handleAskReplyButton, handleAskReplyModalSubmit } from './handlers/asks.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

client.once(Events.ClientReady, async () => {
    if (!client.user) return;
    console.log(`✅ Bot logged in as ${client.user.tag}`);

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
        if (commandName === 'ticket') await handleTicketCommand(interaction);
        else if (commandName === 'close') await handleCloseCommand(interaction);
        else if (commandName === 'mycharacter') await handleMyCharacterCommand(interaction);
        else if (commandName === 'viewcharacter') await handleViewCharacterCommand(interaction);
        else if (commandName === 'inventory') await handleInventoryCommand(interaction);
        else if (commandName === 'assigncharacter') await handleAssignCharacterCommand(interaction);
        else if (commandName === 'synccharacters') await handleSyncCharactersCommand(interaction);
        else if (commandName === 'addchannel') await handleAddChannelCommand(interaction);
        else if (commandName === 'ask') await handleAskCommand(interaction);
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_type') {
            await handleTicketSelection(interaction, client);
        } else if (interaction.customId === 'ask_npc_select') {
            await handleAskNpcSelection(interaction);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('ask_modal_')) {
            await handleAskModalSubmit(interaction, client);
        } else if (interaction.customId.startsWith('ask_reply_modal_')) {
            await handleAskReplyModalSubmit(interaction, client);
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ask_reply_')) {
            await handleAskReplyButton(interaction);
        }
    }
});

client.login(requiredConfig.token);
