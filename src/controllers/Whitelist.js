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

    async isAllowed({ channelId, user, communityIds, userIds }) {
        const isAllowedInSystem = await this._isAllowedInSystem({ channelId, user });

        // not registered in reg service or explicitly banned
        if (!isAllowedInSystem) {
            return false;
        }

        const isAllowedInCommunities = await this._isAllowedInCommunities({
            userId: user,
            communityIds,
        });

        if (!isAllowedInCommunities.isAllowed) {
            return false;
        }

        const isAllowedInUser = await this._isAllowedInUser({
            userId: user,
            targetUserIds: userIds,
        });

        return isAllowedInUser.isAllowed;
    }

    async _isAllowedInSystem({ channelId, user }) {
        // in memory
        const isStoredCache = this._storage.isStored({ channelId, user });

        if (isStoredCache) {
            return true;
        }

        const dbUser = await Whitelist.findOne({ user });

        if (dbUser) {
            if (!dbUser.isBanned) {
                return true;
            }
        }

        if (env.GLS_REGISTRATION_ENABLED) {
            const inRegService = await this._askRegService({ user });

            if (!inRegService) {
                return false;
            }
        }

        // in reg service -> add to mongo and to in-mem
        await Whitelist.create({ user, isBanned: false });
        this._storage.addInMemoryDb({ user, channelId });

        return true;
    }

    async _isAllowedInCommunities({ userId, communityIds }) {
        const isInBlacklistPromises = [];

        // make sure that there is at least one request to prism
        // so global ban check works as well
        if (communityIds.length === 0) communityIds.push('');

        for (const communityId of communityIds) {
            isInBlacklistPromises.push(
                this.callService('prism', 'isInCommunityBlacklist', { userId, communityId })
            );
        }

        const isInBlacklist = await Promise.all(isInBlacklistPromises);

        const restrictedCommunities = isInBlacklist.filter(isBanned => {
            return isBanned === true;
        });

        return {
            isAllowed: restrictedCommunities.length === 0,
        };
    }

    async _isAllowedInUser({ userId, targetUserIds }) {
        const isInBlacklistPromises = [];
        for (const targetUserId of targetUserIds) {
            isInBlacklistPromises.push(
                this.callService('prism', 'isInUserBlacklist', { userId, targetUserId })
            );
        }

        const isInBlacklist = await Promise.all(isInBlacklistPromises);

        const restrictedUsers = isInBlacklist.filter(isBanned => {
            return isBanned === true;
        });

        return {
            isAllowed: restrictedUsers.length === 0,
            restrictedUsers,
        };
    }

    async banUser({ user }) {
        await Whitelist.findOneAndUpdate({ user }, { isBanned: true });

        this._storage.removeFromMemoryDb(user);
    }
}

module.exports = WhitelistController;
