// Metro (#422 N1): the app also reads plain shared rules from the web app (e.g. how a Makala is
// laid out), so one rule is written once for web and app.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../bishoo-frontend/src/public/utils')];
module.exports = config;
