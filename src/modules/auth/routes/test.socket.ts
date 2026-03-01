import { Router } from 'express';

const router = Router();

router.get('/socket', (req: any, res) => {
  const io = req.app.get('io');

  io.emit('test_event', {
    message: 'Hello from server',
    time: new Date(),
  });

  res.json({ socket: 'event emitted' });
});

export default router;
