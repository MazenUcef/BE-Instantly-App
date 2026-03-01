import { Request, Response, Router } from "express";
import redis from "../../../shared/config/redis";

const router = Router()

router.get('/redis', async (req: Request, res: Response) => {
    await redis.set('test:key', 'hello redis', 'EX', 30);
    const value = await redis.get('test:key');

    res.json({
        status: 'ok',
        value
    })
})

export default router