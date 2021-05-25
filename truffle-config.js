require('@babel/register');
require("core-js/stable");
require("regenerator-runtime/runtime");

module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  compilers: {
    solc: {
      version: "0.5.17", //default truffle (v5.3.6) solidity compiler 
    },
  },
};
