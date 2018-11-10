const { echo, exec } = require('shelljs');
const { checkError, getAllEntries } = require('./utils');

const prepareCommand = (config, command) => {
  const entries = getAllEntries(config);
  return entries.reduce((cmd, e) => cmd.replace(`\${${e[0]}}`, e[1]), command);
};

const executeHook = (config, hookKey) => {
  const hookName = hookKey.replace('_', '-');
  echo(`Executing ${hookName} hook...`);
  config.hooks[hookKey].command
    .map(prepareCommand.bind(null, config))
    .forEach((cmd) => {
      exec(cmd, { silent: config.hooks[hookKey].silent });
      checkError(`Non-zero status returned in ${hookName} hook command!`);
    });
  echo(`Executed ${hookName} hook`);
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
