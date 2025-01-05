import { Db } from 'mongodb'
import { EventEmitter } from 'events'
import crypto from 'crypto'
import type { RequiredDeep } from 'type-fest-4'

export interface LeaderOptions {
  /** Collection name. @default 'leader' */
  collectionName?: string
  /** Unique identifier for the group of instances trying to be elected as leader. @default 'default' */
  groupName?: string
  /** Lock time to live in milliseconds. @minimum 1000 @default 1000 */
  ttl?: number
  /** Time between tries getting elected in milliseconds. @minimum 500 @default 500 */
  wait?: number
}

/**
 * Leader election backed by MongoDB
 *
 * @example
 *
 * ```ts
 * import mongoose from 'mongoose'
 * import Leader from 'mongo-lead'
 *
 *
 * const leader = new Leader(mongoose.connection.db, {
 *   groupName: 'all-cron-jobs',
 *   ttl: 10000,
 *   wait: 1000,
 * })
 *
 * leader.start()
 *
 * leader.on('elected', () => {
 *   console.log('Starting all cron jobs')
 *   // ...Rest of the code
 * })
 *
 * leader.on('revoked', () => {
 *   console.log('Stopping all cron jobs')
 *   // ...Rest of the code
 * })
 * ```
 */
export default class Leader extends EventEmitter {
  private id: string
  private db: Db
  private options: RequiredDeep<LeaderOptions>
  private paused: boolean
  private initiated: boolean

  constructor(db: Db, options: LeaderOptions = {}) {
    super()
    this.options = {
      collectionName: 'leader',
      groupName: 'default',
      ttl: 1000,
      wait: 500,
      ...options,
    }
    this.id = crypto.randomUUID()
    this.db = db
    this.paused = false
    this.initiated = false
  }

  // ==============================
  // Public methods
  // ==============================

  /**
   * Checks if the current instance is the elected leader
   */
  async isLeader() {
    // 1. Return false if manager is paused
    if (this.paused) return false
    // 2. Initialize if not already done
    if (!this.initiated) {
      await this.start()
    }
    // 3. Check if we are the current leader
    const item = await this.getCollection().findOne({ 'leader-id': this.id })
    return item != null && item['leader-id'] === this.id
  }

  /**
   * Attempts to elect this instance as the leader if the current leader expired
   * If unsuccessful, retries after the configured wait period
   */
  async elect() {
    // 1. Skip if manager is paused
    if (this.paused) return
    try {
      const collection = this.getCollection()
      const exists = (await collection.countDocuments()) > 0

      // 2. Attempt to update or insert leadership record
      const result = exists
        ? null
        : await collection.findOneAndUpdate(
            {
              groupName: this.options.groupName,
            },
            {
              $set: {
                'leader-id': this.id,
                createdAt: new Date(),
              },
              $setOnInsert: {
                groupName: this.options.groupName,
              },
            },
            {
              upsert: true,
              returnDocument: 'after',
            }
          )

      const isElected = result && result['leader-id'] === this.id

      // 3. Check election results
      if (!isElected) {
        // 4a. If not elected, retry after wait period
        setTimeout(() => this.elect(), this.options.wait)
      } else {
        // 4b. If elected, emit event and schedule renewal
        this.emit('elected')
        setTimeout(() => this.renew(), Math.floor(this.options.ttl / 4))
      }
    } catch (error) {
      // 5. Handle errors by retrying
      console.error('Election error:', error)
      setTimeout(() => this.elect(), this.options.wait)
    }
  }

  /**
   * Renews the leadership status if this instance is the current leader
   * If renewal fails, triggers new election process
   */
  async renew() {
    // 1. Skip if manager is paused
    if (this.paused) return
    try {
      // 2. Attempt to renew leadership

      // 2a. Calculate the expiration date
      const expiresAt = new Date(Date.now() - this.options.ttl)

      // 2b. Attempt to renew leadership
      const result = await this.getCollection().findOneAndUpdate(
        {
          'leader-id': this.id,
          groupName: this.options.groupName,
          createdAt: { $gt: expiresAt },
        },
        {
          $set: {
            createdAt: new Date(),
          },
        },
        {
          returnDocument: 'after',
        }
      )

      // 3. Check renewal result
      if (result) {
        // 3a. If renewed, schedule next renewal
        setTimeout(() => this.renew(), Math.floor(this.options.ttl / 4))
      } else {
        // 3b. If renewal failed, emit event and trigger new election
        this.emit('revoked')
        setTimeout(() => this.elect(), this.options.wait)
      }
    } catch (error) {
      // 4. Handle errors by triggering new election
      console.error('Renewal error:', error)
      this.emit('revoked')
      setTimeout(() => this.elect(), this.options.wait)
    }
  }

  /**
   * Pauses the leader election process
   */
  pause() {
    if (!this.paused) this.paused = true
  }

  /**
   * Resumes the leader election process
   */
  async resume() {
    if (this.paused) {
      this.paused = false
      await this.elect()
    }
  }

  /**
   * Starts the leader election process
   */
  async start() {
    // 1. Initialize if not already done
    if (!this.initiated) {
      this.initiated = true
      await this.initDatabase()
      await this.elect()
    }
  }

  // ==============================
  // Private methods
  // ==============================

  /**
   * Initializes the database with required indexes and TTL settings
   */
  private async initDatabase() {
    // 1. Verify database connection
    await this.db.command({ ping: 1 })

    // 2. Configure TTL monitor if needed
    if (this.options.ttl < 1000) {
      try {
        await this.db
          .admin()
          .command({ setParameter: 1, ttlMonitorSleepSecs: 1 })
      } catch (err) {
        console.warn(
          'Unable to set TTL monitor sleep time. This is not critical, but TTL precision may be reduced.',
          err
        )
      }
    }

    // 3. Setup collection and indexes
    const collection = await this.createCollection()
    const ttlSeconds = Math.max(Math.floor(this.options.ttl / 1000), 1)

    // 4. Clean up existing indexes
    try {
      await collection.dropIndex('createdAt_1')
      await collection.dropIndex('groupName_1_createdAt_1')
    } catch (err) {
      // Ignore error if indexes don't exist
    }

    // 5. Create new indexes
    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: ttlSeconds }
    )
    await collection.createIndex({ groupName: 1 })
  }

  /**
   * Creates or retrieves the leader collection
   */
  private async createCollection() {
    // 1. Check if collection exists
    const cursor = this.db.listCollections({
      name: this.options.collectionName,
    })
    const exists = await cursor.hasNext()

    // 2. Get or create collection
    const collection = exists
      ? this.db.collection(this.options.collectionName)
      : await this.db.createCollection(this.options.collectionName)
    return collection
  }

  /**
   * Gets the leader collection
   */
  private getCollection() {
    return this.db.collection(this.options.collectionName)
  }
}
