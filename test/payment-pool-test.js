import MerkleTree from '../lib/merkle-tree';
import { assertRevert } from './helpers/utils';

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
  let paymentElements = createPaymentLeafNodes(payments);

  describe("payment pool", function() {
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

    describe("balanceOf", function() {
      xit("payee can get their available balance in the payment pool from their proof", async function() {
      });

      xit("non-payee can get the available balance in the payment pool for an address and proof", async function() {
      });

      xit("an invalid proof/address pair returns a balance of 0 in the payment pool", async function() {
      });
    });

    describe("withdraw", function() {
      const payeeIndex = 0;
      const paymentPoolBalance = 100;
      const payee = payments[payeeIndex].payee;
      const paymentAmount = payments[payeeIndex].amount;
      const paymentNode = paymentElements[payeeIndex];
      const merkleTree = new MerkleTree(paymentElements);
      const root = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(paymentNode, { unshift: paymentAmount });

      beforeEach(async function() {
        await token.mint(paymentPool.address, paymentPoolBalance);
        await paymentPool.startNewEpoch();
        await paymentPool.submitPayeeMerkleRoot(root);
      });

      it("payee can withdraw their up to their allotted amount from pool", async function() {
        let txn = await paymentPool.withdraw(paymentAmount, proof, { from: payee });
        // console.log(JSON.stringify(txn, null, 2));

        let withdrawEvent = txn.logs.find(log => log.event === 'PayeeWithdraw');
        assert.equal(withdrawEvent.args.payee, payee, 'event payee is correct');
        assert.equal(withdrawEvent.args.amount.toNumber(), paymentAmount, 'event amount is correct');

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);

        assert.equal(payeeBalance.toNumber(), paymentAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - paymentAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), paymentAmount, 'the withdrawals amount is correct');
      });


      xit("payee can make a withdrawal less than their allotted amount from the pool", async function() {
      });

      xit("payee can make mulitple withdrawls within their allotted amount from the pool", async function() {
      });

      xit("payee cannot withdraw more than their alloted amount from the pool", async function() {
      });

      xit("payee cannot make mulitple withdrawls that total to more than their allotted amount from the pool", async function() {
      });

      xit("non-payee cannot withdraw from pool", async function() {
      });

      xit("payee withdraws their allotted amount from an older epoch", async function() {
      });

    });

  });

});

