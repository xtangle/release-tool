const fs = require('fs');
const mime = require('mime-types');
const path = require('path');
const request = require('request-promise');
const { echo, exec } = require('shelljs');
const { checkError, errorOut } = require('./utils');

async function requestGithub(method, uri, options = {}) {
  const reqOptions = {
    method,
    uri,
    body: options.body,
    encoding: options.encoding,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Basic ${Buffer.from(this.github.cred).toString('base64')}`,
      'User-Agent': 'Request-Promise',
      ...options.headers,
    },
    json: options.json !== false,
    resolveWithFullResponse: true,
  };
  const response = await new Promise((resolve) => {
    request(reqOptions)
      .then(resolve)
      .catch(err => errorOut(`Request to '${reqOptions.uri}' failed. ${err}`));
  });
  if (![200, 201].includes(response.statusCode)) {
    errorOut(`Request to '${reqOptions.uri}' returned an unexpected status code: ${response.statusCode}`);
  }
  return response.body;
}

async function checkGitStatus() {
  echo('Checking git status...');
  const resp = await requestGithub.call(this, 'GET', `${this.github.api}/repos/${this.github.owner}`
    + `/${this.github.repo}/collaborators/${this.github.user}/permission`);
  if (resp.permission !== 'admin' && resp.permission !== 'write') {
    errorOut('You must have at least write privileges to the repository.');
  }
  const originUrl = exec('git remote get-url origin', { silent: true }).toString().trim();
  if (originUrl !== this.github.remote) {
    errorOut(`Git remote origin's push and fetch urls (${originUrl}) must be set to ${this.github.remote}!`);
  }
  exec('git fetch origin', { silent: true });
  checkError('Unable to fetch from origin!');
  const branch = exec('git name-rev --name-only HEAD', { silent: true }).toString().trim();
  if (branch !== this.github.branch) {
    errorOut(`Releases must be done on the '${this.github.branch}' branch!`);
  }
  exec(`git diff origin/${this.github.branch} --quiet`);
  checkError('There are uncommitted and/or unpushed local changes!');
  echo('Git status OK');
}

async function uploadAssets() {
  if (this.github.assets && this.github.assets.length > 0) {
    echo('Uploading assets...');
    await Promise.all(this.github.assets.map(async (asset) => {
      const options = {
        body: fs.readFileSync(asset),
        encoding: null,
        json: false,
        headers: { 'Content-Type': mime.lookup(asset) || 'application/octet-stream' },
      };
      await requestGithub.call(this, 'POST', `${this.github.uploadUrl}?name=${path.basename(asset)}`, options);
    }));
    echo(`Finished uploading assets: ${this.github.assets.join(', ')}`);
  }
}

async function createRelease() {
  echo('Creating release on GitHub...');
  const body = {
    tag_name: this.release.newTag,
    target_commitish: this.github.branch,
    name: `Release ${this.release.newTag}`,
    body: `${this.changelog.changedText}\n${this.changelog.isFirstRelease ? '' : `\n${this.changelog.changedLink}`}`,
  };
  const releaseResponse = await requestGithub.call(this, 'POST',
    `${this.github.api}/repos/${this.github.owner}/${this.github.repo}/releases`, { body });
  echo(`Created release ${this.release.newTag}`);
  this.github.uploadUrl = releaseResponse.upload_url.replace(/{[^{]*}$/, '');
}

function commit() {
  exec('git add CHANGELOG.md package.json');
  checkError('Unable to stage CHANGELOG.md and package.json!');
  echo('Committing changes...');
  exec(`git commit -q -m ${this.release.newTag}`, { silent: true });
  checkError('Unable commit changes!');
  echo('Changes committed');
}

function push() {
  echo('Pushing changes...');
  exec(`git push -q ${this.github.remoteWithCred}`);
  checkError('Unable to push changes!');
  echo('Changes pushed');
}

module.exports = {
  checkGitStatus,
  uploadAssets,
  createRelease,
  commit,
  push,
};
