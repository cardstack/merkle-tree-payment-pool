import MerkleTree from '../lib/merkle-tree';
import { sha3, bufferToHex } from 'ethereumjs-util';

const PaymentPool = artifacts.require('./PaymentPool.sol');
const Token = artifacts.require('./Token.sol');

function createPaymentLeafNodes(payments) {
  return payments.map(payment => payment.payee + payment.amount);
}

contract('PaymentPool', function(accounts) {
  let paymentPool;
  let token;
  let miner = accounts[1];
  let payments = [{
    payee: accounts[1],
    amount: 10
  },{
    payee: accounts[2],
    amount: 12
  },{
    payee: accounts[3],
    amount: 2,
  },{
    payee: accounts[4],
    amount: 1
  },{
    payee: accounts[5],
    amount: 32
  },{
    payee: accounts[6],
    amount: 10
  },{
    payee: accounts[7],
    amount: 9
  },{
    payee: accounts[8],
    amount: 9
  },{
    payee: accounts[9],
    amount: 2
  }];

  describe("ledger", function() {
    beforeEach(async function() {
      token = await Token.new();
      paymentPool = await PaymentPool.new(token.address);
      await token.mint(miner, 100);
      await token.approve(paymentPool.address, 100, { from: miner });
    });

    it.only("payees can withdraw from pool", async function() {
      let miningStake = 10;
      let paymentPoolBalance = 100;
      let paymentElements = createPaymentLeafNodes(payments);
      let merkleTree = new MerkleTree(paymentElements);
      let root = merkleTree.getHexRoot();

      await token.mint(paymentPool.address, paymentPoolBalance);
      await paymentPool.postMiningStake(miningStake, { from: miner });
      await paymentPool.startNewEpoch();

      let txn = await paymentPool.submitPayeeMerkleRoot(root);

      console.log(JSON.stringify(txn, null, 2));

    });

  });

});

