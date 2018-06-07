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
var runTask = function (repositories, flags) {
    var defaultTasks = [];
    var task, tasks;
    repositories.forEach(function (repository, index) {
        var cloneArgs = ['clone'];
        if (is(flags.branch)) {
            cloneArgs.push('--branch', flags.branch);
        }
        if (is(flags.depth)) {
            cloneArgs.push('--depth', flags.depth);
        }
        if (is(flags.output) && flags.length === 1)
            cloneArgs.push(flags.output);
        repository = isRepository(repository);
        if (repository === '-1')
            return console.error(logSymbols.error, "Error: Unsupported repository format specified: " + repositories[index]);
        cloneArgs.push(repository);
        var dirName = is(flags.output) ? flags.output : basename(repository, '.git');
        var targetDir = join(process.cwd(), dirName);
        if (is(flags.overwrite)) {
            var cleanTask = {
                title: "Cleaning up " + dirName,
                task: function () {
                    return rimrafAsync(targetDir).catch(function (error) {
                        if (error !== '') {
                            throw new Error(error);
                        }
                    });
                }
            };
            defaultTasks.push(cleanTask);
        }
        var cloneTask = {
            title: "Cloning repository " + repository,
            task: function (ctx, task) {
                return execa('git', cloneArgs).catch(function (error) {
                    ctx.cloneFailed = true;
                    task.skip(error.Error);
                });
            }
        };
        defaultTasks.push(cloneTask);
        if (is(flags.fetch)) {
            var fetchTask = {
                title: 'Fetching refs',
                enabled: function (ctx) { return ctx.cloneFailed !== true; },
                task: function () {
                    return execa('git', ['fetch'], { cwd: targetDir }).catch(function (error) {
                        throw new Error(error);
                    });
                }
            };
            defaultTasks.push(fetchTask);
        }
        if (is(flags.install)) {
            var lookTask = {
                title: 'Looking for dependencies',
                enabled: function (ctx) { return ctx.cloneFailed !== true; },
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
                            title: 'Detecting Pipfile',
                            task: function (ctx, task) {
                                return existsAsync(join(targetDir, dirName, 'Pipfile')).then(function (result) {
                                    ctx.pipenv = result;
                                    if (result === false) {
                                        task.skip('No Pipfile found');
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
                        },
                        {
                            title: 'Detecting Gopkg.toml',
                            task: function (ctx, task) {
                                return existsAsync(join(targetDir, dirName, 'Gopkg.toml')).then(function (result) {
                                    ctx.godep = result;
                                    if (result === false) {
                                        task.skip('No Gopkg.toml found');
                                    }
                                });
                            }
                        },
                        {
                            title: 'Detecting pubspec.yaml',
                            task: function (ctx, task) {
                                return existsAsync(join(targetDir, dirName, 'pubspec.yaml')).then(function (result) {
                                    ctx.flutter = result;
                                    if (result === false) {
                                        task.skip('No pubspec.yaml found');
                                    }
                                });
                            }
                        }
                    ]);
                }
            };
            var installTask = {
                title: 'Installing dependencies',
                enabled: function (ctx) { return ctx.cloneFailed !== true && (ctx.gitmodules !== false || ctx.npm !== false || ctx.bower !== false || ctx.composer !== false); },
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
                                            return exec('git', ['submodule', 'update', '--init', '--recursive'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
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
                                            return exec('yarn', [], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
                                            }));
                                        }
                                    },
                                    {
                                        title: 'Installing with npm',
                                        enabled: function (ctx) { return ctx.npm === true && ctx.yarn === false; },
                                        task: function () {
                                            return exec('npm', ['install'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
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
                                            return exec('bower', ['install'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
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
                                            return exec('composer', ['install'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
                                            }));
                                        }
                                    }
                                ]);
                            }
                        },
                        {
                            title: 'Pip packages',
                            enabled: function (ctx) { return ctx.pipenv !== false; },
                            task: function () {
                                return new Listr([
                                    {
                                        title: 'Installing',
                                        task: function () {
                                            return exec('pipenv', ['install'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
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
                                            return exec('bundler', ['install'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
                                            }));
                                        }
                                    }
                                ]);
                            }
                        },
                        {
                            title: 'Go dependencies',
                            enabled: function (ctx) { return ctx.godep !== false; },
                            task: function () {
                                return new Listr([
                                    {
                                        title: 'Installing',
                                        task: function () {
                                            return exec('dep', ['ensure'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
                                            }));
                                        }
                                    }
                                ]);
                            }
                        },
                        {
                            title: 'Dart packages',
                            enabled: function (ctx) { return ctx.flutter !== false; },
                            task: function () {
                                return new Listr([
                                    {
                                        title: 'Installing',
                                        task: function () {
                                            return exec('flutter', ['packages', 'get'], { cwd: targetDir }).pipe(catchError(function (error) {
                                                throwError(error);
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
        if (is(flags.test)) {
            var testTask = {
                title: 'Running test script',
                enabled: function (ctx) { return ctx.npm === true; },
                task: function () {
                    return new Listr([
                        {
                            title: 'yarn test',
                            enabled: function (ctx) { return ctx.yarn !== false; },
                            task: function () {
                                return exec('yarn', ['test'], { cwd: targetDir }).pipe(catchError(function (error) {
                                    throwError(error);
                                }));
                            }
                        },
                        {
                            title: 'npm test',
                            enabled: function (ctx) { return ctx.yarn === false; },
                            task: function () {
                                return exec('npm', ['test'], { cwd: targetDir }).pipe(catchError(function (error) {
                                    throwError(error);
                                }));
                            }
                        }
                    ]);
                }
            };
            defaultTasks.push(testTask);
        }
        if (is(flags.run)) {
            var runTask_1 = {
                title: "Running " + flags.run + " script",
                enabled: function (ctx) { return ctx.npm === true; },
                task: function () {
                    return new Listr([
                        {
                            title: "yarn run " + flags.run,
                            enabled: function (ctx) { return ctx.yarn !== false; },
                            task: function () {
                                return exec('yarn', ['run', flags.run], { cwd: targetDir }).pipe(catchError(function (error) {
                                    throwError(error);
                                }));
                            }
                        },
                        {
                            title: "npm run " + flags.run,
                            enabled: function (ctx) { return ctx.yarn === false; },
                            task: function () {
                                return exec('npm', ['run', flags.run], { cwd: targetDir }).pipe(catchError(function (error) {
                                    throwError(error);
                                }));
                            }
                        }
                    ]);
                }
            };
            defaultTasks.push(runTask_1);
        }
        if (is(flags.start)) {
            var startTask = {
                title: 'Running start script',
                enabled: function (ctx) { return ctx.npm === true; },
                task: function () {
                    return new Listr([
                        {
                            title: 'yarn start',
                            enabled: function (ctx) { return ctx.yarn !== false; },
                            task: function () {
                                return exec('yarn', ['start'], { cwd: targetDir }).pipe(catchError(function (error) {
                                    throwError(error);
                                }));
                            }
                        },
                        {
                            title: 'npm start',
                            enabled: function (ctx) { return ctx.yarn === false; },
                            task: function () {
                                return exec('npm', ['start'], { cwd: targetDir }).pipe(catchError(function (error) {
                                    throwError(error);
                                }));
                            }
                        }
                    ]);
                }
            };
            defaultTasks.push(startTask);
        }
    });
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