// This script demonstrates deposit and refund transactions for a CLTV style
// micropayment channel. Specifically, the transactions created will be for
// simulating the case where the receiver abandons the channel, thereby forcing
// the sender to wait until the deposit lock expires before receiving the
// deposit refund.
// For details, see
// https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki#micropayment-channels

'use strict';

var bitcore = require('bitcore');

bitcore.Networks.defaultNetwork = bitcore.Networks.testnet;

var LOCK_UNTIL_BLOCK = 484300; // pick a block height above the current tip

// use a compressed format brain wallet key for testing.
// to use the uncompressed format, don't convert the sha256 buffer to a string.
// do not use brain wallets for production or to store value that you do not
// intend to lose https://en.bitcoin.it/wiki/Brainwallet

// testnet address mqyhNBxMUahJ4SYtagqAt2cfgHvaQ7tr6Y
// https://testnet3.toshi.io/api/v0/addresses/mqyhNBxMUahJ4SYtagqAt2cfgHvaQ7tr6Y/transactions
var senderKey = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('bip65 testnet demo cltv refund sender', 'utf8')).toString('hex'));

// testnet address mxSVRuwXmb4PDGNszEirzWjt2XGcoS2crG
// https://testnet3.toshi.io/api/v0/addresses/mxSVRuwXmb4PDGNszEirzWjt2XGcoS2crG/transactions
var receiverKey = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('bip65 testnet demo cltv refund receiver', 'utf8')).toString('hex'));

var redeemScript = bitcore.Script.empty()
  .add('OP_IF')
    .add(receiverKey.toPublicKey().toBuffer()).add('OP_CHECKSIGVERIFY')
  .add('OP_ELSE')
    // useful generic way to get the minimal encoding of the locktime stack argument
    .add(bitcore.crypto.BN.fromNumber(LOCK_UNTIL_BLOCK).toScriptNumBuffer())
    .add('OP_NOP2').add('OP_DROP')
  .add('OP_ENDIF')
  .add(senderKey.toPublicKey().toBuffer()).add('OP_CHECKSIG');

// https://testnet3.toshi.io/api/v0/addresses/2NAQ8BEdSBGVRbM2LLNxaFjermNm4rG6biF/transactions
var p2shAddress = bitcore.Address.payingTo(redeemScript);

var depositTransaction = new bitcore.Transaction().from({
  txid: '31c7b8eed66e78db9fd45c48cfbf1707779a025ab38b6f24dad38a92d3b61990', // tran id of an utxo associated with the senderKey's address
  vout: 0,                                                                  // output index of the utxo within the transaction with id = txid
  scriptPubKey: '76a91472c006e6c3edd2c7be6b23950b3efffff74efa8788ac',       // scriptPubKey of the utxo txid[vout]
  satoshis: 160000000,                                                      // value of the utxo txid[vout]
})
.to(p2shAddress, 159900000)                                                 // pay a generous miner fee and put the rest into an output for p2shAddress
.sign(senderKey);

var refundTransaction = new bitcore.Transaction().from({
  txid: depositTransaction.id,
  vout: 0,
  scriptPubKey: redeemScript.toScriptHashOut(),
  satoshis: 159900000,
})
.to(senderKey.toAddress(), 159800000) // send back to the original address for ease of testing only
.lockUntilBlockHeight(LOCK_UNTIL_BLOCK); // CLTV requires the transaction nLockTime to be >= the stack argument in the redeem script
refundTransaction.inputs[0].sequenceNumber = 0; // the CLTV opcode requires that the input's sequence number not be finalized

var signature = bitcore.Transaction.sighash.sign(refundTransaction, senderKey, bitcore.crypto.Signature.SIGHASH_ALL, 0, redeemScript);
signature.nhashtype = bitcore.crypto.Signature.SIGHASH_ALL;

// setup the scriptSig of the spending transaction to spend the p2sh-cltv-p2pkh redeem script
refundTransaction.inputs[0].setScript(
  bitcore.Script.empty()
  .add(signature.toTxFormat())
  .add('OP_FALSE') // choose the time-delayed refund code path
  .add(redeemScript.toBuffer())
);

console.log('sender address  : ' + senderKey.toAddress());
console.log('receiver address: ' + receiverKey.toAddress());
console.log('p2sh address    : ' + p2shAddress);
console.log('redeem script   : ' + redeemScript);
console.log();
console.log('depositTransaction (' + depositTransaction.id + '): ' + depositTransaction.serialize(true));
console.log();
console.log('refundTransaction (' + refundTransaction.id + '): ' + refundTransaction.serialize(true));
console.log();

