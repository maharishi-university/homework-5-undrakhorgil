import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

// Setup clients
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || "users";

export const handler = async (event) => {
  try {
    // Parse input
    let jsonBody;
    try {
      jsonBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body || event;
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid JSON format" }),
      };
    }

    const { userId, ...fields } = jsonBody;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "'userId' is required" }),
      };
    }

    // Query to get all items for userId
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
      })
    );

    const items = queryResult.Items;
    if (!items || items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "User not found" }),
      };
    }

    // DELETE if no other fields
    if (Object.keys(fields).length === 0) {
      for (const item of items) {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              userId: item.userId,
              name: item.name, // Change 'name' to your sort key
            },
          })
        );
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Deleted ${items.length} item(s) for userId ${userId}`,
        }),
      };
    }

    // UPDATE if additional fields provided
    const updates = { ...fields, updatedAt: new Date().toISOString() };
    const targetItem = items[0]; // Only update one item

    const updateParams = {
      TableName: TABLE_NAME,
      Key: {
        userId: targetItem.userId,
        name: targetItem.name,
      },
      UpdateExpression:
        "SET " +
        Object.keys(updates)
          .map((key) => `#${key} = :${key}`)
          .join(", "),
      ExpressionAttributeNames: Object.keys(updates).reduce((acc, key) => {
        acc[`#${key}`] = key;
        return acc;
      }, {}),
      ExpressionAttributeValues: Object.keys(updates).reduce((acc, key) => {
        acc[`:${key}`] = updates[key];
        return acc;
      }, {}),
      ReturnValues: "ALL_NEW",
    };

    const result = await docClient.send(new UpdateCommand(updateParams));
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "User updated successfully",
        updatedItem: result.Attributes,
      }),
    };
  } catch (error) {
    console.error("Handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: error.message,
      }),
    };
  }
};
