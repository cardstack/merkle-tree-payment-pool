export const assertRevert = async function (block, msg) {
  let err;
  try {
    await block();
  } catch (e) {
    err = e;
  }

  if (!err) { return assert.isOk(err, "Revert should have been fired, instead no error fired"); }

  if (msg) {
    return assert.isOk(err.message.search(msg) > -1,
                       msg + " should have been fired, instead:" + err.message);
  } else {
    return assert.isOk(err.message.search("revert") > -1,
                       "revert should have been fired, instead:" + err.message);
  }
};


export const advanceBlock = (web3) => { //passes local ganache web3
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_mine',
      id: new Date().getTime()
    }, (err, result) => {
      if (err) { return reject(err) }
      const newBlockHash = web3.eth.getBlock('latest').hash

      return resolve(newBlockHash)
    })
 })
}
