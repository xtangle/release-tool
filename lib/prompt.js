const rls = require('readline-sync');
const { exitOut } = require('./utils');

const promptContinue = (msg) => {
  if (!rls.keyInYNStrict(msg)) {
    exitOut('Aborted');
  }
};

const promptPreCommit = (config) => {
  if (config.prompt.pre_commit) {
    promptContinue('Paused before committing. Continue?');
  }
};

const promptPreRelease = (config) => {
  if (config.github.release && config.prompt.pre_release) {
    promptContinue('Paused before releasing. Continue?');
  }
};

module.exports = {
  promptPreCommit,
  promptPreRelease,
};
