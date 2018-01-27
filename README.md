# Merkle-Tree Payment Pool

This is an implementation of a Merkle Tree based payment pool in Solidity for ERC-20 tokens. This project was inspired by this Ethereum research post: https://ethresear.ch/t/pooled-payments-scaling-solution-for-one-to-many-transactions/590. A longer description around the motivations behind this project is available here: ***TODO: Add medium post URL here***. This project includes a payment pool smart contract that leverages Merkle Trees. Also included is a JS lib to create Merkle Trees, derive Merkle roots, and Merkle proofs that have metadata attached to the proofs that aid this smart contract in managing the payment pool. 

The key feature behind this payment pool, is that by using a Merkle tree to represent the list of payees and their payment amounts, we can specify arbitrarily large amounts of payees and their payment amounts simply by specifying a 32 byte Merkle root of a Merkle tree that represents the payee list. Payees can then withdraw their payments by providing the payment pool with the Merkle proof associated with the payee. This solution does rely on an off-chain mechanism to derive the Merkle tree for each payment cycle, as well as to publish the Merkle proofs for the payees in manner that payees can easily discover their proofs (e.g. IPFS).

## Prerequisites
* Node 7.6 or greater
* Yarn

## Setting up
1. run `yarn install` within the project
2. run `npm test` to run the tests

## How It Works
The way this payment pool works is that for each *payment cycle* the contract owner derives a Merkle tree for a list of payees that recieve payment during the payment cycle. Each payment cycle is numbered, with the first payment cycle start at `1` when the contract is deployed. To look up the current payment cycle use the contract function `paymentPool.numPaymentCycles()`. This project includes a javascript abstraction for a payee-list based Merkle tree, `CumulativePaymentTree`, that you can use to manage the Merkle tree for the list of payees for each payment cycle. 

Link and deploy the `PaymentPool` contract specying whatever ERC-20 token will be governed by the payment pool. From the tests this looks like the following (a truffle migration script would follow a similar approach):
```js
const PaymentPool = artifacts.require('./PaymentPool.sol');
const MerkleProofLib = artifacts.require('MerkleProof.sol'); // From open zeppelin
const Token = artifacts.require('./Token.sol'); // This is just a sample ERC-20 token
 
let merkleProofLib = await MerkleProofLib.new();
let token = await Token.new();
PaymentPool.link('MerkleProof', merkleProofLib.address);
   
await PaymentPool.new(token.address);
```

Assemble the list of payees and their cumulative payment amounts. The payment amounts need to be cumulative across all the payment cycles in order for the payment pool to calculate the current amount available to a payee for their provided proof. The cumulative amounts should never decrease in subsequent payment cycles. The amounts represent the amounts in the ERC-20 token that is specified when the `PaymentPool` contract is deployed.

```js
let paymentList = [{
  payee: "0x627306090abab3a6e1400e9345bc60c78a8bef57",
  amount: 20
},{
  payee: "0xf17f52151ebef6c7334fad080c5704d77216b732",
  amount: 12
},{
  payee: "0xc5fdf4076b8f3a5357c5e395ab970b5b54098fef",
  amount: 15
}];
```


Instantiate an instance of the `CumulativePaymentTree` class with the payee list to build the Merkle tree:
```js
let paymentTree = new CumulativePaymentTree(paymentList);
```


Note the current payment cycle number by querying the `PaymentPool` contract:
```js
let paymentCycleNumber = await paymentPool.numPaymentCycles();
```


Retreive the root of the payment list's Merkle tree and submit to the `PaymentPool` contract. Note that submitting the Merkle root triggers the end of the current payment cycle, and a new cycle is started:
```js
let root = paymentTree.getHexRoot();
await paymentPool.submitPayeeMerkleRoot(root);
```


Retreive the Merkle proof for each payee in the payment list while providing the payment cycle number of the payment cycle that just ended. Then publish the Merkle proof off-chain for each payee in a place that is easily accessible, like IPFS.

It is probably a good idea to organize the published proofs by payment cycle number for each payee, as the payee will generally want to use the latest proof (to retrieve the most token). But an older proof can be used too for retrieving tokens, provided all the tokens haven't already been withdrawn using an older proof. For extra credit, perhaps add a link to a dApp that can display the available balance for each payee's proof. 

```js
// `paymentCycleNumber` is set to the paymentCycle that ended when the root was submitted
paymentList.forEach(({ payee }) => {
  let proof = paymentTree.hexProofForPayee(payee, paymentCycle);
  console.log(`Payee ${payee} proof is: ${proof}`);
});
```


A payee can view the balance the is available to be withdrawn from the payment pool using their proof by calling the `PaymentPool` contract:
```js
let balance = await paymentPool.balanceForProofWithAddress(payeeAddress, proof);
```


A payee can then withdraw tokens from the payment pool using their proof by calling the `PaymentPool` contract. A payee is allowed to withdraw any amount up to the amount allowed by the proof. The payees' withdrawals are tracked by the payment pool, such that a payee cannot withdraw more tokens than they allotted from the payment pool:
```js
await paymentPool.withdraw(15, proof); // withdraw 15 tokens from the payment pool
```


Feel free to checkout the tests for more examples.
