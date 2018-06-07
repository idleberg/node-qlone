# qlone

[![npm](https://img.shields.io/npm/l/qlone.svg?style=flat-square)](https://www.npmjs.org/package/qlone)
[![npm](https://img.shields.io/npm/v/qlone.svg?style=flat-square)](https://www.npmjs.org/package/qlone)
[![David](https://img.shields.io/david/idleberg/node-qlone.svg?style=flat-square)](https://david-dm.org/idleberg/node-qlone)
[![David](https://img.shields.io/david/dev/idleberg/node-qlone.svg?style=flat-square)](https://david-dm.org/idleberg/node-qlone?type=dev)

CLI tool to clone repositories, install dependencies and run Node scripts. All in one command.

## Installation

`yarn global add qlone || npm install --global qlone`

## Usage

Cloning repositories and getting it ready for development use can be a tedious task. This is where `qlone` comes in. See these two examples:

```sh
# Without qlone
$ git clone https://github.com/idleberg/node-qlone
$ cd node-qlone
$ npm install
$ npm start

# With clone
$ qlone gh:idleberg/node-qlone -is
```

The repository can be provided in many syntaxes:

```sh
# Standard syntaxes
ssh://[user@]host.xz[:port]/path/to/repo.git/
git://host.xz[:port]/path/to/repo.git/
http[s]://host.xz[:port]/path/to/repo.git/
ftp[s]://host.xz[:port]/path/to/repo.git/

# Special shorthands
github:user/repository
gh:user/repository
gitlab:user/repository
gl:user/repository
bitbucket:user/repository
bb:user/repository
```

**Examples:**

```sh
# Simple cloning
$ qlone https://github.com/idleberg/node-qlone.git
$ qlone gh:idleberg/node-qlone

# Clone repository and fetch refs
$ qlone gh:idleberg/node-qlone -f

# Clone and install dependencies
$ qlone gh:idleberg/node-qlone -i

# Clone, install dependencies, run test and start scripts
$ qlone gh:idleberg/node-qlone -its
```

When providing the `--install` flag, the following dependencies will be installed, if available:

- Node packages (requires `package.json`)
- Bower packages (requires `bower.json`)
- Composer packages (requires `composer.json`)
- Dart dependencies (requires `pubspec.yaml`)
- Go dependencies (requires `Gopkg.toml`)
- Python packages (requires `Pipfile`)
- Ruby gems (requires `Gemfile`)
- Git submodules (requires `.gitmodules`)

### Options

Run `qlone --help` to list all available flags:

```
  Usage: qlone <repositories> [options]

  Clones repositories, installs dependencies, runs start scripts

  Options:

    -V, --version          output the version number
    -b, --branch <branch>  specify git branch
    -d, --depth <int>      specify git commit depth
    -f, --fetch            runs git fetch after clone
    -i, --install          installs dependencies for Node, Bower, Composer etc.
    -o, --output <folder>  specify output directory
    -O, --overwrite        overwrite existing folder
    -r, --run <script>     runs specified Node script
    -s, --start            runs Node start script
    -t, --test             runs Node test script
    -h, --help             output usage information
```

## License

This work is licensed under [The MIT License](https://opensource.org/licenses/MIT)

## Donate

You are welcome support this project using [Flattr](https://flattr.com/submit/auto?user_id=idleberg&url=https://github.com/idleberg/node-qlone) or Bitcoin `17CXJuPsmhuTzFV2k4RKYwpEHVjskJktRd`
