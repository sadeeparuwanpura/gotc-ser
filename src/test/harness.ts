import type { Express } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { createApp } from '../app';
import { dropEverything, seedDatabase } from '../seed/seed-runner';
import { DEMO_PASSWORD } from '../seed/seed-data';
import { loadMatrix } from '../services/role-permission.service';

/**
 * A single-node replica set rather than a standalone `mongod`, so the transactional
 * paths (reorder, duplicate, order creation, cascade delete) are exercised for real.
 */
let replicaSet: MongoMemoryReplSet | null = null;

export async function startTestServer(): Promise<Express> {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri('gotc-test'));
  await dropEverything();
  await seedDatabase();
  await loadMatrix();
  return createApp();
}

export async function stopTestServer(): Promise<void> {
  await mongoose.disconnect();
  await replicaSet?.stop();
  replicaSet = null;
}

/** A cookie-keeping agent signed in as one of the seeded accounts. */
export async function signIn(app: Express, email: string): Promise<TestAgent> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .send({ email, password: DEMO_PASSWORD })
    .expect(200);

  if (typeof response.body !== 'object' || response.body === null) {
    throw new Error(`Sign-in for ${email} returned no session`);
  }
  return agent;
}

export const ADMIN = 'r.fernando@factory.lk';
export const FABRIC_TECH = 's.jaya@factory.lk';
export const GARMENT_TECH = 'n.perera@factory.lk';
export const PROJECT_MANAGER = 'k.aluthge@factory.lk';
