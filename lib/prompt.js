const rls = require('readline-sync');
const semver = require('semver');
const { echo } = require('shelljs');
const { exitOut, errorOut } = require('./utils');

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
  echo(`Releasing '${this.release.name}'. Existing version: ${this.release.oldVersion}`);
  const types = ['patch', 'minor', 'major', 'specific version'];
  const choice = rls.keyInSelect(types, 'Which type of release will this be?');
  if (choice === -1) {
    exitOut('Aborted');
  } else if (choice < 3) {
    this.release.newVersion = semver.inc(this.release.oldVersion, types[choice]);
  } else {
    const newVersion = rls.question('Enter the new version: ');
    this.release.newVersion = semver.valid(newVersion);
    if (!this.release.newVersion) {
      errorOut(`Invalid version specified: ${newVersion}.`
        + ' Version must conform to the SemVer specification: https://semver.org/');
    }
    if (semver.lte(this.release.newVersion, this.release.oldVersion)) {
      errorOut(`New version (${this.release.newVersion}) is`
        + ` not greater than existing version (${this.release.oldVersion})!`);
    }
  }
  this.release.newTag = `v${this.release.newVersion}`;
  echo(`New version will be: ${this.release.newVersion}`);
}

function getCredentials() {
  if (this.github.user) {
    echo(`Using GitHub user: ${this.github.user}`);
  } else {
    this.github.user = rls.question('What is your GitHub username? (default: $<defaultInput>) ',
      { defaultInput: this.github.owner });
  }
  this.github.pass = rls.question('What is your GitHub password? ', { hideEchoBack: true });
  this.github.cred = `${this.github.user}:${this.github.pass}`;
  this.github.remoteWithCred = this.github.remote.replace('://github.com', `://${this.github.cred}@github.com`);
}

module.exports = {
  printTitle,
  getReleaseType,
  getCredentials,
};
