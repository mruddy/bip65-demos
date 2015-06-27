var argparse = require('argparse');

var parser = new argparse.ArgumentParser({
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

module.exports = parser.parseArgs();

