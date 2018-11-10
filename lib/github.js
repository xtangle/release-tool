const fs = require('fs');
const mime = require('mime-types');
const path = require('path');
const request = require('request-promise');
const { echo, exec, ls } = require('shelljs');
const { checkError, errorOut } = require('./utils');

const GITHUB_API = 'https://api.github.com';

const requestGithub = async (config, method, uri, options = {}) => {
  const auth = config.github.token_ref ? `Token ${process.env[config.github.token_ref]}`
    : `Basic ${Buffer.from(`${config.github.user}:${config.github.pass}`).toString('base64')}`;
  const reqOptions = {
    method,
    uri,
    body: options.body,
    encoding: options.encoding,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: auth,
      'User-Agent': 'Request-Promise',
      ...options.headers,
    },
    json: options.json !== false,
    resolveWithFullResponse: true,
  };
  const response = await request(reqOptions)
    .catch(err => errorOut(`Request to '${reqOptions.uri}' failed. ${err}`));
  if (![200, 201].includes(response.statusCode)) {
    errorOut(`Request to '${reqOptions.uri}' returned an unexpected status code: ${response.statusCode}`);
  }
  return response.body;
};

const parseRemote = (remoteUrl) => {
  const parts = /(?:https:\/\/|git@)github.com[:/]([^/]*)\/(.*).git$/.exec(remoteUrl);
  const owner = parts && parts[1];
  const repo = parts && parts[2];
  const link = `https://github.com/${owner}/${repo}`;
  return { owner, repo, link };
};

const checkGitStatus = async (config) => {
  echo('Checking git status...');
  const permissionUrl = `${GITHUB_API}/repos/${config.github.owner}/${config.github.repo}`
    + `/collaborators/${config.github.user}/permission`;
  const resp = await requestGithub(config, 'GET', permissionUrl);
  if (!['admin', 'write'].includes(resp.permission)) {
    errorOut('You must have at least write privileges to the repository.');
  }
  const originPushUrl = exec('git remote get-url --push origin', { silent: true }).toString().trim();
  if (originPushUrl !== config.github.remote) {
    errorOut(`Git remote origin's push url (${originPushUrl})`
      + ` must be the same as the value set in github.remote (${config.github.remote})!`);
  }
  const originFetchUrl = exec('git remote get-url origin', { silent: true }).toString().trim();
  if (originFetchUrl !== config.github.remote) {
    errorOut(`Git remote origin's fetch url (${originFetchUrl})`
      + ` must be the same as the value set in github.remote (${config.github.remote})!`);
  }
  exec('git fetch origin', { silent: true });
  const branch = exec('git rev-parse --abbrev-ref HEAD', { silent: true }).toString().trim();
  if (branch !== config.github.branch) {
    errorOut(`Releases must be done on the '${config.github.branch}' branch!`);
  }
  checkError('Unable to fetch from origin!');
  if (config.github.strict) {
    exec(`git show-branch remotes/origin/${config.github.branch}`, { silent: true });
    checkError(`Remote branch '${config.github.branch}' doesn't exist!`);
    exec(`git diff origin/${config.github.branch} --quiet`, { silent: true });
    checkError('There are uncommitted and/or unpushed local changes!');
  }
  echo('Git status OK');
  return config;
};

const commit = (config) => {
  exec('git add .');
  checkError('Unable to stage CHANGELOG.md and package.json!');
  exec(`git commit -q -m "v${config.new_version}"`, { silent: true });
  checkError('Unable to commit changes!');
  echo('Committed changes');
};

const push = (config) => {
  const cred = config.github.token_ref ? process.env[config.github.token_ref] : config.github.pass;
  const remoteWithCred = config.github.remote
    .replace(/.*github\.com/, `https://${config.github.user}:${cred}@github.com`);
  exec(`git push -q ${remoteWithCred}`);
  checkError('Unable to push changes!');
  echo('Pushed changes');
};

const release = async (config) => {
  if (!config.github.release) {
    return config;
  }
  echo('Creating release...');
  const releaseTag = `v${config.new_version}`;
  const body = {
    tag_name: releaseTag,
    target_commitish: config.github.branch,
    name: `Release ${releaseTag}`,
    body: config.github.release_notes,
  };
  const releaseResponse = await requestGithub(config, 'POST',
    `${GITHUB_API}/repos/${config.github.owner}/${config.github.repo}/releases`, { body });
  echo(`Created release ${releaseTag}`);
  config.github.upload_url = releaseResponse.upload_url.replace(/{[^{]*}$/, '');
  return config;
};

const uploadAssets = async (config) => {
  if (!config.github.release || config.github.assets.length === 0) {
    return config;
  }
  const assetPaths = ls(config.github.assets).map(p => path.resolve(p));
  if (assetPaths.length === 0) {
    echo('No assets found, nothing to upload!');
    return config;
  }
  echo('Uploading assets...');
  await Promise.all(assetPaths.map((asset) => {
    const options = {
      body: fs.readFileSync(asset),
      encoding: null,
      json: false,
      headers: { 'Content-Type': mime.lookup(asset) || 'application/octet-stream' },
    };
    return requestGithub(config, 'POST', `${config.github.upload_url}?name=${path.basename(asset)}`, options);
  }));
  echo(`Uploaded ${assetPaths.length} assets`);
  return config;
};

module.exports = {
  checkGitStatus,
  parseRemote,
  commit,
  push,
  release,
  uploadAssets,
};
