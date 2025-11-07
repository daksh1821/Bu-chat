import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowUp, 
  ArrowDown, 
  MessageCircle, 
  Share2, 
  Bookmark,
  Gift,
  MoreHorizontal
} from 'lucide-react';
import { toast } from 'react-toastify';
import { formatDistanceToNow } from 'date-fns'; // Import date-fns
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { postService } from '../services/postService';
import { commentService } from '../services/commentService';
import { useAuth } from '../contexts/AuthContext';
import './PostDetail.css'; // Make sure to import the CSS

// Placeholder for the "Be first to comment" image
const EmptyCommentsIcon = () => (
  <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M64 112C90.5097 112 112 90.5097 112 64C112 37.4903 90.5097 16 64 16C37.4903 16 16 37.4903 16 64C16 90.5097 37.4903 112 64 112Z" fill="#F0F2F5"/>
    <path d="M64.0001 79.0001C66.9375 79.0001 69.7032 78.1188 71.941 76.5188C72.641 76.0188 72.841 75.1188 72.341 74.4188C71.841 73.7188 70.9409 73.5188 70.2409 74.0188C68.4031 75.3188 66.2374 76.0001 64.0001 76.0001C61.7628 76.0001 59.597 75.3188 57.7593 74.0188C57.0593 73.5188 56.1593 73.7188 55.6593 74.4188C55.1593 75.1188 55.3593 76.0188 56.0593 76.5188C58.297 78.1188 61.0628 79.0001 64.0001 79.0001Z" fill="#8A8D91"/>
    <path d="M48 54C48 56.2091 46.2091 58 44 58C41.7909 58 40 56.2091 40 54C40 51.7909 41.7909 50 44 50C46.2091 50 48 51.7909 48 54Z" fill="#8A8D91"/>
    <path d="M88 54C88 56.2091 86.2091 58 84 58C81.7909 58 80 56.2091 80 54C80 51.7909 81.7909 50 84 50C86.2091 50 88 51.7909 88 54Z" fill="#8A8D91"/>
  </svg>
);


const PostDetail = () => {
  const { postId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);

  // --- NEW: State for button functionality ---
  const [localScore, setLocalScore] = useState(0);
  const [userVote, setUserVote] = useState(0); // 0 = no vote, 1 = up, -1 = down
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const postData = await postService.getPost(postId);
        if (!postData) {
          throw new Error('Post not found');
        }
        
        const post = postData.post || postData;
        setPost(post); 
        
        // --- NEW: Set initial state from post data ---
        // Assumes your API returns user-specific data like userVote and isSaved
        setLocalScore(post.score || 0);
        setUserVote(post.userVote || 0); 
        setIsSaved(post.isSaved || false);
        // --- End New ---
        
        const commentData = await commentService.getPostComments(postId);
        setComments(commentData.comments || []);
      } catch (error) {
        console.error(error); 
        toast.error('Post not found');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [postId, navigate]);

  const handleComment = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    if (!commentText.trim()) return;

    try {
      await commentService.createComment(postId, {
        body: commentText,
        userId: user.userId || user.id, 
        username: user.username,
      });
      setCommentText('');
      fetchComments(); // Re-fetch comments to show the new one
      toast.success('Comment added!');
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const fetchComments = async () => {
    try {
      const data = await commentService.getPostComments(postId);
      setComments(data.comments || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  // --- NEW: Handle Post Vote ---
  const handleVote = async (voteType) => {
    if (!user) {
      navigate('/login');
      return;
    }

    const currentVote = userVote;
    const newVote = currentVote === voteType ? 0 : voteType;

    // Optimistic UI update
    let newScore = localScore;
    if (currentVote === 1) newScore--;
    if (currentVote === -1) newScore++;
    if (newVote === 1) newScore++;
    if (newVote === -1) newScore--;
    
    setLocalScore(newScore);
    setUserVote(newVote);

    try {
      // API call
      await postService.votePost(postId, user.userId, newVote);
    } catch (error) {
      // Revert on error
      toast.error('Vote failed');
      setLocalScore(localScore);
      setUserVote(currentVote);
    }
  };

  // --- NEW: Handle Save/Bookmark ---
  const handleSave = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    const newState = !isSaved;
    setIsSaved(newState);
    toast.success(newState ? 'Post saved' : 'Post unsaved');

    try {
      // API call
      await postService.savePost(postId, user.userId, newState);
    } catch (error) {
      toast.error('Failed to save post');
      setIsSaved(!newState); // Revert
    }
  };

  // --- NEW: Handle Share ---
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: post.title,
        url: window.location.href,
      }).catch(console.error);
    } else {
      // Fallback for desktop
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    }
  };

  const timeAgo = (dateString) => {
    if (!dateString) return '...';
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  };


  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!post) return null; 

  return (
    <div className="post-detail-page">
      <div className="post-content-column">
        {/* --- Post Card Structure --- */}
        <Card className="post-detail-card">
          <div className="post-voting">
            {/* --- UPDATED: Wired up vote buttons --- */}
            <button 
              className={`vote-btn upvote ${userVote === 1 ? 'active' : ''}`}
              onClick={() => handleVote(1)}
            >
              <ArrowUp size={24} />
            </button>
            <span>{localScore}</span>
            <button 
              className={`vote-btn downvote ${userVote === -1 ? 'active' : ''}`}
              onClick={() => handleVote(-1)}
            >
              <ArrowDown size={24} />
            </button>
          </div>
          <div className="post-content">
            <div className="post-detail-header">
              <Link to={`/c/${post.community}`} className="post-community">c/{post.community}</Link>
              <span className="post-author">Posted by u/{post.username}</span>
              {/* --- UPDATED: Added timestamp --- */}
              <span className="post-time">{timeAgo(post.createdAt)}</span>
            </div>
            <h1 className="post-detail-title">{post.title}</h1>
            {post.body && <p className="post-detail-body">{post.body}</p>}
            {post.media && post.media.length > 0 && (
              <div className="post-detail-media">
                <img src={post.media[0]} alt="Post" />
              </div>
            )}
            <div className="post-detail-actions">
              <div className="action-btn comments">
                <MessageCircle size={18} />
                <span>{comments.length} Comments</span>
              </div>
              {/* --- UPDATED: Wired up placeholder buttons --- */}
              <button className="action-btn" onClick={() => toast.info('Award feature coming soon!')}>
                <Gift size={18} />
                <span>Award</span>
              </button>
              {/* --- UPDATED: Wired up share button --- */}
              <button className="action-btn" onClick={handleShare}>
                <Share2 size={18} />
                <span>Share</span>
              </button>
              {/* --- UPDATED: Wired up save button --- */}
              <button className={`action-btn ${isSaved ? 'saved' : ''}`} onClick={handleSave}>
                <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} />
                <span>{isSaved ? 'Saved' : 'Save'}</span>
              </button>
              <button className="action-btn" onClick={() => toast.info('More options coming soon!')}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>
        </Card>

        {/* --- Comments Section --- */}
        <Card className="comments-section">
          {user && (
            <form onSubmit={handleComment} className="comment-form">
              <p className="comment-as">Comment as <Link to={`/u/${user.username}`}>{user.username}</Link></p>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="What are your thoughts?"
                rows={5}
              />
              <div className="comment-form-actions">
                <Button type="submit" disabled={!commentText.trim()}>Comment</Button>
              </div>
            </form>
          )}
          
          <div className="comments-list">
            {comments.length === 0 ? (
              <div className="empty-comments-placeholder">
                <EmptyCommentsIcon />
                <h2>Be the first to comment</h2>
                <p>Nobody's responded to this post yet. Add your thoughts and get the conversation going.</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.commentId} className="comment-item">
                  <div className="comment-voting">
                    {/* --- UPDATED: Wired up placeholder buttons --- */}
                    <button className="comment-vote" onClick={() => toast.info('Comment voting coming soon!')}><ArrowUp size={16} /></button>
                    <button className="comment-vote" onClick={() => toast.info('Comment voting coming soon!')}><ArrowDown size={16} /></button>
                  </div>
                  <div className="comment-content">
                    <div className="comment-author">
                      <Link to={`/u/${comment.username}`}>u/{comment.username}</Link>
                      <span className="comment-time">
                        {/* --- UPDATED: Added timestamp --- */}
                        {timeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <div className="comment-body">{comment.body}</div>
                    <div className="comment-actions">
                      {/* --- UPDATED: Wired up placeholder buttons --- */}
                      <button className="action-btn" onClick={() => toast.info('Reply feature coming soon!')}>
                        <MessageCircle size={16} />
                        <span>Reply</span>
                      </button>
                      <button className="action-btn" onClick={() => toast.info('Share feature coming soon!')}>
                        <span>Share</span>
                      </button>
                      <button className="action-btn" onClick={() => toast.info('More options coming soon!')}>
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* --- New Right Sidebar Column --- */}
      <div className="post-sidebar-column">
        <Card className="community-sidebar-card">
          <div className="community-sidebar-header">
            {/* Add community icon here */}
            <Link to={`/c/${post.community}`} className="community-sidebar-name">c/{post.community}</Link>
          </div>
          <p className="community-sidebar-description">
            This submit is dedicated to Comedian and India's Got Talent Fame Sharon Verma. This Subreddit is all things...
          </p>
          <div className="community-sidebar-stats">
            <div>
              <span className="stat-number">8.8K</span>
              <span className="stat-label">Members</span>
            </div>
            <div>
              <span className="stat-number">90</span>
              <span className="stat-label">Online</span>
            </div>
          </div>
          {/* --- UPDATED: Wired up placeholder button --- */}
          <Button 
            variant="primary" 
            className="full-width"
            onClick={() => toast.info('Join community feature coming soon!')}
          >
            Join
          </Button>
        </Card>

        <Card className="community-rules-card">
          <h4>c/{post.community} Rules</h4>
          <ul className="community-rules-list">
            <li>1. No other posts than Sharon</li>
            <li>2. No spam</li>
            <li>3. No doctored, manipulated or major altered images</li>
            <li>4. No Duplication</li>
            <li>5. 4 Posts per day Max</li>
            {/* Add more rules as needed */}
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default PostDetail;