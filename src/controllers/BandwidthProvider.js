const { TextEncoder, TextDecoder } = require('text-encoding');
const core = require('gls-core-service');
const fetch = require('node-fetch');
const { JsonRpc, Api, Serialize } = require('cyberwayjs');
const JsSignatureProvider = require('cyberwayjs/dist/eosjs-jssig').default;
const BasicController = core.controllers.Basic;
const Logger = core.utils.Logger;
const ALLOWED_CONTRACTS = require('../data/allowedContracts');
const Log = require('../utils/Log');

const {
    GLS_PROVIDER_WIF,
    GLS_PROVIDER_PUBLIC_KEY,
    GLS_PROVIDER_USERNAME,
    GLS_CYBERWAY_HTTP_URL,
} = require('../data/env');

const rpc = new JsonRpc(GLS_CYBERWAY_HTTP_URL, { fetch });

const requiredKeys = [GLS_PROVIDER_PUBLIC_KEY];
const signatureProviderBP = new JsSignatureProvider([GLS_PROVIDER_WIF]);

const api = new Api({
    rpc,
    signatureProviderBP,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
});

class BandwidthProvider extends BasicController {
    constructor({ connector, whitelist }) {
        super({ connector });

        this._whitelist = whitelist;
        this._logger = new Log();
    }

    async provideBandwidth({
        routing: { channelId },
        auth: { user },
        params: { transaction, chainId },
    }) {
        try {
            const { finalTrx, trx } = await this._prepareFinalTrx({
                transaction,
                user,
                channelId,
                chainId,
            });

            await this._logEntry({ user, transaction: trx });

            return await this._sendTransaction(finalTrx);
        } catch (err) {
            this._processTransactionPushError(err);
        }
    }

    _processTransactionPushError(err) {
        if (err.json && err.json.error) {
            throw {
                code: 1003,
                message: 'Unexpected blockchain error',
                data: err.json,
            };
        }

        if (err && err.code) {
            throw err;
        }

        throw {
            code: 500,
            message: `Failed to transact: ${err}`,
        };
    }

    _decodeTransaction(transaction) {
        return {
            ...transaction,
            serializedTransaction: this._decodeSerializedTransaction(
                transaction.serializedTransaction
            ),
        };
    }

    _decodeSerializedTransaction(serializedTransaction) {
        try {
            return Serialize.hexToUint8Array(serializedTransaction);
        } catch (error) {
            Logger.error('Conversion hexToUint8Array failed:', error);
            throw error;
        }
    }

    async _deserializeTransaction({ serializedTransaction }) {
        try {
            return await api.deserializeTransactionWithActions(serializedTransaction);
        } catch (error) {
            Logger.error('Transaction deserialization failed:', error);
            throw error;
        }
    }

    _isBWProvideAction({ account, name, authorization, data }) {
        return (
            account === 'cyber' &&
            name === 'providebw' &&
            authorization.length === 1 &&
            authorization[0].actor === GLS_PROVIDER_USERNAME &&
            authorization[0].permission === 'providebw' &&
            data.provider === GLS_PROVIDER_USERNAME
        );
    }

    _verifyActionsAndCheckIsNeedProviding({ actions }) {
        const provideBwActions = actions.filter(this._isBWProvideAction);

        if (provideBwActions.length === 0) {
            return false;
        }

        for (const action of actions) {
            if (!ALLOWED_CONTRACTS.includes(action.account)) {
                throw {
                    code: 1104,
                    message: `Transaction contains action of a contract, which is not allowed: ${action.account}.
                         Allowed contracts: ${ALLOWED_CONTRACTS}`,
                };
            }

            if (provideBwActions.includes(action)) {
                continue;
            }

            for (const { actor } of action.authorization) {
                // Проверяем все экшены, чтобы исключить возможность подписи нашим ключом экшенов кроме providebw
                // Если находим такой экшен, то выдаем ошибку.
                if (actor === GLS_PROVIDER_USERNAME) {
                    throw {
                        code: 1104,
                        message:
                            'Transaction contains action with provider as actor except providebw action',
                    };
                }
            }
        }

        return true;
    }

    async _checkWhitelist({ channelId, user, communityIds, userIds }) {
        let isAllowed = false;
        try {
            isAllowed = await this._whitelist.isAllowed({ channelId, user, communityIds, userIds });
        } catch (error) {
            Logger.error('Whitelist check failed:', JSON.stringify(error, null, 4));
            throw error;
        }

        if (!isAllowed) {
            throw {
                code: 1103,
                message: 'This user is not allowed to require bandwidth',
            };
        }
    }

    async _signTransaction({ signatures, serializedTransaction }, { chainId }) {
        try {
            const transactionBW = await signatureProviderBP.sign({
                chainId,
                requiredKeys,
                serializedTransaction,
            });

            return {
                signatures: [...signatures, ...transactionBW.signatures],
                serializedTransaction,
            };
        } catch (error) {
            Logger.error('Transaction sign failed:', JSON.stringify(error, null, 4));
            throw error;
        }
    }

    _logEntry({ user, transaction, isSigned }) {
        try {
            this._logger.createEntry({
                transaction,
                user,
                providedBandwidth: isSigned,
            });
        } catch (error) {
            Logger.error('Logger entry creation failed:', error);
        }
    }

    async _sendTransaction({ signatures, serializedTransaction }) {
        try {
            return await api.pushSignedTransaction({
                signatures,
                serializedTransaction,
            });
        } catch (error) {
            Logger.error('Transaction send failed:', error);
            throw error;
        }
    }

    _extractCommunityIds(trx) {
        const communityIds = [];

        for (const action of trx.actions) {
            const { commun_code: communityId } = action.data;

            if (communityId) {
                communityIds.push(communityId);
            }
        }

        return communityIds;
    }

    _extractUserIds(trx) {
        const userIds = [];

        for (const { data } of trx.actions) {
            if (data.pinning) {
                userIds.push(data.pinning);
            }

            if (data.message_id && data.message_id.author) {
                userIds.push(data.message_id.author);
            }

            if (data.parent_id && data.parent_id.author) {
                userIds.push(data.parent_id.author);
            }
        }

        return userIds;
    }

    async _prepareFinalTrx({ transaction, user, channelId, chainId }) {
        const rawTrx = this._decodeTransaction(transaction);
        const trx = await this._deserializeTransaction(rawTrx);
        const isNeedProviding = this._verifyActionsAndCheckIsNeedProviding(trx);

        if (!isNeedProviding) {
            throw {
                code: 1103,
                message: 'Transaction does not have providebw action',
            };
        }
        const communityIds = this._extractCommunityIds(trx);
        const userIds = this._extractUserIds(trx);

        await this._checkWhitelist({ user, channelId, communityIds, userIds });
        const finalTrx = await this._signTransaction(rawTrx, { chainId });

        return { finalTrx, trx };
    }
}

module.exports = BandwidthProvider;
