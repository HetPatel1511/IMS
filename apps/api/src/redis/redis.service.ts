import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      if (this.client.status !== 'ready') await this.client.connect();
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds = 300): Promise<void> {
    try {
      if (this.client.status !== 'ready') await this.client.connect();
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch {
      // cache is best-effort
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (this.client.status !== 'ready') await this.client.connect();
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      if (this.client.status !== 'ready') await this.client.connect();
      const keys = await this.client.keys(`${prefix}*`);
      if (keys.length) await this.client.del(...keys);
    } catch {
      // ignore
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // ignore
    }
  }
}
