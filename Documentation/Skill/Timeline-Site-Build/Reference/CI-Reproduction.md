# Reproducing a build that fails only in CI

A host builds from a pushed commit into an empty directory, with its own Node version and no
inherited `node_modules`. A local checkout has neither property, so "it builds here" says nothing.
Reproduce the host's conditions before editing a config file.

## Recipe

```sh
# 1. The exact commit the host built, into a clean directory
git clone -q --no-local <repo> /tmp/ci-probe
cd /tmp/ci-probe && git checkout -q <sha>

# 2. The host's Node major, from the build log ("Detected … nodejs@X")
export PATH="<node X bin>:$PATH"; node --version

# 3. Install the way the host does
pnpm install --frozen-lockfile

# 4. Build in the mode the host uses
NODE_ENV=production pnpm run build
```

For a working tree that is not committed yet,
`rsync -a --exclude node_modules --exclude .git --exclude Target --exclude .astro ./ /tmp/ci-probe/`
copies it into the same clean state; that is how a fix gets validated before it is pushed.

Delete the probe directory afterwards - it is a full dependency tree.

## What the difference usually is

| Symptom                                                                                          | Cause                                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `Cannot find module '<pkg>' imported from '<root>/<config>'` where the config does not import it | a transitive dependency of the framework, undeclared at the root; pnpm's strict layout does not hoist it |
| Builds locally, fails on the host with the same Node major                                       | stale local `node_modules` satisfying an import the lockfile cannot                                      |
| Fails on a different Node major only                                                             | the framework's `engines` floor, not a config defect                                                     |
| Installs differ in length or content                                                             | the lockfile is not committed, so the host resolves fresh                                                |

## The fix, and its verification

Declare the missing package at the workspace root at the version the framework declares
(`node_modules/<framework>/package.json` → `dependencies`), then prove it in a clean tree:

```sh
pnpm add -Dw <pkg>@<version>
rsync -a --exclude node_modules --exclude .git --exclude Target ./ /tmp/ci-probe/
cd /tmp/ci-probe && pnpm install --frozen-lockfile && NODE_ENV=production pnpm run build
```

A build that succeeds in the probe succeeds on the host, because the probe has no local state to
hide behind. Report the host's own error line, not the local success, when explaining the failure.
