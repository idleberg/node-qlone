const execa = require('execa');
const Listr = require('listr');
const logSymbols = require('log-symbols');
const process = require('process');
const rimraf = require('rimraf');
const split = require('split');
const streamToObservable = require('@samverschueren/stream-to-observable');
const { basename, join } = require('path');
const { catchError, filter } = require('rxjs/operators');
const { exists } = require('fs');
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

const runTask = (repositories, flags) => {
    const defaultTasks: Array<Object> = [];

    repositories.forEach( (repository, index) => {
        let repositoryUrl = isRepository(repository);
        if (repositoryUrl === '-1') return console.error(logSymbols.error, `Error: Unsupported repository format specified: ${repository}`);

        const cloneArgs: Array<string> = ['clone'];
        let dirName: string;

        if (is(flags.branch)) {
            cloneArgs.push('--branch', flags.branch);
        }

        if (is(flags.depth)) {
            cloneArgs.push('--depth', flags.depth);
        }

        if (is(flags.output) && repositories.length === 1) {
            dirName = flags.output;
            cloneArgs.push(flags.output);
        } else {
            dirName = basename(repositoryUrl, '.git');
        }

        const targetDir: string = join(process.cwd(), dirName);
        let ctx, task;

        cloneArgs.push(repositoryUrl);

        if (is(flags.overwrite)) {
            const cleanTask = {
                title: `Cleaning up ${dirName}`,
                task: () =>
                    rimrafAsync(targetDir).catch(error => {
                        if (error !== '') {
                            throw new Error(error);
                        }
                    })
            };

            defaultTasks.push(cleanTask);
        }

        const cloneTask = {
            title: `Cloning repository ${repositoryUrl}`,
            task: (ctx, task) =>
                execa('git', cloneArgs).catch( error => {
                    ctx.cloneFailed = true;
                    task.skip(error.Error);
                })
        };

        defaultTasks.push(cloneTask);

        if (is(flags.fetch)) {
            const fetchTask: ListrOptions = {
                title: 'Fetching refs',
                enabled: ctx => ctx.cloneFailed !== true,
                task: () =>
                    execa('git', ['fetch'], { cwd: targetDir }).catch( error => {
                        throw new Error(error);
                    })
            };

            defaultTasks.push(fetchTask);
        }

        if (is(flags.install)) {
            const lookTask: ListrOptions = {
                title: 'Looking for dependencies',
                enabled: ctx => ctx.cloneFailed !== true,
                task: () => {
                    return new Listr([
                        {
                            title: 'Detecting .gitmodules',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, '.gitmodules')).then(result => {
                                    ctx.gitmodules = result;

                                    if (result === false) {
                                        task.skip('No .gitmodules found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting package.json',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, 'package.json')).then(result => {
                                    ctx.npm = result;

                                    if (result === false) {
                                        task.skip('No package.json found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting bower.json',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, 'bower.json')).then(result => {
                                    ctx.bower = result;

                                    if (result === false) {
                                        task.skip('No bower.json found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting composer.json',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, dirName, 'composer.json')).then(result => {
                                    ctx.composer = result;

                                    if (result === false) {
                                        task.skip('No composer.json found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting Pipfile',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, dirName, 'Pipfile')).then(result => {
                                    ctx.pipenv = result;

                                    if (result === false) {
                                        task.skip('No Pipfile found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting Gemfile',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, dirName, 'Gemfile')).then(result => {
                                    ctx.bundler = result;

                                    if (result === false) {
                                        task.skip('No Gemfile found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting Gopkg.toml',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, dirName, 'Gopkg.toml')).then(result => {
                                    ctx.godep = result;

                                    if (result === false) {
                                        task.skip('No Gopkg.toml found');
                                    }
                                })
                        },
                        {
                            title: 'Detecting pubspec.yaml',
                            task: (ctx, task) =>
                                existsAsync(join(targetDir, dirName, 'pubspec.yaml')).then(result => {
                                    ctx.flutter = result;

                                    if (result === false) {
                                        task.skip('No pubspec.yaml found');
                                    }
                                })
                        }
                    ]);
                }
            };

            const installTask: ListrOptions = {
                title: 'Installing dependencies',
                enabled: ctx => ctx.cloneFailed !== true && (ctx.gitmodules !== false || ctx.npm !== false || ctx.bower !== false || ctx.composer !== false),
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
                                            exec('git', ['submodule', 'update', '--init', '--recursive'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
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
                                            exec('yarn', [], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
                                                })
                                            )
                                    },
                                    {
                                        title: 'Installing with npm',
                                        enabled: ctx => ctx.npm === true && ctx.yarn === false,
                                        task: () =>
                                            exec('npm', ['install'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
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
                                            exec('bower', ['install'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
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
                                            exec('composer', ['install'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
                                                })
                                            )
                                    }
                                ]);
                            }
                        },
                        {
                            title: 'Pip packages',
                            enabled: ctx => ctx.pipenv !== false,
                            task: () => {
                                return new Listr([
                                    {
                                        title: 'Installing',
                                        task: () =>
                                            exec('pipenv', ['install'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
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
                                            exec('bundler', ['install'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
                                                })
                                            )
                                    }
                                ]);
                            }
                        },
                        {
                            title: 'Go dependencies',
                            enabled: ctx => ctx.godep !== false,
                            task: () => {
                                return new Listr([
                                    {
                                        title: 'Installing',
                                        task: () =>
                                            exec('dep', ['ensure'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
                                                })
                                            )
                                    }
                                ]);
                            }
                        },
                        {
                            title: 'Dart packages',
                            enabled: ctx => ctx.flutter !== false,
                            task: () => {
                                return new Listr([
                                    {
                                        title: 'Installing',
                                        task: () =>
                                            exec('flutter', ['packages', 'get'], { cwd: targetDir }).pipe(
                                                catchError(error => {
                                                    throwError(error);
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

        if (is(flags.test)) {
            const testTask: ListrOptions = {
                title: 'Running test script',
                enabled: ctx => ctx.npm === true,
                task: () => {
                    return new Listr([
                        {
                            title: 'yarn test',
                            enabled: ctx => ctx.yarn !== false,
                            task: () =>
                                exec('yarn', ['test'], { cwd: targetDir }).pipe(
                                    catchError(error => {
                                        throwError(error);
                                    })
                                )
                        },
                        {
                            title: 'npm test',
                            enabled: ctx => ctx.yarn === false,
                            task: () =>
                                exec('npm', ['test'], { cwd: targetDir }).pipe(
                                    catchError(error => {
                                        throwError(error);
                                    })
                                )
                        }
                    ]);
                }
            };

            defaultTasks.push(testTask);
        }

        if (is(flags.run)) {
            const runTask: ListrOptions = {
                title: `Running ${flags.run} script`,
                enabled: ctx => ctx.npm === true,
                task: () => {
                    return new Listr([
                        {
                            title: `yarn run ${flags.run}`,
                            enabled: ctx => ctx.yarn !== false,
                            task: () =>
                                exec('yarn', ['run', flags.run], { cwd: targetDir }).pipe(
                                    catchError(error => {
                                        throwError(error);
                                    })
                                )
                        },
                        {
                            title: `npm run ${flags.run}`,
                            enabled: ctx => ctx.yarn === false,
                            task: () =>
                                exec('npm', ['run', flags.run], { cwd: targetDir }).pipe(
                                    catchError(error => {
                                        throwError(error);
                                    })
                                )
                        }
                    ]);
                }
            };

            defaultTasks.push(runTask);
        }

        if (is(flags.start)) {
            const startTask: ListrOptions = {
                title: 'Running start script',
                enabled: ctx => ctx.npm === true,
                task: () => {
                    return new Listr([
                        {
                            title: 'yarn start',
                            enabled: ctx => ctx.yarn !== false,
                            task: () =>
                                exec('yarn', ['start'], { cwd: targetDir }).pipe(
                                    catchError(error => {
                                        throwError(error);
                                    })
                                )
                        },
                        {
                            title: 'npm start',
                            enabled: ctx => ctx.yarn === false,
                            task: () =>
                                exec('npm', ['start'], { cwd: targetDir }).pipe(
                                    catchError(error => {
                                        throwError(error);
                                    })
                                )
                        }
                    ]);
                }
            };

            defaultTasks.push(startTask);
        }
    });

    const tasks = new Listr(defaultTasks);

    tasks.run().catch(err => {
        console.error(logSymbols.error, err);
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
        const isGit = /^(ssh|git|https?|ftps?):\/\//i;
        const isGitHub = /^(gh|github):/i;
        const isGitLab = /^(gl|gitlab):/i;
        const isBitbucket = /^(bb|bitbucket):/i;

        if (isGit.test(repository)) {
            return repository;
        } else if (isGitHub.test(repository) && repository.split('/').length === 2) {
            repository = `https://github.com/${repository.replace(/(gh|github):/, '')}`;
            return repository;
        } else if (isGitLab.test(repository) && repository.split('/').length === 2) {
            repository = `https://gitlab.com/${repository.replace(/(gl|gitlab):/, '')}`;
            return repository;
        } else if (isBitbucket.test(repository) && repository.split('/').length === 2) {
            repository = `https://bitbucket.com/${repository.replace(/(bb|bitbucket):/, '')}`;
            return repository;
        } else {
            return '-1';
        }
    }
}

export { runTask };
