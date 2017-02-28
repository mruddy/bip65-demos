// This script demonstrates deposit and refund transactions for a CLTV style
// micropayment channel. Specifically, the transactions created will be for
// simulating the case where the receiver abandons the channel, thereby forcing
// the sender to wait until the deposit lock expires before receiving the
// deposit refund. In the example, Alice is the sender and Bob is the receiver.
// For details, see
// https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki
// This script assumes that it is being used in conjunction with a fresh regtest
// environment that was setup with the accompanying refund-regtest.sh script.

'use strict';

const LOCK_UNTIL_BLOCK = 150; // pick a block height above the current tip

const args = require('./args-regtest.js');
const bitcore = require('bitcore-lib');

bitcore.Networks.defaultNetwork = bitcore.Networks.testnet; // works for regtest

// use a compressed format brain wallet key for ease of testing. doing so yields
// fixed addresses.

// address = mkESjLZW66TmHhiFX8MCaBjrhZ543PPh9a
// privKey WIF = cP3voGKJHVSrUsEdrj8HnrpwLNgNngrgijMyyyRowRo15ZattbHm
const alice = bitcore.PrivateKey(bitcore.crypto.Hash.sha256(Buffer.from('alice', 'utf8')).toString('hex'));

// address = mrsU9wTxs1UB4wqWZbuA6Nd6uYxs2VKe8T
const bob = bitcore.PrivateKey(bitcore.crypto.Hash.sha256(Buffer.from('bob', 'utf8')).toString('hex'));

const redeemScript = bitcore.Script.empty()
  .add('OP_IF')
    .add(bob.toPublicKey().toBuffer()).add('OP_CHECKSIGVERIFY')
  .add('OP_ELSE')
    // useful generic way to get the minimal encoding of the locktime stack argument
    .add(bitcore.crypto.BN.fromNumber(LOCK_UNTIL_BLOCK).toScriptNumBuffer())
    .add('OP_CHECKLOCKTIMEVERIFY').add('OP_DROP')
  .add('OP_ENDIF')
  .add(alice.toPublicKey().toBuffer()).add('OP_CHECKSIG');

const p2shAddress = bitcore.Address.payingTo(redeemScript);

const depositTransaction = new bitcore.Transaction().from({
  txid: args.txid, // tran id of an utxo associated with the alice's address
  vout: Number(args.vout), // output index of the utxo within the transaction with id = txid
  scriptPubKey: args.scriptPubKey, // scriptPubKey of the utxo txid[vout]
  satoshis: Number(args.satoshis), // value of the utxo txid[vout]
})
.to(p2shAddress, Number(args.satoshis) - 100000)
.sign(alice);

const refundTransaction = new bitcore.Transaction().from({
  txid: depositTransaction.id,
  vout: 0,
  scriptPubKey: redeemScript.toScriptHashOut(),
  satoshis: Number(args.satoshis) - 100000,
})
.to(alice.toAddress(), Number(args.satoshis) - 200000) // send back to the original address for ease of testing only
.lockUntilBlockHeight(LOCK_UNTIL_BLOCK); // CLTV requires the transaction nLockTime to be >= the stack argument in the redeem script
refundTransaction.inputs[0].sequenceNumber = 0; // the CLTV opcode requires that the input's sequence number not be finalized

const signature = bitcore.Transaction.sighash.sign(refundTransaction, alice, bitcore.crypto.Signature.SIGHASH_ALL, 0, redeemScript);

// setup the scriptSig of the spending transaction to spend the p2sh-cltv-p2pkh redeem script
refundTransaction.inputs[0].setScript(
  bitcore.Script.empty()
  .add(signature.toTxFormat())
  .add('OP_FALSE') // choose the time-delayed refund code path
  .add(redeemScript.toBuffer())
);

const result = {
  alice: alice.toAddress().toString(),
  aliceWif: alice.toWIF(),
  bob: bob.toAddress().toString(),
  bobWif: bob.toWIF(),
  p2shAddress: p2shAddress.toString(),
  redeemScript: redeemScript.toString(),
  depositTransaction: {
    txid: depositTransaction.id,
    raw: depositTransaction.serialize(true),
  },
  refundTransaction: {
    txid: refundTransaction.id,
    raw: refundTransaction.serialize(true),
  },
};

console.log(JSON.stringify(result, null, 2));

