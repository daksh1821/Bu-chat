const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ComprehendClient, DetectSentimentCommand, DetectKeyPhrasesCommand, DetectEntitiesCommand } = require("@aws-sdk/client-comprehend");
const { RekognitionClient, DetectModerationLabelsCommand, DetectLabelsCommand } = require("@aws-sdk/client-rekognition");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const comprehend = new ComprehendClient({});
const rekognition = new RekognitionClient({});

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

    // AUTO-TAG POST - POST /posts/{postId}/auto-tag
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/auto-tag")) {
      const postId = event.pathParameters.postId;

      // Get post
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
      const text = `${post.title}. ${post.body}`;

      try {
        // Detect key phrases
        const keyPhrasesResult = await comprehend.send(new DetectKeyPhrasesCommand({
          Text: text,
          LanguageCode: "en"
        }));

        // Detect entities (people, places, organizations)
        const entitiesResult = await comprehend.send(new DetectEntitiesCommand({
          Text: text,
          LanguageCode: "en"
        }));

        // Extract relevant tags
        const phrases = (keyPhrasesResult.KeyPhrases || [])
          .filter(kp => kp.Score > 0.8)
          .map(kp => kp.Text.toLowerCase())
          .slice(0, 5);

        const entities = (entitiesResult.Entities || [])
          .filter(e => ["PERSON", "LOCATION", "ORGANIZATION", "EVENT"].includes(e.Type) && e.Score > 0.8)
          .map(e => e.Text.toLowerCase())
          .slice(0, 3);

        const suggestedTags = [...new Set([...phrases, ...entities])].slice(0, 8);

        // Update post with tags
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: post.PK, SK: post.SK },
          UpdateExpression: "SET tags = :tags, autoTagged = :auto",
          ExpressionAttributeValues: {
            ":tags": suggestedTags,
            ":auto": true
          }
        }));

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
            tags: suggestedTags,
            message: "tags auto-generated"
          })
        };
      } catch (err) {
        console.error("Comprehend error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "AI analysis failed", error: err.message }) 
        };
      }
    }

    // SENTIMENT ANALYSIS - GET /posts/{postId}/sentiment OR /comments/{commentId}/sentiment
    if (method === "GET" && path.includes("/sentiment")) {
      let targetId, targetType;
      if (event.pathParameters.postId) {
        targetId = event.pathParameters.postId;
        targetType = "post";
      } else if (event.pathParameters.commentId) {
        targetId = event.pathParameters.commentId;
        targetType = "comment";
      }

      // Get content
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { 
          ":pk": targetType === "post" ? `POST#${targetId}` : `COMMENT#${targetId}` 
        },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: `${targetType} not found` }) };
      }

      const item = result.Items[0];
      const text = targetType === "post" ? `${item.title}. ${item.body}` : item.body;

      try {
        const sentimentResult = await comprehend.send(new DetectSentimentCommand({
          Text: text,
          LanguageCode: "en"
        }));

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
            sentiment: sentimentResult.Sentiment,
            scores: {
              positive: sentimentResult.SentimentScore.Positive,
              negative: sentimentResult.SentimentScore.Negative,
              neutral: sentimentResult.SentimentScore.Neutral,
              mixed: sentimentResult.SentimentScore.Mixed
            }
          })
        };
      } catch (err) {
        console.error("Sentiment analysis error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "sentiment analysis failed" }) 
        };
      }
    }

    // MODERATE IMAGE - POST /media/moderate
    if (method === "POST" && path.includes("/media/moderate")) {
      const body = JSON.parse(event.body || "{}");
      const { s3Key } = body;

      if (!s3Key) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "s3Key required" }) };
      }

      try {
        const moderationResult = await rekognition.send(new DetectModerationLabelsCommand({
          Image: {
            S3Object: {
              Bucket: process.env.MEDIA_BUCKET,
              Name: s3Key
            }
          },
          MinConfidence: 60
        }));

        const unsafe = (moderationResult.ModerationLabels || []).filter(label => label.Confidence > 75);
        const isAppropriate = unsafe.length === 0;

        // Also detect general labels for categorization
        const labelsResult = await rekognition.send(new DetectLabelsCommand({
          Image: {
            S3Object: {
              Bucket: process.env.MEDIA_BUCKET,
              Name: s3Key
            }
          },
          MaxLabels: 10,
          MinConfidence: 75
        }));

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
            appropriate: isAppropriate,
            moderationLabels: unsafe,
            contentLabels: (labelsResult.Labels || []).map(l => ({
              name: l.Name,
              confidence: l.Confidence
            }))
          })
        };
      } catch (err) {
        console.error("Image moderation error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "image moderation failed" }) 
        };
      }
    }

    // GET PERSONALIZED RECOMMENDATIONS - GET /recommendations
    if (method === "GET" && path === "/recommendations") {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 10);

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      // Get user's interaction history (votes, comments, views)
      const votesResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "POSTVOTE#"
        },
        Limit: 50
      }));

      // Get posts user upvoted
      const upvotedPostIds = (votesResult.Items || [])
        .filter(v => v.voteType === "up")
        .map(v => v.postId);

      if (upvotedPostIds.length === 0) {
        // New user - return trending posts
        const trending = await ddb.send(new ScanCommand({
          TableName: TABLE,
          FilterExpression: "#type = :type AND #status = :status",
          ExpressionAttributeNames: {
            "#type": "type",
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":type": "post",
            ":status": "active"
          },
          Limit: limit
        }));

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
            posts: (trending.Items || []).sort((a, b) => b.score - a.score).slice(0, limit),
            reason: "trending_for_new_user"
          })
        };
      }

      // Get tags from upvoted posts
      const postsPromises = upvotedPostIds.slice(0, 10).map(async (postId) => {
        const result = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: { ":pk": `POST#${postId}` },
          Limit: 1
        }));
        return result.Items ? result.Items[0] : null;
      });

      const upvotedPosts = (await Promise.all(postsPromises)).filter(p => p);
      const userTags = [...new Set(upvotedPosts.flatMap(p => p.tags || []))];
      const userCommunities = [...new Set(upvotedPosts.map(p => p.community))];

      // Find similar posts
      const allPosts = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND #status = :status",
        ExpressionAttributeNames: {
          "#type": "type",
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":type": "post",
          ":status": "active"
        },
        Limit: 100
      }));

      // Calculate similarity score
      const scored = (allPosts.Items || [])
        .filter(post => !upvotedPostIds.includes(post.postId)) // Exclude already seen
        .map(post => {
          let score = 0;
          
          // Tag similarity
          const commonTags = (post.tags || []).filter(tag => userTags.includes(tag));
          score += commonTags.length * 3;
          
          // Community preference
          if (userCommunities.includes(post.community)) {
            score += 5;
          }
          
          // Recency bonus
          const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3600000;
          if (ageHours < 24) score += 2;
          
          // Engagement bonus
          score += Math.log(post.score + 1);
          
          return { ...post, similarityScore: score };
        })
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, limit);

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          posts: scored,
          reason: "personalized",
          basedOn: {
            tags: userTags.slice(0, 5),
            communities: userCommunities
          }
        })
      };
    }

    // DISCOVER COMMUNITIES - GET /communities/discover
    if (method === "GET" && path.includes("/communities/discover")) {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 5);

      // Get user's communities
      let userCommunities = [];
      if (userId) {
        const memberResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "JOINED#"
          }
        }));
        userCommunities = (memberResult.Items || []).map(m => m.communityName);
      }

      // Get all communities
      const allCommunities = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": "COMMUNITY" }
      }));

      // Filter and score
      const scored = (allCommunities.Items || [])
        .filter(comm => !userCommunities.includes(comm.name))
        .map(comm => {
          let score = 0;
          
          // Activity score
          score += comm.postCount * 2;
          score += comm.memberCount;
          
          // Recency
          const ageMonths = (Date.now() - new Date(comm.createdAt).getTime()) / (30 * 24 * 3600000);
          if (ageMonths < 1) score += 10; // New communities get boost
          
          return { ...comm, discoverScore: score };
        })
        .sort((a, b) => b.discoverScore - a.discoverScore)
        .slice(0, limit);

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          communities: scored,
          message: "discover new communities"
        })
      };
    }

    // ANALYZE COMMENT TOXICITY - POST /comments/{commentId}/analyze-toxicity
    if (method === "POST" && event.pathParameters && event.pathParameters.commentId && path.includes("/analyze-toxicity")) {
      const commentId = event.pathParameters.commentId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "comment not found" }) };
      }

      const comment = result.Items[0];

      try {
        // Use sentiment as proxy for toxicity
        const sentimentResult = await comprehend.send(new DetectSentimentCommand({
          Text: comment.body,
          LanguageCode: "en"
        }));

        const negativeScore = sentimentResult.SentimentScore.Negative;
        const isToxic = negativeScore > 0.75;

        // Simple keyword detection for common toxic patterns
        const toxicKeywords = ["hate", "stupid", "idiot", "kill", "die"];
        const containsToxicWords = toxicKeywords.some(word => 
          comment.body.toLowerCase().includes(word)
        );

        const toxicity = {
          score: negativeScore,
          isToxic: isToxic || containsToxicWords,
          sentiment: sentimentResult.Sentiment,
          containsToxicKeywords: containsToxicWords
        };

        // If toxic, flag for moderation
        if (toxicity.isToxic) {
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: comment.PK, SK: comment.SK },
            UpdateExpression: "SET flaggedForReview = :flag, toxicityScore = :score",
            ExpressionAttributeValues: {
              ":flag": true,
              ":score": negativeScore
            }
          }));
        }

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(toxicity)
        };
      } catch (err) {
        console.error("Toxicity analysis error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "toxicity analysis failed" }) 
        };
      }
    }

    // PERSONALIZED FEED - GET /feed/personalized
    if (method === "GET" && path.includes("/personalized")) {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 25);

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      try {
        // Get user's interaction history
        const interactions = await ddb.send(new ScanCommand({
          TableName: TABLE,
          FilterExpression: "userId = :uid AND #type IN (:vote, :comment, :view)",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: {
            ":uid": userId,
            ":vote": "vote",
            ":comment": "comment",
            ":view": "view"
          },
          Limit: 500
        }));

        // Get user's joined communities
        const communities = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "MEMBER#"
          }
        }));

        const joinedCommunities = (communities.Items || []).map(c => c.communityName);

        // Build user interest profile
        const interestMap = {};
        for (const interaction of interactions.Items || []) {
          if (interaction.community) {
            interestMap[interaction.community] = (interestMap[interaction.community] || 0) + 1;
          }
          if (interaction.tags) {
            for (const tag of interaction.tags) {
              interestMap[tag] = (interestMap[tag] || 0) + 1;
            }
          }
        }

        // Get all recent posts
        const allPosts = await ddb.send(new ScanCommand({
          TableName: TABLE,
          FilterExpression: "#type = :type AND #status = :status",
          ExpressionAttributeNames: {
            "#type": "type",
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":type": "post",
            ":status": "active"
          },
          Limit: 200
        }));

        // Score each post based on personalization algorithm
        const scoredPosts = (allPosts.Items || []).map(post => {
          let score = 0;
          const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3600000;

          // Community interest (40% weight)
          if (joinedCommunities.includes(post.community)) {
            score += 40 * (interestMap[post.community] || 1) / 10;
          }

          // Tag matching (30% weight)
          if (post.tags) {
            const tagScore = post.tags.reduce((sum, tag) => 
              sum + (interestMap[tag] || 0), 0
            );
            score += Math.min(30, tagScore);
          }

          // Engagement quality (20% weight)
          const engagementScore = (
            post.upvotes * 2 + 
            post.commentCount * 3 - 
            post.downvotes * 1
          );
          score += Math.min(20, engagementScore / 10);

          // Recency (10% weight)
          const recencyScore = Math.max(0, 10 - ageHours / 24);
          score += recencyScore;

          // Penalize already seen posts
          const hasInteracted = (interactions.Items || []).some(
            i => i.postId === post.postId
          );
          if (hasInteracted) score *= 0.5;

          return { ...post, personalizedScore: score };
        });

        // Sort by personalized score and apply Hot ranking
        const rankedPosts = scoredPosts
          .sort((a, b) => {
            // Combine personalized score with Reddit Hot algorithm
            const aHot = a.personalizedScore + (
              a.score / Math.pow((Date.now() - new Date(a.createdAt).getTime()) / 3600000 + 2, 1.5)
            );
            const bHot = b.personalizedScore + (
              b.score / Math.pow((Date.now() - new Date(b.createdAt).getTime()) / 3600000 + 2, 1.5)
            );
            return bHot - aHot;
          })
          .slice(0, limit);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          posts: rankedPosts,
          count: rankedPosts.length,
          algorithm: "collaborative_filtering_with_hot_ranking"
        })};
      } catch (err) {
        console.error("Personalized feed error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ 
          message: "personalized feed failed",
          error: err.message 
        })};
      }
    }

    // CONTENT RECOMMENDATIONS - GET /recommendations
    if (method === "GET" && path.includes("/recommendations")) {
      const userId = event.queryStringParameters?.userId;
      const type = event.queryStringParameters?.type || "posts"; // posts, communities, users
      const limit = parseInt(event.queryStringParameters?.limit || 10);

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      try {
        if (type === "communities") {
          // Get user's current communities
          const userCommunities = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": "MEMBER#"
            }
          }));

          const currentCommunities = (userCommunities.Items || []).map(c => c.communityName);

          // Get all communities
          const allCommunities = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: { ":pk": "COMMUNITY" },
            Limit: 100
          }));

          // Recommend communities similar to user's interests
          const recommendations = (allCommunities.Items || [])
            .filter(c => !currentCommunities.includes(c.name))
            .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
            .slice(0, limit);

          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
            recommendations,
            type: "communities"
          })};
        }

        // Default: recommend similar users
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          recommendations: [],
          type
        })};
      } catch (err) {
        console.error("Recommendations error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ 
          message: "recommendations failed" 
        })};
      }
    }

    // TRENDING TOPICS - GET /trending/topics
    if (method === "GET" && path.includes("/trending/topics")) {
      const timeframe = event.queryStringParameters?.timeframe || "day"; // hour, day, week
      const limit = parseInt(event.queryStringParameters?.limit || 20);

      try {
        const timeframes = {
          hour: 3600000,
          day: 86400000,
          week: 604800000
        };

        const since = new Date(Date.now() - timeframes[timeframe]).toISOString();

        // Get recent posts
        const recentPosts = await ddb.send(new ScanCommand({
          TableName: TABLE,
          FilterExpression: "#type = :type AND createdAt > :since",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: {
            ":type": "post",
            ":since": since
          }
        }));

        // Count tag frequency
        const tagCounts = {};
        for (const post of recentPosts.Items || []) {
          if (post.tags) {
            for (const tag of post.tags) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
        }

        // Sort by frequency
        const trending = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          trending,
          timeframe
        })};
      } catch (err) {
        console.error("Trending topics error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ 
          message: "trending topics failed" 
        })};
      }
    }

    // SPAM DETECTION - POST /content/spam-check
    if (method === "POST" && path.includes("/spam-check")) {
      const body = JSON.parse(event.body || "{}");
      const { text, userId } = body;

      if (!text) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "text required" }) };
      }

      try {
        // Simple spam detection rules
        const spamIndicators = {
          excessiveCaps: (text.match(/[A-Z]/g) || []).length / text.length > 0.6,
          excessiveLinks: (text.match(/https?:\/\//g) || []).length > 3,
          excessiveEmojis: (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length > 10,
          repeatedChars: /(.)\1{4,}/.test(text),
          shortWithLinks: text.length < 50 && /https?:\/\//.test(text)
        };

        const spamScore = Object.values(spamIndicators).filter(Boolean).length / 
                         Object.keys(spamIndicators).length;

        const isSpam = spamScore > 0.4;

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
          isSpam,
          spamScore,
          indicators: spamIndicators,
          confidence: spamScore
        })};
      } catch (err) {
        console.error("Spam detection error", err);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ 
          message: "spam detection failed" 
        })};
      }
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "bad request" }) };
  } catch (err) {
    console.error("AI features error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "internal error", error: err.message }) };
  }
};