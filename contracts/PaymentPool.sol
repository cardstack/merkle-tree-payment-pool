pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20.sol';
import 'zeppelin-solidity/contracts/token/SafeERC20.sol';
import 'zeppelin-solidity/contracts/MerkleProof.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';

contract PaymentPool is Ownable {

  using SafeMath for uint256;
  using SafeERC20 for ERC20;
  using MerkleProof for bytes;

  struct AnalyticsSolution {
    uint256 paymentCycleNumber;
    address[] payees;
    uint256[] amounts;
    address miner;
    bytes32 proof;
  }

  uint256 constant MIN_GAS_BAIL_THRESHOLD = 50000;

  ERC20 public token;
  uint256 public numPaymentCycles = 1;
  mapping(address => uint256) public miningStake;
  mapping(address => uint256) public withdrawals;
  mapping(uint256 => bytes32) public payeeRoots;

  //TODO DELETE THIS
  bytes32 payeeRoot; 

  uint256 currentPaymentCycleStartBlock;

  event MiningStake(address indexed miner, uint256 amount);
  event PaymentCycleEnded(uint256 paymentCycle, uint256 startBlock, uint256 endBlock);
  event PayeeMerkleRoot(bytes32 root, uint256 paymentCycle);
  event PayeeWithdraw(address indexed payee, uint256 amount);

  event DebugString(string msg, string value);
  event DebugNumber(string msg, uint256 value);
  event DebugBytes1(string msg, bytes1 value);
  event DebugBytes32(string msg, bytes32 value);
  event DebugBytes32Array(string msg, bytes32[] value);
  event DebugBytes(string msg, bytes value);

  function PaymentPool(ERC20 _token) public {
    token = _token;
    currentPaymentCycleStartBlock = block.number;
  }

  // miner needs to first perform an ERC-20 approve of the mining pool so that we can perform a transferFrom of the token
  function postMiningStake(uint256 amount) public returns (bool) {
    require(token.allowance(msg.sender, this) >= amount);

    token.safeTransferFrom(msg.sender, this, amount);

    miningStake[msg.sender] = amount;

    MiningStake(msg.sender, amount);

    return true;
  }

  // TODO move this to public for Tally. For general purpose PaymentPool, it doesn't make sense to
  // decouple this from the submission of a merkle root
  function startNewPaymentCycle() internal onlyOwner returns(bool) {
    require(block.number > currentPaymentCycleStartBlock);

    PaymentCycleEnded(numPaymentCycles, currentPaymentCycleStartBlock, block.number);

    numPaymentCycles = numPaymentCycles.add(1);
    currentPaymentCycleStartBlock = block.number.add(1);

    return true;
  }

  //TODO this will eventually be the responsibiliy of the miners
  function submitPayeeMerkleRoot(bytes32 payeeRoot) public onlyOwner returns(bool) {
    payeeRoots[numPaymentCycles] = payeeRoot;

    PayeeMerkleRoot(payeeRoot, numPaymentCycles);

    startNewPaymentCycle();

    return true;
  }

  function balanceForProofWithAddress(address _address, bytes proof) public view returns(uint256) {
    bytes32[] memory meta;
    bytes memory _proof;

    (meta, _proof) = splitIntoBytes32(proof, 2);
    if (meta.length != 2) { return 0; }

    uint256 paymentCycleNumber = uint256(meta[0]);
    uint256 cumulativeAmount = uint256(meta[1]);
    if (payeeRoots[paymentCycleNumber] == 0x0) { return 0; }

    bytes32 leaf = keccak256('0x',
                             addressToString(_address),
                             ',',
                             uintToString(cumulativeAmount));
    if (_proof.verifyProof(payeeRoots[paymentCycleNumber], leaf)) {
      return cumulativeAmount.sub(withdrawals[_address]);
    } else {
      return 0;
    }
  }

  function balanceForProof(bytes proof) public view returns(uint256) {
    return balanceForProofWithAddress(msg.sender, proof);
  }

  function withdraw(uint256 amount, bytes proof) public returns(bool) {
    require(amount > 0);
    require(token.balanceOf(this) >= amount);

    uint256 balance = balanceForProof(proof);
    require(balance >= amount);

    withdrawals[msg.sender] = withdrawals[msg.sender].add(amount);
    token.safeTransfer(msg.sender, amount);

    PayeeWithdraw(msg.sender, amount);
  }

  //TODO move to lib
  function splitIntoBytes32(bytes byteArray, uint256 numBytes32) internal pure returns (bytes32[] memory bytes32Array,
                                                                                        bytes memory remainder) {
    if ( byteArray.length % 32 != 0 ||
         byteArray.length < numBytes32.mul(32) ||
         byteArray.length.div(32) > 50) { // Arbitrarily limiting this function to an array of 50 bytes32's to conserve gas

      bytes32Array = new bytes32[](0);
      remainder = new bytes(0);
      return;
    }

    bytes32Array = new bytes32[](numBytes32);
    bytes32 _bytes32;
    for (uint256 k = 32; k <= numBytes32 * 32; k = k.add(32)) {
      assembly {
        _bytes32 := mload(add(byteArray, k))
      }
      bytes32Array[k.sub(32).div(32)] = _bytes32;
    }

    uint256 newArraySize = byteArray.length.div(32).sub(numBytes32).mul(32);
    remainder = new bytes(newArraySize);

    bytes1 _bytes1;
    uint256 offset = numBytes32.sub(1).mul(32).add(64);
    for (uint256 i = offset; i < newArraySize.add(offset); i = i.add(1)) {
      assembly {
        _bytes1 := mload(add(byteArray, i))
      }
      remainder[i.sub(offset)] = _bytes1;
    }
  }

  //TODO use SafeMath and move to lib
  function addressToString(address x) internal pure returns (string) {
    bytes memory s = new bytes(40);
    for (uint256 i = 0; i < 20; i++) {
      byte b = byte(uint8(uint256(x) / (2**(8*(19 - i)))));
      byte hi = byte(uint8(b) / 16);
      byte lo = byte(uint8(b) - 16 * uint8(hi));
      s[2*i] = char(hi);
      s[2*i+1] = char(lo);
    }
    return string(s);
  }

  //TODO use SafeMath and move to lib
  function char(byte b) internal pure returns (byte c) {
    if (b < 10) return byte(uint8(b) + 0x30);
    else return byte(uint8(b) + 0x57);
  }

  //TODO use SafeMath and move to lib
  function uintToString(uint256 v) internal pure returns (string) {
    uint256 maxlength = 80; // 2^256 = 1.157920892E77
    bytes memory reversed = new bytes(maxlength);
    uint256 i = 0;
    while (v != 0) {
      uint256 remainder = v % 10;
      v = v / 10;
      reversed[i++] = byte(48 + remainder);
    }
    bytes memory s = new bytes(i);
    for (uint256 j = 0; j < i; j++) {
      s[j] = reversed[i - 1 - j];
    }
    return string(s);
  }
}
