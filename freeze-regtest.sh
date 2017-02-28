#!/bin/bash
# usage: ./freeze-regtest.sh

# set these variables for your environment's specific configuration
REGTEST_DIR=/tmp/bitcoin-freeze-regtest;
BITCOIN_QT=~/Desktop/bitcoin/src/qt/bitcoin-qt;
BITCOIN_CLI=~/Desktop/bitcoin/src/bitcoin-cli;
NODEJS=/opt/node-v7.6.0-linux-x64/bin/node;

# setup a fresh regtest environment for this test
/bin/mkdir -p $REGTEST_DIR;

# configure the new regtest environment
$BITCOIN_QT -regtest -txindex -server -datadir=$REGTEST_DIR &

# wait for the rpc server to start by waiting for the first cli command to work
until $BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 101 > /dev/null 2>&1; do sleep 1; done
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendtoaddress "mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r" 10 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 1 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR importprivkey "cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA" > /dev/null 2>&1;
UNSPENT=$($BITCOIN_CLI -regtest -datadir=$REGTEST_DIR listunspent 1 1 '["mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r"]');

TXID=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys; data=json.load(sys.stdin); print(data[0]["txid"]);');
VOUT=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys; data=json.load(sys.stdin); print(data[0]["vout"]);');
SCRIPT_PUBKEY=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys; data=json.load(sys.stdin); print(data[0]["scriptPubKey"]);');
SATOSHIS=$(/bin/echo $UNSPENT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin, parse_float=decimal.Decimal); print(data[0]["amount"].scaleb(8));');

RESULT=$($NODEJS freeze.js --txid=$TXID --vout=$VOUT --scriptPubKey=$SCRIPT_PUBKEY --satoshis=$SATOSHIS);

/bin/echo "$RESULT";

FREEZE_TRAN=$(/bin/echo $RESULT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin); print(data["freezeTransaction"]["raw"]);');
SPEND_TRAN=$(/bin/echo $RESULT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin); print(data["spendTransaction"]["raw"]);');
BROKEN_SPEND_TRAN=$(/bin/echo $RESULT | /usr/bin/env python3 -c 'import json, sys, decimal; data=json.load(sys.stdin); print(data["brokenSpendTransaction"]["raw"]);');

$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$FREEZE_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR getblockcount;
# should fail as being invalid cltv - Locktime requirement not satisfied (in debug.log)
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$BROKEN_SPEND_TRAN";
# should fail as being non-final
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$SPEND_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 47 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR getblockcount;
# should fail as being non-final
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$SPEND_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 1 > /dev/null 2>&1;
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR getblockcount;
# should fail as being invalid cltv - Locktime requirement not satisfied (in debug.log)
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$BROKEN_SPEND_TRAN";
# should work
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR sendrawtransaction "$SPEND_TRAN";
$BITCOIN_CLI -regtest -datadir=$REGTEST_DIR generate 1 > /dev/null 2>&1;

