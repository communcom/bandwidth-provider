const core = require('gls-core-service');

const env = process.env;

if (!env.GLS_PROVIDER_WIF) {
    throw new Error('Env variable GLS_PROVIDER_WIF is required!');
}

if (!env.GLS_PROVIDER_USERNAME) {
    throw new Error('Env variable GLS_PROVIDER_USERNAME is required!');
}

if (!env.GLS_CYBERWAY_HTTP_URL) {
    throw new Error('Env variable GLS_CYBERWAY_HTTP_URL is required!');
}

module.exports = {
    ...core.data.env,
    GLS_PROVIDER_WIF: env.GLS_PROVIDER_WIF,
    GLS_PROVIDER_USERNAME: env.GLS_PROVIDER_USERNAME,
    GLS_PROVIDER_PUBLIC_KEY: env.GLS_PROVIDER_PUBLIC_KEY,
    GLS_PRISM_CONNECT: env.GLS_PRISM_CONNECT,
    GLS_REGISTRATION_CONNECT: env.GLS_REGISTRATION_CONNECT,
    GLS_CHANNEL_TTL: env.GLS_CHANNEL_TTL || 1000,
    GLS_CYBERWAY_HTTP_URL: env.GLS_CYBERWAY_HTTP_URL,
    GLS_STORAGE_CLEANUP_TIMEOUT: env.GLS_STORAGE_CLEANUP_TIMEOUT || 1000 * 60 * 60,
    GLS_REGISTRATION_ENABLED: env.GLS_REGISTRATION_ENABLED === 'true',
};
