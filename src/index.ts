import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { requiredConfig } from './config.js';
import { commands } from './commands.js';
import { handleTicketCommand, handleTicketSelection, handleCloseCommand } from './handlers/tickets.js';
import { handleLinkCharacterCommand, handleUnlinkCharacterCommand, handleMyCharacterCommand, handleViewCharacterCommand, handleAssignCharacterCommand, handleInventoryCommand } from './handlers/characters.js';

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
        else if (commandName === 'linkcharacter') await handleLinkCharacterCommand(interaction);
        else if (commandName === 'unlinkcharacter') await handleUnlinkCharacterCommand(interaction);
        else if (commandName === 'mycharacter') await handleMyCharacterCommand(interaction);
        else if (commandName === 'viewcharacter') await handleViewCharacterCommand(interaction);
        else if (commandName === 'inventory') await handleInventoryCommand(interaction);
        else if (commandName === 'assigncharacter') await handleAssignCharacterCommand(interaction);
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
        await handleTicketSelection(interaction, client);
    }
});

client.login(requiredConfig.token);
