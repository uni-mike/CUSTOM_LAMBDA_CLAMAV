const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const sqs = new AWS.SQS();
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const outputQueueUrl = "https://sqs.us-east-2.amazonaws.com/207124830781/prod_clamav_result";
const MAX_RETRIES = 5;

async function sendMessageToSQS(message) {
  const params = {
    MessageBody: JSON.stringify(message),
    QueueUrl: outputQueueUrl
  };

  console.log(`Sending message to SQS: ${JSON.stringify(message)}`);

  try {
    await sqs.sendMessage(params).promise();
    console.log(`Successfully sent message to SQS: ${JSON.stringify(message)}`);
  } catch (err) {
    console.error("Error sending message to SQS:", err);
  }
}

async function updateClamAV() {
  console.log("Starting ClamAV update...");

  return new Promise((resolve, reject) => {
    exec("freshclam", (updateError, updateStdout, updateStderr) => {
      if (updateError) {
        console.error("ClamAV update error:", updateStderr);
        reject(updateError);
      } else {
        console.log("ClamAV updated successfully:", updateStdout);
        resolve(updateStdout);
      }
    });
  });
}

async function scanFileWithRetry(filePath, retries = 0) {
  console.log(`Starting ClamAV scan for file: ${filePath} (Attempt: ${retries + 1})`);

  return new Promise((resolve, reject) => {
    exec(`clamscan ${filePath}`, (scanError, scanStdout) => {
      if (scanError) {
        console.error(`Scan error on attempt ${retries + 1}: ${scanError}`);
        if (retries < MAX_RETRIES) {
          console.log(`Retrying file scan: ${filePath} (Attempt: ${retries + 2})`);
          return resolve(scanFileWithRetry(filePath, retries + 1));
        } else {
          console.error(`File scan failed after ${MAX_RETRIES} retries: ${filePath}`);
          reject("Scan failed after retries");
        }
      } else {
        console.log(`Scan result for file: ${filePath} - ${scanStdout}`);
        resolve(scanStdout.includes("Infected files: 1"));
      }
    });
  });
}

exports.handler = async function (event) {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const message = JSON.parse(event.Records[0].body);
  console.log("Parsed message:", JSON.stringify(message, null, 2));

  const { url, context } = message;
  console.log(`Processing file from URL: ${url} with context: ${context}`);

  let sourceBucket, objectKey;

  if (url.startsWith('s3://')) {
    const urlParts = url.replace('s3://', '').split('/');
    sourceBucket = urlParts[0];
    objectKey = urlParts.slice(1).join('/');
    console.log(`Extracted S3 bucket: ${sourceBucket}, object key: ${objectKey}`);
  } else {
    const errorMsg = "Invalid S3 URL format";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const tmpFilePath = path.join(os.tmpdir(), path.basename(objectKey));
  console.log(`Temporary file path: ${tmpFilePath}`);

  try {
    console.log(`Attempting to retrieve file from S3 (Bucket: ${sourceBucket}, Key: ${objectKey})`);
    const s3Object = await s3.getObject({ Bucket: sourceBucket, Key: objectKey }).promise();
    console.log("Successfully retrieved file from S3");

    fs.writeFileSync(tmpFilePath, s3Object.Body);
    console.log(`File written to temporary path: ${tmpFilePath}`);

    await sendMessageToSQS({ url, context, status: "inProgress" });

    try {
      await updateClamAV();
      console.log("ClamAV virus definitions updated successfully.");

      const isInfected = await scanFileWithRetry(tmpFilePath);
      const status = isInfected ? "infected" : "secure";
      console.log(`Scan completed. File status: ${status}`);
      await sendMessageToSQS({ url, context, status });
    } catch (scanError) {
      console.error("Error during scanning or ClamAV update:", scanError);
      await sendMessageToSQS({ url, context, status: "error" });
    }

  } catch (error) {
    console.error("Error during file processing:", error);
    await sendMessageToSQS({ url, context, status: "error" });
  } finally {
    fs.unlink(tmpFilePath, (err) => {
      if (err) {
        console.error("Error deleting temporary file:", err);
      } else {
        console.log(`Temporary file deleted: ${tmpFilePath}`);
      }
    });
  }
};