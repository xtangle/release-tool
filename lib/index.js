const path = require('path');
const semver = require('semver');
const { echo, exit, ls } = require('shelljs');
const { updateChangelog } = require('./changes');
const { checkGitStatus, commit, createRelease, push, uploadAssets } = require('./github');
const { updatePackageJson } = require('./npm');
const { getCredentials, getReleaseType, printTitle } = require('./prompt');
const { checkError, errorOut, resolveFromLocal } = require('./utils');

const context = (() => {
  const options = require(resolveFromLocal('.release-info.json'));
  const packageJson = require(resolveFromLocal('package.json'));

  const oldVersion = semver.valid(packageJson.version);
  if (!oldVersion) {
    errorOut(`Invalid version in package.json! (${packageJson.version})`);
  }
  const githubUrl = options.remote.replace(/.git$/, '');
  const githubUrlParts = /github.com\/([^/]*)\/(.*)$/.exec(githubUrl);
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
      assets: null,
      uploadUrl: null,
      api: 'https://api.github.com',
    },
  };
})();

async function preRelease() {
  let paths = this.options.assets;
  if (this.release.preReleasePath) {
    const preReleaseResult = await require(this.release.preReleasePath).call(context);
    if (!paths) {
      paths = preReleaseResult;
    }
  }
  if (typeof paths === 'string') {
    paths = [paths];
  }
  if (Array.isArray(paths) && paths.length > 0) {
    this.github.assets = ls(paths).map(p => path.resolve(p));
    checkError('One or more assets could not be found!');
  }
  echo('Finished pre-release stage');
}

async function postRelease() {
  if (this.release.postReleasePath) {
    await require(this.release.postReleasePath).call(context);
    echo('Finished post-release stage');
  }
}

module.exports = async function () {
  printTitle.call(context);
  getReleaseType.call(context);
  getCredentials.call(context);

  await checkGitStatus.call(context);
  updateChangelog.call(context);
  updatePackageJson.call(context);

  await preRelease.call(context);
  commit.call(context);
  push.call(context);
  await createRelease.call(context);
  await uploadAssets.call(context);
  await postRelease.call(context);

  exit();
};
