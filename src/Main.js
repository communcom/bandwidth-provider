const core = require('gls-core-service');
const BasicMain = core.services.BasicMain;
const env = require('./data/env');
const Connector = require('./services/Connector');
const Cleaner = require('./services/Cleaner');
const MongoDB = core.services.MongoDB;

class Main extends BasicMain {
    constructor() {
        super(env);
        this.addNested(new MongoDB(), new Connector(), new Cleaner());
    }
}

module.exports = Main;
