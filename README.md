# Merkle-Tree Payment Pool

This is an implementation of a Merkle Tree based payment pool in Solidity for ERC-20 tokens. This project was inspired by this Ethereum research post: https://ethresear.ch/t/pooled-payments-scaling-solution-for-one-to-many-transactions/590. A longer description around the motivations behind this project is available here: ***TODO: Add medium post URL here***. This project includes a payment pool smart contract that leverages Merkle Trees. Also included is a JS lib to create Merkle Trees, derive Merkle roots, and Merkle proofs that have metadata attached to the proofs that aid this smart contract in managing the payment pool. 

The key feature behind this payment pool, is that by using a Merkle tree to represent the list of payees and their payment amounts, we can specify arbitrarily large amounts of payees and their payment amounts simply by specifying a 32 byte Merkle root of a Merkle tree that represents the payee list. Payees can then withdraw their payments by providing the payment pool with the Merkle proof associated with the payee. This solution does rely on an off-chain mechanism to derive the Merkle tree for each payment cycle, as well as to publish the Merkle proofs for the payees in manner that payees can easily discover their proofs (e.g. IPFS).

## How It Works
The way this payment pool works is that for each *payment cycle* the contract owner derives a Merkle tree for a list of payees that recieve payment during the payment cycle. Each payment cycle is numbered, with the first payment cycle start at `1` when the contract is deployed. To look up the current payment cycle use the contract function `paymentPool.numPaymentCycles()`. This project includes a javascript abstraction for a payee-list based Merkle tree, `CumulativePaymentTree`, that you can use to manage the Merkle tree for the list of payees for each payment cycle. 

Deploy the `PaymentPool` contract. 

Assemble the list of payees and their cumulative payment amounts. The payment amounts need to be cumulative across all the payment cycles in order for the payment pool to calculate the current amount available to a payee for their provided proof. The cumulative amounts should never decrease in a subsequent payment cycle. The amounts represent the amounts in the ERC-20 token that is specified when the `PaymentPool` contract is deployed.

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

Instantiate an instance of the `CumulativePaymentTree` class:
```js
let paymentTree = new CumulativePaymentTree(paymentList);
```
