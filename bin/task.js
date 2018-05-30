"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var execa = require('execa');
var Listr = require('listr');
var process = require('process');
var rimraf = require('rimraf');
var _a = require('path'), basename = _a.basename, join = _a.join;
var exists = require('fs').exists;
var promisify = require('util').promisify;
var cloneArgs = ['clone'];
var existsAsync = promisify(exists);
var rimrafAsync = promisify(rimraf);
var runTask = function (program) {
    var task, tasks;
    var repository = program.args[0];
    cloneArgs.push(isRepository(repository));
    if (is(program.branch)) {
        cloneArgs.push('--branch', program.branch);
    }
    if (is(program.depth)) {
        cloneArgs.push('--depth', program.depth);
    }
    if (is(program.output))
        cloneArgs.push(program.output);
    var dirName = is(program.output) ? program.output : basename(repository, '.git');
    var defaultTasks = [
        {
            title: 'Cloning repository',
            task: function () {
                return execa('git', cloneArgs).catch(function (error) {
                    if (error !== '') {
                        throw new Error(error);
                    }
                });
            }
        }
    ];
    if (is(program.overwrite)) {
        var cleanTask = {
            title: 'Cleaning up',
            task: function () {
                return rimrafAsync(join(process.cwd(), dirName)).catch(function (error) {
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
                return execa('git', ['fetch'], { cwd: dirName }).catch(function (error) {
                    if (error !== '') {
                        throw new Error(error);
                    }
                });
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
                            return existsAsync(join(process.cwd(), dirName, '.gitmodules')).then(function (result) {
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
                            return existsAsync(join(process.cwd(), dirName, 'package.json')).then(function (result) {
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
                            return existsAsync(join(process.cwd(), dirName, 'bower.json')).then(function (result) {
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
                            return existsAsync(join(process.cwd(), dirName, 'composer.json')).then(function (result) {
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
                            return existsAsync(join(process.cwd(), dirName, 'Gemfile')).then(function (result) {
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
                                        return execa('git', ['submodule', 'update', '--init', '--recursive'], { cwd: dirName }).catch(function () {
                                            task.skip('Bower is not installed, install it via `npm install -g bower`');
                                        });
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
                                        return execa('yarn', { cwd: dirName }).catch(function () {
                                            ctx.yarn = false;
                                            task.skip('Yarn not available, install it via `npm install -g yarn`');
                                        });
                                    }
                                },
                                {
                                    title: 'Installing with npm',
                                    enabled: function (ctx) { return ctx.npm === true && ctx.yarn === false; },
                                    task: function () { return execa('npm', ['install'], { cwd: dirName }); }
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
                                        return execa('bower', ['install'], { cwd: dirName }).catch(function () {
                                            task.skip('Bower is not installed, install it via `npm install -g bower`');
                                        });
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
                                    task: function () { return execa('composer', ['install'], { cwd: dirName }); }
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
                                    task: function () { return execa('bundler', ['install'], { cwd: dirName }); }
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
                        task: function () { return execa('yarn', ['test'], { cwd: dirName }); }
                    },
                    {
                        title: 'npm test',
                        enabled: function (ctx) { return ctx.yarn === false; },
                        task: function () { return execa('npm', ['test'], { cwd: dirName }); }
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
                        task: function () { return execa('yarn', ['start'], { cwd: dirName }); }
                    },
                    {
                        title: 'npm start',
                        enabled: function (ctx) { return ctx.yarn === false; },
                        task: function () { return execa('npm', ['start'], { cwd: dirName }); }
                    }
                ]);
            }
        };
        defaultTasks.push(startTask);
    }
    tasks = new Listr(defaultTasks);
    tasks.run().catch(function (err) {
        console.error(err);
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
        var standardPrefixes = /^(ssh|git|https?|ftps?):\/\//i;
        var githubPrefixes = /^(gh|github):/i;
        var bitbucketPrefixes = /^(bb|bitbucket):/i;
        if (standardPrefixes.test(repository)) {
            return repository;
        }
        else if (githubPrefixes.test(repository) && repository.split('/').length === 2) {
            repository = "https://github.com/" + repository.replace(/(gh|github):/, '');
            return repository;
        }
        else if (bitbucketPrefixes.test(repository) && repository.split('/').length === 2) {
            repository = "https://bitbucket.com/" + repository.replace(/(bb|bitbucket):/, '');
            return repository;
        }
        else {
            throw new Error('Unsupported repository format specified');
        }
    }
}
//# sourceMappingURL=task.js.map