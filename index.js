require('babel-register');
require('babel-polyfill');

module.exports = {
  MerkleTree: require('./lib/merkle-tree').default,
  CumulativePaymentTree: require('./lib/cumulative-payment-tree').default
};

