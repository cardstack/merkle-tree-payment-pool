pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20.sol';
import 'zeppelin-solidity/contracts/token/SafeERC20.sol';

contract PaymentPool {

  using SafeMath for uint256;
  using SafeERC20 for ERC20;

  struct AnalyticsSolution {
    uint256 epochNumber;
    address[] payees;
    uint256[] amounts;
    address miner;
    bytes32 proof;
  }

  uint256 constant MIN_GAS_BAIL_THRESHOLD = 10000;

  ERC20 public token;
  uint256 public payeeIndex;
  uint256 public numEpochs;
  mapping(address => uint256) public miningStake;

  uint256 currentEpochStartBlock;
  uint256 settlementId;
  mapping(uint256 => AnalyticsSolution) settlementQueue;

  event ProcessPayee(address payee, uint256 amount);
  event EpochEnded(uint256 epochNumber, uint256 startBlock, uint256 endBlock);
  event AnalyticsSubmitted(uint256 epochNumber, address[] payees, uint256[] amounts, address miner, bytes32 proof);
  event MiningStake(address indexed miner, uint256 amount);

  event Debug(string msg, uint256 value);

  function PaymentPool(ERC20 _token) public {
    token = _token;
    currentEpochStartBlock = block.number;
  }

  // miner needs to first perform an ERC-20 approve of the mining pool so that we can perform a transferFrom of the token
  function postMiningStake(uint256 amount) public {
    require(token.allowance(msg.sender, this) >= amount);

    token.safeTransferFrom(msg.sender, this, amount);

    miningStake[msg.sender] = amount;

    MiningStake(msg.sender, amount);
  }

  function startNewEpoch() public  {
    // TODO don't start new epoch if the n - 1 epoch is still unsolved
    // at most there can be 1 unsolved epoch
    require(block.number > currentEpochStartBlock);

    EpochEnded(numEpochs, currentEpochStartBlock, block.number);

    numEpochs = numEpochs.add(1);
    currentEpochStartBlock = block.number.add(1);
  }

  // analytics submitted are for the n-1 epoch
  // idea: payment pool could govern a basket of tokens...
  function submitAnalytics(address[] payees, uint256[] amounts, bytes32 proof) public {
    // confirm proof? (could be very expensive)...
    // TODO need to cap the number of payees so we don't run out of gas updating the contract state
    // TODO confirm msg.sender is an approved miner for this epoch
    require(payees.length > 0);
    require(payees.length == amounts.length);

    settlementQueue[settlementId] = AnalyticsSolution({
      epochNumber: numEpochs.sub(1),
      payees: payees,
      amounts: amounts,
      miner: msg.sender,
      proof: proof
    });
    settlementId = settlementId.add(1);

    AnalyticsSubmitted(numEpochs.sub(1), payees, amounts, msg.sender, proof); // the amounts emitted are an array of hexidecimal in web3
  }

  function getSettlementQueueJob(uint256 _settlementId) public view returns (uint256 _epochNumber,
                                                                             address[] _payees,
                                                                             uint256[] _amounts,
                                                                             address _miner,
                                                                             bytes32 _proof) {
    AnalyticsSolution storage job = settlementQueue[_settlementId];
    _epochNumber = job.epochNumber;
    _payees = job.payees;
    _amounts = job.amounts;
    _miner = job.miner;
    _proof = job.proof;
  }

  // breaking out the function to dispurse payments from the pool as it will require
  // mulitple blocks to process
  function disbursePayments() public {
    // while (payeeIndex < payees.length && msg.gas > MIN_GAS_BAIL_THRESHOLD) {
    //   ProcessPayee(payees[payeeIndex], amounts[payeeIndex]);
    //   payeeIndex = payeeIndex.add(1);
    // }

    // // vv Everything below here needs to be able to run with MIN_GAS_BAIL_THRESHOLD budget vv
    // if (payeeIndex >= payees.length) {
    //   payeeIndex = 0;
    // }
  }
}
