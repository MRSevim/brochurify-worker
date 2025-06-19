import { PutObjectCommand } from "@aws-sdk/client-s3";
import puppeteer from "puppeteer";
import { s3Client } from "./clients.js";

const Bucket = process.env.S3_BUCKET_NAME;

export const uploadToS3 = async ({ buffer, key, contentType }) => {
  try {
    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);

    return `${process.env.AWS_CLOUDFRONT_URL}/${key}`;
  } catch (error) {
    throw new Error(`uploadToS3 failed: ${error.message || error}`);
  }
};

export const getScreenSnapshot = async (html) => {
  let instance;
  try {
    const instance = await puppeteer.launch({
      headless: true,
      timeout: 0,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await instance.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: true,
    });
    await page.close();
    await instance.close();
    return buffer;
  } catch (error) {
    throw new Error(`getScreenSnapshot failed: ${error.message || error}`);
  } finally {
    if (instance) await instance.close();
  }
};
