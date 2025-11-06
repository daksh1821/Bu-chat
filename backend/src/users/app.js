const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const TABLE = process.env.APP_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@buchat.com";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// Helper: Send verification email
async function sendVerificationEmail(email, code, username) {
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "Verify your BuChat account" },
      Body: {
        Html: {
          Data: `
            <h2>Welcome to BuChat, ${username}!</h2>
            <p>Please verify your email address by entering this code:</p>
            <h1 style="color: #ff4500; font-size: 32px; letter-spacing: 5px;">${code}</h1>
            <p>Or click this link: <a href="http://localhost:3000/verify?code=${code}&email=${email}">Verify Email</a></p>
            <p>This code expires in 24 hours.</p>
          `
        }
      }
    }
  };
  
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (error) {
    console.error("Email send error:", error);
    // Don't fail registration if email fails
  }
}

// Helper: Send password reset email
async function sendPasswordResetEmail(email, code, username) {
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "Reset your BuChat password" },
      Body: {
        Html: {
          Data: `
            <h2>Password Reset Request</h2>
            <p>Hi ${username},</p>
            <p>Enter this code to reset your password:</p>
            <h1 style="color: #ff4500; font-size: 32px; letter-spacing: 5px;">${code}</h1>
            <p>Or click: <a href="http://localhost:3000/reset-password?code=${code}&email=${email}">Reset Password</a></p>
            <p>This code expires in 1 hour.</p>
            <p>If you didn't request this, ignore this email.</p>
          `
        }
      }
    }
  };
  
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (error) {
    console.error("Email send error:", error);
  }
}

exports.handler = async (event) => {
  // Handle OPTIONS preflight
  if (event.requestContext.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;

    // REGISTER WITH PASSWORD - POST /users/register
    if (method === "POST" && path === "/users/register") {
      const body = JSON.parse(event.body || "{}");
      const { username, email, password, displayName, avatar, bio } = body;

      if (!username || !email || !password) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "username, email, and password required" }) 
        };
      }

      if (password.length < 8) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "password must be at least 8 characters" }) 
        };
      }

      // Check if username exists
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (existing.Item) {
        return { 
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({ message: "username already exists" }) 
        };
      }

      // Check if email exists
      const emailCheck = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND email = :email",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": "user", ":email": email },
        Limit: 1
      }));

      if (emailCheck.Items && emailCheck.Items.length > 0) {
        return { 
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email already exists" }) 
        };
      }

      const userId = uuidv4();
      const now = new Date().toISOString();
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const item = {
        PK: `USER#${username}`,
        SK: "PROFILE",
        GSI1PK: `USERID#${userId}`,
        GSI1SK: "PROFILE",
        type: "user",
        userId,
        username,
        email,
        password: hashedPassword,
        displayName: displayName || username,
        avatar: avatar || "",
        bio: bio || "",
        verified: false,
        verificationCode,
        verificationExpiry: new Date(Date.now() + 24 * 3600000).toISOString(),
        authProvider: "local",
        karma: 0,
        postKarma: 0,
        commentKarma: 0,
        postCount: 0,
        commentCount: 0,
        awardCount: 0,
        cakeDay: now,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      // Send verification email
      await sendVerificationEmail(email, verificationCode, username);

      // Generate JWT
      const token = jwt.sign({ userId, username, email }, JWT_SECRET, { expiresIn: '7d' });

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({ 
          user: {
            userId, 
            username,
            email,
            displayName: item.displayName,
            verified: false,
            createdAt: now
          },
          token,
          message: "Registration successful! Please check your email to verify your account."
        })
      };
    }

    // LOGIN WITH PASSWORD - POST /users/login
    if (method === "POST" && path === "/users/login") {
      const body = JSON.parse(event.body || "{}");
      const { username, password } = body;

      if (!username || !password) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "username and password required" }) 
        };
      }

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!result.Item) {
        return { 
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: "invalid username or password" }) 
        };
      }

      const user = result.Item;

      // Check if using local auth
      if (user.authProvider !== "local" || !user.password) {
        return { 
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: "please use Google Sign-In for this account" }) 
        };
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return { 
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: "invalid username or password" }) 
        };
      }

      // Generate JWT
      const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

      // Remove sensitive data
      delete user.password;
      delete user.verificationCode;

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ user, token }) 
      };
    }

    // GOOGLE SIGN-IN - POST /users/google-auth
    if (method === "POST" && path === "/users/google-auth") {
      const body = JSON.parse(event.body || "{}");
      const { idToken } = body;

      if (!idToken) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "idToken required" }) 
        };
      }

      // Verify Google token
      let ticket;
      try {
        ticket = await googleClient.verifyIdToken({
          idToken,
          audience: GOOGLE_CLIENT_ID
        });
      } catch (error) {
        return { 
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: "invalid Google token" }) 
        };
      }

      const payload = ticket.getPayload();
      const { email, name, picture, sub: googleId } = payload;

      // Check if user exists by email
      const emailCheck = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND email = :email",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": "user", ":email": email },
        Limit: 1
      }));

      let user;
      const now = new Date().toISOString();

      if (emailCheck.Items && emailCheck.Items.length > 0) {
        // User exists, update Google ID if needed
        user = emailCheck.Items[0];
        
        if (!user.googleId) {
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: user.PK, SK: user.SK },
            UpdateExpression: "SET googleId = :googleId, verified = :verified, updatedAt = :now",
            ExpressionAttributeValues: {
              ":googleId": googleId,
              ":verified": true,
              ":now": now
            }
          }));
          user.googleId = googleId;
          user.verified = true;
        }
      } else {
        // Create new user
        const username = email.split('@')[0] + Math.random().toString(36).substring(2, 6);
        const userId = uuidv4();

        user = {
          PK: `USER#${username}`,
          SK: "PROFILE",
          GSI1PK: `USERID#${userId}`,
          GSI1SK: "PROFILE",
          type: "user",
          userId,
          username,
          email,
          googleId,
          displayName: name,
          avatar: picture || "",
          bio: "",
          verified: true,
          authProvider: "google",
          karma: 0,
          postKarma: 0,
          commentKarma: 0,
          postCount: 0,
          commentCount: 0,
          awardCount: 0,
          cakeDay: now,
          status: "active",
          createdAt: now,
          updatedAt: now
        };

        await ddb.send(new PutCommand({ TableName: TABLE, Item: user }));
      }

      // Generate JWT
      const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

      // Remove sensitive data
      delete user.password;
      delete user.verificationCode;

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ user, token }) 
      };
    }

    // VERIFY EMAIL - POST /users/verify
    if (method === "POST" && path === "/users/verify") {
      const body = JSON.parse(event.body || "{}");
      const { email, code } = body;

      if (!email || !code) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email and code required" }) 
        };
      }

      // Find user by email
      const emailCheck = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND email = :email",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": "user", ":email": email },
        Limit: 1
      }));

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        return { 
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = emailCheck.Items[0];

      if (user.verified) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email already verified" }) 
        };
      }

      if (user.verificationCode !== code.toUpperCase()) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "invalid verification code" }) 
        };
      }

      if (new Date(user.verificationExpiry) < new Date()) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "verification code expired" }) 
        };
      }

      // Mark as verified
      const now = new Date().toISOString();
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET verified = :verified, verificationCode = :empty, updatedAt = :now",
        ExpressionAttributeValues: {
          ":verified": true,
          ":empty": "",
          ":now": now
        }
      }));

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "email verified successfully" }) 
      };
    }

    // RESEND VERIFICATION - POST /users/resend-verification
    if (method === "POST" && path === "/users/resend-verification") {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;

      if (!email) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email required" }) 
        };
      }

      const emailCheck = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND email = :email",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": "user", ":email": email },
        Limit: 1
      }));

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        return { 
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = emailCheck.Items[0];

      if (user.verified) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email already verified" }) 
        };
      }

      const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET verificationCode = :code, verificationExpiry = :expiry, updatedAt = :now",
        ExpressionAttributeValues: {
          ":code": verificationCode,
          ":expiry": new Date(Date.now() + 24 * 3600000).toISOString(),
          ":now": now
        }
      }));

      await sendVerificationEmail(email, verificationCode, user.username);

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "verification email sent" }) 
      };
    }

    // FORGOT PASSWORD - POST /users/forgot-password
    if (method === "POST" && path === "/users/forgot-password") {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;

      if (!email) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email required" }) 
        };
      }

      const emailCheck = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND email = :email",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": "user", ":email": email },
        Limit: 1
      }));

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        // Don't reveal if email exists
        return { 
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ message: "if email exists, reset code sent" }) 
        };
      }

      const user = emailCheck.Items[0];

      if (user.authProvider !== "local") {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "please use Google Sign-In for this account" }) 
        };
      }

      const resetCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET resetCode = :code, resetExpiry = :expiry, updatedAt = :now",
        ExpressionAttributeValues: {
          ":code": resetCode,
          ":expiry": new Date(Date.now() + 3600000).toISOString(), // 1 hour
          ":now": now
        }
      }));

      await sendPasswordResetEmail(email, resetCode, user.username);

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "if email exists, reset code sent" }) 
      };
    }

    // RESET PASSWORD - POST /users/reset-password
    if (method === "POST" && path === "/users/reset-password") {
      const body = JSON.parse(event.body || "{}");
      const { email, code, newPassword } = body;

      if (!email || !code || !newPassword) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "email, code, and newPassword required" }) 
        };
      }

      if (newPassword.length < 8) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "password must be at least 8 characters" }) 
        };
      }

      const emailCheck = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#type = :type AND email = :email",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": "user", ":email": email },
        Limit: 1
      }));

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        return { 
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = emailCheck.Items[0];

      if (!user.resetCode || user.resetCode !== code.toUpperCase()) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "invalid reset code" }) 
        };
      }

      if (new Date(user.resetExpiry) < new Date()) {
        return { 
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: "reset code expired" }) 
        };
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET password = :password, resetCode = :empty, updatedAt = :now",
        ExpressionAttributeValues: {
          ":password": hashedPassword,
          ":empty": "",
          ":now": now
        }
      }));

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "password reset successfully" }) 
      };
    }

    // GET USER PROFILE - GET /users/{username}
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/users/") && !path.includes("/posts") && !path.includes("/comments") && !path.includes("/stats")) {
      const username = event.pathParameters.username;

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!result.Item) {
        return { 
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = result.Item;
      delete user.password;
      delete user.verificationCode;
      delete user.resetCode;

      return { 
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ user }) 
      };
    }

    // UPDATE USER PROFILE - PUT /users/{username}
    if (method === "PUT" && event.pathParameters && event.pathParameters.username) {
      const username = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { displayName, bio, avatar, banner, location, website } = body;

      const now = new Date().toISOString();
      const updates = ["updatedAt = :now"];
      const values = { ":now": now };

      if (displayName) {
        updates.push("displayName = :display");
        values[":display"] = displayName;
      }
      if (bio !== undefined) {
        updates.push("bio = :bio");
        values[":bio"] = bio;
      }
      if (avatar) {
        updates.push("avatar = :avatar");
        values[":avatar"] = avatar;
      }
      if (banner) {
        updates.push("banner = :banner");
        values[":banner"] = banner;
      }
      if (location) {
        updates.push("location = :location");
        values[":location"] = location;
      }
      if (website) {
        updates.push("website = :website");
        values[":website"] = website;
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeValues: values
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "profile updated" }) };
    }

    // UPDATE USER PREFERENCES - PUT /users/{username}/preferences
    if (method === "PUT" && event.pathParameters && event.pathParameters.username && path.includes("/preferences")) {
      const username = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const {
        theme,
        emailNotifications,
        pushNotifications,
        showNSFW,
        autoplayVideos,
        openLinksInNewTab,
        showOnlineStatus,
        allowPrivateMessages,
        contentVisibility // public, friends, private
      } = body;

      const now = new Date().toISOString();

      const preferences = {
        PK: `USER#${username}`,
        SK: "PREFERENCES",
        type: "preferences",
        theme: theme || "light",
        emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
        pushNotifications: pushNotifications !== undefined ? pushNotifications : true,
        showNSFW: showNSFW !== undefined ? showNSFW : false,
        autoplayVideos: autoplayVideos !== undefined ? autoplayVideos : true,
        openLinksInNewTab: openLinksInNewTab !== undefined ? openLinksInNewTab : false,
        showOnlineStatus: showOnlineStatus !== undefined ? showOnlineStatus : true,
        allowPrivateMessages: allowPrivateMessages !== undefined ? allowPrivateMessages : true,
        contentVisibility: contentVisibility || "public",
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: preferences }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "preferences updated" }) };
    }

    // GET USER PREFERENCES - GET /users/{username}/preferences
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/preferences")) {
      const username = event.pathParameters.username;

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PREFERENCES" }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ preferences: result.Item || {} }) };
    }

    // BLOCK USER - POST /users/{username}/block
    if (method === "POST" && event.pathParameters && event.pathParameters.username && path.includes("/block")) {
      const blockedUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const now = new Date().toISOString();

      const block = {
        PK: `USER#${userId}`,
        SK: `BLOCKED#${blockedUsername}`,
        type: "block",
        userId,
        blockedUser: blockedUsername,
        blockedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: block }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "user blocked" }) };
    }

    // UNBLOCK USER - DELETE /users/{username}/block
    if (method === "DELETE" && event.pathParameters && event.pathParameters.username && path.includes("/block")) {
      const blockedUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "userId required" }) };
      }

      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `BLOCKED#${blockedUsername}` }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "user unblocked" }) };
    }

    // GET USER KARMA BREAKDOWN - GET /users/{username}/karma
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/karma")) {
      const username = event.pathParameters.username;

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!result.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: "user not found" }) };
      }

      const karma = {
        postKarma: result.Item.postKarma || 0,
        commentKarma: result.Item.commentKarma || 0,
        awardKarma: result.Item.awardKarma || 0,
        total: (result.Item.postKarma || 0) + (result.Item.commentKarma || 0) + (result.Item.awardKarma || 0)
      };

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ karma }) };
    }

    // ADD USER TROPHY - POST /users/{username}/trophies
    if (method === "POST" && event.pathParameters && event.pathParameters.username && path.includes("/trophies")) {
      const username = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { trophyType, title, description, icon } = body;

      if (!trophyType || !title) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "trophyType and title required" }) };
      }

      const trophyId = uuidv4();
      const now = new Date().toISOString();

      const trophy = {
        PK: `USER#${username}`,
        SK: `TROPHY#${trophyId}`,
        type: "trophy",
        trophyId,
        trophyType, // verified-email, elder, well-rounded, inciteful-comment, etc
        title,
        description: description || "",
        icon: icon || "",
        awardedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: trophy }));

      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ trophyId, message: "trophy awarded" }) };
    }

    // GET USER TROPHIES - GET /users/{username}/trophies
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/trophies")) {
      const username = event.pathParameters.username;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${username}`,
          ":sk": "TROPHY#"
        }
      }));

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ trophies: result.Items || [] }) };
    }

    // SEARCH USERS - GET /users/search
    if (method === "GET" && path.includes("/users/search")) {
      const query = event.queryStringParameters?.q || "";
      const limit = parseInt(event.queryStringParameters?.limit || 20);

      if (!query || query.length < 2) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "query must be at least 2 characters" }) };
      }

      const params = {
        TableName: TABLE,
        FilterExpression: "#type = :type AND (contains(username, :query) OR contains(displayName, :query))",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":type": "user",
          ":query": query.toLowerCase()
        },
        Limit: limit
      };

      const result = await ddb.send(new ScanCommand(params));
      const users = (result.Items || []).map(user => {
        delete user.password;
        delete user.verificationCode;
        delete user.resetCode;
        return user;
      });

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ users, count: users.length }) };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: "bad request" }) };
  } catch (err) {
    console.error("users error", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: "internal error", error: err.message }) };
  }
};
