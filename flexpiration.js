// This script demonstrates using a P2SH CLTV output as the earnest money
// deposit of a flexible expiration smart contract offer from Alice that is
// accepted and put into escrow by Bob.
// In this example, Alice is acting as a buyer that wishes to purchase from Bob.
// Carol is acting as the arbitration provider for Alice and Bob.
// Bob advertises his public key in a sale advertisement.
// Carol makes her public key for arbitration services available to Alice prior
// to Alice making the offer to Bob.
// For details, see
// https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki#flexible-expiration-smart-contract-offer-and-acceptance-with-escrow
// This script assumes that it is being used in conjunction with a fresh regtest
// environment that was setup with the accompanying flexpiration-regtest.sh script.

'use strict';

var LOCK_UNTIL_BLOCK = 150; // pick a block height above the current tip

var args = require('./args-regtest.js');
var bitcore = require('bitcore');
var fs = require('fs');

bitcore.Networks.defaultNetwork = bitcore.Networks.testnet; // works for regtest

var agreement = fs.readFileSync('./flexpiration-example-agreement.txt');
var agreementHash = bitcore.crypto.Hash.sha256ripemd160(agreement);

// use a compressed format brain wallet key for ease of testing. doing so yields
// fixed addresses.

// address = mkESjLZW66TmHhiFX8MCaBjrhZ543PPh9a
// privKey WIF = cP3voGKJHVSrUsEdrj8HnrpwLNgNngrgijMyyyRowRo15ZattbHm
// public key = 039997a497d964fc1a62885b05a51166a65a90df00492c8d7cf61d6accf54803be
var alice = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('alice', 'utf8')).toString('hex'));

// address = mrsU9wTxs1UB4wqWZbuA6Nd6uYxs2VKe8T
// public key = 024edfcf9dfe6c0b5c83d1ab3f78d1b39a46ebac6798e08e19761f5ed89ec83c10
var bob = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('bob', 'utf8')).toString('hex'));

// address = mnLx2xcfdukP1y1djkgJrkrw87L6vRpvVg
// public key = 029094567ba7245794198952f68e5723ac5866ad2f67dd97223db40e14c15b092e
var carol = new bitcore.PrivateKey(bitcore.crypto.Hash.sha256(new Buffer('carol', 'utf8')).toString('hex'));

var earnestMoneyRedeemScript = bitcore.Script.empty()
  .add('OP_IF')
    .add(agreementHash).add('OP_EQUALVERIFY')
    .add(bob.toPublicKey().toBuffer()).add('OP_CHECKSIGVERIFY')
  .add('OP_ELSE')
    // useful generic way to get the minimal encoding of the locktime stack argument
    .add(bitcore.crypto.BN.fromNumber(LOCK_UNTIL_BLOCK).toScriptNumBuffer())
    .add('OP_NOP2').add('OP_DROP')
  .add('OP_ENDIF')
  .add(alice.toPublicKey().toBuffer()).add('OP_CHECKSIG');

var earnestMoneyAddress = bitcore.Address.payingTo(earnestMoneyRedeemScript);

var escrowRedeemScript = bitcore.Script.buildMultisigOut([
    alice.toPublicKey(),
    bob.toPublicKey(),
    carol.toPublicKey(),
  ], 2);

var escrowAddress = bitcore.Address.payingTo(escrowRedeemScript);

var earnestMoneyTransaction = new bitcore.Transaction().from({
  txid: args.txid, // tran id of an utxo associated with the alice's address
  vout: Number(args.vout), // output index of the utxo within the transaction with id = txid
  scriptPubKey: args.scriptPubKey, // scriptPubKey of the utxo txid[vout]
  satoshis: Number(args.satoshis), // value of the utxo txid[vout]
})
.to(earnestMoneyAddress, Number(args.satoshis) - 100000)
.sign(alice);

// Alice sends Bob:
// 1) The full text of the offer (so that Bob can read it and Hash160 it)
// 2) The transaction id + vout of the Earnest Money P2SH CLTV output
// 3) The redeem script of the Earnest Money output
// 4) Alice's signature spending the Earnest Money output to the escrow address

var acceptTransaction = new bitcore.Transaction().from({
  txid: earnestMoneyTransaction.id,
  vout: 0,
  scriptPubKey: earnestMoneyRedeemScript.toScriptHashOut(),
  satoshis: Number(args.satoshis) - 100000,
})
.to(escrowAddress, Number(args.satoshis) - 200000);

var aliceSignature = bitcore.Transaction.sighash.sign(acceptTransaction, alice, bitcore.crypto.Signature.SIGHASH_ALL, 0, earnestMoneyRedeemScript);
var bobSignature = bitcore.Transaction.sighash.sign(acceptTransaction, bob, bitcore.crypto.Signature.SIGHASH_ALL, 0, earnestMoneyRedeemScript);

// setup the scriptSig of the accept transaction to spend the p2sh-cltv redeem script
acceptTransaction.inputs[0].setScript(
  bitcore.Script.empty()
  .add(aliceSignature.toTxFormat())
  .add(bobSignature.toTxFormat())
  .add(agreementHash)
  .add('OP_TRUE') // choose the accept offer code path
  .add(earnestMoneyRedeemScript.toBuffer())
);

// the bogus transaction demonstrates that Bob cannot rip-off Alice
// by using her Signature to send to an address other than the escrow
// address. This is the case since Alice signed her version of the acceptance
// transaction with SIGHASH_ALL.
var bogusAcceptTransaction = new bitcore.Transaction().from({
  txid: earnestMoneyTransaction.id,
  vout: 0,
  scriptPubKey: earnestMoneyRedeemScript.toScriptHashOut(),
  satoshis: Number(args.satoshis) - 100000,
})
.to(bob.toAddress(), Number(args.satoshis) - 200000);

// setup the scriptSig of the bogus accept transaction to spend the p2sh-cltv redeem script
bogusAcceptTransaction.inputs[0].setScript(
  bitcore.Script.empty()
  .add(aliceSignature.toTxFormat())
  .add(bobSignature.toTxFormat())
  .add(agreementHash)
  .add('OP_TRUE') // choose the accept offer code path
  .add(earnestMoneyRedeemScript.toBuffer())
);

var result = {
  agreementHash: agreementHash.toString('hex'),
  alice: alice.toPublicKey().toString(),
  bob: bob.toPublicKey().toString(),
  carol: carol.toPublicKey().toString(),
  earnestMoneyRedeemScript: earnestMoneyRedeemScript.toString(),
  earnestMoneyAddress: earnestMoneyAddress.toString(),
  escrowRedeemScript: escrowRedeemScript.toString(),
  escrowAddress: escrowAddress.toString(),
  earnestMoneyTransaction: {
    txid: earnestMoneyTransaction.id,
    raw: earnestMoneyTransaction.serialize(true),
  },
  acceptTransaction: {
    txid: acceptTransaction.id,
    raw: acceptTransaction.serialize(true),
  },
  bogusAcceptTransaction: {
    txid: bogusAcceptTransaction.id,
    raw: bogusAcceptTransaction.serialize(true),
  },
};

console.log(JSON.stringify(result, null, 2));

