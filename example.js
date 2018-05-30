const execa = require('execa');
const Listr = require('listr');

const tasks = new Listr([
    {
        title: 'Git',
        task: () => {
            return new Listr([
                {
                    title: 'Checking git status',
                    task: () => execa.stdout('echo', ['status', '--porcelain']).then(result => {
                        // if (result !== '') {
                        //     throw new Error('Unclean working tree. Commit or stash changes first.');
                        // }
                    })
                },
                {
                    title: 'Checking remote history',
                    task: () => execa.stdout('echo', ['rev-list', '--count', '--left-only', '@{u}...HEAD']).then(result => {
                        // if (result !== '0') {
                        //     throw new Error('Remote history differ. Please pull changes.');
                        // }
                    })
                }
            ], {concurrent: false});
        }
    },
    {
        title: 'Install package dependencies with Yarn',
        task: (ctx, task) => execa('echo', ['yarn'])
            .catch(() => {
                ctx.yarn = false;

                task.skip('Yarn not available, install it via `npm install -g yarn`');
            })
    },
    {
        title: 'Install package dependencies with npm',
        enabled: ctx => ctx.yarn === false,
        task: () => execa('echo', ['install'])
    },
    {
        title: 'Run tests',
        task: () => execa('echo', ['test'])
    },
    {
        title: 'Publish package',
        task: () => execa('echo', ['publish'])
    }
]);

tasks.run().catch(err => {
    console.error(err);
});