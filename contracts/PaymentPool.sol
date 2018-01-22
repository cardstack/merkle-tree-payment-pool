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

  uint256 currentEpochStartBlock;
  bytes32 payeeRoot;

  event MiningStake(address indexed miner, uint256 amount);
  event EpochEnded(uint256 epochNumber, uint256 startBlock, uint256 endBlock);
  event PayeeMerkleRoot(bytes32 root /*, uint256 epochNumber*/);
  event PayeeWithdraw(address indexed payee, uint256 amount);

  event DebugString(string msg, string value);
  event DebugNumber(string msg, uint256 value);
  event DebugBytes32(string msg, bytes32 value);

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

  function withdraw(uint256 amount, bytes proof) public returns(bool) {
    require(amount > 0);
    bytes32 leaf = keccak256('0x',
                             addressToString(msg.sender),
                             ',',
                             uintToString(amount));
    require(proof.verifyProof(payeeRoot, leaf));

    token.safeTransfer(msg.sender, amount);

    PayeeWithdraw(msg.sender, amount);
  }

  //TODO use SafeMath
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

  //TODO use SafeMath
  function char(byte b) internal pure returns (byte c) {
    if (b < 10) return byte(uint8(b) + 0x30);
    else return byte(uint8(b) + 0x57);
  }

  //TODO use SafeMath
  function uintToString(uint256 v) internal pure returns (string) {
    uint256 maxlength = 100;
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
