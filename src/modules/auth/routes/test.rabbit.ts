import { Router } from 'express';
import { connectRabbitMQ } from '../../../shared/config/rabbitmq';

const router = Router();

router.get('/rabbit', async (_, res) => {
  const { channel } = await connectRabbitMQ();

  const queue = 'test_queue';
  await channel.assertQueue(queue);

  channel.sendToQueue(queue, Buffer.from(JSON.stringify({
    event: 'TEST_EVENT',
    message: 'Hello RabbitMQ',
  })));

  res.json({ rabbitmq: 'message sent' });
});

export default router;
