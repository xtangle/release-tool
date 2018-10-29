const { cat, echo, ShellString } = require('shelljs');
const fs = require('fs');
const { checkError, errorOut, exitOut } = require('./utils');

const DEFAULT_CHANGELOG_TEMPLATE = `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased
`;

function updateChangelog() {
  const helpLink = 'http://keepachangelog.com/en/1.0.0/';
  const helpMsg = `See: ${helpLink}`;
  if (!fs.existsSync(this.release.changelogPath)) {
    ShellString(DEFAULT_CHANGELOG_TEMPLATE).to(this.release.changelogPath);
    checkError('Unable to create Changelog!');
    exitOut(`Changelog file was not found! A default one following the convention of ${helpLink}`
      + ' has been automatically generated. Document your changes under the \'Unreleased\' section,'
      + ' and commit & push before running this script again.');
  }

  const oldText = cat(this.release.changelogPath);
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

  const linkLabel = isFirstRelease ? this.release.newTag : `[${this.release.newTag}]`;
  const date = new Date().toISOString().substr(0, 10);
  const changedText = unreleasedSection
    .replace(/\n## \[?Unreleased]?[^\n]*/, `## ${linkLabel} - ${date}`)
    .trim();
  const changedLink = isFirstRelease ? ''
    : `${linkLabel}: ${this.github.url}/compare/${this.release.oldTag}...${this.release.newTag}`;
  const unreleasedLink = `[Unreleased]: ${this.github.url}/compare/${this.release.newTag}...HEAD`;

  let newText = oldText.replace(unreleasedSection, `\n## [Unreleased]\n\n${changedText}\n\n`);
  if (isFirstRelease) {
    newText += `${unreleasedLink}\n`;
  } else {
    newText = newText.replace(/\n\[Unreleased]:[^\n]*/, `\n${unreleasedLink}\n${changedLink}`);
  }
  ShellString(newText).to(this.release.changelogPath);
  checkError('Unable to update Changelog!');
  echo('Updated Changelog');

  this.changelog = {
    isFirstRelease,
    changedText,
    changedLink,
    unreleasedLink,
  };
}

module.exports = {
  updateChangelog,
};
