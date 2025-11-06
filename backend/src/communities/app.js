const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.APP_TABLE;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
  // Handle OPTIONS preflight
  if (event.requestContext.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;

    // CREATE COMMUNITY - POST /communities
    if (method === "POST" && path === "/communities") {
      const body = JSON.parse(event.body || "{}");
      const { name, displayName, description, category, rules } = body;

      if (!name || !displayName) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "name and displayName required" }) 
        };
      }

      // Check if community already exists
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${name}`, SK: "META" }
      }));

      if (existing.Item) {
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: "community already exists" }) 
        };
      }

      const now = new Date().toISOString();
      const communityId = uuidv4();

      const item = {
        PK: `COMM#${name}`,
        SK: "META",
        GSI1PK: "COMMUNITY",
        GSI1SK: `CREATED#${now}`,
        type: "community",
        communityId,
        name,
        displayName,
        description: description || "",
        category: category || "general",
        rules: rules || [],
        memberCount: 0,
        postCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ 
          communityId, 
          name, 
          displayName,
          createdAt: now 
        })
      };
    }

    // GET COMMUNITY - GET /communities/{name}
    if (method === "GET" && event.pathParameters && event.pathParameters.name) {
      const name = event.pathParameters.name;

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${name}`, SK: "META" }
      }));

      if (!result.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "community not found" }) 
        };
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result.Item) 
      };
    }

    // LIST ALL COMMUNITIES - GET /communities
    if (method === "GET" && path === "/communities") {
      const limit = event.queryStringParameters?.limit || 20;
      const lastKey = event.queryStringParameters?.lastKey;

      const params = {
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": "COMMUNITY" },
        Limit: parseInt(limit),
        ScanIndexForward: false // newest first
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          communities: result.Items || [],
          lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
        })
      };
    }

    // JOIN COMMUNITY - POST /communities/{name}/join
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/join")) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) 
        };
      }

      const now = new Date().toISOString();

      // Add membership record
      const memberItem = {
        PK: `COMM#${name}`,
        SK: `MEMBER#${userId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `JOINED#${now}`,
        type: "membership",
        userId,
        communityName: name,
        role: "member",
        joinedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: memberItem }));

      // Increment member count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${name}`, SK: "META" },
        UpdateExpression: "ADD memberCount :inc SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":inc": 1,
          ":now": now
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "joined successfully", joinedAt: now })
      };
    }

    // LEAVE COMMUNITY - POST /communities/{name}/leave
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/leave")) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) 
        };
      }

      const now = new Date().toISOString();

      // Remove membership record
      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${name}`, SK: `MEMBER#${userId}` }
      }));

      // Decrement member count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${name}`, SK: "META" },
        UpdateExpression: "ADD memberCount :dec SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":dec": -1,
          ":now": now
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "left successfully" })
      };
    }

    // ADD COMMUNITY FLAIR - POST /communities/{name}/flairs
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/flairs")) {
      const community = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { text, backgroundColor, textColor, moderatorOnly } = body;

      if (!text) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "flair text required" }) };
      }

      const flairId = uuidv4();
      const now = new Date().toISOString();

      const flair = {
        PK: `COMM#${community}`,
        SK: `FLAIR#${flairId}`,
        type: "flair",
        flairId,
        text,
        backgroundColor: backgroundColor || "#0079d3",
        textColor: textColor || "#ffffff",
        moderatorOnly: moderatorOnly || false,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: flair }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ flairId, message: "flair created" }) };
    }

    // GET COMMUNITY FLAIRS - GET /communities/{name}/flairs
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.includes("/flairs")) {
      const community = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `COMM#${community}`,
          ":sk": "FLAIR#"
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ flairs: result.Items || [] }) };
    }

    // UPDATE COMMUNITY SETTINGS - PUT /communities/{name}/settings
    if (method === "PUT" && event.pathParameters && event.pathParameters.name && path.includes("/settings")) {
      const community = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { 
        description, 
        type, // public, restricted, private
        nsfw, 
        allowImages, 
        allowVideos, 
        allowPolls,
        requirePostApproval,
        welcomeMessage,
        primaryColor,
        icon,
        banner
      } = body;

      const now = new Date().toISOString();
      const updates = ["updatedAt = :now"];
      const values = { ":now": now };

      if (description !== undefined) {
        updates.push("description = :desc");
        values[":desc"] = description;
      }
      if (type !== undefined) {
        updates.push("#type = :type");
        values[":type"] = type;
      }
      if (nsfw !== undefined) {
        updates.push("nsfw = :nsfw");
        values[":nsfw"] = nsfw;
      }
      if (allowImages !== undefined) {
        updates.push("allowImages = :img");
        values[":img"] = allowImages;
      }
      if (allowVideos !== undefined) {
        updates.push("allowVideos = :vid");
        values[":vid"] = allowVideos;
      }
      if (allowPolls !== undefined) {
        updates.push("allowPolls = :polls");
        values[":polls"] = allowPolls;
      }
      if (requirePostApproval !== undefined) {
        updates.push("requirePostApproval = :approval");
        values[":approval"] = requirePostApproval;
      }
      if (welcomeMessage !== undefined) {
        updates.push("welcomeMessage = :welcome");
        values[":welcome"] = welcomeMessage;
      }
      if (primaryColor !== undefined) {
        updates.push("primaryColor = :color");
        values[":color"] = primaryColor;
      }
      if (icon !== undefined) {
        updates.push("icon = :icon");
        values[":icon"] = icon;
      }
      if (banner !== undefined) {
        updates.push("banner = :banner");
        values[":banner"] = banner;
      }

      const attributeNames = {};
      if (type !== undefined) {
        attributeNames["#type"] = "type";
      }

      const updateExpression = `SET ${updates.join(", ")}`;

      const params = {
        TableName: TABLE,
        Key: { PK: `COMM#${community}`, SK: "META" },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values
      };

      if (Object.keys(attributeNames).length > 0) {
        params.ExpressionAttributeNames = attributeNames;
      }

      await ddb.send(new UpdateCommand(params));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "settings updated" }) };
    }

    // ADD COMMUNITY RULE - POST /communities/{name}/rules
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/rules")) {
      const community = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { title, description, order } = body;

      if (!title) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "rule title required" }) };
      }

      const ruleId = uuidv4();
      const now = new Date().toISOString();

      const rule = {
        PK: `COMM#${community}`,
        SK: `RULE#${ruleId}`,
        type: "rule",
        ruleId,
        title,
        description: description || "",
        order: order || 0,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: rule }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ ruleId, message: "rule added" }) };
    }

    // GET COMMUNITY RULES - GET /communities/{name}/rules
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.includes("/rules")) {
      const community = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `COMM#${community}`,
          ":sk": "RULE#"
        }
      }));

      const rules = (result.Items || []).sort((a, b) => (a.order || 0) - (b.order || 0));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ rules }) };
    }

    // ADD COMMUNITY WIDGET - POST /communities/{name}/widgets
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/widgets")) {
      const community = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { widgetType, title, content, order } = body;

      if (!widgetType) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "widgetType required" }) };
      }

      const widgetId = uuidv4();
      const now = new Date().toISOString();

      const widget = {
        PK: `COMM#${community}`,
        SK: `WIDGET#${widgetId}`,
        type: "widget",
        widgetId,
        widgetType, // text, rules, moderators, calendar, button
        title: title || "",
        content: content || {},
        order: order || 0,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: widget }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ widgetId, message: "widget added" }) };
    }

    // GET COMMUNITY WIDGETS - GET /communities/{name}/widgets
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.includes("/widgets")) {
      const community = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `COMM#${community}`,
          ":sk": "WIDGET#"
        }
      }));

      const widgets = (result.Items || []).sort((a, b) => (a.order || 0) - (b.order || 0));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ widgets }) };
    }

    // GET USER'S JOINED COMMUNITIES - GET /users/{username}/communities
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/communities")) {
      const username = event.pathParameters.username;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${username}`,
          ":sk": "JOINED#"
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ communities: result.Items || [] }) };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "bad request" }) 
    };

  } catch (err) {
    console.error("communities error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "internal error", error: err.message }) 
    };
  }
};

