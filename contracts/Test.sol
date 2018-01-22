pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/MerkleProof.sol';

contract Test {

  using MerkleProof for bytes;

  event Debug(string msg);

  function validate(bytes32 leaf, bytes proof, bytes32 root) public returns(bool) {
    require(proof.verifyProof(root, leaf));

    Debug("success!");
  }

}
