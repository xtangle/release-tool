const { echo, sed } = require('shelljs');
const { checkError } = require('./utils');

function updatePackageJson() {
  sed('-i', '"version":\\s*"[^"]*"', `"version": "${this.release.newVersion}"`, 'package.json');
  checkError('Unable to update package.json!');
  echo('Updated package.json');
}

module.exports = {
  updatePackageJson,
};
