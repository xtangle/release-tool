const { echo, sed } = require('shelljs');
const { checkError } = require('./utils');

const updatePackageJson = (config) => {
  if (!config.npm.update) {
    return;
  }
  sed('-i', '"version":\\s*"[^"]*"', `"version": "${config.new_version}"`, config.npm.package);
  checkError('Unable to update package.json!');
  echo('Updated package.json');
};

module.exports = {
  updatePackageJson,
};
