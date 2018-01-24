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
    amount: 101 // this amount is used to test logic when the payment pool doesn't have sufficient funds
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

    describe("balanceForProof", function() {
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

      it("payee can get their available balance in the payment pool from their proof", async function() {
        let balance = await paymentPool.balanceForProof(proof, { from: payee });
        assert.equal(balance.toNumber(), paymentAmount, "the balance is correct");
      });

      it("non-payee can get the available balance in the payment pool for an address and proof", async function() {
        let balance = await paymentPool.balanceForProofWithAddress(payee, proof);
        assert.equal(balance.toNumber(), paymentAmount, "the balance is correct");
      });

      it("an invalid proof/address pair returns a balance of 0 in the payment pool", async function() {
        const paymentNode = paymentElements[4];
        const differentUsersProof = merkleTree.getHexProof(paymentNode, { unshift: paymentElements[4].amount });
        let balance = await paymentPool.balanceForProofWithAddress(payee, differentUsersProof);
        assert.equal(balance.toNumber(), 0, "the balance is correct");
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

      it("payee can withdraw up to their allotted amount from pool", async function() {
        let txn = await paymentPool.withdraw(paymentAmount, proof, { from: payee });

        let withdrawEvent = txn.logs.find(log => log.event === 'PayeeWithdraw');
        assert.equal(withdrawEvent.args.payee, payee, 'event payee is correct');
        assert.equal(withdrawEvent.args.amount.toNumber(), paymentAmount, 'event amount is correct');

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), paymentAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - paymentAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), paymentAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), 0, 'the proof balance is correct');
      });

      it("payee can make a withdrawal less than their allotted amount from the pool", async function() {
        let withdrawalAmount = 8;
        let txn = await paymentPool.withdraw(withdrawalAmount, proof, { from: payee });

        let withdrawEvent = txn.logs.find(log => log.event === 'PayeeWithdraw');
        assert.equal(withdrawEvent.args.payee, payee, 'event payee is correct');
        assert.equal(withdrawEvent.args.amount.toNumber(), withdrawalAmount, 'event amount is correct');

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount - withdrawalAmount, 'the proof balance is correct');
      });

      it("payee can make mulitple withdrawls within their allotted amount from the pool", async function() {
        let withdrawalAmount = 4 + 6;
        await paymentPool.withdraw(4, proof, { from: payee });
        await paymentPool.withdraw(6, proof, { from: payee });

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount - withdrawalAmount, 'the proof balance is correct');
      });

      it("payee cannot withdraw more than their allotted amount from the pool", async function() {
        let withdrawalAmount = 11;
        await assertRevert(async () => await paymentPool.withdraw(withdrawalAmount, proof, { from: payee }));

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), 0, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), 0, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount, 'the proof balance is correct');
      });

      it("payee cannot make mulitple withdrawls that total to more than their allotted amount from the pool", async function() {
        let withdrawalAmount = 4;
        await paymentPool.withdraw(4, proof, { from: payee });
        await assertRevert(async () => await paymentPool.withdraw(7, proof, { from: payee }));

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount - withdrawalAmount, 'the proof balance is correct');
      });

      it("payee cannot withdraw 0 tokens from payment pool", async function() {
        let withdrawalAmount = 0;
        await assertRevert(async () => await paymentPool.withdraw(withdrawalAmount, proof, { from: payee }));

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), 0, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), 0, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount, 'the proof balance is correct');
      });

      it("non-payee cannot withdraw from pool", async function() {
        let withdrawalAmount = 10;
        await assertRevert(async () => await paymentPool.withdraw(withdrawalAmount, proof, { from: accounts[0] }));

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });

        assert.equal(payeeBalance.toNumber(), 0, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), 0, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount, 'the proof balance is correct');
      });

      it("payee cannot withdraw their allotted tokens from the pool when the pool does not have enough tokens", async function() {
        const insufficientFundsPayeeIndex = 7;
        const insufficientFundsPayee = payments[insufficientFundsPayeeIndex].payee;
        const insufficientFundsPaymentAmount = payments[insufficientFundsPayeeIndex].amount;
        const insufficientFundsPaymentNode = paymentElements[insufficientFundsPayeeIndex];
        const insufficientFundsProof = merkleTree.getHexProof(insufficientFundsPaymentNode, { unshift: insufficientFundsPaymentAmount });

        await assertRevert(async () => await paymentPool.withdraw(insufficientFundsPaymentAmount, insufficientFundsProof, { from: insufficientFundsPayee }));

        let payeeBalance = await token.balanceOf(insufficientFundsPayee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(insufficientFundsPayee);
        let proofBalance = await paymentPool.balanceForProof(insufficientFundsProof, { from: insufficientFundsPayee });

        assert.equal(payeeBalance.toNumber(), 0, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), 0, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), insufficientFundsPaymentAmount, 'the proof balance is correct');
      });

      xit("payee withdraws their allotted amount from an older epoch", async function() {
      });

    });

  });

  describe("popBytes32FromBytes", function() {
    xit("rejects when bytes is only 32 bytes long", async function() {
    });

    xit("can handle up to 50 * 32 bytes long", async function() {
    });

    xit("rejects when bytes is not a multiple of 32 bytes long", async function() {
    });
  });

});

