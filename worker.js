import { Worker } from "bullmq";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { uploadToS3, getScreenSnapshot } from "./helpers.js";
import { Redis } from "ioredis";
import { docClient } from "./clients.js";

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

const TABLE_NAME = process.env.DB_TABLE_NAME;

const snapshotWorker = new Worker(
  "snapshot-queue",
  async (job) => {
    try {
      const { isTemplate, html, id, userId } = job.data;
      console.log("Received job:", job.id);
      // ✅ 1. Check if project still exists
      const getResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { userId, id },
        })
      );

      if (!getResult.Item) {
        console.warn(`Job ${job.id} skipped: item no longer exists.`);
        return; // ⛔ Abort the job early
      }
      const buffer = await getScreenSnapshot(html);
      console.log("Snapshot buffer generated.");

      const snapshot = await uploadToS3({
        buffer,
        key: isTemplate
          ? `templateSnapshots/${id}.jpeg`
          : `${userId}/snapshots/${id}.jpeg`,
        contentType: "image/jpeg",
      });
      console.log("Snapshot uploaded to S3:", snapshot);

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            id,
          },
          UpdateExpression: "SET #snapshot = :snapshot",
          ExpressionAttributeNames: {
            "#snapshot": "snapshot",
          },
          ExpressionAttributeValues: {
            ":snapshot": snapshot,
          },
        })
      );
      console.log("Snapshot URL saved to DynamoDB.");
    } catch (error) {
      console.error(`${error.message}`);
    }
  },
  { connection }
);
snapshotWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});
