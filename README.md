# Discord Ticket Bot

A Discord bot that manages a ticket system for character concepts, creation, and submissions.

## Features

- 🎫 **Ticket Creation**: Users can create tickets using `/ticket` command
- 📋 **Ticket Types**: Three types available:
  - Character Concept
  - Character Creation
  - Character Submission
- 🔒 **Private Channels**: Creates private text and voice channels for each ticket
- 👥 **Role-based Access**: Only ticket creator and support role members can access ticket channels
- ✅ **Ticket Closing**: Close tickets with `/close` command

## Setup

### Prerequisites

- Node.js (v16.9.0 or higher)
- A Discord Bot Token
- Discord Server with Administrator permissions

### Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Configure the bot by editing `config.json`:
```json
{
  "token": "YOUR_BOT_TOKEN_HERE",
  "clientId": "YOUR_CLIENT_ID_HERE",
  "guildId": "YOUR_GUILD_ID_HERE",
  "ticketChannelId": "YOUR_TICKET_CHANNEL_ID_HERE",
  "supportRoleId": "YOUR_SUPPORT_ROLE_ID_HERE",
  "ticketCategoryId": "YOUR_CATEGORY_ID_HERE"
}
```

### Configuration Guide

1. **Bot Token & Client ID**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application or select existing one
   - Go to "Bot" section and copy the token
   - Go to "OAuth2" section and copy the Application ID (Client ID)

2. **Guild ID**:
   - Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
   - Right-click your server and select "Copy ID"

3. **Ticket Channel ID**:
   - Right-click the channel where users will use `/ticket` command
   - Select "Copy ID"

4. **Support Role ID**:
   - Right-click the role that should handle tickets
   - Select "Copy ID"

5. **Ticket Category ID**:
   - Create a category for tickets (or use existing one)
   - Right-click the category and select "Copy ID"

### Bot Permissions

When inviting the bot, it needs the following permissions:
- Manage Channels
- Manage Roles
- Send Messages
- Manage Messages
- Read Message History
- Mention Everyone Roles
- Use Slash Commands

Invite URL format:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268823632&scope=bot%20applications.commands
```

### Running the Bot

Start the bot:
```bash
npm start
```

## Usage

### Creating a Ticket

1. Go to the designated ticket channel
2. Type `/ticket`
3. Select the ticket type from the dropdown menu
4. A private text and voice channel will be created
5. Support role members will be notified

### Closing a Ticket

1. In the ticket's text channel, type `/close`
2. The ticket creator or support role members can close tickets
3. Both text and voice channels will be deleted after 5 seconds

## Features Explained

### Ticket System

- Each user can only have one active ticket at a time
- Tickets are automatically numbered with a unique ID
- Private channels are created with appropriate permissions
- Support role members are mentioned when a ticket is created

### Channel Permissions

Ticket channels are only visible to:
- The user who created the ticket
- Users with the designated support role

Everyone else in the server cannot see or access these channels.

## Troubleshooting

### Commands not showing up
- Make sure the bot has been invited with `applications.commands` scope
- Check if the bot has proper permissions in the server
- Verify the guild ID is correct in config.json

### Channels not being created
- Ensure the bot has "Manage Channels" permission
- Check if the category ID is valid
- Verify the bot role is high enough in the role hierarchy

### Support role not being mentioned
- Make sure the support role is mentionable (or bot has "Mention Everyone" permission)
- Verify the role ID is correct in config.json

## Support

If you encounter any issues, please check:
1. Bot token is valid and correct
2. All IDs in config.json are correct
3. Bot has necessary permissions
4. Bot is online and connected to Discord

## License

MIT License
