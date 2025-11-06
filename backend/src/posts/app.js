const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
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
    
    // CREATE POST - POST /communities/{name}/posts
    if (method === "POST" && event.pathParameters && event.pathParameters.name && !path.includes("/search")) {
      const community = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { 
        title, 
        body: content, 
        media, 
        userId, 
        tags, 
        flair, 
        nsfw, 
        spoiler,
        ogContent // Original post if this is a crosspost
      } = body;

      if (!title) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "title required" }) };
      }

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Validate and structure media array
      const processedMedia = (media || []).map(m => {
        // Each media item should have:
        // { type: 'image|video|gif|audio|document', url: 'S3_URL', thumbnail: 'THUMB_URL', metadata: {...} }
        return {
          type: m.type || 'image', // image, video, gif, audio, document
          url: m.url,
          thumbnail: m.thumbnail || m.url, // Fallback to original for images
          metadata: {
            filename: m.metadata?.filename || '',
            size: m.metadata?.size || 0,
            mimeType: m.metadata?.mimeType || '',
            duration: m.metadata?.duration || null, // For videos/audio
            dimensions: m.metadata?.dimensions || null, // { width, height }
            qualities: m.metadata?.qualities || null, // For videos: ['144p', '240p', '360p', '480p', '720p', '1080p']
            hlsManifest: m.metadata?.hlsManifest || null // HLS manifest URL for videos
          },
          caption: m.caption || '' // Optional caption for each media item
        };
      });

      // Determine post type based on content
      let postType = 'text';
      if (processedMedia.length > 0) {
        const hasVideo = processedMedia.some(m => m.type === 'video');
        const hasImage = processedMedia.some(m => m.type === 'image' || m.type === 'gif');
        const hasAudio = processedMedia.some(m => m.type === 'audio');
        const hasDocument = processedMedia.some(m => m.type === 'document');
        
        if (hasVideo) postType = 'video';
        else if (hasImage) postType = 'image';
        else if (hasAudio) postType = 'audio';
        else if (hasDocument) postType = 'link'; // Documents shown as links
      }

      const postId = uuidv4();
      const now = new Date().toISOString();

      const item = {
        PK: `COMM#${community}`,
        SK: `POST#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `CREATED#${now}`,
        type: "post",
        postType, // text, image, video, audio, link
        postId,
        community,
        userId,
        title,
        body: content || "",
        media: processedMedia,
        tags: tags || [],
        flair: flair || null,
        nsfw: nsfw || false,
        spoiler: spoiler || false,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        commentCount: 0,
        viewCount: 0,
        shareCount: 0,
        awardCount: 0,
        status: "active",
        isCrosspost: !!ogContent,
        originalPost: ogContent || null, // { postId, community, title, userId }
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      // Increment post count in community
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${community}`, SK: "META" },
        UpdateExpression: "ADD postCount :inc SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":inc": 1,
          ":now": now
        }
      }));

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({ postId, createdAt: now })
      };
    }

    // EDIT POST - PUT /posts/{postId}
    if (method === "PUT" && event.pathParameters && event.pathParameters.postId) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, title, body: content, tags } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Find post
      const postResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!postResult.Items || postResult.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "post not found" }) };
      }

      const post = postResult.Items[0];

      // Check ownership
      if (post.userId !== userId) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: "not authorized" }) };
      }

      const now = new Date().toISOString();
      const updates = ["updatedAt = :now", "edited = :edited"];
      const values = { ":now": now, ":edited": true };

      if (title) {
        updates.push("title = :title");
        values[":title"] = title;
      }
      if (content !== undefined) {
        updates.push("body = :body");
        values[":body"] = content;
      }
      if (tags) {
        updates.push("tags = :tags");
        values[":tags"] = tags;
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeValues: values
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "post updated", updatedAt: now })
      };
    }

    // DELETE POST - DELETE /posts/{postId}
    if (method === "DELETE" && event.pathParameters && event.pathParameters.postId) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Find post
      const postResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!postResult.Items || postResult.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "post not found" }) };
      }

      const post = postResult.Items[0];

      // Check ownership
      if (post.userId !== userId) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: "not authorized" }) };
      }

      const now = new Date().toISOString();

      // Soft delete
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "SET #status = :status, body = :body, updatedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "deleted",
          ":body": "[deleted]",
          ":now": now
        }
      }));

      // Decrement community post count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${post.community}`, SK: "META" },
        UpdateExpression: "ADD postCount :dec SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":dec": -1,
          ":now": now
        }
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "post deleted" })
      };
    }

    // LIST POSTS IN COMMUNITY - GET /communities/{name}/posts
    if (method === "GET" && event.pathParameters && event.pathParameters.name && !path.includes("/search")) {
      const community = event.pathParameters.name;
      const limit = parseInt(event.queryStringParameters?.limit || 25);
      const lastKey = event.queryStringParameters?.lastKey;
      const sort = event.queryStringParameters?.sort || "new"; // new, hot, top, controversial

      const params = {
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { 
          ":pk": `COMM#${community}`,
          ":sk": "POST#"
        },
        Limit: limit,
        ScanIndexForward: false
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));
      let items = (result.Items || []).filter(item => item.status === "active");

      // Sorting algorithms
      if (sort === "hot") {
        items = items.sort((a, b) => {
          const aHot = a.score / Math.pow((Date.now() - new Date(a.createdAt).getTime()) / 3600000 + 2, 1.5);
          const bHot = b.score / Math.pow((Date.now() - new Date(b.createdAt).getTime()) / 3600000 + 2, 1.5);
          return bHot - aHot;
        });
      } else if (sort === "top") {
        items = items.sort((a, b) => b.score - a.score);
      } else if (sort === "controversial") {
        items = items.sort((a, b) => {
          const aControversy = Math.min(a.upvotes, a.downvotes) * (a.upvotes + a.downvotes);
          const bControversy = Math.min(b.upvotes, b.downvotes) * (b.upvotes + b.downvotes);
          return bControversy - aControversy;
        });
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          posts: items,
          lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
        })
      };
    }

    // GET SINGLE POST - GET /posts/{postId}
    if (method === "GET" && path.includes("/posts/") && event.pathParameters && event.pathParameters.postId && !path.includes("/vote")) {
      const postId = event.pathParameters.postId;

      const params = {
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` }
      };

      const result = await ddb.send(new QueryCommand(params));
      const item = (result.Items && result.Items[0]) || null;
      
      if (!item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "post not found" }) };
      }

      // Increment view count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: "ADD viewCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      item.viewCount = (item.viewCount || 0) + 1;

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(item) };
    }

    // SEARCH POSTS - GET /posts/search
    if (method === "GET" && path.includes("/posts/search")) {
      const query = event.queryStringParameters?.q || "";
      const limit = parseInt(event.queryStringParameters?.limit || 25);
      
      if (!query || query.length < 2) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "query must be at least 2 characters" }) };
      }

      const params = {
        TableName: TABLE,
        FilterExpression: "#type = :type AND #status = :status AND (contains(#title, :query) OR contains(body, :query))",
        ExpressionAttributeNames: {
          "#type": "type",
          "#status": "status",
          "#title": "title"
        },
        ExpressionAttributeValues: {
          ":type": "post",
          ":status": "active",
          ":query": query.toLowerCase()
        },
        Limit: limit
      };

      const result = await ddb.send(new ScanCommand(params));
      const posts = (result.Items || []).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          posts,
          count: posts.length,
          query
        })
      };
    }

    // GET TRENDING POSTS - GET /posts/trending
    if (method === "GET" && path.includes("/posts/trending")) {
      const limit = parseInt(event.queryStringParameters?.limit || 10);
      const timeframe = event.queryStringParameters?.timeframe || "day"; // day, week, month

      const now = Date.now();
      const timeframes = {
        day: 24 * 3600000,
        week: 7 * 24 * 3600000,
        month: 30 * 24 * 3600000
      };

      const params = {
        TableName: TABLE,
        FilterExpression: "#type = :type AND #status = :status",
        ExpressionAttributeNames: {
          "#type": "type",
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":type": "post",
          ":status": "active"
        }
      };

      const result = await ddb.send(new ScanCommand(params));
      
      const trending = (result.Items || [])
        .filter(post => now - new Date(post.createdAt).getTime() < timeframes[timeframe])
        .map(post => ({
          ...post,
          trendScore: (post.score + post.commentCount * 2 + post.viewCount * 0.1) / 
                     Math.pow((now - new Date(post.createdAt).getTime()) / 3600000 + 2, 1.5)
        }))
        .sort((a, b) => b.trendScore - a.trendScore)
        .slice(0, limit);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ posts: trending, timeframe })
      };
    }

    // SAVE POST - POST /posts/{postId}/save
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/save")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const now = new Date().toISOString();

      const saveItem = {
        PK: `USER#${userId}`,
        SK: `SAVED#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `SAVED#${now}`,
        type: "saved",
        userId,
        postId,
        savedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: saveItem }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "post saved" }) };
    }

    // UNSAVE POST - DELETE /posts/{postId}/save
    if (method === "DELETE" && event.pathParameters && event.pathParameters.postId && path.includes("/save")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `SAVED#${postId}` }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "post unsaved" }) };
    }

    // GET SAVED POSTS - GET /users/{username}/saved
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/saved")) {
      const username = event.pathParameters.username;
      const limit = parseInt(event.queryStringParameters?.limit || 25);

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${username}`,
          ":sk": "SAVED#"
        },
        Limit: limit,
        ScanIndexForward: false
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ saved: result.Items || [] }) };
    }

    // HIDE POST - POST /posts/{postId}/hide
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/hide") && !path.includes("/unhide")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const now = new Date().toISOString();

      const hideItem = {
        PK: `USER#${userId}`,
        SK: `HIDDEN#${postId}`,
        type: "hidden",
        userId,
        postId,
        hiddenAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: hideItem }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "post hidden" }) };
    }

    // UNHIDE POST - POST /posts/{postId}/unhide
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/unhide")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `HIDDEN#${postId}` }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "post unhidden" }) };
    }

    // AWARD POST - POST /posts/{postId}/award
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/award")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, awardType, isAnonymous } = body;

      if (!userId || !awardType) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId and awardType required" }) };
      }

      const awardId = uuidv4();
      const now = new Date().toISOString();

      const award = {
        PK: `POST#${postId}`,
        SK: `AWARD#${awardId}`,
        GSI1PK: `AWARD#${awardId}`,
        GSI1SK: `CREATED#${now}`,
        type: "award",
        awardId,
        postId,
        givenBy: isAnonymous ? "anonymous" : userId,
        awardType, // silver, gold, platinum, custom
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: award }));

      // Increment award count on post
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `COMM#${postId.split('#')[0]}`, SK: `POST#${postId}` },
        UpdateExpression: "ADD awardCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ awardId, message: "award given" }) };
    }

    // SET POST FLAIR - PUT /posts/{postId}/flair
    if (method === "PUT" && event.pathParameters && event.pathParameters.postId && path.includes("/flair")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, flairId, flairText } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

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

      if (post.userId !== userId) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: "not authorized" }) };
      }

      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "SET flairId = :flairId, flairText = :flairText, updatedAt = :now",
        ExpressionAttributeValues: {
          ":flairId": flairId || null,
          ":flairText": flairText || null,
          ":now": now
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "flair updated" }) };
    }

    // CROSSPOST - POST /posts/{postId}/crosspost
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/crosspost")) {
      const originalPostId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, community, title } = body;

      if (!userId || !community || !title) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId, community, and title required" }) };
      }

      const postId = uuidv4();
      const now = new Date().toISOString();

      const crosspost = {
        PK: `COMM#${community}`,
        SK: `POST#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `CREATED#${now}`,
        type: "post",
        postId,
        community,
        userId,
        title,
        isCrosspost: true,
        originalPostId,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        commentCount: 0,
        viewCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: crosspost }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ postId, message: "crossposted successfully" }) };
    }

    // GET POST MEDIA - GET /posts/{postId}/media
    if (method === "GET" && event.pathParameters && event.pathParameters.postId && path.includes("/media")) {
      const postId = event.pathParameters.postId;

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
      return { 
        statusCode: 200, 
        headers: corsHeaders, 
        body: JSON.stringify({ 
          postId, 
          postType: post.postType,
          media: post.media || [],
          nsfw: post.nsfw || false,
          spoiler: post.spoiler || false
        }) 
      };
    }

    // TRACK MEDIA VIEW - POST /posts/{postId}/media/view
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/media/view")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, mediaIndex, duration } = body; // duration = seconds watched for videos

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

      // Track view analytics
      const viewId = uuidv4();
      const now = new Date().toISOString();

      const viewRecord = {
        PK: `POST#${postId}`,
        SK: `VIEW#${viewId}`,
        type: "media_view",
        userId: userId || 'anonymous',
        mediaIndex: mediaIndex || 0,
        duration: duration || 0,
        timestamp: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: viewRecord }));

      // Increment view count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "ADD viewCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "view tracked" }) };
    }

    // UPDATE POST MEDIA - PUT /posts/{postId}/media
    if (method === "PUT" && event.pathParameters && event.pathParameters.postId && path.includes("/media")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, media } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

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

      if (post.userId !== userId) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: "not authorized" }) };
      }

      // Process new media
      const processedMedia = (media || []).map(m => ({
        type: m.type || 'image',
        url: m.url,
        thumbnail: m.thumbnail || m.url,
        metadata: {
          filename: m.metadata?.filename || '',
          size: m.metadata?.size || 0,
          mimeType: m.metadata?.mimeType || '',
          duration: m.metadata?.duration || null,
          dimensions: m.metadata?.dimensions || null,
          qualities: m.metadata?.qualities || null,
          hlsManifest: m.metadata?.hlsManifest || null
        },
        caption: m.caption || ''
      }));

      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "SET media = :media, updatedAt = :now",
        ExpressionAttributeValues: {
          ":media": processedMedia,
          ":now": now
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "media updated" }) };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "bad request" }) };
  } catch (err) {
    console.error("posts error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "internal error", error: err.message }) };
  }
};