const semver = require('semver');
const { echo, exit } = require('shelljs');
const { updateChangelog } = require('./changes');
const { checkGitStatus, commit, createRelease, push, uploadAssets } = require('./github');
const { updatePackageJson } = require('./npm');
const { getCredentials, getReleaseType, printTitle } = require('./prompt');
const { errorOut, resolveFromLocal } = require('./utils');

function initializeContext() {
  const options = require(resolveFromLocal('.release-info.json'));
  const packageJson = require(resolveFromLocal('package.json'));

  const oldVersion = semver.valid(packageJson.version);
  if (!oldVersion) {
    errorOut(`Invalid version in package.json! (${packageJson.version})`);
  }
  const githubUrl = options.remote.replace(/.git$/, '');
  const githubUrlParts = /github.com\/([^/]*)\/(.*)$/.exec(githubUrl);
  let assets = options.assets || [];
  if (typeof assets === 'string') {
    assets = [assets];
  }
  if (!Array.isArray(assets)) {
    errorOut('Invalid type for assets! Must be string or array.');
  }

  return {
    options,
    changelog: null,
    release: {
      name: packageJson.name,
      oldVersion,
      oldTag: `v${oldVersion}`,
      newVersion: null,
      newTag: null,
      changelogPath: resolveFromLocal(options.changelog || 'CHANGELOG.md'),
      preReleasePath: options.pre_release ? resolveFromLocal(options.pre_release) : '',
      postReleasePath: options.post_release ? resolveFromLocal(options.post_release) : '',
    },
    github: {
      url: githubUrl,
      user: options.user,
      pass: null,
      cred: null,
      owner: githubUrlParts[1],
      repo: githubUrlParts[2],
      branch: options.branch || 'master',
      remote: options.remote,
      remoteWithCred: null,
      assets,
      uploadUrl: null,
      api: 'https://api.github.com',
    },
  };
}

async function preRelease() {
  if (this.release.preReleasePath) {
    await require(this.release.preReleasePath).call(this);
    echo('Finished pre-release stage');
  }
}

async function postRelease() {
  if (this.release.postReleasePath) {
    await require(this.release.postReleasePath).call(this);
    echo('Finished post-release stage');
  }
}

module.exports = async function () {
  const context = initializeContext();
  printTitle.call(context);
  getReleaseType.call(context);
  getCredentials.call(context);

  await checkGitStatus.call(context);
  updateChangelog.call(context);
  updatePackageJson.call(context);
  Object.freeze(context);

  await preRelease.call(context);
  commit.call(context);
  push.call(context);
  await createRelease.call(context);
  await uploadAssets.call(context);
  await postRelease.call(context);

  exit();
};
