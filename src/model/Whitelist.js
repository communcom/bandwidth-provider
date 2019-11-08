const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Whitelist',
    {
        user: {
            type: String,
            required: true,
        },
        isBanned: {
            type: Boolean,
            required: true,
        },
    },
    {
        index: [
            {
                fields: {
                    user: 1,
                },
            },
        ],
    }
);
