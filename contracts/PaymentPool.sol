pragma solidity 0.5.16;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/cryptography/MerkleProof.sol';
import '@openzeppelin/contracts/ownership/Ownable.sol';

contract PaymentPool is Ownable {

  using SafeMath for uint256;
  using SafeERC20 for ERC20;
  using MerkleProof for bytes32[];

  ERC20 public token;
  uint256 public numPaymentCycles = 1;
  mapping(address => uint256) public withdrawals;

  mapping(uint256 => bytes32) payeeRoots;
  uint256 currentPaymentCycleStartBlock;

  event PaymentCycleEnded(uint256 paymentCycle, uint256 startBlock, uint256 endBlock);
  event PayeeWithdraw(address indexed payee, uint256 amount);

  constructor (ERC20 _token) public {
    token = _token;
    currentPaymentCycleStartBlock = block.number;
  }

  function startNewPaymentCycle() internal onlyOwner returns(bool) {
    require(block.number > currentPaymentCycleStartBlock);

    emit PaymentCycleEnded(numPaymentCycles, currentPaymentCycleStartBlock, block.number);

    numPaymentCycles = numPaymentCycles.add(1);
    currentPaymentCycleStartBlock = block.number.add(1);

    return true;
  }

  function submitPayeeMerkleRoot(bytes32 payeeRoot) public onlyOwner returns(bool) {
    payeeRoots[numPaymentCycles] = payeeRoot;

    startNewPaymentCycle();

    return true;
  }

  function balanceForProofWithAddress(address _address, bytes memory proof) public view returns(uint256) {
    bytes32[] memory meta;
    bytes32[] memory _proof;

    (meta, _proof) = splitIntoBytes32(proof, 2);
    if (meta.length != 2) { return 0; }

    uint256 paymentCycleNumber = uint256(meta[0]);
    uint256 cumulativeAmount = uint256(meta[1]);
    if (payeeRoots[paymentCycleNumber] == 0x0) { return 0; }

    bytes32 leaf = keccak256(
                             abi.encodePacked(
                                              '0x',
                                              addressToString(_address),
                                              ',',
                                              uintToString(cumulativeAmount)
                                              )
                             );
    if (withdrawals[_address] < cumulativeAmount &&
        _proof.verify(payeeRoots[paymentCycleNumber], leaf)) {
      return cumulativeAmount.sub(withdrawals[_address]);
    } else {
      return 0;
    }
  }


  function balanceForProof(bytes memory proof) public view returns(uint256) {
    return balanceForProofWithAddress(msg.sender, proof);
  }

  function withdraw(uint256 amount, bytes memory proof) public returns(bool) {
    require(amount > 0);
    require(token.balanceOf(address(this)) >= amount);

    uint256 balance = balanceForProof(proof);
    require(balance >= amount);

    withdrawals[msg.sender] = withdrawals[msg.sender].add(amount);
    token.safeTransfer(msg.sender, amount);

    emit PayeeWithdraw(msg.sender, amount);
  }


  function splitIntoBytes32(bytes memory byteArray, uint256 numBytes32) internal pure returns (bytes32[] memory bytes32Array,
                                                                                        bytes memory remainder) {
    if ( byteArray.length % 32 != 0 ||
         byteArray.length < numBytes32.mul(32) ||
         byteArray.length.div(32) > 50) { // Arbitrarily limiting this function to an array of 50 bytes32's to conserve gas

      bytes32Array = new bytes32[](0);
    }

    bytes32Array = new bytes32[](numBytes32);
    remainder = new bytes32[](byteArray.length.sub(64).div(32));
    bytes32 _bytes32;
    for (uint256 k = 32; k <= byteArray.length; k = k.add(32)) {
      assembly {
        _bytes32 := mload(add(byteArray, k))
      }
      if(k <= numBytes32*32){
        bytes32Array[k.sub(32).div(32)] = _bytes32;
      } else {
        remainder[k.sub(96).div(32)] = _bytes32;
      }
    }
  }

  //TODO use SafeMath and move to lib
  function addressToString(address x) internal pure returns (string memory) {
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
  function uintToString(uint256 v) internal pure returns (string memory) {
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
