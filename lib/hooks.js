const { echo, exec } = require('shelljs');
const { checkError, getAllEntries } = require('./utils');

const prepareCommand = (config, command) => {
  const entries = getAllEntries(config);
  return entries.reduce((cmd, e) => cmd.replace(`\${${e[0]}}`, e[1]), command);
};

const executeHook = (config, hookKey) => {
  const hookName = hookKey.replace('_', '-');
  const cmd = prepareCommand(config, config.hooks[hookKey].command);
  echo(`Executing ${hookName} hook`);
  exec(cmd, { silent: config.hooks[hookKey].silent });
  checkError(`Non-zero status returned by ${hookName} hook command!`);
};

const preCommitHook = (config) => {
  if (config.hooks.pre_commit.command) {
    executeHook(config, 'pre_commit');
  }
};

const preReleaseHook = (config) => {
  if (config.github.release && config.hooks.pre_release.command) {
    executeHook(config, 'pre_release');
  }
};

module.exports = {
  preCommitHook,
  preReleaseHook,
};
