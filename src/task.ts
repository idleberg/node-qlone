const execa = require('execa');
const Listr = require('listr');
const process = require('process');
const rimraf = require('rimraf');
const split = require('split');
const streamToObservable = require('@samverschueren/stream-to-observable');
const { basename, join } = require('path');
const { exists } = require('fs');
const { catchError, filter } = require('rxjs/operators');
const { merge, throwError } = require('rxjs');
const { promisify } = require('util');

const existsAsync = promisify(exists);
const rimrafAsync = promisify(rimraf);

const exec = (cmd, args = [], opts = {}) => {
    const cp = execa(cmd, args, opts);

    return merge(
        streamToObservable(cp.stdout.pipe(split()), {await: cp}),
        streamToObservable(cp.stderr.pipe(split()), {await: cp})
    ).pipe(filter(Boolean));
};

const runTask = program => {
    let task, tasks;
    let repository = program.args[0];
    const cloneArgs = ['clone'];

    cloneArgs.push(isRepository(repository));

    if (is(program.branch)) {
        cloneArgs.push('--branch', program.branch);
    }
    if (is(program.depth)) {
        cloneArgs.push('--depth', program.depth);
    }
    if (is(program.output)) cloneArgs.push(program.output);
    const dirName = is(program.output) ? program.output : basename(repository, '.git');

    const defaultTasks = [
        {
            title: 'Cloning repository',
            task: () =>
                exec('git', cloneArgs).pipe(
                    catchError(err => {
                        throwError(err);
                    })
                )
        }
    ];

    if (is(program.overwrite)) {
        const cleanTask = {
            title: 'Cleaning up',
            task: () =>
                rimrafAsync(join(process.cwd(), dirName)).catch(error => {
                    if (error !== '') {
                        throw new Error(error);
                    }
                })
        };

        defaultTasks.unshift(cleanTask);
    }

    if (is(program.fetch)) {
        const fetchTask: ListrOptions = {
            title: 'Fetching refs',
            task: () =>
                exec('git', ['fetch'], { cwd: dirName }).pipe(
                    catchError(err => {
                        throwError(err);
                    })
                )
        };

        defaultTasks.push(fetchTask);
    }

    if (is(program.install)) {
        const lookTask: ListrOptions = {
            title: 'Looking for dependencies',
            task: () => {
                return new Listr([
                    {
                        title: 'Detecting .gitmodules',
                        task: (ctx, task) =>
                            existsAsync(join(process.cwd(), dirName, '.gitmodules')).then(result => {
                                ctx.gitmodules = result;

                                if (result === false) {
                                    task.skip('No .gitmodules found');
                                }
                            })
                    },
                    {
                        title: 'Detecting package.json',
                        task: (ctx, task) =>
                            existsAsync(join(process.cwd(), dirName, 'package.json')).then(result => {
                                ctx.npm = result;

                                if (result === false) {
                                    task.skip('No package.json found');
                                }
                            })
                    },
                    {
                        title: 'Detecting bower.json',
                        task: (ctx, task) =>
                            existsAsync(join(process.cwd(), dirName, 'bower.json')).then(result => {
                                ctx.bower = result;

                                if (result === false) {
                                    task.skip('No bower.json found');
                                }
                            })
                    },
                    {
                        title: 'Detecting composer.json',
                        task: (ctx, task) =>
                            existsAsync(join(process.cwd(), dirName, 'composer.json')).then(result => {
                                ctx.composer = result;

                                if (result === false) {
                                    task.skip('No composer.json found');
                                }
                            })
                    },
                    {
                        title: 'Detecting Gemfile',
                        task: (ctx, task) =>
                            existsAsync(join(process.cwd(), dirName, 'Gemfile')).then(result => {
                                ctx.bundler = result;

                                if (result === false) {
                                    task.skip('No Gemfile found');
                                }
                            })
                    }
                ]);
            }
        };

        const installTask: ListrOptions = {
            title: 'Installing dependencies',
            enabled: ctx => ctx.gitmodules !== false || ctx.npm !== false || ctx.bower !== false || ctx.composer !== false,
            task: () => {
                return new Listr([
                    {
                        title: 'Git modules',
                        enabled: ctx => ctx.gitmodules !== false,
                        task: () => {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: () =>
                                        exec('git', ['submodule', 'update', '--init', '--recursive'], { cwd: dirName }).pipe(
                                            catchError(err => {
                                                throwError(err);
                                            })
                                        )
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Node packages',
                        enabled: ctx => ctx.npm !== false,
                        task: () => {
                            return new Listr([
                                {
                                    title: 'Installing with Yarn',
                                    enabled: ctx => ctx.npm === true,
                                    task: (ctx, task) =>
                                        exec('yarn', [], { cwd: dirName }).pipe(
                                            catchError(err => {
                                                throwError(err);
                                            })
                                        )
                                },
                                {
                                    title: 'Installing with npm',
                                    enabled: ctx => ctx.npm === true && ctx.yarn === false,
                                    task: () =>
                                        exec('npm', ['install'], { cwd: dirName }).pipe(
                                            catchError(err => {
                                                throwError(err);
                                            })
                                        )
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Bower packages',
                        enabled: ctx => ctx.bower !== false,
                        task: () => {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: () =>
                                        exec('bower', ['install'], { cwd: dirName }).pipe(
                                            catchError(err => {
                                                throwError(err);
                                            })
                                        )
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Composer packages',
                        enabled: ctx => ctx.composer !== false,
                        task: () => {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: () =>
                                        exec('composer', ['install'], { cwd: dirName }).pipe(
                                            catchError(err => {
                                                throwError(err);
                                            })
                                        )
                                }
                            ]);
                        }
                    },
                    {
                        title: 'Ruby gems',
                        enabled: ctx => ctx.bundler !== false,
                        task: () => {
                            return new Listr([
                                {
                                    title: 'Installing',
                                    task: () =>
                                        exec('bundler', ['install'], { cwd: dirName }).pipe(
                                            catchError(err => {
                                                throwError(err);
                                            })
                                        )
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
        const testTask: ListrOptions = {
            title: 'Running test script',
            enabled: ctx => ctx.npm === true,
            task: () => {
                return new Listr([
                    {
                        title: 'yarn test',
                        enabled: ctx => ctx.yarn !== false,
                        task: () =>
                            exec('yarn', ['test'], { cwd: dirName }).pipe(
                                catchError(err => {
                                    throwError(err);
                                })
                            )
                    },
                    {
                        title: 'npm test',
                        enabled: ctx => ctx.yarn === false,
                        task: () =>
                            exec('npm', ['test'], { cwd: dirName }).pipe(
                                catchError(err => {
                                    throwError(err);
                                })
                            )
                    }
                ]);
            }
        };

        defaultTasks.push(testTask);
    }

    if (is(program.start)) {
        const startTask: ListrOptions = {
            title: 'Running start script',
            enabled: ctx => ctx.npm === true,
            task: () => {
                return new Listr([
                    {
                        title: 'yarn start',
                        enabled: ctx => ctx.yarn !== false,
                        task: () =>
                            exec('yarn', ['start'], { cwd: dirName }).pipe(
                                catchError(err => {
                                    throwError(err);
                                })
                            )
                    },
                    {
                        title: 'npm start',
                        enabled: ctx => ctx.yarn === false,
                        task: () =>
                            exec('npm', ['start'], { cwd: dirName }).pipe(
                                catchError(err => {
                                    throwError(err);
                                })
                            )
                    }
                ]);
            }
        };

        defaultTasks.push(startTask);
    }

    tasks = new Listr(defaultTasks);

    tasks.run().catch(err => {
        console.error(err);
    });
};

function is(input: string|undefined): boolean {
    if (typeof input !== 'undefined' && input) {
        return true;
    }

    return false;
}

function isRepository(repository: string): string {
    if (is(repository)) {
        const standardPrefixes = /^(ssh|git|https?|ftps?):\/\//i;
        const githubPrefixes = /^(gh|github):/i;
        const bitbucketPrefixes = /^(bb|bitbucket):/i;

        if (standardPrefixes.test(repository)) {
            return repository;
        } else if (githubPrefixes.test(repository) && repository.split('/').length === 2) {
            repository = `https://github.com/${repository.replace(/(gh|github):/, '')}`;
            return repository;
        } else if (bitbucketPrefixes.test(repository) && repository.split('/').length === 2) {
            repository = `https://bitbucket.com/${repository.replace(/(bb|bitbucket):/, '')}`;
            return repository;
        } else {
            throw new Error('Unsupported repository format specified');
        }
    }
}

export { runTask };
