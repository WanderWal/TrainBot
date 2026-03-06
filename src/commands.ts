export const commands = [
    { name: 'ticket', description: 'Create a new ticket', options: [] },
    { name: 'close', description: 'Close the current ticket', options: [] },
    { name: 'mycharacter', description: 'View your linked FoundryVTT character', options: [] },
    {
        name: 'viewcharacter',
        description: "View another user's linked character",
        options: [
            { name: 'user', type: 6, description: 'The user whose character you want to view', required: true }
        ]
    },
    { name: 'inventory', description: 'View your character\'s inventory from FoundryVTT', options: [] },
    {
        name: 'assigncharacter',
        description: '[Support] Assign a FoundryVTT character to a Discord user',
        options: [
            { name: 'user', type: 6, description: 'The user to assign the character to', required: true },
            { name: 'character_name', type: 3, description: 'The FoundryVTT character sheet name', required: true }
        ]
    },
    {
        name: 'synccharacters',
        description: '[Support] Sync all characters raw data from FoundryVTT to the database',
        options: []
    }
];
