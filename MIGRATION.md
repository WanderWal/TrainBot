# Migration Guide: Local Storage to REST API

## Overview

The Discord bot has been updated to store character links via the FoundryVTT REST API Relay instead of local JSON files. This provides:
- ✅ Centralized storage accessible from anywhere
- ✅ Better data persistence and backup
- ✅ Multi-bot support (multiple Discord bots can share the same character links)
- ✅ Database-backed reliability

## What Changed

### Before
- Character links were stored in `character-links.json` file
- Data was local to the bot instance
- No API authentication required for character links

### After
- Character links are stored via the REST API relay
- Data is centralized and accessible from multiple bots
- Requires `FOUNDRY_API_KEY` for authentication
- Uses the `/api/discord/links` endpoints

## Migration Steps

### 1. Update Your Environment Variables

Ensure your `.env` file includes:

```env
FOUNDRY_API_KEY=your-api-key-here
FOUNDRY_RELAY_URL=https://foundryvtt-rest-api-relay.fly.dev
FOUNDRY_RELAY_CLIENT_ID=your-client-id
```

### 2. Migrate Existing Character Links (Optional)

If you have an existing `character-links.json` file with character links you want to preserve, you can migrate them using this Node.js script:

```javascript
// migrate-links.js
const fs = require('fs');
const path = require('path');

async function migrateLinks() {
  const linksFile = path.join(process.cwd(), 'character-links.json');
  
  if (!fs.existsSync(linksFile)) {
    console.log('No character-links.json file found. Nothing to migrate.');
    return;
  }

  const data = fs.readFileSync(linksFile, 'utf8');
  const links = new Map(JSON.parse(data));

  const FOUNDRY_API_KEY = process.env.FOUNDRY_API_KEY;
  const RELAY_URL = process.env.FOUNDRY_RELAY_URL || 'https://foundryvtt-rest-api-relay.fly.dev';

  if (!FOUNDRY_API_KEY) {
    console.error('FOUNDRY_API_KEY not set in environment variables');
    return;
  }

  console.log(`Migrating ${links.size} character links...`);

  for (const [discordUserId, linkData] of links.entries()) {
    try {
      const response = await fetch(`${RELAY_URL}/api/discord/links`, {
        method: 'POST',
        headers: {
          'x-api-key': FOUNDRY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          discordUserId,
          actorUuid: linkData.actorUuid,
          actorName: linkData.characterName
        })
      });

      if (!response.ok) {
        console.error(`Failed to migrate link for user ${discordUserId}: ${response.statusText}`);
      } else {
        console.log(`✓ Migrated link for user ${discordUserId} (${linkData.characterName})`);
      }
    } catch (error) {
      console.error(`Error migrating link for user ${discordUserId}:`, error);
    }
  }

  console.log('Migration complete!');
  console.log('You can safely delete or backup the character-links.json file.');
}

migrateLinks().catch(console.error);
```

Run the migration:

```bash
# Make sure you have node-fetch installed (or use Node 18+)
npm install node-fetch

# Run the migration
node migrate-links.js
```

### 3. Backup Your Old Data

Before deleting `character-links.json`, make a backup:

```bash
cp character-links.json character-links.json.backup
```

### 4. Update the Bot

```bash
# Pull the latest changes
git pull

# Install dependencies
npm install

# Build the bot
npm run build

# Start the bot
npm start
```

### 5. Test the Integration

Test the bot commands to ensure everything works:

```
/mycharacter
```

## Troubleshooting

### "API key is required" Error

Make sure `FOUNDRY_API_KEY` is set in your `.env` file and that you have a valid API key from the relay service.

### "Failed to create/update character link" Error

1. Check that your API key is valid
2. Verify the relay URL is correct
3. Ensure your API key has permission to create character links

### Lost Character Links

If you had character links before the update and they're not showing up:

1. Check if `character-links.json` still exists
2. Run the migration script above
3. Or, users can simply re-link their characters using `/linkcharacter`

## Rolling Back (If Needed)

If you need to roll back to the old version:

```bash
git checkout <previous-commit-hash>
npm install
npm run build
npm start
```

Your old `character-links.json` file will still work with the previous version.

## Support

If you encounter issues during migration:
1. Check the bot logs for detailed error messages
2. Verify your environment variables are correct
3. Test your API key using a direct API call
4. Reach out for support with your error logs
