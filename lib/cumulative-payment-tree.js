import MerkleTree from './merkle-tree';
import { bufferToHex, zeros } from 'ethereumjs-util';
import _ from 'lodash/lodash';

/*
 * `paymentList` is an array of objects that have a property `payee` to hold the
 * payee's Ethereum address and `amount` to hold the cumulative amount of tokens
 * paid to the payee across all payment cycles:
 *
 * [{
 *   payee: "0x627306090abab3a6e1400e9345bc60c78a8bef57",
 *   amount: 20
 * },{
 *   payee: "0xf17f52151ebef6c7334fad080c5704d77216b732",
 *   amount: 12
 * },{
 *   payee: "0xc5fdf4076b8f3a5357c5e395ab970b5b54098fef",
 *   amount: 15
 * }]
 *
 */

export default class CumulativePaymentTree extends MerkleTree {
  constructor(paymentList) {
    let filteredPaymentList = paymentList.filter(payment => payment.payee && payment.amount);
    let groupedPayees = _.groupBy(filteredPaymentList, payment => payment.payee);
    let reducedPaymentList = Object.keys(groupedPayees).map(payee => {
      let payments = groupedPayees[payee];
      let amount = _.reduce(payments, (sum, payment) => sum + payment.amount, 0);
      return { payee, amount };
    });
    let paymentNodes = reducedPaymentList.map(payment => payment.payee + ',' + payment.amount);

    super(paymentNodes);

    this.paymentNodes = paymentNodes;
    this.paymentList = reducedPaymentList;
  }

  amountForPayee(payee) {
    let payment = _.find(this.paymentList, { payee });
    if (!payment) { return 0; }

    return payment.amount;
  }

  hexProofForPayee(payee, paymentCycle) {
    let leaf = this.paymentNodes.find(paymentNode => paymentNode.indexOf(payee) > -1);
    if (!leaf) { return bufferToHex(zeros(32)); }

    return this.getHexProof(leaf, [ paymentCycle, this.amountForPayee(payee) ]);
  }
}
