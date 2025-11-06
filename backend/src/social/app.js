const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
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

    // FOLLOW USER - POST /users/{username}/follow
    if (method === "POST" && event.pathParameters && event.pathParameters.username && path.includes("/follow")) {
      const targetUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Get target user
      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;
      const now = new Date().toISOString();

      // Check if already following
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `FOLLOWING#${targetUserId}` }
      }));

      if (existing.Item) {
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: "already following" }) };
      }

      // Create follow relationship
      const follow = {
        PK: `USER#${userId}`,
        SK: `FOLLOWING#${targetUserId}`,
        GSI1PK: `USER#${targetUserId}`,
        GSI1SK: `FOLLOWER#${userId}`,
        type: "follow",
        followerId: userId,
        followingId: targetUserId,
        followingUsername: targetUsername,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: follow }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "now following", followedAt: now })
      };
    }

    // UNFOLLOW USER - DELETE /users/{username}/follow
    if (method === "DELETE" && event.pathParameters && event.pathParameters.username && path.includes("/follow")) {
      const targetUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `FOLLOWING#${targetUserId}` }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "unfollowed" })
      };
    }

    // GET FOLLOWERS - GET /users/{username}/followers
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/followers")) {
      const username = event.pathParameters.username;
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      const user = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!user.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const userId = user.Item.userId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "FOLLOWER#"
        },
        Limit: limit
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          followers: result.Items || [],
          count: (result.Items || []).length
        })
      };
    }

    // GET FOLLOWING - GET /users/{username}/following
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/following")) {
      const username = event.pathParameters.username;
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      const user = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!user.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const userId = user.Item.userId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "FOLLOWING#"
        },
        Limit: limit
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          following: result.Items || [],
          count: (result.Items || []).length
        })
      };
    }

    // SEND DIRECT MESSAGE - POST /messages
    if (method === "POST" && path === "/messages") {
      const body = JSON.parse(event.body || "{}");
      const { senderId, recipientId, encryptedMessage, media, replyToId } = body;

      if (!senderId || !recipientId || !encryptedMessage) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "senderId, recipientId, and encryptedMessage required" }) };
      }

      const messageId = uuidv4();
      const now = new Date().toISOString();
      const conversationId = [senderId, recipientId].sort().join("#");

      const dm = {
        PK: `CONV#${conversationId}`,
        SK: `MSG#${now}#${messageId}`,
        GSI1PK: `USER#${recipientId}`,
        GSI1SK: `INBOX#${now}`,
        type: "message",
        messageId,
        conversationId,
        senderId,
        recipientId,
        encryptedMessage, // Client-side encrypted with recipient's public key
        media: media || [],
        replyToId: replyToId || null,
        read: false,
        delivered: false,
        encrypted: true,
        createdAt: now,
        expiresAt: null // For disappearing messages
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: dm }));

      // Update conversation last activity
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `CONV#${conversationId}`,
          SK: "META",
          type: "conversation",
          conversationId,
          participants: [senderId, recipientId],
          lastMessageAt: now,
          lastMessagePreview: "[Encrypted message]",
          updatedAt: now
        }
      }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ 
        messageId, 
        sentAt: now,
        conversationId 
      })};
    }

    // GET CONVERSATION - GET /messages/conversations/{conversationId}
    if (method === "GET" && event.pathParameters && event.pathParameters.conversationId && path.includes("/conversations/")) {
      const conversationId = event.pathParameters.conversationId;
      const limit = parseInt(event.queryStringParameters?.limit || 50);
      const lastKey = event.queryStringParameters?.lastKey;

      const params = {
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CONV#${conversationId}`,
          ":sk": "MSG#"
        },
        Limit: limit,
        ScanIndexForward: false
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          messages: result.Items || [],
          lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
        })
      };
    }

    // GET USER INBOX - GET /messages/inbox
    if (method === "GET" && path.includes("/inbox")) {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "INBOX#"
        },
        Limit: limit,
        ScanIndexForward: false
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          messages: result.Items || [],
          unreadCount: (result.Items || []).filter(m => !m.read).length
        })
      };
    }

    // MARK MESSAGE AS READ - PUT /messages/{messageId}/read
    if (method === "PUT" && event.pathParameters && event.pathParameters.messageId && path.includes("/read")) {
      const messageId = event.pathParameters.messageId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Find message
      const result = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "messageId = :mid AND recipientId = :uid",
        ExpressionAttributeValues: {
          ":mid": messageId,
          ":uid": userId
        },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "message not found" }) };
      }

      const message = result.Items[0];

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: message.PK, SK: message.SK },
        UpdateExpression: "SET #read = :read, readAt = :now",
        ExpressionAttributeNames: { "#read": "read" },
        ExpressionAttributeValues: {
          ":read": true,
          ":now": new Date().toISOString()
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "marked as read" })
      };
    }

    // CROSS-POST - POST /posts/{postId}/crosspost
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/crosspost")) {
      const originalPostId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, targetCommunity, title } = body;

      if (!userId || !targetCommunity) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId and targetCommunity required" }) };
      }

      // Get original post
      const originalResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${originalPostId}` },
        Limit: 1
      }));

      if (!originalResult.Items || originalResult.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "original post not found" }) };
      }

      const original = originalResult.Items[0];
      const crosspostId = uuidv4();
      const now = new Date().toISOString();

      const crosspost = {
        PK: `COMM#${targetCommunity}`,
        SK: `POST#${crosspostId}`,
        GSI1PK: `POST#${crosspostId}`,
        GSI1SK: `CREATED#${now}`,
        type: "post",
        postId: crosspostId,
        community: targetCommunity,
        userId,
        title: title || `Crosspost: ${original.title}`,
        body: original.body,
        media: original.media,
        tags: original.tags || [],
        isCrosspost: true,
        originalPostId,
        originalCommunity: original.community,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        commentCount: 0,
        viewCount: 0,
        shareCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: crosspost }));

      // Increment share count on original
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: original.PK, SK: original.SK },
        UpdateExpression: "ADD shareCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ 
          crosspostId, 
          originalPostId,
          createdAt: now 
        })
      };
    }

    // SHARE TO EXTERNAL - POST /posts/{postId}/share
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/share") && !path.includes("/crosspost")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { platform } = body; // twitter, facebook, linkedin, reddit, etc.

      // Find post
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "post not found" }) };
      }

      const post = result.Items[0];

      // Increment share count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "ADD shareCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      // Generate share URL (you'd use your actual domain)
      const shareUrl = `https://yourapp.com/r/${post.community}/p/${postId}`;
      
      const shareUrls = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(shareUrl)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
        reddit: `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}`
      };

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
          shareUrl: shareUrls[platform] || shareUrl,
          platform 
        })
      };
    }

    // GET FEED (Following) - GET /feed
    if (method === "GET" && path === "/feed") {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 25);

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Get users that this user follows
      const followingResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "FOLLOWING#"
        }
      }));

      const followingUserIds = (followingResult.Items || []).map(f => f.followingId);

      if (followingUserIds.length === 0) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ posts: [], message: "follow users to see their posts" })
        };
      }

      // Get posts from followed users (this is simplified, in production use GSI)
      const params = {
        TableName: TABLE,
        FilterExpression: "#type = :type AND #status = :status AND userId IN (" + 
          followingUserIds.map((_, i) => `:uid${i}`).join(",") + ")",
        ExpressionAttributeNames: {
          "#type": "type",
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":type": "post",
          ":status": "active",
          ...Object.fromEntries(followingUserIds.map((id, i) => [`:uid${i}`, id]))
        },
        Limit: limit
      };

      const result = await ddb.send(new ScanCommand(params));
      
      const posts = (result.Items || []).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ posts, count: posts.length })
      };
    }

    // BLOCK USER - POST /users/{username}/block
    if (method === "POST" && path.includes("/block") && event.pathParameters.username) {
      const targetUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;
      const now = new Date().toISOString();

      const block = {
        PK: `USER#${userId}`,
        SK: `BLOCKED#${targetUserId}`,
        GSI1PK: `USER#${targetUserId}`,
        GSI1SK: `BLOCKEDBY#${userId}`,
        type: "block",
        blockerId: userId,
        blockedId: targetUserId,
        blockedUsername: targetUsername,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: block }));

      // Remove follow relationships if any
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `FOLLOWING#${targetUserId}` }
      }));
      
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUserId}`, SK: `FOLLOWING#${userId}` }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "user blocked" })};
    }

    // UNBLOCK USER - DELETE /users/{username}/block
    if (method === "DELETE" && path.includes("/block") && event.pathParameters.username) {
      const targetUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `BLOCKED#${targetUserId}` }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "user unblocked" })};
    }

    // GET BLOCKED USERS - GET /users/blocked
    if (method === "GET" && path === "/users/blocked") {
      const userId = event.queryStringParameters?.userId;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "BLOCKED#"
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
        blocked: result.Items || [],
        count: (result.Items || []).length
      })};
    }

    // DELETE MESSAGE - DELETE /messages/{messageId}
    if (method === "DELETE" && path.includes("/messages/") && event.pathParameters.messageId) {
      const messageId = event.pathParameters.messageId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Find message
      const result = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "messageId = :mid AND senderId = :uid",
        ExpressionAttributeValues: {
          ":mid": messageId,
          ":uid": userId
        },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "message not found or not authorized" }) };
      }

      const message = result.Items[0];

      // Soft delete - mark as deleted
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: message.PK, SK: message.SK },
        UpdateExpression: "SET deleted = :deleted, deletedAt = :now, encryptedMessage = :msg",
        ExpressionAttributeValues: {
          ":deleted": true,
          ":now": new Date().toISOString(),
          ":msg": "[Message deleted]"
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "message deleted" })};
    }

    // GET ALL CONVERSATIONS - GET /messages/conversations
    if (method === "GET" && path === "/messages/conversations") {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Scan for conversations where user is a participant
      const result = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND contains(participants, :userId)",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":type": "conversation",
          ":userId": userId
        },
        Limit: limit
      }));

      const conversations = (result.Items || []).sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
        conversations,
        count: conversations.length
      })};
    }

    // MARK CONVERSATION AS READ - PUT /messages/conversations/{conversationId}/read
    if (method === "PUT" && path.includes("/conversations/") && path.includes("/read")) {
      const conversationId = event.pathParameters.conversationId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Update all unread messages in conversation
      const messages = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "recipientId = :uid AND #read = :false",
        ExpressionAttributeNames: { "#read": "read" },
        ExpressionAttributeValues: {
          ":pk": `CONV#${conversationId}`,
          ":sk": "MSG#",
          ":uid": userId,
          ":false": false
        }
      }));

      const now = new Date().toISOString();
      
      for (const msg of messages.Items || []) {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: msg.PK, SK: msg.SK },
          UpdateExpression: "SET #read = :true, readAt = :now",
          ExpressionAttributeNames: { "#read": "read" },
          ExpressionAttributeValues: {
            ":true": true,
            ":now": now
          }
        }));
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
        message: "conversation marked as read",
        updatedCount: (messages.Items || []).length
      })};
    }

    // TYPING INDICATOR - POST /messages/conversations/{conversationId}/typing
    if (method === "POST" && path.includes("/typing")) {
      const conversationId = event.pathParameters.conversationId;
      const body = JSON.parse(event.body || "{}");
      const { userId, isTyping } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const now = new Date().toISOString();

      // Store typing indicator (with short TTL in production)
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `CONV#${conversationId}`,
          SK: `TYPING#${userId}`,
          type: "typing",
          userId,
          isTyping: isTyping || false,
          timestamp: now,
          expiresAt: new Date(Date.now() + 5000).toISOString() // 5 seconds
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
        message: "typing indicator updated"
      })};
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "bad request" }) };
  } catch (err) {
    console.error("social error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "internal error", error: err.message }) };
  }
};