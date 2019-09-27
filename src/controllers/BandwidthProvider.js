const { TextEncoder, TextDecoder } = require('text-encoding');
const core = require('gls-core-service');
const fetch = require('node-fetch');
const { JsonRpc, Api, Serialize } = require('cyberwayjs');
const JsSignatureProvider = require('cyberwayjs/dist/eosjs-jssig').default;
const BasicController = core.controllers.Basic;
const Logger = core.utils.Logger;
const Log = require('../utils/Log');
const ProposalModel = require('../model/Proposal');

const {
    GLS_PROVIDER_WIF,
    GLS_PROVIDER_PUBLIC_KEY,
    GLS_PROVIDER_USERNAME,
    GLS_CYBERWAY_HTTP_URL,
} = require('../data/env');

const PROPOSAL_ALLOWED_CONTRACTS = ['gls.vesting::delegate'];

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
            const rawTrx = this._decodeTransaction(transaction);
            const trx = await this._deserializeTransaction(rawTrx);
            const isNeedProviding = this._verifyActionsAndCheckIsNeedProviding(trx);

            let finalTrx = rawTrx;

            if (isNeedProviding) {
                await this._checkWhitelist({ user, channelId });
                finalTrx = await this._signTransaction(rawTrx, { chainId });
            }

            this._logEntry({ user, transaction: trx, isSigned: isNeedProviding });

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

    async _checkWhitelist({ channelId, user }) {
        let isAllowed = false;
        try {
            isAllowed = await this._whitelist.isAllowed({ channelId, user });
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

    async createProposal({
        routing: { channelId },
        auth: { user },
        params: { transaction, chainId },
    }) {
        const rawTrx = this._decodeTransaction(transaction);
        const trx = await this._deserializeTransaction(rawTrx);
        const isNeedProviding = this._verifyActionsAndCheckIsNeedProviding(trx);
        const { action, auth } = this._checkProposalRestrictionsAndGetAction(trx, user);
        let finalTrx = rawTrx;

        if (isNeedProviding) {
            await this._checkWhitelist({ user, channelId });
            finalTrx = await this._signTransaction(rawTrx, { chainId });
        }

        const proposal = await ProposalModel.create({
            initiatorId: user,
            waitingFor: {
                userId: auth.actor,
                permission: auth.permission,
            },
            expirationTime: new Date(trx.expiration + 'Z'),
            action,
            serializedTransaction: transaction.serializedTransaction,
            signatures: finalTrx.signatures,
        });

        return {
            proposalId: proposal._id,
        };
    }

    _checkProposalRestrictionsAndGetAction({ actions }, user) {
        const targetActions = actions.filter(action => !this._isBWProvideAction(action));

        if (targetActions.length !== 1) {
            throw {
                code: 1134,
                message:
                    targetActions.length === 0
                        ? 'No action for providing'
                        : 'Allowed only one action for providing',
            };
        }

        const [targetAction] = targetActions;

        const contractMethod = `${targetAction.account}::${targetAction.name}`;

        if (!PROPOSAL_ALLOWED_CONTRACTS.includes(contractMethod)) {
            throw {
                code: 1135,
                message: `Contract method '${contractMethod}' is not allowed for creating proposal`,
            };
        }

        const needAuthFor = targetAction.authorization.filter(auth => auth.actor !== user);

        if (needAuthFor.length !== 1) {
            throw {
                code: 1136,
                message:
                    needAuthFor.length === 0
                        ? 'List of awaiting signs is empty'
                        : 'Proposal have more than one awaiting signs',
            };
        }

        return {
            action: targetAction,
            auth: needAuthFor[0],
        };
    }

    async getProposals({ auth: { user }, params: { contract, method } }) {
        const items = await ProposalModel.find(
            {
                'waitingFor.userId': user,
                'action.account': contract,
                'action.name': method,
                expirationTime: {
                    $gt: new Date(),
                },
            },
            {
                _id: true,
                initiatorId: true,
                action: true,
                serializedTransaction: true,
                expirationTime: true,
            },
            {
                lean: true,
            }
        );

        let usernames = {};

        try {
            const results = await this.callService('prism', 'getUsernames', {
                userIds: items.map(({ initiatorId }) => initiatorId),
            });

            usernames = results.usernames;
        } catch (err) {
            Logger.warn('getUsernames failed:', err.message);
        }

        for (const item of items) {
            item.proposalId = item._id;
            item._id = undefined;
            item.initiatorUsername = usernames[item.initiatorId] || null;
        }

        return {
            items,
        };
    }

    async signAndExecuteProposal({ auth: { user }, params: { proposalId, signature } }) {
        const proposal = await ProposalModel.findOne(
            {
                _id: proposalId,
                'waitingFor.userId': user,
            },
            {
                serializedTransaction: true,
                signatures: true,
            },
            {
                lean: true,
            }
        );

        if (!proposal) {
            throw {
                code: 404,
                message: 'Proposal not found',
            };
        }

        const signatures = proposal.signatures;

        if (!signatures.includes(signature)) {
            signatures.push(signature);
        }

        const serializedTransaction = this._decodeSerializedTransaction(
            proposal.serializedTransaction
        );

        try {
            const results = await api.pushSignedTransaction({
                signatures,
                serializedTransaction,
            });

            try {
                await ProposalModel.deleteOne({
                    _id: proposalId,
                });
            } catch (err) {
                Logger.error('Proposal deleting failed:', err);
            }

            return results;
        } catch (err) {
            this._processTransactionPushError(err);
        }
    }
}

module.exports = BandwidthProvider;
