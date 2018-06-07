var program = require('commander');
var runTask = require('./task').runTask;
var version = require('../package.json').version;
program
    .version(version)
    .description('Clones repositories, installs dependencies, runs start scripts')
    .arguments('<repository>')
    .usage('<repository> [options]')
    .option('-b, --branch <branch>', 'specify git branch')
    .option('-d, --depth <int>', 'specify git commit depth', parseInt)
    .option('-f, --fetch', 'runs git fetch after clone')
    .option('-i, --install', 'installs dependencies for Node, Bower, Composer etc.')
    .option('-o, --output <folder>', 'specify output directory')
    .option('-O, --overwrite', 'overwrite existing folder')
    .option('-r, --run <script>', 'runs specified Node script')
    .option('-s, --start', 'runs Node start script')
    .option('-t, --test', 'runs Node test script')
    .parse(process.argv);
if (program.args.length === 0)
    program.help();
var flags = {
    branch: program.branch,
    depth: program.depth,
    fetch: program.fetch,
    install: program.install,
    output: program.output,
    overwrite: program.overwrite,
    run: program.run,
    start: program.start,
    test: program.test
};
runTask(program.args, flags);
//# sourceMappingURL=cli.js.map