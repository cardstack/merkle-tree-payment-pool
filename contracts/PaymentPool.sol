pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20.sol';
import 'zeppelin-solidity/contracts/token/SafeERC20.sol';
import 'zeppelin-solidity/contracts/MerkleProof.sol';

contract PaymentPool {

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

  event Debug(string msg, uint256 value);

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

  function startNewEpoch() public returns(bool) {
    // TODO don't start new epoch if the n - 1 epoch is still unsolved
    // at most there can be 1 unsolved epoch
    require(block.number > currentEpochStartBlock);

    EpochEnded(numEpochs, currentEpochStartBlock, block.number);

    numEpochs = numEpochs.add(1);
    currentEpochStartBlock = block.number.add(1);

    return true;
  }

  function submitPayeeMerkleRoot(bytes32 _payeeRoot) public returns(bool) {
    payeeRoot = _payeeRoot;

    PayeeMerkleRoot(_payeeRoot);

    return true;
  }

}
