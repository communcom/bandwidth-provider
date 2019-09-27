const core = require('gls-core-service');
const BasicConnector = core.services.Connector;
const BandwidthProvider = require('../controllers/BandwidthProvider');
const StorageService = require('./StorageService');
const Whitelist = require('../controllers/Whitelist');
const env = require('../data/env');

class Connector extends BasicConnector {
    constructor() {
        super();

        this._storageService = new StorageService();
        this.addNested(this._storageService);

        this._whitelistController = new Whitelist({
            connector: this,
            storage: this._storageService,
        });

        this._bandwidthProvider = new BandwidthProvider({
            connector: this,
            whitelist: this._whitelistController,
        });
    }

    async start() {
        const provider = this._bandwidthProvider;
        const whitelist = this._whitelistController;

        await super.start({
            serverRoutes: {
                'bandwidth.provide': {
                    handler: provider.provideBandwidth,
                    scope: provider,
                },
                'bandwidth.createProposal': {
                    handler: provider.createProposal,
                    scope: provider,
                },
                'bandwidth.getProposals': {
                    handler: provider.getProposals,
                    scope: provider,
                },
                'bandwidth.signAndExecuteProposal': {
                    handler: provider.signAndExecuteProposal,
                    scope: provider,
                },
                'bandwidth.banUser': {
                    handler: whitelist.banUser,
                    scope: whitelist,
                },
                'bandwidth.notifyOffline': {
                    handler: whitelist.handleOffline,
                    scope: whitelist,
                },
            },
            requiredClients: {
                prism: env.GLS_PRISM_CONNECT,
                registration: env.GLS_REGISTRATION_CONNECT,
            },
        });

        await this.startNested();
    }
}

module.exports = Connector;
