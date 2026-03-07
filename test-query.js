const q = {
    _and: [
        {
            _or: [
                { related_actions: { actions_id: { name: { _eq: 'Ask' } } } },
                { related_actions: { actions_id: { name: { _eq: 'Talk' } } } }
            ]
        },
        { channel: { discord_id: { _eq: '123' } } }
    ]
};
console.log(encodeURIComponent(JSON.stringify(q)));
