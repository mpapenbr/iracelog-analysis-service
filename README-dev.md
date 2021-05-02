# Accessing own packages on GitHub packages

At the moment (2021-04-25) there is no way to get packages from github repository (https://npm.pkg.github.com) without using a personal access token (PAT).  
So we need to put one in place at `~/.npmrc` which looks like this

```
@mpapenbr:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=<READ_ACCESS_TOKEN>
```
