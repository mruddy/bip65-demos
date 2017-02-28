#!/bin/bash
# usage: ./refund-regtest.sh

# set these variables for your environment's specific configuration
REGTEST_DIR=/tmp/bitcoin-refund-regtest;
BITCOIN_QT=~/Desktop/bitcoin/src/qt/bitcoin-qt;
BITCOIN_CLI=~/Desktop/bitcoin/src/bitcoin-cli;
NODEJS=/opt/node-v7.6.0-linux-x64/bin/node;

# setup a fresh regtest environment for this test
/bin/mkdir -p $REGTEST_DIR;

# configure the new regtest environment
$BITCOIN_QT -regtest -txindex -server -datadir=$REGTEST_DIR &

# wait for the rpc server to start by waiting for the first cli command to work
until $BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 101 > /dev/null 2>&1; do sleep 1; done
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendtoaddress "mkESjLZW66TmHhiFX8MCaBjrhZ543PPh9a" 10 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 1 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR importprivkey "cP3voGKJHVSrUsEdrj8HnrpwLNgNngrgijMyyyRowRo15ZattbHm" > /dev/null 2>&1;
UNSPENT=$($BITCOIN_CLI -regtest -datadir=$REGTEST_DIR listunspent 1 1 '["mkESjLZW66TmHhiFX8MCaBjrhZ543PPh9a"]');

TXID=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys; data=json.load(sys.stdin); print(data[0]["txid"]);');
VOUT=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys; data=json.load(sys.stdin); print(data[0]["vout"]);');
SCRIPT_PUBKEY=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys; data=json.load(sys.stdin); print(data[0]["scriptPubKey"]);');
SATOSHIS=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin, parse_float=decimal.Decimal); print(data[0]["amount"].scaleb(8));');

RESULT=$($NODEJS refund.js --txid=$TXID --vout=$VOUT --scriptPubKey=$SCRIPT_PUBKEY --satoshis=$SATOSHIS);

/bin/echo "$RESULT";

DEPOSIT_TRAN=$(/bin/echo $RESULT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin); print(data["depositTransaction"]["raw"]);');
REFUND_TRAN=$(/bin/echo $RESULT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin); print(data["refundTransaction"]["raw"]);');

$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$DEPOSIT_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR getblockcount;
# should fail as being non-final
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$REFUND_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 47 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR getblockcount;
# should fail as being non-final
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$REFUND_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 1 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR getblockcount;
# should work
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$REFUND_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 1 > /dev/null 2>&1;

