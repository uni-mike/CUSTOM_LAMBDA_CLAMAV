const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

exports.handler = async function (event) {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const message = JSON.parse(event.Records[0].body);
  const { sourceBucket, objectKey, destinationBucket } = message;

  console.log("Updating ClamAV virus definitions...");
  try {
    const updateOutput = execSync("freshclam").toString();
    console.log("ClamAV update output:", updateOutput);
  } catch (updateError) {
    console.error("ClamAV update error:", updateError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error updating ClamAV." }),
    };
  }

  console.log(`Downloading file from S3: s3://${sourceBucket}/${objectKey}`);
  const tmpFilePath = path.join(os.tmpdir(), objectKey);
  try {
    const s3Object = await s3
      .getObject({ Bucket: sourceBucket, Key: objectKey })
      .promise();
    fs.writeFileSync(tmpFilePath, s3Object.Body);
    console.log("File downloaded and written to:", tmpFilePath);
  } catch (downloadError) {
    console.error("Error downloading file from S3:", downloadError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error downloading file from S3." }),
    };
  }

  return new Promise((resolve, reject) => {
    console.log("Scanning file with ClamAV:", tmpFilePath);
    exec(`clamscan ${tmpFilePath}`, (error, stdout, stderr) => {
      if (error) {
        console.error("Error during ClamAV scan:", error);
        return reject({
          statusCode: 500,
          body: JSON.stringify({ error: "ClamAV scan error." }),
        });
      }
      console.log("ClamAV scan output:", stdout);

      s3.putObject({
        Bucket: destinationBucket,
        Key: objectKey,
        Body: fs.readFileSync(tmpFilePath),
      }).promise()
        .then(() => {
          console.log("File uploaded successfully to:", `s3://${destinationBucket}/${objectKey}`);
          resolve({
            statusCode: 200,
            body: JSON.stringify({
              message: "File processed and uploaded successfully.",
            }),
          });
        })
        .catch(uploadError => {
          console.error("Error uploading file to S3:", uploadError);
          reject({
            statusCode: 500,
            body: JSON.stringify({ error: "Error uploading file to S3." }),
          });
        })
        .finally(() => {
          try {
            fs.unlinkSync(tmpFilePath);
            console.log("Temporary file deleted:", tmpFilePath);
          } catch (cleanupError) {
            console.error("Error cleaning up temporary file:", cleanupError);
          }
        });
    });
  });
};
