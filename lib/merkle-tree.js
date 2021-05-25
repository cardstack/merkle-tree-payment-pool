import { bufferToHex, toBuffer, setLengthLeft, keccak256 } from 'ethereumjs-util';
import { soliditySha3, hexToBytes} from 'web3-utils'


export default class MerkleTree {
  constructor (elements) {
    // Filter empty strings and hash elements
    this.elements = elements.filter(el => el).map(el => this.sha3(el));

    // Deduplicate elements
    this.elements = this.bufDedup(this.elements);
    // Sort elements
    this.elements.sort(Buffer.compare);

    // Create layers
    this.layers = this.getLayers(this.elements);
  }

  getLayers (elements) {
    if (elements.length === 0) {
      return [['']];
    }

    const layers = [];
    layers.push(elements);

    // Get next layer until we reach the root
    while (layers[layers.length - 1].length > 1) {
      layers.push(this.getNextLayer(layers[layers.length - 1]));
    }

    return layers;
  }
  getNextLayer (elements) {
    return elements.reduce((layer, el, idx, arr) => {
      if (idx % 2 === 0) {
        // Hash the current element with its pair element
        layer.push(this.combinedHash(el, arr[idx + 1]));
      }

      return layer;
    }, []);
  }

  combinedHash(first,second ) {
    if (!first) { return second; }
    if (!second) { return first; }
    return keccak256(this.sortAndConcat(first,second)) // Identical to: Buffer.from(hexToBytes(soliditySha3({t: 'bytes', v: this.sortAndConcat(first,second).toString("hex")})))
  }

  getRoot () {
    return this.layers[this.layers.length - 1][0];
  }

  getHexRoot () {
    return bufferToHex(this.getRoot());
  }

  getProof (el, prefix) {
    let idx = this.bufIndexOf(el, this.elements);

    if (idx === -1) {
      throw new Error('Element does not exist in Merkle tree');
    }

    let proof = this.layers.reduce((proof, layer) => {
      const pairElement = this.getPairElement(idx, layer);

      if (pairElement) {
        proof.push(pairElement);
      }

      idx = Math.floor(idx / 2);

      return proof;
    }, []);

    if (prefix) {
      if (!Array.isArray(prefix)) {
        prefix = [ prefix ];
      }
      prefix = prefix.map(item => setLengthLeft(toBuffer(item), 32));
      proof = prefix.concat(proof);
    }

    return proof;
  }

  getHexProof (el, prefix) {
    const proof = this.getProof(el, prefix);

    return this.bufArrToHex(proof);
  }

  getPairElement (idx, layer) {
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

    if (pairIdx < layer.length) {
      return layer[pairIdx];
    } else {
      return null;
    }
  }

  bufIndexOf (el, arr) {
    let hash;

    // Convert element to 32 byte hash if it is not one already
    if (el.length !== 32 || !Buffer.isBuffer(el)) {
      hash = this.sha3(el);
    } else {
      hash = el;
    }

    for (let i = 0; i < arr.length; i++) {
      if (hash.equals(arr[i])) {
        return i;
      }
    }

    return -1;
  }

  bufDedup (elements) {
    return elements.filter((el, idx) => {
      return this.bufIndexOf(el, elements) === idx;
    });
  }

  bufArrToHex (arr) {
    if (arr.some(el => !Buffer.isBuffer(el))) {
      throw new Error('Array is not an array of buffers');
    }

    return '0x' + arr.map(el => el.toString('hex')).join('');
  }

  sortAndConcat (...args) {
    return Buffer.concat([...args].sort(Buffer.compare));
  }
   
  sha3 (node) {
    return Buffer.from(hexToBytes(soliditySha3({t: 'address', v: node["payee"]}, {t: "uint256", v: node["amount"] })))
  }
}
