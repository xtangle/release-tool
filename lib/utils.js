const { echo, error, exit } = require('shelljs');
const path = require('path');

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

function resolveFromLocal(filePath) {
  return path.resolve(process.cwd(), filePath);
}

module.exports = {
  exitOut,
  errorOut,
  checkError,
  resolveFromLocal,
};
