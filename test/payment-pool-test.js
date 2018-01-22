import MerkleTree from '../lib/merkle-tree';
import { sha3, bufferToHex } from 'ethereumjs-util';

const PaymentPool = artifacts.require('./PaymentPool.sol');
const Token = artifacts.require('./Token.sol');
const MerkleProofLib = artifacts.require('MerkleProof.sol');

function createPaymentLeafNodes(payments) {
  return payments.map(payment => payment.payee + ',' + payment.amount);
}

contract('PaymentPool', function(accounts) {
  let paymentPool;
  let token;
  let miner = accounts[1];

  let payments = [{
    payee: accounts[2],
    amount: 10
  },{
    payee: accounts[3],
    amount: 12
  },{
    payee: accounts[4],
    amount: 2,
  },{
    payee: accounts[5],
    amount: 1
  },{
    payee: accounts[6],
    amount: 32
  },{
    payee: accounts[7],
    amount: 10
  },{
    payee: accounts[8],
    amount: 9
  },{
    payee: accounts[9],
    amount: 9
  }];

  describe("ledger", function() {
    beforeEach(async function() {
      let merkleProofLib = await MerkleProofLib.new();
      token = await Token.new();
      PaymentPool.link('MerkleProof', merkleProofLib.address);
      paymentPool = await PaymentPool.new(token.address);
      await token.mint(miner, 100);
      await token.approve(paymentPool.address, 100, { from: miner });
    });


    xit("miner can post mining stake", async function() {
    });

    //TODO this will eventually be the responsibiliy of the miners
    xit("owner can submit merkle root", async function() {
    });

    it.only("payee can withdraw their allotted amount from pool", async function() {
      let payeeIndex = 0;
      let paymentPoolBalance = 100;

      let paymentElements = createPaymentLeafNodes(payments);
      let paymentNode = paymentElements[payeeIndex];
      let merkleTree = new MerkleTree(paymentElements);
      let root = merkleTree.getHexRoot();

      await token.mint(paymentPool.address, paymentPoolBalance);
      await paymentPool.startNewEpoch();
      await paymentPool.submitPayeeMerkleRoot(root);

      let proof = merkleTree.getHexProof(paymentNode);
      let txn = await paymentPool.withdraw(payments[payeeIndex].amount, proof, {
        from: payments[payeeIndex].payee
      });

      let withdrawEvent = txn.logs.find(log => log.event === 'PayeeWithdraw');
      assert.equal(withdrawEvent.args.payee, payments[payeeIndex].payee, 'event payee is correct');
      assert.equal(withdrawEvent.args.amount.toNumber(), payments[payeeIndex].amount, 'event amount is correct');

      let payeeBalance = await token.balanceOf(payments[payeeIndex].payee);
      let poolBalance = await token.balanceOf(paymentPool.address);

      assert.equal(payeeBalance.toNumber(), payments[payeeIndex].amount, 'the payee balance is correct');
      assert.equal(poolBalance.toNumber(), paymentPoolBalance - payments[payeeIndex].amount, 'the pool balance is correct');
    });

    xit("payee cannot withdraw an amount that is different from their alloted amount from the pool", async function() {
    });

    xit("payee cannot withdraw their allotted amount more than once", async function() {
    });

  });

});

