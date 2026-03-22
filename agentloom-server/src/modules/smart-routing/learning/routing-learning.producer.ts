import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import {
  ROUTING_LEARNING_JOB_NAME,
  ROUTING_LEARNING_QUEUE,
  type RoutingLearningJob,
} from './routing-learning.types';

@Injectable()
export class RoutingLearningProducer {
  constructor(
    @InjectQueue(ROUTING_LEARNING_QUEUE)
    private readonly queue: Queue<RoutingLearningJob>,
  ) {}

  async enqueueLearningJob(data: RoutingLearningJob): Promise<void> {
    await this.queue.add(ROUTING_LEARNING_JOB_NAME, data, {
      jobId: data.routingDecisionId,
    });
  }
}
