export type ActiveTicket = {
    textChannelId: string;
    voiceChannelId: string;
    ticketType: string;
};

export type CharacterLink = {
    id: number;
    discordUserId: string;
    actorUuid: string;
    actorName: string;
    createdAt: string;
    updatedAt: string;
};
