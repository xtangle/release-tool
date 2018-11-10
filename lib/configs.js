const path = require('path');
const rls = require('readline-sync');
const semver = require('semver');
const parser = require('yargs-parser');
const { echo, mkdir, ShellString } = require('shelljs');
const { parseRemote } = require('./github');
const { chain, checkError, errorOut, exitOut, mergeInPlace, resolveFromLocal, valueAt } = require('./utils');

const mergeWithLocalConfig = (config) => {
  if (config.config) {
    const localConfig = require(resolveFromLocal(config.config));
    mergeInPlace(config, localConfig);
  }
};

const mergeWithCLIConfig = cliConfig => config => mergeInPlace(config, cliConfig);

const validateOptions = (config) => {
  const required = [
    ['github.remote', 'remote URL to GitHub repository'],
  ];
  required.forEach(([prop, desc]) => {
    if (!valueAt(prop, config)) {
      errorOut(`Missing required option: --${prop} (${desc})`);
    }
  });

  let assets = config.github.assets || [];
  if (typeof assets === 'string') {
    assets = [assets];
  }
  if (!Array.isArray(assets)) {
    errorOut('Invalid type for github.assets! Must be string or array.');
  }
  config.github.assets = assets;
};

const initVersions = (config) => {
  const packageJson = require(resolveFromLocal(config.npm.package));
  config.name = config.name || packageJson.name;
  if (!config.name) {
    errorOut('No npm package name specified!');
  }
  config.old_version = config.old_version || packageJson.version;
  if (!config.old_version || !semver.valid(config.old_version)) {
    errorOut(`Invalid npm package version! version: ${config.old_version}`);
  }
  echo(`Releasing '${config.name}'. Existing version: ${config.old_version}`);

  let newVersion = config.new_version;
  if (!newVersion) {
    const types = ['patch', 'minor', 'major', 'specific version'];
    const choice = rls.keyInSelect(types, 'Which type of release will this be?');
    if (choice === -1) {
      exitOut('Aborted');
    } else if (choice < 3) {
      newVersion = semver.inc(config.old_version, types[choice]);
    } else {
      newVersion = rls.question('Enter the new version: ');
    }
  }
  config.new_version = semver.valid(newVersion);
  if (!config.new_version) {
    errorOut(`Invalid version specified: ${newVersion}.`
      + ' Version must conform to the SemVer specification: https://semver.org/');
  }
  if (semver.lte(config.new_version, config.old_version)) {
    errorOut(`New version (${config.new_version}) is`
      + ` not greater than existing version (${config.old_version})!`);
  }
  echo(`New version: ${config.new_version}`);
  config.release_type = semver.diff(config.old_version, config.new_version);
};

const initCreds = (config) => {
  const { owner, repo, link } = parseRemote(config.github.remote);
  if (!owner || !repo) {
    errorOut(`Invalid github remote url: ${config.github.remote}`);
  }
  config.github.owner = owner;
  config.github.repo = repo;
  config.github.link = link;
  if (!config.github.user) {
    config.github.user = owner;
  }
  echo(`Using GitHub user: ${config.github.user}`);
  if (!config.github.token_ref) {
    config.github.pass = rls.question('What is your GitHub password? ', { hideEchoBack: true });
  }
};

const maskConfidentialConfigs = (config) => {
  Object.defineProperties(config.github, {
    pass: { enumerable: false },
    token_ref: { enumerable: false },
  });
};

const initConfigs = () => {
  const defaultConfig = require('../conf/defaults');
  const cliOpts = require('../conf/opts');
  const cliConfig = parser(process.argv.slice(2), cliOpts);
  const config = { ...defaultConfig, config: cliConfig.config || defaultConfig.config };

  return chain(
    mergeWithLocalConfig,
    mergeWithCLIConfig(cliConfig),
    validateOptions,
    initVersions,
    initCreds,
    maskConfidentialConfigs,
  )(config);
};

const dumpConfigs = (config) => {
  if (config.dump_configs) {
    const dumpPath = path.resolve(config.dump_configs);
    mkdir('-p', path.dirname(dumpPath));
    ShellString(JSON.stringify(config, null, 2)).to(dumpPath);
    checkError('Unable to dump configs!');
  }
};

module.exports = {
  initConfigs,
  dumpConfigs,
};
