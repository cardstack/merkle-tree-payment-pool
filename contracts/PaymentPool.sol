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
    uint256 epochNumber;
    address[] payees;
    uint256[] amounts;
    address miner;
    bytes32 proof;
  }

  uint256 constant MIN_GAS_BAIL_THRESHOLD = 50000;

  ERC20 public token;
  uint256 public numEpochs;
  mapping(address => uint256) public miningStake;
  mapping(address => uint256) public withdrawals;

  uint256 currentEpochStartBlock;
  bytes32 payeeRoot;

  event MiningStake(address indexed miner, uint256 amount);
  event EpochEnded(uint256 epochNumber, uint256 startBlock, uint256 endBlock);
  event PayeeMerkleRoot(bytes32 root /*, uint256 epochNumber*/);
  event PayeeWithdraw(address indexed payee, uint256 amount);

  event DebugString(string msg, string value);
  event DebugNumber(string msg, uint256 value);
  event DebugBytes1(string msg, bytes1 value);
  event DebugBytes32(string msg, bytes32 value);
  event DebugBytes(string msg, bytes value);

  function PaymentPool(ERC20 _token) public {
    token = _token;
    currentEpochStartBlock = block.number;
  }

  // miner needs to first perform an ERC-20 approve of the mining pool so that we can perform a transferFrom of the token
  function postMiningStake(uint256 amount) public returns (bool) {
    require(token.allowance(msg.sender, this) >= amount);

    token.safeTransferFrom(msg.sender, this, amount);

    miningStake[msg.sender] = amount;

    MiningStake(msg.sender, amount);

    return true;
  }

  function startNewEpoch() public onlyOwner returns(bool) {
    // TODO don't start new epoch if the n - 1 epoch is still unsolved
    // at most there can be 1 unsolved epoch
    require(block.number > currentEpochStartBlock);

    EpochEnded(numEpochs, currentEpochStartBlock, block.number);

    numEpochs = numEpochs.add(1);
    currentEpochStartBlock = block.number.add(1);

    return true;
  }

  //TODO this will eventually be the responsibiliy of the miners
  function submitPayeeMerkleRoot(bytes32 _payeeRoot) public onlyOwner returns(bool) {
    payeeRoot = _payeeRoot;

    PayeeMerkleRoot(_payeeRoot);

    return true;
  }

  function balanceForProofWithAddress(address _address, bytes proof) public view returns(uint256) {
    bytes32 cumulativeAmountBytes;
    bytes memory _proof;

    (cumulativeAmountBytes, _proof) = popBytes32FromBytes(proof);

    uint256 cumulativeAmount = uint256(cumulativeAmountBytes);

    bytes32 leaf = keccak256('0x',
                             addressToString(_address),
                             ',',
                             uintToString(cumulativeAmount));
    if (_proof.verifyProof(payeeRoot, leaf)) {
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
  function popBytes32FromBytes(bytes byteArray) internal pure returns (bytes32 firstElement, bytes memory trimmedArray) {
    require(byteArray.length % 32 == 0 &&
            byteArray.length > 32 &&
            byteArray.length % 32 <= 50); // Arbitrarily limiting this function to an array of 50 bytes32's to conserve gas

    assembly {
      firstElement := mload(add(byteArray, 32))
    }

    uint256 newArraySize = byteArray.length.div(32).sub(1).mul(32);
    trimmedArray = new bytes(newArraySize);

    bytes1 _bytes1;
    uint256 j = 0;
    for (uint256 i = 64; i < newArraySize.add(64); i = i.add(1)) {
      assembly {
        _bytes1 := mload(add(byteArray, i))
      }
      trimmedArray[j] = _bytes1;
      j = j.add(1);
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
