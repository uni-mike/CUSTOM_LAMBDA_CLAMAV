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

  try {
    await sqs.sendMessage(params).promise();
  } catch (err) {
    console.error("Error sending message to SQS:", err);
  }
}

async function scanFileWithRetry(filePath, retries = 0) {
  return new Promise((resolve, reject) => {
    exec(`clamscan ${filePath}`, (scanError, scanStdout) => {
      if (scanError) {
        if (retries < MAX_RETRIES) {
          return resolve(scanFileWithRetry(filePath, retries + 1));
        } else {
          reject("Scan failed after retries");
        }
      } else {
        resolve(scanStdout.includes("Infected files: 1"));
      }
    });
  });
}

exports.handler = async function (event) {
  const message = JSON.parse(event.Records[0].body);
  const { url, context } = message;

  const [sourceBucket, objectKey] = url.split('/').slice(-2);
  const tmpFilePath = path.join(os.tmpdir(), objectKey);

  try {
    const s3Object = await s3.getObject({ Bucket: sourceBucket, Key: objectKey }).promise();
    fs.writeFileSync(tmpFilePath, s3Object.Body);
    await sendMessageToSQS({ url, context, status: "inProgress" });

    try {
      const isInfected = await scanFileWithRetry(tmpFilePath);
      const status = isInfected ? "infected" : "secure";
      await sendMessageToSQS({ url, context, status });
    } catch (scanError) {
      console.error("Error during scanning:", scanError);
      await sendMessageToSQS({ url, context, status: "error" });
    }

  } catch (error) {
    console.error("Error:", error);
    await sendMessageToSQS({ url, context, status: "error" });
  } finally {
    fs.unlink(tmpFilePath, (err) => {
      if (err) console.error("Error deleting temporary file:", err);
    });
  }
};
