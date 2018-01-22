import MerkleTree from '../lib/merkle-tree';
import { sha3, bufferToHex } from 'ethereumjs-util';

const Demo = artifacts.require('./Test.sol');

contract('Demo', function(accounts) {
  describe("demo", function() {
    let demo;
    beforeEach(async function() {
      demo = await Demo.new();
    });

    it("can verify proof", async function() {
      let elements = [ "A", "B", "C", "D" ];
      let element = elements[0];
      let merkleTree = new MerkleTree(elements);
      let root = merkleTree.getHexRoot();
      let proof = merkleTree.getHexProof(element);
      let leaf = bufferToHex(sha3(element));

      let txn = await demo.validate(leaf, proof, root);

      console.log(JSON.stringify(txn, null, 2));

    });

  });

});

