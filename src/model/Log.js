const core = require('gls-core-service');
const MongoDB = core.services.MongoDB;

module.exports = MongoDB.makeModel(
    'Log',
    {
        user: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            default: () => new Date(),
        },
        actions: {
            type: [String],
            required: true,
            set: actions => actions.map(action => action.name || 'unknown'),
        },
        transaction: {
            type: Object,
            required: true,
        },
        providedBandwidth: {
            required: true,
            type: Boolean,
        },
    },
    {
        index: [
            {
                fields: {
                    user: 1,
                    timestamp: 1,
                    actions: 1,
                },
            },
        ],
    }
);
