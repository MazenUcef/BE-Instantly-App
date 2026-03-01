import amqp, { Channel, Connection, ConsumeMessage } from "amqplib";

let channel: Channel;

export const connectRabbitMQ = async (): Promise<{
  connection: any;
  channel: Channel;
}> => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  channel = await connection.createChannel();

  await channel.assertQueue("USER_REGISTERED", { durable: true });
  await channel.assertQueue("notifications", { durable: true });
  await channel.assertQueue("email_jobs", { durable: true });

  console.log("✅ RabbitMQ connected");

  return { connection, channel };
};

export const publishToQueue = async (queue: string, message: any) => {
  const ch = getChannel();
  await ch.assertQueue(queue, { durable: true });
  const sent = ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
  console.log(`Message sent to ${queue}: ${sent}`);
};

export const getChannel = (): Channel => {
  if (!channel) throw new Error("RabbitMQ not initialized");
  return channel;
};