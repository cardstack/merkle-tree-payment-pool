require('@babel/register');
require("core-js/stable");
require("regenerator-runtime/runtime");

module.exports = {
  MerkleTree: require('./lib/merkle-tree').default,
  CumulativePaymentTree: require('./lib/cumulative-payment-tree').default
};

