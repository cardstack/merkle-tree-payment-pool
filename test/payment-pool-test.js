const PaymentPool = artifacts.require('./PaymentPool.sol');
const Token = artifacts.require('./Token.sol');

contract('PaymentPool', function(accounts) {
  let paymentPool;
  let token;
  let miner = accounts[1];
  let payees = [
    accounts[1],
    accounts[2],
    accounts[3],
    accounts[4],
    accounts[5],
    accounts[6],
    accounts[7],
    accounts[8],
    accounts[9]
  ];

  let amounts = [
    10,
    12,
    2,
    1,
    32,
    10,
    9,
    9,
    2
  ];

  describe("ledger", function() {
    beforeEach(async function() {
      token = await Token.new();
      paymentPool = await PaymentPool.new(token.address);
      await token.mint(miner, 100);
      await token.approve(paymentPool.address, 100, { from: miner });
    });

    xit("can iterate thru payees", async function() {
      let txn = await paymentPool.submitAnalytics(payees, amounts, {
        gas: 100000
      });

      let payeeIndex = await paymentPool.payeeIndex();

      console.log(JSON.stringify(txn, null, 2));
      console.log("PAYEE LOGS:", txn.logs.length);
      console.log("PAYEE INDEX:", payeeIndex.toNumber());

      txn = await paymentPool.submitAnalytics(payees, amounts, {
        gas: 100000
      });

      payeeIndex = await paymentPool.payeeIndex();

      console.log(JSON.stringify(txn, null, 2));
      console.log("PAYEE LOGS:", txn.logs.length);
      console.log("PAYEE INDEX:", payeeIndex.toNumber());
    });

    it("can allow a miner to post stake with the payment pool", async function() {
      let txn = await paymentPool.postMiningStake(10, { from: miner });
      assert.equal(txn.logs.length, 1, "the number of events is correct");

      let event = txn.logs[0];
      assert.equal(event.event, "MiningStake", "the event type is correct");
      assert.equal(event.args.miner, miner, "the miner is correct");
      assert.equal(event.args.amount.toNumber(), 10, "the amount staked is correct");

      let stake = await paymentPool.miningStake(miner);

      assert.equal(stake.toNumber(), 10, "the mining stake is correct");
    });

    it("can store the analytics solution", async function() {
      await paymentPool.postMiningStake(10, { from: miner });
      await paymentPool.startNewEpoch();

      let proof = web3.toHex("my proof is pudding");
      let txn = await paymentPool.submitAnalytics(payees, amounts, proof, { from: accounts[1] });

      console.log(JSON.stringify(txn, null, 2));

      txn = await paymentPool.getSettlementQueueJob(0);

      console.log("ANALYTICS SOLUTION", JSON.stringify(txn, null, 2));
    });

    it.only("can disburse payments", async function() {
      let miningStake = 10;
      let paymentPoolBalance = 100;
      await token.mint(paymentPool.address, paymentPoolBalance);
      await paymentPool.postMiningStake(miningStake, { from: miner });
      await paymentPool.startNewEpoch();
      let proof = web3.toHex("my proof is pudding");
      await paymentPool.submitAnalytics(payees, amounts, proof, { from: accounts[1] });


      let txn = await paymentPool.disbursePayments();

      console.log(JSON.stringify(txn, null, 2));

      // note payees[1] is also the miner
      let balance = await token.balanceOf(payees[2]);
      assert.equal(balance.toNumber(), amounts[2], "balance is correct");

      balance = await token.balanceOf(payees[3]);
      assert.equal(balance.toNumber(), amounts[3], "balance is correct");

      balance = await token.balanceOf(payees[4]);
      assert.equal(balance.toNumber(), amounts[4], "balance is correct");

      balance = await token.balanceOf(payees[5]);
      assert.equal(balance.toNumber(), amounts[5], "balance is correct");

      balance = await token.balanceOf(payees[6]);
      assert.equal(balance.toNumber(), amounts[6], "balance is correct");

      balance = await token.balanceOf(payees[7]);
      assert.equal(balance.toNumber(), amounts[7], "balance is correct");

      balance = await token.balanceOf(payees[8]);
      assert.equal(balance.toNumber(), amounts[8], "balance is correct");

      let amountsTotal = amounts.reduce((total, amount) => total + amount);
      balance = await token.balanceOf(paymentPool.address);
      assert.equal(balance.toNumber(), paymentPoolBalance - amountsTotal + miningStake, "balance is correct");
    });

  });

});

