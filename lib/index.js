const { echo, exit } = require('shelljs');
const { dumpConfigs, initConfigs } = require('./configs');
const { updateChangelog } = require('./changelog');
const { checkGitStatus, commit, push, release, uploadAssets } = require('./github');
const { preCommitHook, preReleaseHook } = require('./hooks');
const { updatePackageJson } = require('./npm');
const { promptPreCommit, promptPreRelease } = require('./prompt');
const { chain } = require('./utils');

const printTitle = () => {
  echo(`
██████╗ ███████╗██╗     ███████╗ █████╗ ███████╗███████╗
██╔══██╗██╔════╝██║     ██╔════╝██╔══██╗██╔════╝██╔════╝
██████╔╝█████╗  ██║     █████╗  ███████║███████╗█████╗  
██╔══██╗██╔══╝  ██║     ██╔══╝  ██╔══██║╚════██║██╔══╝  
██║  ██║███████╗███████╗███████╗██║  ██║███████║███████╗
╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
`);
};

module.exports = async () => {
  await chain(
    printTitle,
    initConfigs,
    checkGitStatus,

    updateChangelog,
    updatePackageJson,
    dumpConfigs,

    preCommitHook,
    promptPreCommit,
    commit,
    push,

    preReleaseHook,
    promptPreRelease,
    release,
    uploadAssets,
  )();

  echo('Done!');
  exit();
};
