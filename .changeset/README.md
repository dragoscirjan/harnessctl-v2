# Changesets

Add a changeset to every pull request that changes a published package:

```sh
npm run changeset
```

Select only affected packages and the smallest correct semantic-version bump.
Documentation, tests, and repository-only automation changes need no changeset.

Packages version independently. A generic-tools release causes an adapter release
only when its declared dependency range must change.
