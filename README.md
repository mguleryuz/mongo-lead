<div align="center">

[![npm latest package][npm-latest-image]][npm-url]
[![Build Status][ci-image]][ci-url]
[![License][license-image]][license-url]
[![npm downloads][npm-downloads-image]][npm-url]
[![Follow on Twitter][twitter-image]][twitter-url]

</div>

# mongo-lead ~ Leader Election backed by MongoDB

A lightweight leader election implementation using MongoDB as the coordination backend. This package enables distributed systems to elect a single leader among multiple instances, ensuring that only one instance holds the leadership role at any given time.

The leader election process works by:

- Using MongoDB's atomic operations to maintain leadership records
- Implementing a heartbeat mechanism with TTL (Time To Live) indexes
- Automatically handling failover if the leader becomes unavailable
- Providing event-driven leadership status notifications

Perfect for scenarios where you need:

- Distributed cron jobs that should only run on one instance
- Primary/backup system coordination
- Cluster coordination tasks
- Preventing duplicate processing in distributed systems

## Summary

A MongoDB-backed leader election package that provides reliable distributed coordination through atomic operations and TTL-based heartbeats. Built and maintained by [mguleryuz](https://github.com/mguleryuz), inspired by [mongo-leader](https://github.com/andrewmolyuk/mongo-leader) by Andrew Molyuk.

Check out the [Changelog](./CHANGELOG.md) to see what changed in the last releases.

## Install

```sh
bun add mongo-lead
```

## Usage

```ts
import mongoose from 'mongoose'
import Leader from 'mongo-lead'

// Plese note that prior to using the Leader class you need to have a MongoDB instance connected

const leader = new Leader(mongoose.connection.db, {
  groupName: 'all-cron-jobs',
  ttl: 10000,
  wait: 1000,
})

leader.start()

leader.on('elected', () => {
  console.log('Starting all cron jobs')
  // ...Rest of the code
})

leader.on('revoked', () => {
  console.log('Stopping all cron jobs')
  // ...Rest of the code
})
```

## Developing

Install Dependencies

```sh
bun i
```

Watching TS Problems

```sh
bun watch
```

## How to make a release

**For the Maintainer**: Add NPM_TOKEN to the GitHub Secrets.

1. PR with changes
2. Merge PR into main
3. Checkout main
4. `git pull`
5. `bun release: '' | alpha | beta` optionally add `-- --release-as minor | major | 0.0.1`
6. Make sure everything looks good (e.g. in CHANGELOG.md)
7. Lastly run `bun release:pub`
8. Done

## License

This package is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

[ci-image]: https://badgen.net/github/checks/mguleryuz/mongo-lead/main?label=ci
[ci-url]: https://github.com/mguleryuz/mongo-lead/actions/workflows/ci.yaml
[npm-url]: https://npmjs.org/package/mongo-lead
[twitter-url]: https://twitter.com/mgguleryuz
[twitter-image]: https://img.shields.io/twitter/follow/mgguleryuz.svg?label=follow+mgguleryuz
[license-image]: https://img.shields.io/badge/License-MIT-blue
[license-url]: ./LICENSE
[npm-latest-image]: https://img.shields.io/npm/v/mongo-lead/latest.svg
[npm-downloads-image]: https://img.shields.io/npm/dm/mongo-lead.svg
