var version = require('../package.json').version;
var program = require('commander');
var runTask = require('./task').runTask;
program
    .version(version)
    .description('CLI version of node-makensis')
    .arguments('<repository>')
    .usage('<repository> [options]')
    .option('-i, --install', 'installs dependencies for Node, Bower, Composer etc.')
    .option('-s, --start', 'installs dependencies for Node, Bower, Composer etc.')
    .option('-f, --fetch', 'runs fetch after clone')
    .option('-b, --branch <branch>', 'specify branch')
    .option('-d, --depth <int>', 'specify commit depth', parseInt)
    .option('-o, --output <folder>', 'specify output directory')
    .parse(process.argv);
if (program.args.length === 0)
    program.help();
runTask(program);
//# sourceMappingURL=cli.js.map