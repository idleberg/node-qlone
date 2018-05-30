const execa = require('execa');
const Listr = require('listr');
const process = require('process');
const rimraf = require('rimraf');
const { basename, join } = require('path');
const { exists } = require('fs');
const { promisify } = require('util');

const cloneArgs = ['clone'];

const existsAsync = promisify(exists);
const rimrafAsync = promisify(rimraf);

const runTask = program => {
    let task, tasks;
    let repository = program.args[0];

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
                execa('git', cloneArgs).catch(error => {
                    if (error !== '') {
                        throw new Error(error);
                    }
                })
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
                execa('git', ['fetch'], { cwd: dirName }).catch(error => {
                    if (error !== '') {
                        throw new Error(error);
                    }
                })
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
                                        execa('git', ['submodule', 'update', '--init', '--recursive'], { cwd: dirName }).catch(() => {
                                            task.skip('Bower is not installed, install it via `npm install -g bower`');
                                        })
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
                                        execa('yarn', { cwd: dirName }).catch(() => {
                                            ctx.yarn = false;

                                            task.skip('Yarn not available, install it via `npm install -g yarn`');
                                        })
                                },
                                {
                                    title: 'Installing with npm',
                                    enabled: ctx => ctx.npm === true && ctx.yarn === false,
                                    task: () => execa('npm', ['install'], { cwd: dirName })
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
                                        execa('bower', ['install'], { cwd: dirName }).catch(() => {
                                            task.skip('Bower is not installed, install it via `npm install -g bower`');
                                        })
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
                                    task: () => execa('composer', ['install'], { cwd: dirName })
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
                                    task: () => execa('bundler', ['install'], { cwd: dirName })
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
                        task: () => execa('yarn', ['test'], { cwd: dirName })
                    },
                    {
                        title: 'npm test',
                        enabled: ctx => ctx.yarn === false,
                        task: () => execa('npm', ['test'], { cwd: dirName })
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
                        task: () => execa('yarn', ['start'], { cwd: dirName })
                    },
                    {
                        title: 'npm start',
                        enabled: ctx => ctx.yarn === false,
                        task: () => execa('npm', ['start'], { cwd: dirName })
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
