/**
 * Map provider registry — callers never import a vendor file directly.
 */

const google = require('./google');
const apple = require('./apple');
const bing = require('./bing');
const osm = require('./osm');
const states = require('./states');
const packages = require('./packages');

const PROVIDERS = {
    google,
    apple,
    bing,
    osm
};

const TESLA_NOTE = 'A Tesla não tem registo de negócios. A navegação usa sobretudo Google (mapa/POI) e OpenStreetMap/TomTom (rotas). Estar correcto no Google (e mais tarde no OSM) é o que faz o negócio aparecer bem num Tesla.';

function listProviders() {
    return Object.values(PROVIDERS).map((p) => ({
        id: p.id,
        nome: p.nome,
        capability: p.capability,
        capabilityLabel: p.capabilityLabel || p.capability,
        enabled: p.enabled !== false
    }));
}

function getProvider(id) {
    const key = String(id || '').trim();
    return PROVIDERS[key] || null;
}

module.exports = {
    PROVIDERS,
    TESLA_NOTE,
    listProviders,
    getProvider,
    states,
    packages,
    google,
    apple,
    bing,
    osm
};
