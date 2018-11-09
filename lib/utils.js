const { echo, error, exit } = require('shelljs');
const path = require('path');

const exitOut = (msg) => {
  echo(msg);
  exit();
};

const errorOut = (msg) => {
  echo(`ERROR: ${msg}`);
  exit(1);
};

const checkError = (msg) => {
  if (error()) {
    errorOut(msg);
  }
};

const resolveFromLocal = filePath => path.resolve(process.cwd(), filePath);

const getAllEntries = (obj, prefix = '') => {
  let entries = [];
  Object.entries(obj).forEach(([key, value]) => {
    const prop = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      entries = [...entries, ...getAllEntries(value, prop)];
    } else {
      entries = [...entries, [prop, value]];
    }
  });
  return entries;
};

const mergeInPlace = (src, other) => {
  Object.keys(src).forEach((key) => {
    if (src[key] && typeof src[key] === 'object' && typeof other[key] === 'object') {
      mergeInPlace(src[key], other[key]);
    } else if (other[key] || typeof other[key] === 'boolean') {
      src[key] = other[key];
    }
  });
};

const valueAt = (prop, obj) => prop.split('.').reduce((a, b) => a[b], obj);

const chain = (...funcs) => async initialValue => funcs.reduce(async (c, f) => f(await c) || c, initialValue);

module.exports = {
  exitOut,
  errorOut,
  checkError,
  resolveFromLocal,
  getAllEntries,
  mergeInPlace,
  valueAt,
  chain,
};
