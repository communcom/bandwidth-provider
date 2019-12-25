const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Connector = require('./services/Connector');
const MongoDB = core.services.MongoDB;

class Main extends BasicMain {
    constructor() {
        super(env);
        this.addNested(new MongoDB(), new Connector());
    }
}

module.exports = Main;
