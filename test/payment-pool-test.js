import CumulativePaymentTree from '../lib/cumulative-payment-tree.js';
import { assertRevert } from './helpers/utils';

const PaymentPool = artifacts.require('./PaymentPool.sol');
const Token = artifacts.require('./Token.sol');
const MerkleProofLib = artifacts.require('MerkleProof.sol');

contract('PaymentPool', function(accounts) {
  describe("payment pool", function() {
    let paymentPool;
    let token;
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
    let initialBlockNumber;
    beforeEach(async function() {
      let merkleProofLib = await MerkleProofLib.new();
      token = await Token.new();
      PaymentPool.link('MerkleProof', merkleProofLib.address);
      paymentPool = await PaymentPool.new(token.address);
      initialBlockNumber = await web3.eth.blockNumber;
    });

    describe("submitPayeeMerkleRoot", function() {
      it("starts a new payment cycle after the payee merkle root is submitted", async function() {
        let merkleTree = new CumulativePaymentTree(payments);
        let root = merkleTree.getHexRoot();
        let paymentCycleNumber = await paymentPool.numPaymentCycles();
        assert.equal(paymentCycleNumber.toNumber(), 1, 'the payment cycle number is correct');

        let txn = await paymentPool.submitPayeeMerkleRoot(root);
        let currentBlockNumber = await web3.eth.blockNumber;
        let actualRoot = await paymentPool.payeeRoots(1);
        paymentCycleNumber = await paymentPool.numPaymentCycles();

        assert.equal(paymentCycleNumber.toNumber(), 2, "the payment cycle number is correct");
        assert.equal(txn.logs.length, 2, "the correct number of events were fired");
        assert.equal(actualRoot, root, "the payee merkle root is correct");

        let event = txn.logs[0];
        assert.equal(event.event, "PayeeMerkleRoot", "the event type is correct");
        assert.equal(event.args.root, root, "the root arg is correct");
        assert.equal(event.args.paymentCycle, 1, "the payment cycle number is correct");

        event = txn.logs[1];
        assert.equal(event.event, "PaymentCycleEnded", "the event type is correct");
        assert.equal(event.args.paymentCycle, 1, "the payment cycle number is correct");
        assert.equal(event.args.startBlock, initialBlockNumber, "the payment cycle start block is correct");
        assert.equal(event.args.endBlock, currentBlockNumber, "the payment cycle end block is correct");
      });

      it("allows a new merkle root to be submitted in a block after the previous payment cycle has ended", async function() {
        let merkleTree = new CumulativePaymentTree(payments);
        let root = merkleTree.getHexRoot();
        await paymentPool.submitPayeeMerkleRoot(root);

        let updatedPayments = payments.slice();
        updatedPayments[0].amount += 10;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let actualOriginalRoot = await paymentPool.payeeRoots(1);
        let actualUpdatedRoot = await paymentPool.payeeRoots(2);
        let paymentCycleNumber = await paymentPool.numPaymentCycles();

        assert.equal(actualOriginalRoot, root, "the root is correct");
        assert.equal(actualUpdatedRoot, updatedRoot, "the root is correct");
        assert.notEqual(actualUpdatedRoot, actualOriginalRoot, "the roots are different");
        assert.equal(paymentCycleNumber.toNumber(), 3, "the payment cycle number is correct");
      });

      it("does not allow 2 merkle roots to be submitted in the same block after the previous payment cycle has ended", async function() {
        let merkleTree = new CumulativePaymentTree(payments);
        let root = merkleTree.getHexRoot();
        await paymentPool.submitPayeeMerkleRoot(root);

        let updatedPayments = payments.slice();
        updatedPayments[0].amount += 10;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        await assertRevert(async () => await paymentPool.submitPayeeMerkleRoot(updatedRoot));

        let actualOriginalRoot = await paymentPool.payeeRoots(1);
        let actualUpdatedRoot = await paymentPool.payeeRoots(2);
        let paymentCycleNumber = await paymentPool.numPaymentCycles();

        assert.equal(actualOriginalRoot, root, "the original root is correct");
        assert.equal(actualUpdatedRoot, "0x0000000000000000000000000000000000000000000000000000000000000000", "the updated root is correct");
        assert.equal(paymentCycleNumber.toNumber(), 2, "the payment cycle number is correct");
      });

      it("does not allow non-owner to submit merkle root", async function() {
        let merkleTree = new CumulativePaymentTree(payments);
        let root = merkleTree.getHexRoot();

        await assertRevert(async () => paymentPool.submitPayeeMerkleRoot(root, { from: accounts[2] }));
        let paymentCycleNumber = await paymentPool.numPaymentCycles();
        let actualRoot = await paymentPool.payeeRoots(1);

        assert.equal(paymentCycleNumber.toNumber(), 1, "the payment cycle number is correct");
        assert.equal(actualRoot, "0x0000000000000000000000000000000000000000000000000000000000000000", "the payee merkle root is correct");
      });
    });

    describe("balanceForProof", function() {
      let paymentPoolBalance;
      let paymentCycle;
      let proof;
      let payeeIndex = 0;
      let payee = payments[payeeIndex].payee;
      let paymentAmount = payments[payeeIndex].amount;
      let merkleTree = new CumulativePaymentTree(payments);
      let root = merkleTree.getHexRoot();

      beforeEach(async function() {
        paymentPoolBalance = 100;
        await token.mint(paymentPool.address, paymentPoolBalance);
        paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        proof = merkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(root);
      });

      afterEach(async function() {
        payments[payeeIndex].amount = 10; // one of the tests is bleeding state...
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
        let differentPayee = payments[4].payee;
        let differentUsersProof = merkleTree.hexProofForPayee(differentPayee, paymentCycle);
        let balance = await paymentPool.balanceForProofWithAddress(payee, differentUsersProof);
        assert.equal(balance.toNumber(), 0, "the balance is correct");
      });

      it("garbage proof data returns a balance of 0 in payment pool", async function() {
        let literalGarbage = "0x0123456789abcdef0123456789abdef0123456789abcdef0123456789abdef00";
        let balance = await paymentPool.balanceForProofWithAddress(payee, web3.toHex(literalGarbage));
        assert.equal(balance.toNumber(), 0, "the balance is correct");
      });

      it("can handle balance for proofs from different payment cycles", async function() {
        let updatedPayments = payments.slice();
        updatedPayments[payeeIndex].amount = 20;
        let updatedPaymentAmount = 20;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let balance = await paymentPool.balanceForProof(updatedProof, { from: payee });
        assert.equal(balance.toNumber(), updatedPaymentAmount, "the balance is correct for the updated proof");

        balance = await paymentPool.balanceForProof(proof, { from: payee });
        assert.equal(balance.toNumber(), paymentAmount, "the balance is correct for the original proof");

        updatedPayments[payeeIndex].amount = 20;
      });

      it("balance of payee that has 0 tokens in payment list returns 0 balance in payment pool", async function() {
        let aPayee = accounts[1];
        let updatedPayments = payments.slice();
        updatedPayments.push({ payee: aPayee, amount: 0 });
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(aPayee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let balance = await paymentPool.balanceForProof(updatedProof, { from: aPayee });
        assert.equal(balance.toNumber(), 0, "the balance is correct for the updated proof");
      });

      it("balance of proof for payee that has mulitple entries in the payment list returns the sum of all their amounts in the payment pool", async function() {
        let updatedPayments = payments.slice();
        updatedPayments.push({
          payee,
          amount: 8
        });
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let balance = await paymentPool.balanceForProof(updatedProof, { from: payee });
        assert.equal(balance.toNumber(), 18, "the balance is correct for the updated proof");
      });
    });

    describe("withdraw", function() {
      let paymentPoolBalance;
      let paymentCycle;
      let proof;
      let payeeIndex = 0;
      let payee = payments[payeeIndex].payee;
      let paymentAmount = payments[payeeIndex].amount;
      let merkleTree = new CumulativePaymentTree(payments);
      let root = merkleTree.getHexRoot();

      beforeEach(async function() {
        paymentPoolBalance = 100;
        await token.mint(paymentPool.address, paymentPoolBalance);
        paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        proof = merkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(root);
      });
      afterEach(async function() {
        payments[payeeIndex].amount = 10; // one of the tests is bleeding state...
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
        let insufficientFundsPayeeIndex = 7;
        let insufficientFundsPayee = payments[insufficientFundsPayeeIndex].payee;
        let insufficientFundsPaymentAmount = payments[insufficientFundsPayeeIndex].amount;
        let insufficientFundsProof = merkleTree.hexProofForPayee(insufficientFundsPayee, paymentCycle);

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

      it("payee withdraws their allotted amount from an older proof", async function() {
        let updatedPayments = payments.slice();
        updatedPayments[payeeIndex].amount += 2;
        let updatedPaymentAmount = updatedPayments[payeeIndex].amount;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let withdrawalAmount = 8;
        await paymentPool.withdraw(withdrawalAmount, proof, { from: payee });

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });
        let udpatedProofBalance = await paymentPool.balanceForProof(updatedProof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount - withdrawalAmount, 'the proof balance is correct');
        assert.equal(udpatedProofBalance.toNumber(), updatedPaymentAmount - withdrawalAmount, 'the updated proof balance is correct');
      });

      it("payee withdraws their allotted amount from a newer proof", async function() {
        let updatedPayments = payments.slice();
        updatedPayments[payeeIndex].amount += 2;
        let updatedPaymentAmount = updatedPayments[payeeIndex].amount;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let withdrawalAmount = 8;
        await paymentPool.withdraw(withdrawalAmount, updatedProof, { from: payee });

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });
        let udpatedProofBalance = await paymentPool.balanceForProof(updatedProof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount - withdrawalAmount, 'the proof balance is correct');
        assert.equal(udpatedProofBalance.toNumber(), updatedPaymentAmount - withdrawalAmount, 'the updated proof balance is correct');
      });

      it("payee withdraws their allotted amount from both an older and new proof", async function() {
        let updatedPayments = payments.slice();
        updatedPayments[payeeIndex].amount += 2;
        let updatedPaymentAmount = updatedPayments[payeeIndex].amount;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let withdrawalAmount = 8 + 4;
        await paymentPool.withdraw(8, proof, { from: payee });
        await paymentPool.withdraw(4, updatedProof, { from: payee });

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });
        let udpatedProofBalance = await paymentPool.balanceForProof(updatedProof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), 0, 'the proof balance is correct');
        assert.equal(udpatedProofBalance.toNumber(), updatedPaymentAmount - withdrawalAmount, 'the updated proof balance is correct');
      });

      it("does not allow a payee to exceed their provided proof's allotted amount when withdrawing from an older proof and a newer proof", async function() {
        let updatedPayments = payments.slice();
        updatedPayments[payeeIndex].amount += 2;
        let updatedPaymentAmount = updatedPayments[payeeIndex].amount;
        let updatedMerkleTree = new CumulativePaymentTree(updatedPayments);
        let updatedRoot = updatedMerkleTree.getHexRoot();

        // do something that causes a block to be mined
        await token.mint(accounts[0], 1);

        let paymentCycle = await paymentPool.numPaymentCycles();
        paymentCycle = paymentCycle.toNumber();
        let updatedProof = updatedMerkleTree.hexProofForPayee(payee, paymentCycle);
        await paymentPool.submitPayeeMerkleRoot(updatedRoot);

        let withdrawalAmount = 8;
        await paymentPool.withdraw(8, updatedProof, { from: payee });
        await assertRevert(async () => paymentPool.withdraw(4, proof, { from: payee })); // this proof only permits 10 - 8 tokens to be withdrawn, even though the newer proof permits 12 - 8 tokens to be withdrawn

        let payeeBalance = await token.balanceOf(payee);
        let poolBalance = await token.balanceOf(paymentPool.address);
        let withdrawals = await paymentPool.withdrawals(payee);
        let proofBalance = await paymentPool.balanceForProof(proof, { from: payee });
        let udpatedProofBalance = await paymentPool.balanceForProof(updatedProof, { from: payee });

        assert.equal(payeeBalance.toNumber(), withdrawalAmount, 'the payee balance is correct');
        assert.equal(poolBalance.toNumber(), paymentPoolBalance - withdrawalAmount, 'the pool balance is correct');
        assert.equal(withdrawals.toNumber(), withdrawalAmount, 'the withdrawals amount is correct');
        assert.equal(proofBalance.toNumber(), paymentAmount - withdrawalAmount, 'the proof balance is correct');
        assert.equal(udpatedProofBalance.toNumber(), updatedPaymentAmount - withdrawalAmount, 'the updated proof balance is correct');
      });
    });
  });
});

