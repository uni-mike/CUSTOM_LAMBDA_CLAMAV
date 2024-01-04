const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

exports.handler = async function (event) {
  console.log("Got event:", event);

  const message = JSON.parse(event.Records[0].body);
  const { sourceBucket, objectKey, destinationBucket } = message;

  execSync('freshclam');

  const tmpFilePath = path.join(os.tmpdir(), objectKey);
  const s3Object = await s3.getObject({ Bucket: sourceBucket, Key: objectKey }).promise();
  fs.writeFileSync(tmpFilePath, s3Object.Body);

  try {
    execSync(`clamscan ${tmpFilePath}`);
    console.log("File is clean, proceeding to upload.");

    await s3.putObject({
      Bucket: destinationBucket,
      Key: objectKey,
      Body: fs.readFileSync(tmpFilePath)
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'File processed and uploaded successfully.' })
    };
  } catch (error) {
    console.error("File is infected or an error occurred:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'File is infected or an error occurred.' })
    };
  } finally {
    try {
      fs.unlinkSync(tmpFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up temporary file:", cleanupError);
    }
  }
};
