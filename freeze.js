// This script demonstrates freezing funds in an unspent transaction output
// (UTXO) on the blockchain in a way such that the funds cannot be spent until
// at least a certain block height is reached.
// To do this, first, funds are sent from an existing UTXO to the UTXO that
// will be frozen. The frozen output will be a P2SH output based on a redeem
// script that uses the CHECKLOCKTIMEVERIFY (CLTV) opcode.
// For details, see
// https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki#freezing-funds

'use strict';

var bitcore = require('bitcore');

bitcore.Networks.defaultNetwork = bitcore.Networks.testnet;

var LOCK_UNTIL_BLOCK = 484296; // pick a block height above the current tip

// use a compressed format brain wallet key for testing.
// to use the uncompressed format, don't convert the sha256 buffer to a string.
// do not use brain wallets for production or to store value that you do not
// intend to lose https://en.bitcoin.it/wiki/Brainwallet

// testnet address mmAzFHun2eGXrsMsfGh7Skqu9FFmQ399mA
// https://testnet3.toshi.io/api/v0/addresses/mmAzFHun2eGXrsMsfGh7Skqu9FFmQ399mA/transactions
var privKey = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('bip65 testnet demo cltv freeze', 'utf8')).toString('hex'));

var redeemScript = bitcore.Script.empty()
  // useful generic way to get the minimal encoding of the locktime stack argument
  .add(bitcore.crypto.BN.fromNumber(LOCK_UNTIL_BLOCK).toBuffer({endian: 'little'}))
  .add('OP_NOP2').add('OP_DROP')
  .add(bitcore.Script.buildPublicKeyHashOut(privKey.toAddress()));

// https://testnet3.toshi.io/api/v0/addresses/2Mxvf1GiDH687oC4FUnZFKeRbihb2d6FCBa/transactions
var p2shAddress = bitcore.Address.payingTo(redeemScript);

var freezeTransaction = new bitcore.Transaction().from({
  txid: 'f106249e80307baee9f17226974b77c965941f9cd24d16e885ec235c80331ce4', // tran id of an utxo associated with the privKey's address
  vout: 0,                                                                  // output index of the utxo within the transaction with id = txid
  scriptPubKey: '76a9143e0a10b34f195b8b53c39d38b38fc6ec9bb1f6fe88ac',       // scriptPubKey of the utxo txid[vout]
  satoshis: 170000000,                                                      // value of the utxo txid[vout]
})
.to(p2shAddress, 169900000)                                                 // pay a generous miner fee and put the rest into an output for p2shAddress
.sign(privKey);

var spendTransaction = new bitcore.Transaction().from({
  txid: freezeTransaction.id,
  vout: 0,
  scriptPubKey: redeemScript.toScriptHashOut(),
  satoshis: 169900000,
})
.to(privKey.toAddress(), 169800000) // send back to the original address for ease of testing only
.lockUntilBlockHeight(LOCK_UNTIL_BLOCK); // CLTV requires the transaction nLockTime to be >= the stack argument in the redeem script
spendTransaction.inputs[0].sequenceNumber = 0; // the CLTV opcode requires that the input's sequence number not be finalized

var signature = bitcore.Transaction.sighash.sign(spendTransaction, privKey, bitcore.crypto.Signature.SIGHASH_ALL, 0, redeemScript);

// append the left-zero-padded SIGHASH value to the end of the signature
signature = Buffer.concat([
  signature.toBuffer(),
  new Buffer((0x100 + bitcore.crypto.Signature.SIGHASH_ALL).toString(16).slice(-2), 'hex')
]);

// setup the scriptSig of the spending transaction to spend the p2sh-cltv-p2pkh redeem script
spendTransaction.inputs[0].setScript(
  bitcore.Script.empty()
  .add(signature)
  .add(privKey.toPublicKey().toBuffer())
  .add(redeemScript.toBuffer())
);

console.log('from address : ' + privKey.toAddress());
console.log('p2sh address : ' + p2shAddress);
console.log('redeem script: ' + redeemScript);
console.log();
console.log('freezeTransaction (' + freezeTransaction.id + '): ' + freezeTransaction.serialize(true));
console.log();
console.log('spendTransaction (' + spendTransaction.id + '): ' + spendTransaction.serialize(true));
console.log();

