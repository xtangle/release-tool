const fs = require('fs');
const { cat, echo, exec, ShellString } = require('shelljs');
const { parseRemote } = require('./github');
const { checkError, errorOut, exitOut } = require('./utils');

const HELP_REF = 'http://keepachangelog.com/en/1.0.0/';

const DEFAULT_TEMPLATE = `# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](${HELP_REF})
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased
`;

const updateChangelog = (config) => {
  if (!config.changelog.update) {
    return;
  }
  if (!fs.existsSync(config.changelog.path)) {
    ShellString(DEFAULT_TEMPLATE).to(config.changelog.path);
    checkError('Unable to create Changelog!');
    exec('git add CHANGELOG.md', { silent: true });
    exitOut(`Changelog file was not found! A default one following the convention of ${HELP_REF}`
      + ' has been automatically generated. Document your changes under the \'Unreleased\' section.');
  }

  const oldText = cat(config.changelog.path);
  const matched = /(\n## \[?Unreleased]?.*?\n)(?=(## )|$)/s.exec(oldText);
  if (!matched || !matched[1]) {
    errorOut(`Changelog does not have an 'Unreleased' section! See ${HELP_REF}`);
  }
  const unreleasedSection = matched[1];
  const isFirstRelease = !matched[2];
  if (!unreleasedSection.includes('\n### ')) {
    errorOut(`There are no changes in the 'Unreleased' section of the Changelog! See ${HELP_REF}`);
  }
  if (!isFirstRelease && !oldText.includes('\n[Unreleased]:')) {
    errorOut(`There is no link on the 'Unreleased' section of the Changelog! See ${HELP_REF}`);
  }

  const linkLabel = isFirstRelease ? `v${config.new_version}` : `[v${config.new_version}]`;
  const date = new Date().toISOString().substr(0, 10);
  const { link } = parseRemote(config.github.remote);
  const changedText = unreleasedSection
    .replace(/\n## \[?Unreleased]?[^\n]*/, `## ${linkLabel} - ${date}`)
    .trim();
  const changedLink = isFirstRelease ? ''
    : `${linkLabel}: ${link}/compare/v${config.old_version}...v${config.new_version}`;
  const unreleasedLink = `[Unreleased]: ${link}/compare/v${config.new_version}...HEAD`;

  let newText = oldText.replace(unreleasedSection, `\n## [Unreleased]\n\n${changedText}\n\n`);
  if (isFirstRelease) {
    newText += `${unreleasedLink}\n`;
  } else {
    newText = newText.replace(/\n\[Unreleased]:[^\n]*/, `\n${unreleasedLink}\n${changedLink}`);
  }
  ShellString(newText).to(config.changelog.path);
  checkError('Unable to update Changelog!');
  echo('Updated Changelog');

  config.github.release_notes = `${changedText}\n${isFirstRelease ? '' : `\n${changedLink}\n`}`;
};

module.exports = {
  updateChangelog,
};
