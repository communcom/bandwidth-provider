const core = require('gls-core-service');
const BasicService = core.services.Basic;
const Logger = core.utils.Logger;

const ProposalModel = require('../model/Proposal');

const CLEAR_EVERY = 120000;

class Cleaner extends BasicService {
    async start() {
        this.startLoop(CLEAR_EVERY, CLEAR_EVERY);
    }

    async iteration() {
        try {
            await this._clear();
        } catch (err) {
            Logger.warn('Clearing failed:', err);
        }
    }

    async _clear() {
        await ProposalModel.deleteMany({
            expirationTime: {
                $lte: new Date(),
            },
        });
    }
}

module.exports = Cleaner;
