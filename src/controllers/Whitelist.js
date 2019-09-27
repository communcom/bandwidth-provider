const core = require('gls-core-service');
const BasicController = core.controllers.Basic;
const Logger = core.utils.Logger;
const Whitelist = require('../model/Whitelist');
const env = require('../data/env');

class WhitelistController extends BasicController {
    constructor({ connector, storage }) {
        super({ connector });

        this._storage = storage;
    }

    async _askRegService({ user }) {
        try {
            const { isRegistered } = await this.callService('registration', 'isRegistered', {
                userId: user,
            });
            return isRegistered;
        } catch (error) {
            Logger.error('Error calling registration service --', error);

            return false;
        }
    }

    async handleOffline({ user, channelId }) {
        this._storage.handleOffline({ user, channelId });
    }

    async isAllowed({ channelId, user }) {
        // in memory -> allowed
        if (this._storage.isStored({ channelId, user })) {
            return true;
        }

        const dbUser = await Whitelist.findOne({ user });

        // explicitly banned -> not allowed
        if (dbUser && dbUser.banned) {
            return false;
        }

        // in db -> allowed and should be stored in memory
        if (dbUser && !dbUser.banned) {
            this._storage.addInMemoryDb({ user: dbUser.user, channelId });

            return true;
        }

        if (env.GLS_REGISTRATION_ENABLED) {
            const inRegService = await this._askRegService({ user });

            if (!inRegService) {
                return false;
            }
        }

        // in reg service -> add to mongo and to in-mem
        await Whitelist.create({ user, banned: false });
        this._storage.addInMemoryDb({ user, channelId });

        return true;
    }

    async banUser({ user }) {
        await Whitelist.findOneAndUpdate({ user }, { banned: true });

        this._storage.removeFromMemoryDb(user);
    }
}

module.exports = WhitelistController;
