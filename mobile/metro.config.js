const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { resolvedorConExtensionJs } = require('./metro.resolverJs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Imports relativos con `.js` que en realidad son `.ts` (los de shared/): ver metro.resolverJs.js.
config.resolver.resolveRequest = resolvedorConExtensionJs(config.resolver.resolveRequest);

module.exports = config;
