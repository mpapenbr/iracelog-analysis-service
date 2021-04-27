# Accessing own packages on GitHub packages

No so brillant.
As of now (2021-04-26) I got this only working with my (general purpose) personal access token. GITHUB_ACTION_TOKEN does not work. I had to define a repository secret (PAT_REPO_ACCESS) and use that with github actions.

**Also important**: The referenced lib iracelog-analyis has to be published with `--access public` otherwise we get a 401 during the install phase.
