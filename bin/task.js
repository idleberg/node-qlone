"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var execa = require('execa');
var Listr = require('listr');
var logSymbols = require('log-symbols');
var process = require('process');
var rimraf = require('rimraf');
var split = require('split');
var streamToObservable = require('@samverschueren/stream-to-observable');
var _a = require('path'), basename = _a.basename, join = _a.join;
var _b = require('rxjs/operators'), catchError = _b.catchError, filter = _b.filter;
var exists = require('fs').exists;
var _c = require('rxjs'), merge = _c.merge, throwError = _c.throwError;
var promisify = require('util').promisify;
var existsAsync = promisify(exists);
var rimrafAsync = promisify(rimraf);
var exec = function (cmd, args, opts) {
    if (args === void 0) { args = []; }
    if (opts === void 0) { opts = {}; }
    var cp = execa(cmd, args, opts);
    return merge(streamToObservable(cp.stdout.pipe(split()), { await: cp }), streamToObservable(cp.stderr.pipe(split()), { await: cp })).pipe(filter(Boolean));
};
var runTask = function (program) {
    var task, tasks;
    var repository = program.args[0];
    var cloneArgs = ['clone'];
    repository = isRepository(repository);
    if (repository === '-1')
        return console.error(logSymbols.error, 'Error: Unsupported repository format specified');
    cloneArgs.push(repository);
    if (is(program.branch)) {
        cloneArgs.push('--branch', program.branch);
    }
    if (is(program.depth)) {
        cloneArgs.push('--depth', program.depth);
    }
    if (is(program.output))
        cloneArgs.push(program.output);
    var dirName = is(program.output) ? program.output : basename(repository, '.git');
    var targetDir = join(process.cwd(), dirName);
    var defaultTasks = [
        {
            title: 'Cloning repository',
            task: function () {
                return exec('git', cloneArgs).pipe(catchError(function (err) {
                    throwError(err);
                }));
            }
        }
    ];
    if (is(program.overwrite)) {
        var cleanTask = {
            title: 'Cleaning up',
            task: function () {
                return rimrafAsync(targetDir).catch(function (error) {
                    if (error !== '') {
                        throw new Error(error);
                    }
                });
            }
        };
        defaultTasks.unshift(cleanTask);
    }
    if (is(program.fetch)) {
        var fetchTask = {
            title: 'Fetching refs',
            task: function () {
                return exec('git', ['fetch'], { cwd: targetDir }).pipe(catchError(function (err) {
                    throwError(err);
                }));
            }
        };
        defaultTasks.push(fetchTask);
    }
    if (is(program.install)) {
        var lookTask = {
            title: 'Looking for dependencies',
            task: function () {
                return new Listr([
                    {
                        title: 'Detecting .gitmodules',
                        task: function (ctx, task) {
                            return existsAsync(join(targetDir, '.gitmodules')).then(function (result) {
                                ctx.gitmodules = result;
                                if (result === false) {
                                    task.skip('No .gitmodules found');
                                }
                            });
                        }
                    },
                    {
                        title: 'Detecting package.json',
                        task: function (ctx, task) {
                            return existsAsync(join(targetDir, 'package.json')).then(function (result) {
                                ctx.npm = result;
                                if (result === false) {
                                    task.skip('No package.json found');
                                }
                            });
                        }
                    },
                    {
                        title: 'Detecting bower.json',
                        task: function (ctx, task) {
                            return existsAsync(join(targetDir, 'bower.json')).then(function (result) {
                                ctx.bower = result;
                                if (result === false) {
                                    task.skip('No bower.json found');
                                }
                            });
                        }
                    },
                    {
                        title: 'Detecting composer.json',
                        task: function (ctx, task) {
                            return existsAsync(join(targetDir, dirName, 'composer.json')).then(function (result) {
                                ctx.composer = result;
                                if (result === false) {
                                    task.skip('No composer.json found');
                                }
                            });
                        }
                    },
                    {
                        title: 'Detecting Gemfile',
                        task: function (ctx, task) {
                            return existsAsync(join(targetDir, dirName, 'Gemfile')).then(function (result) {
                                ctx.bundler = result;
                                if (result === false) {
                                    task.skip('No Gemfile found');
                                }
                            });
                        }
                    }
                ]);
            }
        };
        var installTask = {
            title: 'Installing dependencies',
            enabled: function (ctx) { return ctx.gitmodules !== false || ctx.npm !== false || ctx.bower !== false || ctx.composer !== false; },
            task: function () {
                return new Listr([
                    {
                        title: 'Git modules',
                        enabled: function (ctx) { return ctx.gitmodules !== false; },
                        task: function () {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: function () {
                                        return exec('git', ['submodule', 'update', '--init', '--recursive'], { cwd: targetDir }).pipe(catchError(function (err) {
                                            throwError(err);
                                        }));
                                    }
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Node packages',
                        enabled: function (ctx) { return ctx.npm !== false; },
                        task: function () {
                            return new Listr([
                                {
                                    title: 'Installing with Yarn',
                                    enabled: function (ctx) { return ctx.npm === true; },
                                    task: function (ctx, task) {
                                        return exec('yarn', [], { cwd: targetDir }).pipe(catchError(function (err) {
                                            throwError(err);
                                        }));
                                    }
                                },
                                {
                                    title: 'Installing with npm',
                                    enabled: function (ctx) { return ctx.npm === true && ctx.yarn === false; },
                                    task: function () {
                                        return exec('npm', ['install'], { cwd: targetDir }).pipe(catchError(function (err) {
                                            throwError(err);
                                        }));
                                    }
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Bower packages',
                        enabled: function (ctx) { return ctx.bower !== false; },
                        task: function () {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: function () {
                                        return exec('bower', ['install'], { cwd: targetDir }).pipe(catchError(function (err) {
                                            throwError(err);
                                        }));
                                    }
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Composer packages',
                        enabled: function (ctx) { return ctx.composer !== false; },
                        task: function () {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: function () {
                                        return exec('composer', ['install'], { cwd: targetDir }).pipe(catchError(function (err) {
                                            throwError(err);
                                        }));
                                    }
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Ruby gems',
                        enabled: function (ctx) { return ctx.bundler !== false; },
                        task: function () {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: function () {
                                        return exec('bundler', ['install'], { cwd: targetDir }).pipe(catchError(function (err) {
                                            throwError(err);
                                        }));
                                    }
                                }
                            ]);
                        }
                    }
                ]);
            }
        };
        defaultTasks.push(lookTask, installTask);
    }
    if (is(program.test)) {
        var testTask = {
            title: 'Running test script',
            enabled: function (ctx) { return ctx.npm === true; },
            task: function () {
                return new Listr([
                    {
                        title: 'yarn test',
                        enabled: function (ctx) { return ctx.yarn !== false; },
                        task: function () {
                            return exec('yarn', ['test'], { cwd: targetDir }).pipe(catchError(function (err) {
                                throwError(err);
                            }));
                        }
                    },
                    {
                        title: 'npm test',
                        enabled: function (ctx) { return ctx.yarn === false; },
                        task: function () {
                            return exec('npm', ['test'], { cwd: targetDir }).pipe(catchError(function (err) {
                                throwError(err);
                            }));
                        }
                    }
                ]);
            }
        };
        defaultTasks.push(testTask);
    }
    if (is(program.start)) {
        var startTask = {
            title: 'Running start script',
            enabled: function (ctx) { return ctx.npm === true; },
            task: function () {
                return new Listr([
                    {
                        title: 'yarn start',
                        enabled: function (ctx) { return ctx.yarn !== false; },
                        task: function () {
                            return exec('yarn', ['start'], { cwd: targetDir }).pipe(catchError(function (err) {
                                throwError(err);
                            }));
                        }
                    },
                    {
                        title: 'npm start',
                        enabled: function (ctx) { return ctx.yarn === false; },
                        task: function () {
                            return exec('npm', ['start'], { cwd: targetDir }).pipe(catchError(function (err) {
                                throwError(err);
                            }));
                        }
                    }
                ]);
            }
        };
        defaultTasks.push(startTask);
    }
    tasks = new Listr(defaultTasks);
    tasks.run().catch(function (err) {
        console.error(logSymbols.error, err);
    });
};
exports.runTask = runTask;
function is(input) {
    if (typeof input !== 'undefined' && input) {
        return true;
    }
    return false;
}
function isRepository(repository) {
    if (is(repository)) {
        var isGit = /^(ssh|git|https?|ftps?):\/\//i;
        var isGitHub = /^(gh|github):/i;
        var isGitLab = /^(gl|gitlab):/i;
        var isBitbucket = /^(bb|bitbucket):/i;
        if (isGit.test(repository)) {
            return repository;
        }
        else if (isGitHub.test(repository) && repository.split('/').length === 2) {
            repository = "https://github.com/" + repository.replace(/(gh|github):/, '');
            return repository;
        }
        else if (isGitLab.test(repository) && repository.split('/').length === 2) {
            repository = "https://gitlab.com/" + repository.replace(/(gl|gitlab):/, '');
            return repository;
        }
        else if (isBitbucket.test(repository) && repository.split('/').length === 2) {
            repository = "https://bitbucket.com/" + repository.replace(/(bb|bitbucket):/, '');
            return repository;
        }
        else {
            return '-1';
        }
    }
}
//# sourceMappingURL=task.js.map