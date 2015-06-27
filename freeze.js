// This script demonstrates freezing funds in an unspent transaction output
// (UTXO) on the blockchain in a way such that the funds cannot be spent until
// at least a certain block height is reached.
// To do this, first, funds are sent from an existing UTXO to the UTXO that
// will be frozen. The frozen output will be a P2SH output based on a redeem
// script that uses the CHECKLOCKTIMEVERIFY (CLTV) opcode.
// For details, see
// https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki#freezing-funds
// This script assumes that it is being used in conjunction with a fresh regtest
// environment that was setup with the accompanying freeze-regtest.sh script.

'use strict';

var LOCK_UNTIL_BLOCK = 150; // pick a block height above the current tip

var args = require('./args-regtest.js');
var bitcore = require('bitcore');

bitcore.Networks.defaultNetwork = bitcore.Networks.testnet; // works for regtest

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

var getSpendTransaction = function(lockTime, sequenceNumber) {
  var result = new bitcore.Transaction().from({
    txid: freezeTransaction.id,
    vout: 0,
    scriptPubKey: redeemScript.toScriptHashOut(),
    satoshis: Number(args.satoshis) - 100000,
  })
  // send back to the original address for ease of testing only
  .to(privKey.toAddress(), Number(args.satoshis) - 200000)
  // CLTV requires the transaction nLockTime to be >= the stack argument in the redeem script
  .lockUntilBlockHeight(lockTime);
  // the CLTV opcode requires that the input's sequence number not be finalized
  result.inputs[0].sequenceNumber = sequenceNumber;

  var signature = bitcore.Transaction.sighash.sign(
    result,
    privKey,
    bitcore.crypto.Signature.SIGHASH_ALL,
    0,
    redeemScript
  );
  // next statement is needed until a bug in bitcore is fixed
  // https://github.com/bitpay/bitcore/pull/1278
  signature.nhashtype = bitcore.crypto.Signature.SIGHASH_ALL;

  // setup the scriptSig of the spending transaction to spend the p2sh-cltv-p2pkh redeem script
  result.inputs[0].setScript(
    bitcore.Script.empty()
    .add(signature.toTxFormat())
    .add(privKey.toPublicKey().toBuffer())
    .add(redeemScript.toBuffer())
  );

  return result;
};

// this is the valid attempt to spend the cltv frozen funds
var spendTransaction = getSpendTransaction(LOCK_UNTIL_BLOCK, 0);

// this is an invalid attempt to spend the cltv frozen funds by using a finalized
// transaction input to disable to transaction's time lock. the cltv opcode
// correctly prevents this from working.
var brokenSpendTransaction = getSpendTransaction(LOCK_UNTIL_BLOCK, 0xffffffff);

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
  brokenSpendTransaction: {
    txid: brokenSpendTransaction.id,
    raw: brokenSpendTransaction.serialize(true),
  },
};

console.log(JSON.stringify(result, null, 2));

