# Capstone Project - BuChat

A modern, Reddit-like social platform built with React and AWS serverless architecture featuring real-time interactions, community management, and comprehensive user engagement features.

## Features

### Core Functionality
- **User Authentication**: Email verification, password authentication with bcrypt, Google OAuth, JWT tokens, forgot password flow
- **Posts & Communities**: Create/view posts, join communities, upvote/downvote, comment system, save posts
- **Social Features**: Follow users, direct messaging, notifications feed, user profiles with karma/levels
- **Search**: Multi-tab search (posts/communities/users) with real-time results
- **Leaderboard**: Top 50 users ranking with timeframe filters (All Time/Month/Week)

### Modern UI/UX
- Glassmorphism design with smooth animations
- Fully responsive (mobile-first approach)
- Reddit-like interface with sidebar navigation
- Dark theme with gradient accents
- Rounded corners (12-24px) and modern shadows

## Tech Stack

### Frontend
- **React** 18.x with React Router
- **Context API** for state management
- **Axios** for API calls
- **CSS3** with custom properties and animations

### Backend (AWS Serverless)
- **AWS Lambda** (Node.js 18.x)
- **API Gateway** for REST APIs
- **DynamoDB** for data storage
- **AWS SES** for email notifications
- **AWS SAM** for infrastructure as code
- **bcryptjs** for password hashing
- **jsonwebtoken** for authentication
- **google-auth-library** for OAuth

## Project Structure

```
Capstone/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   ├── common/
│   │   │   ├── layout/
│   │   │   └── posts/
│   │   ├── contexts/
│   │   │   └── AuthContext.js
│   │   ├── pages/
│   │   │   ├── CreatePost.js
│   │   │   ├── PostDetail.js
│   │   │   ├── UserProfile.js
│   │   │   ├── Leaderboard.js
│   │   │   ├── Search.js
│   │   │   ├── Messages.js
│   │   │   └── Notifications.js
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── userService.js
│   │   │   ├── postService.js
│   │   │   ├── communityService.js
│   │   │   └── socialService.js
│   │   └── App.js
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── users/
│   │   ├── posts/
│   │   ├── communities/
│   │   ├── comments/
│   │   ├── votes/
│   │   ├── follows/
│   │   ├── messages/
│   │   ├── notifications/
│   │   ├── awards/
│   │   ├── reports/
│   │   └── saved/
│   └── template.yaml
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js 18.x or higher
- AWS CLI configured
- AWS SAM CLI installed
- Google OAuth credentials (for Google Sign-In)
- AWS SES verified email (for email notifications)

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Backend Setup
```bash
cd backend
sam build
sam deploy --guided
```

### Environment Variables

Add to SAM template.yaml:
```yaml
Environment:
  Variables:
    JWT_SECRET: your-secret-key
    GOOGLE_CLIENT_ID: your-google-client-id
    FROM_EMAIL: verified@email.com
```

Add to frontend/.env:
```
REACT_APP_API_URL=your-api-gateway-url
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id
```

## API Endpoints

### Authentication
- POST `/users/register` - Register with email verification
- POST `/users/login` - Login with password
- POST `/users/verify-email` - Verify email with code
- POST `/users/google-auth` - Google OAuth login
- POST `/users/forgot-password` - Request password reset
- POST `/users/reset-password` - Reset password with code

### Users
- GET `/users/{userId}` - Get user profile
- PUT `/users/{userId}` - Update user profile
- GET `/users/search?q={query}` - Search users

### Posts
- GET `/posts` - Get all posts
- POST `/posts` - Create post
- GET `/posts/{postId}` - Get post details
- PUT `/posts/{postId}` - Update post
- DELETE `/posts/{postId}` - Delete post

### Communities
- GET `/communities` - Get all communities
- POST `/communities` - Create community
- GET `/communities/{communityId}` - Get community details
- POST `/communities/{communityId}/join` - Join community
- GET `/communities/search?q={query}` - Search communities

### Social
- POST `/follows` - Follow user
- DELETE `/follows/{followId}` - Unfollow user
- GET `/messages` - Get conversations
- POST `/messages` - Send message
- GET `/notifications` - Get notifications
- POST `/saved` - Save post
- GET `/saved` - Get saved posts

## Key Features Implementation

### Authentication Flow
1. User registers with email/password
2. Verification code sent via AWS SES
3. User verifies email with 6-digit code
4. JWT token issued (7-day expiry)
5. Alternative: Google OAuth auto-creates account

### CORS Configuration
All Lambda functions include CORS headers:
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};
```

### Security
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens for authentication
- Email verification required
- Rate limiting on sensitive endpoints
- Input validation and sanitization

## Development

### Running Locally
```bash
# Frontend
cd frontend && npm start

# Backend (SAM local)
cd backend && sam local start-api
```

### Testing
```bash
# Frontend tests
cd frontend && npm test

# Backend tests
cd backend && npm test
```

## Deployment

### Production Deployment
```bash
# Build and deploy backend
cd backend
sam build
sam deploy --config-env production

# Build and deploy frontend
cd frontend
npm run build
# Deploy build/ to S3 or hosting service
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open Pull Request

## License

MIT License - See LICENSE file for details

## Contact

For questions or support, please open an issue in the repository.
