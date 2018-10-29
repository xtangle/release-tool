const { cat, echo, error, exec, exit, ls, sed, ShellString } = require('shelljs');
const fs = require('fs');
const mime = require('mime-types');
const path = require('path');
const rls = require('readline-sync');
const request = require('request-promise');
const semver = require('semver');

const LOCAL_CONFIG_PATH = path.resolve(process.cwd(), '.release-info.json');
const LOCAL_PACKAGE_PATH = path.resolve(process.cwd(), 'package.json');

const releaseInfoJson = require(LOCAL_CONFIG_PATH);
const packageJson = require(LOCAL_PACKAGE_PATH);

function exitOut(msg) {
  echo(msg);
  exit();
}

function errorOut(msg) {
  echo(`ERROR: ${msg}`);
  exit(1);
}

function checkError(msg) {
  if (error()) {
    errorOut(msg);
  }
}

const DEFAULT_CHANGELOG_TEMPLATE = `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased
`;

const release = (function getReleaseInfo() {
  const oldVersion = semver.valid(packageJson.version);
  if (!oldVersion) {
    errorOut(`Invalid version in package.json! (${packageJson.version})`);
  }
  return {
    name: packageJson.name,
    changelog: releaseInfoJson.changelog || 'CHANGELOG.md',
    oldVersion,
    oldTag: `v${oldVersion}`,
    newVersion: null,
    newTag: null,
    preRelease: releaseInfoJson.pre_release,
    postRelease: releaseInfoJson.post_release,
  };
}());

const github = (function generateGithubInfo() {
  const url = releaseInfoJson.remote.replace(/.git$/, '');
  const matched = /github.com\/([^/]*)\/(.*)$/.exec(url);
  return {
    url,
    user: null,
    pass: null,
    cred: null,
    owner: matched[1],
    repo: matched[2],
    branch: releaseInfoJson.branch,
    remote: releaseInfoJson.remote,
    remoteWithCred: null,
    api: 'https://api.github.com',
  };
}());

async function requestGithub(method, uri, options = {}) {
  const reqOptions = {
    method,
    uri,
    body: options.body,
    encoding: options.encoding,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Basic ${Buffer.from(github.cred).toString('base64')}`,
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
  if (response.statusCode !== 200 && response.statusCode !== 201) {
    errorOut(`Request to '${reqOptions.uri}' returned an unexpected status code: ${response.statusCode}`);
  }
  return response.body;
}

function printTitle() {
  echo(`
██████╗ ███████╗██╗     ███████╗ █████╗ ███████╗███████╗
██╔══██╗██╔════╝██║     ██╔════╝██╔══██╗██╔════╝██╔════╝
██████╔╝█████╗  ██║     █████╗  ███████║███████╗█████╗  
██╔══██╗██╔══╝  ██║     ██╔══╝  ██╔══██║╚════██║██╔══╝  
██║  ██║███████╗███████╗███████╗██║  ██║███████║███████╗
╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
`);
}

function getReleaseType() {
  echo(`Releasing '${release.name}'. Existing version: ${release.oldVersion}`);
  const types = ['patch', 'minor', 'major', 'specific version'];
  const choice = rls.keyInSelect(types, 'Which type of release will this be?');
  if (choice === -1) {
    exitOut('Aborted');
  } else if (choice < 3) {
    release.newVersion = semver.inc(release.oldVersion, types[choice]);
  } else {
    const newVersion = rls.question('Enter the new version: ');
    release.newVersion = semver.valid(newVersion);
    if (!release.newVersion) {
      errorOut(`Invalid version specified: ${newVersion}.`
        + ' Version must conform to the SemVer specification: https://semver.org/');
    }
    if (semver.lte(release.newVersion, release.oldVersion)) {
      errorOut(`New version (${release.newVersion}) is not greater than existing version (${release.oldVersion})!`);
    }
  }
  release.newTag = `v${release.newVersion}`;
  echo(`New version will be: ${release.newVersion}`);
  Object.freeze(release);
}

function getCredentials() {
  if (releaseInfoJson.user) {
    github.user = releaseInfoJson.user;
    echo(`Using GitHub user: ${github.user}`);
  } else {
    github.user = rls.question('What is your GitHub username? (default: $<defaultInput>) ',
      { defaultInput: github.owner });
  }
  github.pass = rls.question('What is your GitHub password? ', { hideEchoBack: true });
  github.cred = `${github.user}:${github.pass}`;
  github.remoteWithCred = releaseInfoJson.remote.replace('://github.com', `://${github.cred}@github.com`);
  Object.freeze(github);
}

async function checkGitStatus() {
  echo('Checking git status...');
  const resp = await requestGithub('GET',
    `${github.api}/repos/${github.owner}/${github.repo}/collaborators/${github.user}/permission`);
  if (resp.permission !== 'admin' && resp.permission !== 'write') {
    errorOut('You must have at least write privileges to the repository.');
  }
  const originUrl = exec('git remote get-url origin', { silent: true }).toString().trim();
  if (originUrl !== github.remote) {
    errorOut(`Git remote origin's push and fetch urls (${originUrl}) must be set to ${github.remote}!`);
  }
  exec('git fetch origin', { silent: true });
  checkError('Unable to fetch from origin!');
  const branch = exec('git name-rev --name-only HEAD', { silent: true }).toString().trim();
  if (branch !== github.branch) {
    errorOut(`Releases must be done on the '${github.branch}' branch!`);
  }
  exec(`git diff origin/${github.branch} --quiet`);
  checkError('There are uncommitted local changes!');
  echo('Git status OK');
}

function updateChangelog() {
  const helpLink = 'http://keepachangelog.com/en/1.0.0/';
  const helpMsg = `See ${helpLink} on how to write a Changelog.`;
  const changelogPath = path.resolve(release.changelog);
  if (!fs.existsSync(changelogPath)) {
    ShellString(DEFAULT_CHANGELOG_TEMPLATE).to(changelogPath);
    checkError('Unable to create Changelog!');
    exitOut(`Changelog file was not found! A default one following the convention of ${helpLink}`
      + ' has been automatically generated. Document your changes under the \'Unreleased\' section,'
      + ' and commit & push before running this script again.');
  }

  const oldText = cat(changelogPath);
  const matched = /(\n## \[?Unreleased]?.*?\n)(?=(## )|$)/s.exec(oldText);
  if (!matched || !matched[1]) {
    errorOut(`Changelog does not have an 'Unreleased' section! ${helpMsg}`);
  }
  const unreleasedSection = matched[1];
  if (!unreleasedSection.includes('\n### ')) {
    errorOut(`There are no changes in the 'Unreleased' section of the Changelog! ${helpMsg}`);
  }
  const isFirstRelease = !matched[2];
  if (!isFirstRelease && !oldText.includes('\n[Unreleased]:')) {
    errorOut(`There is no link on the 'Unreleased' section of the Changelog! ${helpMsg}`);
  }

  const linkLabel = isFirstRelease ? release.newTag : `[${release.newTag}]`;
  const date = new Date().toISOString().substr(0, 10);
  const changedText = unreleasedSection
    .replace(/\n## \[?Unreleased]?[^\n]*/, `\n## [Unreleased]\n\n## ${linkLabel} - ${date}`)
    .trim();
  const changedLink = isFirstRelease ? ''
    : `${linkLabel}: ${github.url}/compare/${release.oldTag}...${release.newTag}`;
  const unreleasedLink = `[Unreleased]: ${github.url}/compare/${release.newTag}...HEAD`;

  let newText = oldText.replace(unreleasedSection, `\n${changedText}\n\n`);
  if (isFirstRelease) {
    newText += `${unreleasedLink}\n`;
  } else {
    newText = newText.replace(/\n\[Unreleased]:[^\n]*/, `\n${unreleasedLink}\n${changedLink}`);
  }
  ShellString(newText).to(changelogPath);
  checkError('Unable to update Changelog!');
  echo('Updated Changelog');

  return Object.freeze({
    isFirstRelease,
    changedText,
    changedLink,
    unreleasedLink,
  });
}

function updatePackageJson() {
  sed('-i', '"version":\\s*"[^"]*"', `"version": "${release.newVersion}"`, 'package.json');
  checkError('Unable to update package.json!');
  echo('Updated package.json');
}

async function preRelease() {
  let assets = [];
  if (release.preRelease) {
    let paths = await require(path.resolve(release.preRelease))();
    if (typeof paths === 'string') {
      paths = [paths];
    }
    if (Array.isArray(paths) && paths.length > 0) {
      assets = ls(paths).map(p => path.resolve(p));
      checkError('One or more assets could not be found!');
    }
    echo('Finished pre-release stage');
  }
  return Object.freeze(assets);
}

async function postRelease(assets, releaseResp) {
  if (release.postRelease) {
    await require(path.resolve(release.postRelease))(assets, releaseResp);
    echo('Finished post-release stage');
  }
}

function commit() {
  exec('git add CHANGELOG.md package.json');
  checkError('Unable to stage CHANGELOG.md and package.json!');
  echo('Committing changes...');
  exec(`git commit -q -m ${release.newTag}`, { silent: true });
  checkError('Unable commit changes!');
  echo('Changes committed');
}

function push() {
  echo('Pushing changes...');
  exec(`git push -q ${github.remoteWithCred}`);
  checkError('Unable to push changes!');
  echo('Changes pushed');
}

async function uploadAssets(assets, releaseResponse) {
  if (assets && assets.length > 0) {
    echo('Uploading assets...');
    const uploadUrl = releaseResponse.upload_url.replace(/{[^{]*}$/, '');
    await Promise.all(assets.map(async (asset) => {
      const options = {
        body: fs.readFileSync(asset),
        encoding: null,
        json: false,
        headers: { 'Content-Type': mime.lookup(asset) || 'application/octet-stream' },
      };
      await requestGithub('POST', `${uploadUrl}?name=${path.basename(asset)}`, options);
    }));
    echo(`Finished uploading assets: ${assets.join(', ')}`);
  }
}

async function createRelease(changelog) {
  echo('Creating release on GitHub...');
  const body = {
    tag_name: release.newTag,
    target_commitish: github.branch,
    name: `Release ${release.newTag}`,
    body: `${changelog.changedText}\n${changelog.isFirstRelease ? '' : `\n${changelog.changedLink}`}`,
  };
  const releaseResponse = await requestGithub('POST',
    `${github.api}/repos/${github.owner}/${github.repo}/releases`, { body });
  echo(`Created release ${release.newTag}`);
  return Object.freeze(releaseResponse);
}

module.exports = async function () {
  printTitle();
  getReleaseType();
  getCredentials();

  await checkGitStatus();
  const changelog = updateChangelog();
  updatePackageJson();

  const assets = await preRelease({ release, github });
  commit();
  push();
  const releaseResponse = await createRelease(changelog);
  await uploadAssets(assets, releaseResponse);
  await postRelease({ release, github, assets });

  echo('Done!');
  exit();
};
