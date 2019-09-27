const core = require('gls-core-service');
const Logger = core.utils.Logger;
const LogModel = require('../model/Log');

class Log {
    createEntry({ user, transaction, providedBandwidth }) {
        const entry = new LogModel();

        entry.user = user;
        entry.transaction = transaction;
        entry.actions = transaction.actions;
        entry.providedBandwidth = providedBandwidth;

        entry.save().catch(error => {
            Logger.error('Error during creating a log entry:', error);
        });
    }
}

module.exports = Log;
