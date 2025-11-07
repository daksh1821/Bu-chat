import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, MessageCircle, Share2, Award, Clock, Bookmark, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
import Card from '../common/Card';
import Button from '../common/Button';
import PostMedia from './PostMedia';
import { postService } from '../../services/postService';
import { useAuth } from '../../contexts/AuthContext';
import './PostCard.css';

// --- UPDATED: Accepts onPostClick prop ---
const PostCard = ({ post, onVote, onDelete, onPostClick }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userVote, setUserVote] = useState(null);
  const [localScore, setLocalScore] = useState(post.score || 0);
  const [isSaved, setIsSaved] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // --- NEW: This function calls the navigation prop ---
  const handleCardClick = () => {
    if (onPostClick) {
      onPostClick(post.postId);
    }
  };

  // --- NEW: This stops clicks on buttons/links from triggering the card click ---
  const handleStopPropagation = (e) => {
    e.stopPropagation();
  };

  const handleVote = async (e, voteType) => {
    handleStopPropagation(e); // Stop click from bubbling
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      const newVote = userVote === voteType ? 0 : voteType;
      setUserVote(newVote);
      
      if (newVote === 1) {
        setLocalScore(post.score + (userVote === -1 ? 2 : 1));
      } else if (newVote === -1) {
        setLocalScore(post.score - (userVote === 1 ? 2 : 1));
      } else {
        setLocalScore(post.score + (userVote === 1 ? -1 : 1));
      }

      await postService.votePost(post.postId, user.userId, newVote);
      if (onVote) onVote();
    } catch (error) {
      console.error('Vote error:', error);
      setUserVote(userVote);
      setLocalScore(post.score);
    }
  };

  const handleSave = async (e) => {
    handleStopPropagation(e); // Stop click from bubbling
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await postService.savePost(post.postId, user.userId);
      setIsSaved(!isSaved);
      toast.success(isSaved ? 'Post unsaved' : 'Post saved');
    } catch (error) {
      toast.error('Failed to save post');
    }
  };

  const handleShare = (e) => {
    handleStopPropagation(e); // Stop click from bubbling
    if (navigator.share) {
      navigator.share({
        title: post.title,
        url: window.location.origin + `/post/${post.postId}`,
      });
    } else {
      navigator.clipboard.writeText(window.location.origin + `/post/${post.postId}`);
      toast.success('Link copied to clipboard');
    }
  };

  const timeAgo = post.createdAt
    ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })
    : 'recently';

  return (
    // --- UPDATED: Added onClick to the main card ---
    <Card className="post-card" hover={false} onClick={handleCardClick}>
      <div className="post-card-content">
        {/* --- UPDATED: Added onClick to stop propagation --- */}
        <div className="post-vote-section" onClick={handleStopPropagation}>
          <button
            className={`vote-button ${userVote === 1 ? 'active upvote' : ''}`}
            onClick={(e) => handleVote(e, 1)}
          >
            <ArrowUp size={20} />
          </button>
          <span className="vote-count">{localScore}</span>
          <button
            className={`vote-button ${userVote === -1 ? 'active downvote' : ''}`}
            onClick={(e) => handleVote(e, -1)}
          >
            <ArrowDown size={20} />
          </button>
        </div>

        <div className="post-main-content">
          <div className="post-header">
            {/* --- UPDATED: Added onClick to stop propagation --- */}
            <div className="post-meta" onClick={handleStopPropagation}>
              <Link to={`/c/${post.community}`} className="post-community">
                c/{post.community}
              </Link>
              <span className="post-separator">•</span>
              <span className="post-author">u/{post.username || 'anonymous'}</span>
              <span className="post-separator">•</span>
              <span className="post-time">
                <Clock size={14} />
                {timeAgo}
              </span>
            </div>
          </div>

          {/* --- UPDATED: Added onClick to stop propagation --- */}
          <Link 
            to={`/post/${post.postId}`} 
            className="post-title-link" 
            onClick={handleStopPropagation}
          >
            <h3 className="post-title">
              {post.flair && (
                <span className="post-flair">
                  {post.flair}
                </span>
              )}
              {post.nsfw && (
                <span className="post-badge nsfw">NSFW</span>
              )}
              {post.spoiler && (
                <span className="post-badge spoiler">Spoiler</span>
              )}
              <span>{post.title}</span>
            </h3>
          </Link>

          {post.body && (
            <p className="post-body">
              {post.body.length > 300 ? `${post.body.substring(0, 300)}...` : post.body}
            </p>
          )}

          {/* --- UPDATED: Added onClick to stop propagation --- */}
          {post.media && post.media.length > 0 && (
            <div onClick={handleStopPropagation}>
              <PostMedia 
                media={post.media} 
                postType={post.postType}
                nsfw={post.nsfw}
                spoiler={post.spoiler}
                postId={post.postId}
                onView={(postId, mediaIndex) => {
                  postService.trackMediaView(postId, user?.userId, mediaIndex);
                }}
              />
            </div>
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="post-tags">
              {post.tags.map((tag, index) => (
                <span key={index} className="post-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* --- UPDATED: Added onClick to stop propagation --- */}
          <div className="post-actions" onClick={handleStopPropagation}>
            <Link to={`/post/${post.postId}`} className="post-action-button">
              <MessageCircle size={18} />
              <span>{post.commentCount || 0} Comments</span>
            </Link>
            <button className="post-action-button" onClick={handleShare}>
              <Share2 size={18} />
              <span>Share</span>
            </button>
            <button className={`post-action-button ${isSaved ? 'saved' : ''}`} onClick={handleSave}>
              <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
            {post.awards && post.awards > 0 && (
              <div className="post-action-button">
                <Award size={18} />
                <span>{post.awards}</span>
              </div>
            )}
            <button className="post-action-button" onClick={(e) => {
              handleStopPropagation(e);
              setShowMenu(!showMenu);
            }}>
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </div>
      {showMenu && (
        // --- UPDATED: Added onClick to stop propagation ---
        <div className="post-menu" onClick={handleStopPropagation}>
          <button onClick={() => { toast.info('Report feature coming soon'); setShowMenu(false); }}>Report</button>
          <button onClick={() => { toast.info('Hide feature coming soon'); setShowMenu(false); }}>Hide</button>
        </div>
      )}
    </Card>
  );
};

export default PostCard;