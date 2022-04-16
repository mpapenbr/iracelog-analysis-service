# How to publish

The package publishing is done by GitHub Actions. See `.github/workflows/publish.yml`

This will be triggered by a new tag. The local actions are as follows:

```
yarn release:[patch|minor|major]
```

This will do the following

- increment that version number in `package.json`
- run the tests
- create a tag of the version with prefix `v`
- update the `CHANGELOG.md`

_Note:_ It is important to keep the version in `CHANGELOG.md` and `package.json` in sync. In general, this works out of the box as designed.
We use changelog (https://github.com/lob/generate-changelog) for generating the `CHANGELOG.md `. The github workflow uses https://github.com/ScottBrenner/generate-changelog-action to generate the changelog for the release.

If the tests are successful the tag is created and pushed to the repository. GHA will recognize the new tag and start the publish process.

# Accessing own packages on GitHub packages

At the moment (2021-04-25) there is no way to get packages from github repository (https://npm.pkg.github.com) without using a personal access token (PAT).  
So we need to put one in place at `~/.npmrc` which looks like this

```
@mpapenbr:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=<READ_ACCESS_TOKEN>
```

# When running someting inside the container

## export some env vars

```
export $(cat .env.dev )
```
