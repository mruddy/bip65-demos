// This script demonstrates freezing funds in an unspent transaction output
// (UTXO) on the blockchain in a way such that the funds cannot be spent until
// at least a certain block height is reached.
// To do this, first, funds are sent from an existing UTXO to the UTXO that
// will be frozen. The frozen output will be a P2SH output based on a redeem
// script that uses the CHECKLOCKTIMEVERIFY (CLTV) opcode.
// For details, see
// https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki#freezing-funds
// This script assumes that it is being used in conjunction with a fresh regtest
// environment that was setup with the accompanying regtest-freeze.sh script.

'use strict';

var LOCK_UNTIL_BLOCK = 150; // pick a block height above the current tip

var argparse = require('argparse');
var bitcore = require('bitcore');

bitcore.Networks.defaultNetwork = bitcore.Networks.testnet; // works for regtest

var parser = new argparse.ArgumentParser({
  description: 'freeze',
  addHelp: true,
});

parser.addArgument(['--txid'], {
  required: true,
  help: 'transaction id of an unspent output',
});

parser.addArgument(['--vout'], {
  required: true,
  help: 'vout of an unspent output',
});

parser.addArgument(['--scriptPubKey'], {
  required: true,
  help: 'scriptPubKey of an unspent output',
});

parser.addArgument(['--satoshis'], {
  required: true,
  help: 'value of an unspent output (given in satoshis)',
});

var args = parser.parseArgs();

// use a compressed format brain wallet key for ease of testing. doing so yields
// fixed addresses.

// address = mkESjLZW66TmHhiFX8MCaBjrhZ543PPh9a
// privKey WIF = cP3voGKJHVSrUsEdrj8HnrpwLNgNngrgijMyyyRowRo15ZattbHm
var privKey = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('alice', 'utf8')).toString('hex'));

var redeemScript = bitcore.Script.empty()
  // useful generic way to get the minimal encoding of the locktime stack argument
  .add(bitcore.crypto.BN.fromNumber(LOCK_UNTIL_BLOCK).toScriptNumBuffer())
  .add('OP_NOP2').add('OP_DROP')
  .add(bitcore.Script.buildPublicKeyHashOut(privKey.toAddress()));

// address = 2NAiPrBTcYyedveW7ydDuVyxGGeho3pK3C7
var p2shAddress = bitcore.Address.payingTo(redeemScript);

var freezeTransaction = new bitcore.Transaction().from({
  txid: args.txid, // tran id of an utxo associated with the privKey's address
  vout: Number(args.vout), // output index of the utxo within the transaction with id = txid
  scriptPubKey: args.scriptPubKey, // scriptPubKey of the utxo txid[vout]
  satoshis: Number(args.satoshis), // value of the utxo txid[vout]
})
.to(p2shAddress, Number(args.satoshis) - 100000)
.sign(privKey);

var spendTransaction = new bitcore.Transaction().from({
  txid: freezeTransaction.id,
  vout: 0,
  scriptPubKey: redeemScript.toScriptHashOut(),
  satoshis: Number(args.satoshis) - 100000,
})
// send back to the original address for ease of testing only
.to(privKey.toAddress(), Number(args.satoshis) - 200000)
// CLTV requires the transaction nLockTime to be >= the stack argument in the redeem script
.lockUntilBlockHeight(LOCK_UNTIL_BLOCK);
// the CLTV opcode requires that the input's sequence number not be finalized
spendTransaction.inputs[0].sequenceNumber = 0;

var signature = bitcore.Transaction.sighash.sign(
  spendTransaction,
  privKey,
  bitcore.crypto.Signature.SIGHASH_ALL,
  0,
  redeemScript
);

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

var result = {
  fromAddress: privKey.toAddress().toString(),
  p2shAddress: p2shAddress.toString(),
  redeemScript: redeemScript.toString(),
  freezeTransaction: {
    txid: freezeTransaction.id,
    raw: freezeTransaction.serialize(true),
  },
  spendTransaction: {
    txid: spendTransaction.id,
    raw: spendTransaction.serialize(true),
  },
};

console.log(JSON.stringify(result, null, 2));
